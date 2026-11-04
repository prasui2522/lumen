//! PHASE-11 A3.4: existing `select` is the native select (no new kind); options escaped; 100-cap.
//! Goldens: fixtures/a3/a34-escape.{html,css}. Regenerate with `A34_BLESS=1 cargo test a34_tests`.
use super::*;
use crate::defaults::{NodeType, PageDocument};

const ESCAPE: &str = include_str!("fixtures/a3/a34-escape.json");

fn doc(src: &str) -> PageDocument {
    parse_document(&serde_json::from_str(src).unwrap()).unwrap()
}
fn export(src: &str) -> (String, String) {
    compile_export(&doc(src), &CompileOptions::default()).unwrap()
}
fn golden(ext: &str) -> std::path::PathBuf {
    std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join(format!("src/fixtures/a3/a34-escape.{ext}"))
}

#[test]
fn no_native_select_kind_select_wire_name_unchanged() {
    assert_eq!(type_name(NodeType::Select), "select");
    let names: Vec<&str> = ALL_TYPES.iter().map(|t| type_name(*t)).collect();
    assert!(!names.iter().any(|n| *n == "nativeSelect"));
    assert_eq!(ALL_TYPES.len(), 59); // A4.2 table
}

#[test]
fn options_with_lt_and_amp_are_escaped_in_value_and_text() {
    let (html, css) = export(ESCAPE);
    if std::env::var("A34_BLESS").is_ok() {
        std::fs::write(golden("html"), &html).unwrap();
        std::fs::write(golden("css"), &css).unwrap();
        return;
    }
    assert_eq!(html, std::fs::read_to_string(golden("html")).unwrap());
    assert_eq!(css, std::fs::read_to_string(golden("css")).unwrap());
    assert!(html.contains(r#"value="A &amp; B""#), "{html}");
    assert!(html.contains(r#"value="&lt;C&gt;""#), "{html}");
    assert!(html.contains(">A &amp; B</option>"), "{html}");
    assert!(html.contains(">&lt;C&gt;</option>"), "{html}");
    assert!(!html.contains("value=\"A & B\""), "{html}");
    assert!(!html.contains("value=\"<C>\""), "{html}");
}

#[test]
fn more_than_100_options_are_truncated_at_export() {
    let opts: Vec<String> = (1..=120).map(|i| format!("o{i}")).collect();
    let opts_json = serde_json::to_string(&opts).unwrap();
    let src = format!(
        r#"{{"version":1,"meta":{{"title":"a34","lang":"th"}},"root":"root","nodes":{{
      "root":{{"id":"root","type":"page","props":{{"type":"page","children":["s"]}},"style":{{}}}},
      "s":{{"id":"s","type":"select","props":{{"type":"select","value":"o1","options":{opts_json}}},"style":{{}}}}
    }}}}"#
    );
    let (html, _) = export(&src);
    assert_eq!(html.matches("<option").count(), MAX_SELECT_OPTIONS);
    assert!(html.contains(">o100</option>"), "{html}");
    assert!(!html.contains(">o101</option>"), "{html}");
    assert!(!html.contains(">o120</option>"), "{html}");
}
