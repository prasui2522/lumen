//! PHASE-11 A2.2 tests: children of the new container kinds are reachable through
//! `children()`, the A2.3 arms draw them (all nine kinds since part 2), cycles and
//! dangling ids cannot hang or panic the compiler.
use super::*;

const NEST: &str = include_str!("fixtures/a2/seed-a2-nest.json");

fn compile(v: &serde_json::Value) -> (String, String) {
    let doc = parse_document(v).unwrap();
    compile_export(&doc, &CompileOptions::default()).unwrap()
}

#[test]
fn nested_a2_documents_render_all_their_children() {
    let v: serde_json::Value = serde_json::from_str(NEST).unwrap();
    let (html, css) = compile(&v);
    // card > alert > aspectRatio > scrollArea > buttonGroup > buttons, the card's text, and the
    // container with a badge and a heading: nothing is skipped any more.
    for text in ["หัวข้อ", "ข้อความในการ์ด", ">ก<", ">ข<", "ป้าย"] {
        assert!(html.contains(text), "{text}\n{html}");
    }
    for here in ["t-card", "t-alert", "t-aspectRatio", "t-scrollArea", "t-buttonGroup", "t-badge", "t-button"] {
        assert!(html.contains(here) && css.contains(here), "{here}");
    }
    // the dangling card is drawn empty, its missing child is skipped
    assert!(html.matches("t-card").count() == 2, "{html}");
}

#[test]
fn a_child_removed_from_a_container_leaves_no_trace_in_the_output() {
    let mut v: serde_json::Value = serde_json::from_str(NEST).unwrap();
    let with = compile(&v);
    assert!(with.0.contains("ป้าย") && with.0.contains(">ก<"));
    v["nodes"]["grp"]["props"]["children"] = serde_json::json!(["hd"]);
    v["nodes"]["scroll1"]["props"]["children"] = serde_json::json!([]);
    let (html, _) = compile(&v);
    assert!(!html.contains("ป้าย") && !html.contains(">ก<") && !html.contains(">ข<"), "{html}");
    assert!(html.contains("t-scrollArea"));
}

#[test]
fn a_card_that_contains_itself_or_a_missing_id_does_not_hang_or_panic() {
    let mut v: serde_json::Value = serde_json::from_str(NEST).unwrap();
    v["nodes"]["card1"]["props"]["children"] = serde_json::json!(["card1", "ghost", "alert1"]);
    let (html, _) = compile(&v);
    assert!(html.contains("t-page"));
}
