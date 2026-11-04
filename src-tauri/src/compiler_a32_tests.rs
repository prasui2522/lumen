//! PHASE-11 A3.2 tests: the switch restyle (spec §9 A3 switch row, §10; G1–G6).
//! Golden: fixtures/a3/a32-switch.{html,css}; regenerate with `A32_BLESS=1 cargo test a32_tests`.
use super::*;
use crate::defaults::{is_a3_kind, is_version4_kind, normalize_saved_document, NodeProps, NodeType, PageDocument};

const SW: &str = include_str!("fixtures/a3/a32-switch.json");
const TRACK: &str = "<span class=\"sw-track\"><span class=\"sw-thumb\"></span></span>";

fn doc(src: &str) -> PageDocument {
    parse_document(&serde_json::from_str(src).unwrap()).unwrap()
}
fn export(src: &str) -> (String, String) {
    compile_export(&doc(src), &CompileOptions::default()).unwrap()
}
fn golden(ext: &str) -> std::path::PathBuf {
    std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join(format!("src/fixtures/a3/a32-switch.{ext}"))
}

#[test]
fn golden_switch() {
    let (html, css) = export(SW);
    if std::env::var("A32_BLESS").is_ok() {
        std::fs::write(golden("html"), &html).unwrap();
        std::fs::write(golden("css"), &css).unwrap();
        return;
    }
    assert_eq!(html, std::fs::read_to_string(golden("html")).unwrap(), "html");
    assert_eq!(css, std::fs::read_to_string(golden("css")).unwrap(), "css");
    assert_eq!(export(SW), (html, css), "not deterministic"); // G6
}

#[test]
fn markup_is_label_input_track_thumb_span() {
    let (h, _) = export(SW);
    assert!(h.contains(&format!("<label class=\"t-switch\"><input type=\"checkbox\" class=\"sw\" checked=\"checked\">{TRACK}<span>เปิดใช้</span></label>")), "{h}");
    assert!(h.contains(&format!("<label class=\"t-switch\"><input type=\"checkbox\" class=\"sw\">{TRACK}<span>Checkbox</span></label>")), "{h}");
    // two switches are independent: one native input per label, no shared name / id / for
    assert_eq!(h.matches("<input type=\"checkbox\" class=\"sw\"").count(), 4, "{h}");
    assert_eq!(h.matches("<label class=\"t-switch\">").count(), 4, "{h}");
    for bad in [" name=", " id=", " for=", "onclick", "onchange", "<script", "tabindex", "role=", "aria-pressed", "data-cv", "readonly"] {
        let body = &h[h.find("<body>").unwrap()..];
        assert!(!body.contains(bad), "{bad} in {body}");
    }
}

#[test]
fn empty_label_omits_span_and_names_the_input() {
    let (h, _) = export(SW);
    assert!(h.contains(&format!("<input type=\"checkbox\" class=\"sw\" aria-label=\"แจ้งเตือน\">{TRACK}</label>")), "{h}");
    // blank label and no name: the type label "Switch" (G4), never unnamed
    assert!(h.contains(&format!("<input type=\"checkbox\" class=\"sw\" checked=\"checked\" aria-label=\"Switch\">{TRACK}</label>")), "{h}");
    assert!(!h.contains("<span></span>") && !h.contains("<span> </span>"), "{h}");
    assert_eq!(h.matches("aria-label=").count(), 2, "only the two unlabelled switches: {h}");
}

#[test]
fn label_text_is_escaped() {
    let (h, _) = export(&SW.replace("เปิดใช้", "<b>&\\\"x"));
    assert!(h.contains("<span>&lt;b&gt;&amp;&quot;x</span>"), "{h}");
}

#[test]
fn track_and_thumb_are_literal_constants_with_states() {
    let (_, css) = export(SW);
    for rule in [
        ".t-switch input{position:absolute;top:0px;left:0px;width:1px;height:1px;margin:0px;padding:0px;opacity:0;overflow:hidden}",
        "width:40px;height:22px;border:1px solid #64748b;border-radius:11px;background-color:#cbd5e1;",
        ".t-switch .sw-thumb{position:absolute;top:2px;left:2px;width:16px;height:16px;border:1px solid #64748b;border-radius:50%;background-color:#ffffff;",
        ".t-switch input:checked+.sw-track{background-color:#0f172a;border-color:#0f172a}",
        ".t-switch input:checked+.sw-track .sw-thumb{transform:translateX(18px);border-color:#ffffff}",
        ".t-switch input:focus-visible+.sw-track{outline:2px solid #0077c2;outline-offset:2px}",
        "@media (prefers-reduced-motion:reduce){.t-switch .sw-track,.t-switch .sw-thumb{transition:none}}",
        "@media (forced-colors:active){.t-switch .sw-track,.t-switch .sw-thumb{forced-color-adjust:none}",
        ".t-switch input:checked+.sw-track{background-color:Highlight;border-color:Highlight}",
        ".t-switch input:checked+.sw-track .sw-thumb{background-color:HighlightText;border-color:HighlightText}",
    ] {
        assert!(css.contains(rule), "missing {rule}\n{css}");
    }
    // the visually hidden input is never display:none / visibility:hidden (it must stay focusable)
    assert!(!css.contains("display:none") && !css.contains("visibility:hidden"), "{css}");
    // order: forced colors and reduced motion come after the base + :checked rules
    let chk = css.find(".t-switch input:checked+.sw-track .sw-thumb{transform").unwrap();
    assert!(css.find("@media (forced-colors:active)").unwrap() > chk);
    assert!(css.find("@media (prefers-reduced-motion:reduce)").unwrap() > chk);
    // every transition is switch-only and switched off under reduced motion
    assert_eq!(css.matches("transition:").count(), 3, "{css}");
    assert!(!css.contains("url(") && !css.contains("animation"), "{css}");
    // root row: kind extras incl. position:relative for the hidden input
    assert!(css.contains("align-items:center;gap:8px;position:relative}"), "{css}");
    let l = kind_looks();
    assert!(l.a3_kinds.contains_key("switch") && !l.kinds.contains_key("switch"));
}

#[test]
fn explicit_style_wins_over_type_defaults_g1() {
    let src = SW.replace(
        "\"s1\": {\n      \"id\": \"s1\",\n      \"type\": \"switch\",\n      \"props\": {\n        \"type\": \"switch\",\n        \"label\": \"เปิดใช้\",\n        \"checked\": true\n      },\n      \"style\": {}",
        "\"s1\": {\n      \"id\": \"s1\",\n      \"type\": \"switch\",\n      \"props\": {\n        \"type\": \"switch\",\n        \"label\": \"เปิดใช้\",\n        \"checked\": true\n      },\n      \"style\": {\"color\": \"#ff0000\", \"fontSize\": 20}",
    );
    assert_ne!(src, SW, "fixture shape changed");
    let (html, css) = export(&src);
    let t = css.find(".t-switch{").unwrap();
    let cls = html.split("<label class=\"t-switch ").nth(1).expect("node class").split('"').next().unwrap().to_string();
    let n = css.find(&format!(".{cls}{{")).expect("node class rule");
    assert!(n > t, "{css}");
    let rule = &css[n..n + css[n..].find('}').unwrap()];
    assert!(rule.contains("color:#ff0000") && rule.contains("font-size:20px"), "{rule}");
}

#[test]
fn old_v3_and_v4_switch_docs_open_unchanged() {
    // stored data is untouched: parse -> serialize gives the same JSON, the version stays, no new keys
    let orig: serde_json::Value = serde_json::from_str(SW).unwrap();
    let mut d = doc(SW);
    let v = serde_json::to_value(&d).unwrap();
    for id in ["s1", "s2", "s3", "s4"] {
        assert_eq!(v["nodes"][id], orig["nodes"][id], "{id}");
        assert!(matches!(d.nodes[id].props, NodeProps::Switch { .. }));
    }
    assert_eq!(v["version"], 3);
    normalize_saved_document(&mut d);
    assert_eq!(d.version, 3, "a switch keeps the version-3 marker; no bump");
    let v4 = SW.replace("\"version\": 3", "\"version\": 4");
    let v = serde_json::to_value(doc(&v4)).unwrap();
    assert_eq!(v["nodes"]["s2"], orig["nodes"]["s2"]);
    assert_eq!(v["nodes"]["s3"]["name"], "แจ้งเตือน");
    assert!(!is_a3_kind(NodeType::Switch) && !is_version4_kind(NodeType::Switch));
}
