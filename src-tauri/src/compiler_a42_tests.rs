//! PHASE-11 A4.2 tests: the table kind (spec §9 A4, T29–T34).
//! Goldens: fixtures/a4/a42-{minimal,striped,caption,big}.{html,css}; regenerate with `A42_BLESS=1 cargo test a42_tests`.
use super::*;
use crate::defaults::{is_a4_kind, is_version4_kind, NodeProps, NodeType, PageDocument};

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
    ("a42-minimal", include_str!("fixtures/a4/a42-minimal.json")),
    ("a42-striped", include_str!("fixtures/a4/a42-striped.json")),
    ("a42-caption", include_str!("fixtures/a4/a42-caption.json")),
    ("a42-big", include_str!("fixtures/a4/a42-big.json")),
];

#[test]
fn goldens_for_table_variants() {
    for (name, src) in FIXTURES {
        let (html, css) = export(src);
        if std::env::var("A42_BLESS").is_ok() {
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
fn wrapper_region_and_table_shape() {
    let (h, css) = export(FIXTURES[0].1);
    assert!(h.contains("<div class=\"t-tablewrap\" role=\"region\" aria-label=\"Table\" tabindex=\"0\">"), "{h}");
    assert!(h.contains("<table class=\"t-table\">"), "{h}");
    assert!(h.contains("<thead><tr><th scope=\"col\">A</th><th scope=\"col\">B</th></tr></thead>"), "{h}");
    assert!(h.contains("<td>1</td><td>2</td>"), "{h}");
    assert!(css.contains(".t-tablewrap{overflow-x:auto}"), "{css}");
    assert!(css.contains(".t-table--striped tbody tr:nth-child(even){background:#f8fafc}"), "{css}");

    let (striped, _) = export(FIXTURES[1].1);
    assert!(striped.contains("t-table--striped"), "{striped}");

    let (cap, _) = export(FIXTURES[2].1);
    assert!(cap.contains("aria-label=\"Sales Q1\""), "{cap}");
    assert!(cap.contains("<caption>Sales Q1</caption>"), "{cap}");
    assert!(!cap.contains("<thead>"), "{cap}");
}

#[test]
fn cells_are_escaped_and_capped() {
    let src = FIXTURES[0].1.replace("\"1\"", "\"<b>&\\\"x\"");
    let (h, _) = export(&src);
    assert!(h.contains("<td>&lt;b&gt;&amp;&quot;x</td>"), "{h}");

    let cols: Vec<String> = (0..25).map(|i| format!("c{i}")).collect();
    let col_json = cols.iter().map(|c| format!("\"{c}\"")).collect::<Vec<_>>().join(",");
    let row: Vec<String> = (0..25).map(|i| format!("v{i}")).collect();
    let row_json = row.iter().map(|c| format!("\"{c}\"")).collect::<Vec<_>>().join(",");
    let many_rows: String = (0..110)
        .map(|_| format!("[{row_json}]"))
        .collect::<Vec<_>>()
        .join(",");
    let src = format!(
        r#"{{"version":4,"meta":{{"title":"cap","lang":"th"}},"root":"root","nodes":{{
      "root":{{"id":"root","type":"page","props":{{"type":"page","children":["t1"]}},"style":{{}}}},
      "t1":{{"id":"t1","type":"table","props":{{"type":"table","columns":[{col_json}],"rows":[{many_rows}],"headerRow":true,"striped":false}},"style":{{}}}}
    }}}}"#
    );
    let (h, _) = export(&src);
    assert_eq!(h.matches("<th scope=\"col\">").count(), 20, "{h}");
    assert_eq!(h.matches("<tr>").count(), 101, "{h}"); // 1 header + 100 body rows
    assert!(!h.contains("v20"), "{h}");
    assert!(!h.contains("c20"), "{h}");
}

#[test]
fn table_is_version4_kind_and_in_all_types() {
    assert!(is_a4_kind(NodeType::Table));
    assert!(is_version4_kind(NodeType::Table));
    assert!(ALL_TYPES.contains(&NodeType::Table));
    assert_eq!(ALL_TYPES.len(), 63);
    assert_eq!(ALL_TYPES.iter().filter(|t| is_a4_kind(**t)).count(), 3);
    assert_eq!(type_name(NodeType::Table), "table");
    let l = kind_looks();
    assert!(l.a4_kinds.contains_key("table"));
    assert!(l.a4_kinds.get("table").unwrap().css.contains("t-tablewrap"));
}

#[test]
fn no_script_in_table_export() {
    for (_, src) in FIXTURES {
        let (html, css) = export(src);
        for bad in ["<script", "onclick", "javascript:"] {
            assert!(!html.contains(bad) && !css.contains(bad), "{bad}");
        }
    }
    let _ = NodeProps::Table {
        columns: vec![],
        rows: vec![],
        caption: None,
        header_row: true,
        striped: false,
    };
}
