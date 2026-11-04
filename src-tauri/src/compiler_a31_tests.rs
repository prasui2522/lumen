//! PHASE-11 A3.1 tests: the checkbox kind (spec §9 A3, §4.1, T20/T21; G1–G6).
//! Goldens: fixtures/a3/a31-{checked,unchecked}.{html,css} (re-blessed in A3.1.1: border, forced colors, cb3); regenerate with `A31_BLESS=1 cargo test a31_tests`.
use super::*;
use crate::defaults::{is_a3_kind, is_version4_kind, normalize_saved_document, NodeProps, NodeType, PageDocument};

const CHECKED: &str = include_str!("fixtures/a3/a31-checked.json");
const UNCHECKED: &str = include_str!("fixtures/a3/a31-unchecked.json");
const CHECKMARK_URL: &str = "url(\"data:image/svg+xml,";

fn doc(src: &str) -> PageDocument {
    parse_document(&serde_json::from_str(src).unwrap()).unwrap()
}
fn export(src: &str) -> (String, String) {
    compile_export(&doc(src), &CompileOptions::default()).unwrap()
}
fn golden(name: &str, ext: &str) -> std::path::PathBuf {
    std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join(format!("src/fixtures/a3/{name}.{ext}"))
}

#[test]
fn goldens_checked_and_unchecked() {
    for (name, src) in [("a31-checked", CHECKED), ("a31-unchecked", UNCHECKED)] {
        let (html, css) = export(src);
        if std::env::var("A31_BLESS").is_ok() {
            std::fs::write(golden(name, "html"), &html).unwrap();
            std::fs::write(golden(name, "css"), &css).unwrap();
            continue;
        }
        assert_eq!(html, std::fs::read_to_string(golden(name, "html")).unwrap(), "{name} html");
        assert_eq!(css, std::fs::read_to_string(golden(name, "css")).unwrap(), "{name} css");
        assert_eq!(export(src), (html, css), "{name} not deterministic"); // G6
    }
}

#[test]
fn checked_state_is_the_checked_attribute_only() {
    let (h1, _) = export(CHECKED);
    let (h0, _) = export(UNCHECKED);
    assert!(h1.contains("<input type=\"checkbox\" checked=\"checked\"><span>ยอมรับเงื่อนไข</span></label>"), "{h1}");
    assert!(h0.contains("<input type=\"checkbox\"><span>ยอมรับเงื่อนไข</span></label>"), "{h0}");
    assert!(!h0.contains("checked=\"checked\""), "{h0}");
    // G2: a native, labelled control: the root is a <label>, never a div with a click handler
    assert!(h1.contains("<label class=\"t-checkbox"), "{h1}");
    for bad in ["onclick", "tabindex", "role=", "data-cv", "readonly"] {
        assert!(!h1.contains(bad) && !h0.contains(bad), "{bad}");
    }
}

#[test]
fn empty_label_omits_span_and_names_by_layer() {
    let (h, _) = export(UNCHECKED);
    // G3/G4: no empty span; the input is named by the layer name
    assert!(h.contains("<input type=\"checkbox\" aria-label=\"รับข่าวสาร\"></label>"), "{h}");
    assert!(!h.contains("<span></span>"), "{h}");
    // A3.1.1: no label and no (or a blank) layer name: the type label "Checkbox", never unnamed (G4)
    let src = UNCHECKED.replace("\"name\": \"รับข่าวสาร\"", "\"name\": \"  \"");
    let (h2, _) = export(&src);
    assert!(h2.contains("<input type=\"checkbox\" aria-label=\"Checkbox\"></label>"), "{h2}");
    assert!(!h2.contains("<input type=\"checkbox\"></label>"), "{h2}");
    assert!(!h2.contains("aria-label=\"\""), "{h2}");
    // the golden's cb3 has no name key at all
    assert!(h.contains("<input type=\"checkbox\" aria-label=\"Checkbox\"></label>"), "{h}");
    // a label present: no aria-label at all
    let (h3, _) = export(CHECKED);
    assert!(!h3.contains("aria-label"), "{h3}");
}

#[test]
fn label_text_is_escaped() {
    let src = CHECKED.replace("ยอมรับเงื่อนไข", "<b>&\\\"x");
    let (h, _) = export(&src);
    assert!(h.contains("<span>&lt;b&gt;&amp;&quot;x</span>"), "{h}");
}

#[test]
fn checkmark_comes_only_from_the_compiler_constant() {
    let (_, css) = export(CHECKED);
    // the box + checkmark rules are in the export
    assert!(css.contains(".t-checkbox input{-webkit-appearance:none;appearance:none;"), "{css}");
    assert!(css.contains(".t-checkbox input:checked{background-color:#0f172a;border-color:#0f172a;background-image:url(\"data:image/svg+xml,"), "{css}");
    assert!(css.contains(".t-checkbox input:focus-visible{outline:2px solid #0077c2;outline-offset:2px}"), "{css}");
    // A3.1.1: border #64748b (4.76:1 on white, WCAG 1.4.11); forced colors restore the native box + system tick
    assert!(css.contains("border:1px solid #64748b;"), "{css}");
    assert!(!css.contains("#94a3b8"), "{css}");
    assert!(css.contains("@media (forced-colors:active){.t-checkbox input,.t-checkbox input:checked{-webkit-appearance:auto;appearance:auto;background-image:none}}"), "{css}");
    let fc = css.find("@media (forced-colors:active)").unwrap();
    assert!(fc > css.find(".t-checkbox input:checked{").unwrap(), "forced-colors rule must come after :checked");
    // exactly one url( in the whole stylesheet, and it is the constant data: SVG (no remote fetch)
    assert_eq!(css.matches("url(").count(), 1, "{css}");
    assert_eq!(css.matches(CHECKMARK_URL).count(), 1, "{css}");
    let after = &css[css.find("url(").unwrap()..];
    let url = &after[..after.find(')').unwrap()];
    // the only http text is the SVG namespace (not a fetch); nothing else can load
    assert_eq!(url.replace("http://www.w3.org/2000/svg", "").matches("http").count(), 0, "{url}");
    for bad in ["javascript:", "expression(", "@import", "<script"] {
        assert!(!url.contains(bad), "{bad} in {url}");
    }
    // the constant lives only in kind-looks a3, never in a user-facing table
    let l = kind_looks();
    assert!(l.a3_kinds.get("checkbox").unwrap().css.contains(CHECKMARK_URL));
    for (k, v) in l.kinds.iter().chain(l.a2_kinds.iter()) {
        assert!(!v.css.contains("url("), "{k}");
    }
}

#[test]
fn user_style_cannot_inject_a_checkmark_or_url() {
    // css_safe still rejects a url( in any user value, also on a checkbox node
    assert_eq!(css_safe("url(\"data:image/svg+xml,%3Csvg%3E\")"), "");
    let hostile = CHECKED.replace(
        "\"style\": {},\n      \"props\": {\n        \"type\": \"checkbox\"",
        "\"style\": {\"backgroundColor\": \"url(https://evil.test/x.svg)\", \"color\": \"red;background-image:url(x)\"},\n      \"props\": {\n        \"type\": \"checkbox\"",
    );
    assert_ne!(hostile, CHECKED, "fixture shape changed");
    for opts in [CompileOptions::default()] {
        let (_, css) = compile_export(&doc(&hostile), &opts).unwrap();
        assert_eq!(css.matches("url(").count(), 1, "{css}");
        assert!(!css.contains("evil.test") && !css.contains("url(x)"), "{css}");
    }
    let html = compile(&doc(&hostile), &CompileOptions::default()).unwrap();
    assert!(!html.contains("evil.test") && !html.contains("url(x)"));
    assert_eq!(html.matches("url(").count(), 1, "preview has only the constant");
}

#[test]
fn explicit_style_wins_over_type_defaults_g1() {
    // gap / align-items are kind extras, not style keys; the style keys a user can set (colour, size)
    // land in the node class, which follows the type class, so they win the cascade.
    let src = CHECKED.replace(
        "\"style\": {},\n      \"props\": {\n        \"type\": \"checkbox\"",
        "\"style\": {\"color\": \"#ff0000\", \"fontSize\": 20},\n      \"props\": {\n        \"type\": \"checkbox\"",
    );
    assert_ne!(src, CHECKED);
    let (html, css) = export(&src);
    let t = css.find(".t-checkbox{").unwrap();
    let cls = html.split("<label class=\"t-checkbox ").nth(1).expect("node class").split('"').next().unwrap().to_string();
    let n = css.find(&format!(".{cls}{{")).expect("node class rule");
    assert!(n > t, "{css}");
    let rule = &css[n..n + css[n..].find('}').unwrap()];
    assert!(rule.contains("color:#ff0000") && rule.contains("font-size:20px"), "{rule}");
}

#[test]
fn round_trip_sparse_and_version_4() {
    for src in [CHECKED, UNCHECKED] {
        let d = doc(src);
        let v = serde_json::to_value(&d).unwrap();
        let back: PageDocument = serde_json::from_value(v.clone()).unwrap();
        assert_eq!(serde_json::to_value(&back).unwrap(), v);
        let n = &v["nodes"]["cb"];
        assert_eq!(n["type"], "checkbox");
        // both props always stored, including checked:false; no other keys
        let p = n["props"].as_object().unwrap();
        let mut keys: Vec<_> = p.keys().cloned().collect();
        keys.sort();
        assert_eq!(keys, ["checked", "label", "type"]);
        assert!(matches!(back.nodes["cb"].props, NodeProps::Checkbox { .. }));
    }
    assert!(is_a3_kind(NodeType::Checkbox) && is_version4_kind(NodeType::Checkbox));
    let mut d = doc(&CHECKED.replace("\"version\": 4", "\"version\": 1"));
    normalize_saved_document(&mut d);
    assert_eq!(d.version, 4, "a checkbox forces the version-4 marker (§4.4)");
    assert_eq!(ALL_TYPES.iter().filter(|t| is_a3_kind(**t)).count(), 2); // checkbox + field (A3.3)
}
