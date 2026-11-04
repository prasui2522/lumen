//! PHASE-11 A2.3 (part 2) tests: badge and scrollArea (Designer's ruling). Goldens live in
//! fixtures/a2/a23b-*.{html,css}; regenerate with `A23_BLESS=1 cargo test a23b_tests`.
use super::*;
use crate::defaults::{default_styles, NodeType, ScrollOrientation, StyleProps};

const DEFAULT: &str = include_str!("fixtures/a2/a23b-default.json");
const OVERRIDES: &str = include_str!("fixtures/a2/a23b-overrides.json");
const NESTED: &str = include_str!("fixtures/a2/a23b-nested.json");
const HOSTILE: &str = include_str!("fixtures/a2/a23b-hostile.json");
const ORIENT: &str = include_str!("fixtures/a2/scroll-orientation.json");

const FIXTURES: [(&str, &str); 4] = [("default", DEFAULT), ("overrides", OVERRIDES), ("nested", NESTED), ("hostile", HOSTILE)];

fn export(src: &str) -> (String, String) {
    let doc = parse_document(&serde_json::from_str(src).unwrap()).unwrap();
    compile_export(&doc, &CompileOptions::default()).unwrap()
}

fn golden_path(name: &str, ext: &str) -> std::path::PathBuf {
    std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join(format!("src/fixtures/a2/a23b-{name}.{ext}"))
}

#[test]
fn goldens_for_the_four_a23b_fixtures() {
    for (name, src) in FIXTURES {
        let (html, css) = export(src);
        if std::env::var("A23_BLESS").is_ok() {
            std::fs::write(golden_path(name, "html"), &html).unwrap();
            std::fs::write(golden_path(name, "css"), &css).unwrap();
            continue;
        }
        assert_eq!(html, std::fs::read_to_string(golden_path(name, "html")).unwrap(), "{name}.html");
        assert_eq!(css, std::fs::read_to_string(golden_path(name, "css")).unwrap(), "{name}.css");
        assert_eq!(export(src), (html, css), "{name} not deterministic");
    }
}

fn has(s: &str, needle: &str) -> bool {
    s.contains(needle)
}

#[test]
fn badge_is_a_span_with_the_label_and_the_ruling_values_in_its_type_rule() {
    let (html, css) = export(DEFAULT);
    assert!(has(&html, "<span class=\"t-badge\">ใหม่</span><span class=\"t-badge\"></span>"), "{html}");
    // display:inline-flex comes from default_styles; align-items / gap from the shared extras;
    // display is written exactly once (never in both places)
    assert!(has(&css, ".t-badge{display:inline-flex;padding:2px 10px 2px 10px;background-color:#0f172a;color:#ffffff;font-size:12px;font-weight:500;border-radius:200px;align-items:center;gap:4px}"), "{css}");
    assert_eq!(css.matches("display:inline-flex").count(), 1, "{css}");
    // the badge is not given a role, tabindex or aria-label
    assert!(!has(&html, "t-badge\" role") && !has(&html, "t-badge\" tabindex"), "{html}");
}

#[test]
fn an_explicit_badge_style_wins_over_the_defaults_and_the_extras() {
    let (html, css) = export(OVERRIDES);
    assert!(has(&html, "<span class=\"t-badge n1\">ปรับสไตล์</span>"), "{html}");
    // display:inline-block / flex written by the node override the type rule (G1)
    assert!(has(&css, ".n1{display:inline-block;padding:4px 4px 4px 4px;background-color:#16a34a;font-size:20px;border-radius:4px}"), "{css}");
    assert!(has(&css, ".n2{display:flex;width:120px;color:#000000}"), "{css}");
    // an override that does not touch `display` leaves the type rule's inline-flex alone
    assert!(has(&css, ".n3{border-width:1px;border-color:#0ea5e9;border-style:solid}"), "{css}");
}

#[test]
fn scroll_area_has_overflow_auto_in_its_type_rule_and_a_name_makes_it_a_region() {
    let (html, css) = export(DEFAULT);
    assert!(has(&css, ".t-scrollArea{display:flex;width:100%;overflow:auto}"), "{css}");
    assert!(has(&html, "<div class=\"t-scrollArea n1\" role=\"region\" aria-label=\"รายการเลื่อน\" tabindex=\"0\">"), "{html}");
    // the layer name is the fallback, the label wins when both exist
    assert!(has(&html, "role=\"region\" aria-label=\"พื้นที่เลื่อนแนวนอน\" tabindex=\"0\""), "{html}");
    // no name -> still focusable (keyboard scrolling) but no role / aria-label
    assert!(has(&html, "<div class=\"t-scrollArea n3\" tabindex=\"0\"></div>"), "{html}");
    let (html, _) = export(OVERRIDES);
    assert!(has(&html, "aria-label=\"เลื่อนแนวนอน\""), "label beats the layer name");
    assert!(has(&html, "aria-label=\"เลื่อนตั้ง\""), "layer name used when no label");
    // a whitespace-only label and no name: nothing
    assert!(has(&html, "<div class=\"t-scrollArea n9\" tabindex=\"0\">"), "{html}");
}

#[test]
fn scroll_orientation_follows_the_shared_table() {
    let rows: Vec<serde_json::Value> = serde_json::from_str(ORIENT).unwrap();
    assert!(rows.len() >= 10);
    for r in rows {
        let o: ScrollOrientation = serde_json::from_value(r["orientation"].clone()).unwrap();
        let ov = r["overflow"].as_str();
        let got: Vec<(String, String)> = scroll_axis_decls(o, ov).into_iter().map(|(k, v)| (k.to_string(), v)).collect();
        let want: Vec<(String, String)> = r["decls"]
            .as_array()
            .unwrap()
            .iter()
            .map(|d| (d[0].as_str().unwrap().to_string(), d[1].as_str().unwrap().to_string()))
            .collect();
        assert_eq!(got, want, "{r}");
    }
}

#[test]
fn explicit_overflow_wins_and_no_axis_rule_is_written_for_it() {
    let (_, css) = export(OVERRIDES);
    // overflow:scroll + horizontal -> overflow-y after the shorthand; hidden / visible: nothing
    assert!(has(&css, ".n5{max-width:120px;overflow:scroll;display:flex;flex-direction:row;gap:8px;align-items:stretch;justify-content:flex-start;overflow-y:hidden}"), "{css}");
    assert!(has(&css, ".n6{height:40px;overflow:hidden;display:flex;flex-direction:column;gap:0px;align-items:stretch;justify-content:flex-start}"), "{css}");
    assert!(has(&css, ".n7{overflow:visible;display:flex;flex-direction:column;gap:0px;align-items:stretch;justify-content:flex-start}"), "{css}");
    // the scrollArea's own direction / gap / align / justify props reach the output (n5 row+8, n8 center+between)
    // orientation both: no per-axis rule
    assert!(has(&css, ".n8{width:200px;height:50px;display:flex;flex-direction:column;gap:0px;align-items:center;justify-content:space-between}"), "{css}");
}

#[test]
fn nested_badge_and_scroll_area_render_everywhere_including_inside_a_button_group() {
    let (html, css) = export(NESTED);
    for t in ["สถานะ", "ในแจ้งเตือน", "ซ้อนสอง", "ป้ายในกลุ่ม", "เลื่อนในกลุ่ม", "ซ้าย", "ขวา"] {
        assert!(has(&html, t), "{t}\n{html}");
    }
    // a badge in the middle of a group is square, the scrollArea (no radius of its own) gets nothing
    assert!(has(&css, ".n4{border-radius:0px}"), "{css}");
    assert!(has(&html, "<div class=\"t-scrollArea n5\" role=\"region\" aria-label=\"ในกลุ่ม\""), "{html}");
    // the nested scrollArea of an alert has its own class and no region role (no name)
    assert!(has(&html, "<div class=\"t-scrollArea n2\" tabindex=\"0\">"), "{html}");
}

#[test]
fn hostile_badge_and_scroll_area_values_cannot_break_out() {
    let (html, css) = export(HOSTILE);
    assert!(!has(&html, "<script") && !has(&html, "<b onload") && !has(&html, "</style><b"), "{html}");
    assert!(has(&html, "aria-label=\"&lt;/style&gt;&lt;b onload=x&gt;\"") && has(&html, "aria-label=\"&quot;onfocus=&quot;x\""), "{html}");
    for bad in ["url(", "linear-gradient", "expression(", "var(", "!important", "evil.test", "</style", "<script"] {
        assert!(!has(&css, bad), "{bad}\n{css}");
    }
    // the style block still has exactly the rules it should (no injected selector / brace)
    assert_eq!(css.matches('{').count(), css.matches('}').count(), "{css}");
    // a hostile overflow value is not `auto` / `scroll`, so no axis rule is written for it
    assert!(!has(&css, "overflow-x:hidden;overflow") && !has(&css, "overflow-y"), "{css}");
    assert!(!has(&css, ".n5{overflow:auto/style;display:flex;flex-direction:column;gap:0px;align-items:stretch;justify-content:flex-start;overflow-"), "{css}");
}

#[test]
fn preview_and_export_agree_for_the_two_kinds() {
    for (name, src) in FIXTURES {
        let (ex, _) = export(src);
        let prev = compile_json(src, &CompileOptions { preview: true, ..Default::default() }).unwrap();
        for tag in ["t-badge", "t-scrollArea"] {
            assert_eq!(ex.matches(tag).count() > 0, prev.matches(tag).count() > 0, "{name} {tag}");
        }
        assert!(!ex.contains(" id=\""), "{name}");
    }
}

#[test]
fn display_inline_flex_and_overflow_auto_round_trip_through_the_document_model() {
    let mut v: serde_json::Value = serde_json::from_str(OVERRIDES).unwrap();
    v["nodes"]["bd3"]["style"]["display"] = serde_json::json!("inline-flex");
    for ov in ["auto", "scroll", "hidden", "visible"] {
        v["nodes"]["sa1"]["style"]["overflow"] = serde_json::json!(ov);
        let doc = parse_document(&v).unwrap();
        let back = serde_json::to_value(&doc).unwrap();
        assert_eq!(back["nodes"]["sa1"]["style"]["overflow"], ov);
        assert_eq!(back["nodes"]["bd3"]["style"]["display"], "inline-flex");
        // parse(serialize(doc)) is stable
        assert_eq!(serde_json::to_value(parse_document(&back).unwrap()).unwrap(), back);
    }
    // is_empty looks at both keys: a style with only one of them is an override
    let only_overflow: StyleProps = serde_json::from_value(serde_json::json!({"overflow": "auto"})).unwrap();
    let only_display: StyleProps = serde_json::from_value(serde_json::json!({"display": "inline-flex"})).unwrap();
    assert!(!only_overflow.is_empty() && !only_display.is_empty());
    assert!(StyleProps::default().is_empty());
}

#[test]
fn the_default_styles_of_the_two_kinds_carry_the_ruling_values() {
    let b = default_styles(NodeType::Badge);
    assert_eq!(b.display.as_deref(), Some("inline-flex"));
    assert_eq!(b.overflow, None);
    let s = default_styles(NodeType::ScrollArea);
    assert_eq!(s.overflow.as_deref(), Some("auto"));
    assert_eq!(s.display.as_deref(), Some("flex"));
    // the shared kind-looks file never repeats them
    let l = kind_looks();
    for k in l.a2_kinds.values() {
        assert!(k.extras.iter().all(|(p, _)| *p != "display" && *p != "overflow"));
    }
}

// ---- F7: the aspectRatio set is exactly the spec's five; anything else is refused when read ----
#[test]
fn only_the_five_spec_ratios_are_accepted_everything_else_is_refused_at_parse() {
    const DOC: &str = include_str!("fixtures/a2/a23-default.json");
    for ok in ["16/9", "4/3", "1/1", "3/2", "21/9"] {
        let mut v: serde_json::Value = serde_json::from_str(DOC).unwrap();
        v["nodes"]["ar"]["props"]["ratio"] = serde_json::json!(ok);
        assert!(parse_document(&v).is_ok(), "{ok}");
    }
    // 9/16 is NOT in the set (PM ruling); neither are other spellings
    for bad in ["9/16", "16:9", "16 / 9", "", " 4/3", "2/1", "16/9;}x{y:z"] {
        let mut v: serde_json::Value = serde_json::from_str(DOC).unwrap();
        v["nodes"]["ar"]["props"]["ratio"] = serde_json::json!(bad);
        assert!(parse_document(&v).is_err(), "{bad:?}");
    }
    // the TS list in src/schema.ts is the same five (a2-looks.test.ts checks the other side)
    let schema = include_str!("../../src/schema.ts");
    assert!(schema.contains(r#"ASPECT_RATIOS = ["16/9", "4/3", "1/1", "3/2", "21/9"] as const"#));
}

// ---- F9: a missing / malformed section of the shared look file is a hard error ----
#[test]
fn a_missing_section_of_kind_looks_is_a_hard_error_not_empty_looks() {
    let full: serde_json::Value = serde_json::from_str(include_str!("../../src/lib/kind-looks.json")).unwrap();
    assert!(parse_kind_looks_checked(&full.to_string()).is_ok());
    for (path, mutate) in [
        ("a2", Box::new(|v: &mut serde_json::Value| { v.as_object_mut().unwrap().remove("a2"); }) as Box<dyn Fn(&mut serde_json::Value)>),
        ("a2.kinds", Box::new(|v| { v["a2"].as_object_mut().unwrap().remove("kinds"); })),
        ("a2.texts", Box::new(|v| { v["a2"].as_object_mut().unwrap().remove("texts"); })),
        ("kinds", Box::new(|v| { v.as_object_mut().unwrap().remove("kinds"); })),
        ("palette", Box::new(|v| { v.as_object_mut().unwrap().remove("palette"); })),
        ("facing", Box::new(|v| { v.as_object_mut().unwrap().remove("facing"); })),
        ("facingBorder", Box::new(|v| { v.as_object_mut().unwrap().remove("facingBorder"); })),
    ] {
        let mut v = full.clone();
        mutate(&mut v);
        let err = parse_kind_looks_checked(&v.to_string()).err().unwrap_or_else(|| panic!("{path}: accepted"));
        assert!(err.contains(&format!("`{path}`")), "{path}: {err}");
    }
    assert!(parse_kind_looks_checked("{").err().unwrap().contains("not valid JSON"));
    // a malformed a2 kind entry is refused too
    let mut v = full.clone();
    v["a2"]["kinds"]["badge"] = serde_json::json!({"extras": "x"});
    assert!(parse_kind_looks_checked(&v.to_string()).err().unwrap().contains("a2.kinds"));
    // the embedded file itself loads
    assert!(!kind_looks().a2_kinds.is_empty());
}

// ---- F8: a bordered separator without its own colour draws the inherited text colour on both sides ----
#[test]
fn separator_colour_is_inherited_not_the_ua_grey_and_an_own_colour_still_wins() {
    let doc = serde_json::json!({
        "version": 4, "meta": {"title": "sep", "lang": "th"}, "root": "root",
        "nodes": {
            "root": {"id": "root", "type": "page", "props": {"type": "page", "children": ["s1", "s2", "s3"]}, "style": {}},
            "s1": {"id": "s1", "type": "separator", "props": {"type": "separator", "orientation": "horizontal"}, "style": {"borderWidth": 2, "borderStyle": "solid"}},
            "s2": {"id": "s2", "type": "separator", "props": {"type": "separator", "orientation": "horizontal"}, "style": {"borderWidth": 2, "borderStyle": "solid", "color": "#ef4444"}},
            "s3": {"id": "s3", "type": "separator", "props": {"type": "separator", "orientation": "vertical"}, "style": {}}
        }
    });
    let (html, css) = export(&doc.to_string());
    assert!(css.contains(".t-separator{display:block;width:100%;height:1px;background-color:#e2e8f0;color:inherit}"), "{css}");
    // s1 has no colour of its own: nothing but the type rule sets `color`
    assert!(html.contains("<hr class=\"t-separator n1\">"), "{html}");
    assert!(css.contains(".n1{border-width:2px;border-style:solid}"), "{css}");
    // s2 sets its own colour: it follows the type rule, so it wins
    assert!(css.contains(".n2{") && css.contains("color:#ef4444"), "{css}");
    // vertical separator: same type rule (a div inherits anyway)
    assert!(html.contains("<div class=\"t-separator n3\" role=\"separator\" aria-orientation=\"vertical\"></div>") || html.contains("role=\"separator\" aria-orientation=\"vertical\""), "{html}");
}
