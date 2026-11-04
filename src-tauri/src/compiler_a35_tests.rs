//! PHASE-11 A3.5: `input.suggestions` → native `<datalist>` (unique dl ids; empty emits nothing).
//! Goldens: fixtures/a3/a35-suggestions.{html,css}. Regenerate with `A35_BLESS=1 cargo test a35_tests`.
use super::*;
use crate::defaults::PageDocument;

const SRC: &str = include_str!("fixtures/a3/a35-suggestions.json");

fn doc() -> PageDocument {
    parse_document(&serde_json::from_str(SRC).unwrap()).unwrap()
}
fn export() -> (String, String) {
    compile_export(&doc(), &CompileOptions::default()).unwrap()
}
fn golden(ext: &str) -> std::path::PathBuf {
    std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join(format!("src/fixtures/a3/a35-suggestions.{ext}"))
}

#[test]
fn goldens_suggestions_datalist() {
    let (html, css) = export();
    if std::env::var("A35_BLESS").is_ok() {
        std::fs::write(golden("html"), &html).unwrap();
        std::fs::write(golden("css"), &css).unwrap();
        return;
    }
    assert_eq!(html, std::fs::read_to_string(golden("html")).unwrap());
    assert_eq!(css, std::fs::read_to_string(golden("css")).unwrap());
}

#[test]
fn empty_suggestions_emits_nothing() {
    let (html, _) = export();
    // input c has no suggestions key
    assert!(html.contains(r#"placeholder="ว่าง""#), "{html}");
    let after_c = html.split(r#"placeholder="ว่าง""#).nth(1).unwrap();
    assert!(!after_c.contains("datalist"), "{after_c}");
    // No list= on c: the bare input opens then closes with no list attr
    assert!(
        html.contains(r#"placeholder="ว่าง""#) && !html.contains(r#"placeholder="ว่าง" list="#),
        "{html}"
    );
}

#[test]
fn datalist_ids_are_unique_per_page_and_linked() {
    let (html, _) = export();
    // Compiler next_uid starts at 1 (same as tip/tab/field).
    assert!(html.contains(r#"list="dl1""#), "{html}");
    assert!(html.contains(r#"<datalist id="dl1">"#), "{html}");
    assert!(html.contains(r#"list="dl2""#), "{html}");
    assert!(html.contains(r#"<datalist id="dl2">"#), "{html}");
    assert!(!html.contains("dl3"), "{html}");
    assert_eq!(html.matches("<datalist").count(), 2);
    // labelled input keeps label wrapping the control; datalist follows outside
    assert!(html.contains("</label><datalist id=\"dl2\">"), "{html}");
    assert!(html.contains("<label>ชื่อ<input"), "{html}");
}

#[test]
fn suggestion_values_are_escaped() {
    let (html, _) = export();
    assert!(html.contains(r#"value="A &amp; B""#), "{html}");
    assert!(html.contains(r#"value="&lt;C&gt;""#), "{html}");
    assert!(!html.contains(r#"value="A & B""#), "{html}");
    assert!(!html.contains(r#"value="<C>""#), "{html}");
}

#[test]
fn no_script_no_handlers() {
    let (html, _) = export();
    let low = html.to_ascii_lowercase();
    assert!(!low.contains("<script"));
    assert!(!low.contains("onclick=") && !low.contains("onchange="));
}

#[test]
fn absent_and_empty_array_are_equivalent_on_the_wire() {
    // Sparse: no key → empty Vec after parse; serialize drops empty.
    let v: serde_json::Value = serde_json::from_str(SRC).unwrap();
    assert!(v["nodes"]["c"]["props"].get("suggestions").is_none());
    let d = doc();
    match &d.nodes["c"].props {
        crate::defaults::NodeProps::Input { suggestions, .. } => assert!(suggestions.is_empty()),
        other => panic!("{other:?}"),
    }
    let back = serde_json::to_value(&d).unwrap();
    assert!(back["nodes"]["c"]["props"].get("suggestions").is_none());
}
