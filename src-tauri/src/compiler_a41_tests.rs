//! PHASE-11 A4.1 tests: the list kind (spec §9 A4, T24–T28; G1–G6).
//! Goldens: fixtures/a4/a41-{disc,decimal,check,none}.{html,css}; regenerate with `A41_BLESS=1 cargo test a41_tests`.
use super::*;
use crate::defaults::{is_a4_kind, is_version4_kind, ListMarker, NodeProps, NodeType, PageDocument};

fn doc(src: &str) -> PageDocument {
    parse_document(&serde_json::from_str(src).unwrap()).unwrap()
}
fn export(src: &str) -> (String, String) {
    compile_export(&doc(src), &CompileOptions::default()).unwrap()
}
fn golden(name: &str, ext: &str) -> std::path::PathBuf {
    std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join(format!("src/fixtures/a4/{name}.{ext}"))
}

const FIXTURES: [(&str, &str); 4] = [
    ("a41-disc", include_str!("fixtures/a4/a41-disc.json")),
    ("a41-decimal", include_str!("fixtures/a4/a41-decimal.json")),
    ("a41-check", include_str!("fixtures/a4/a41-check.json")),
    ("a41-none", include_str!("fixtures/a4/a41-none.json")),
];

#[test]
fn goldens_for_four_markers() {
    for (name, src) in FIXTURES {
        let (html, css) = export(src);
        if std::env::var("A41_BLESS").is_ok() {
            std::fs::write(golden(name, "html"), &html).unwrap();
            std::fs::write(golden(name, "css"), &css).unwrap();
            continue;
        }
        assert_eq!(html, std::fs::read_to_string(golden(name, "html")).unwrap(), "{name} html");
        assert_eq!(css, std::fs::read_to_string(golden(name, "css")).unwrap(), "{name} css");
        assert_eq!(export(src), (html, css), "{name} not deterministic");
    }
}

#[test]
fn marker_shapes_and_role_list() {
    let (disc, _) = export(FIXTURES[0].1);
    assert!(disc.contains("<ul class=\"t-list t-list--disc"), "{disc}");
    assert!(disc.contains("<li>หนึ่ง</li><li>สอง</li><li>สาม</li>"), "{disc}");
    assert!(!disc.contains("role=\"list\""), "{disc}");

    let (decimal, _) = export(FIXTURES[1].1);
    assert!(decimal.contains("<ol class=\"t-list t-list--decimal"), "{decimal}");
    assert!(!decimal.contains("role=\"list\""), "{decimal}");

    let (check, css_check) = export(FIXTURES[2].1);
    assert!(check.contains("<ul class=\"t-list t-list--check"), "{check}");
    assert!(check.contains("role=\"list\""), "{check}");
    assert!(css_check.contains("-webkit-mask-image:url(\"data:image/svg+xml,"), "{css_check}");
    assert!(css_check.contains("mask-image:url(\"data:image/svg+xml,"), "{css_check}");
    // No text-glyph content for the checkmark (mask only).
    assert!(!css_check.contains("content:\"✓\""), "{css_check}");
    assert!(!css_check.contains("content:'✓'"), "{css_check}");

    let (none, _) = export(FIXTURES[3].1);
    assert!(none.contains("<ul class=\"t-list t-list--none"), "{none}");
    assert!(none.contains("role=\"list\""), "{none}");
}

#[test]
fn items_are_escaped_and_capped_at_50() {
    let src = FIXTURES[0].1.replace("หนึ่ง", "<b>&\\\"x");
    let (h, _) = export(&src);
    assert!(h.contains("<li>&lt;b&gt;&amp;&quot;x</li>"), "{h}");

    let many: Vec<String> = (0..60).map(|i| format!("\"i{i}\"")).collect();
    let items = many.join(",");
    let src = format!(
        r#"{{"version":4,"meta":{{"title":"c","lang":"th"}},"root":"root","nodes":{{
      "root":{{"id":"root","type":"page","props":{{"type":"page","children":["l1"]}},"style":{{}}}},
      "l1":{{"id":"l1","type":"list","props":{{"type":"list","items":[{items}],"ordered":false,"marker":"disc"}},"style":{{}}}}
    }}}}"#
    );
    let (h, _) = export(&src);
    assert!(h.contains("<li>i49</li>"), "{h}");
    assert!(!h.contains("<li>i50</li>"), "{h}");
    assert_eq!(h.matches("<li>").count(), 50, "{h}");
}

#[test]
fn list_is_version4_kind_and_in_all_types() {
    assert!(is_a4_kind(NodeType::List));
    assert!(is_version4_kind(NodeType::List));
    assert!(ALL_TYPES.contains(&NodeType::List));
    assert_eq!(ALL_TYPES.len(), 59);
    assert_eq!(ALL_TYPES.iter().filter(|t| is_a4_kind(**t)).count(), 3);
    assert_eq!(type_name(NodeType::List), "list");
    let l = kind_looks();
    assert!(l.a4_kinds.contains_key("list"));
    assert!(l.a4_kinds.get("list").unwrap().css.contains("t-list--check"));
}

#[test]
fn no_script_in_list_export() {
    for (_, src) in FIXTURES {
        let (html, css) = export(src);
        for bad in ["<script", "onclick", "javascript:"] {
            assert!(!html.contains(bad) && !css.contains(bad), "{bad}");
        }
    }
    let _ = NodeProps::List {
        items: vec![],
        ordered: false,
        marker: ListMarker::Disc,
    };
}
