//! PHASE-11 A3.3 tests: the `field` kind (spec §9 A3; FOLLOWUPS 68.4).
//! Goldens: fixtures/a3/a33-{input,textarea,checkbox,select,button,empty}.{html,css}.
//! Regenerate with `A33_BLESS=1 cargo test a33_tests`.
use super::*;
use crate::defaults::{is_a3_kind, is_version4_kind, NodeType, PageDocument};
use std::collections::HashSet;

const CASES: &[&str] = &[
    "a33-input",
    "a33-textarea",
    "a33-checkbox",
    "a33-select",
    "a33-button",
    "a33-empty",
];

fn src(name: &str) -> String {
    std::fs::read_to_string(golden(name, "json")).unwrap()
}
fn doc(name: &str) -> PageDocument {
    parse_document(&serde_json::from_str(&src(name)).unwrap()).unwrap()
}
fn export_named(name: &str) -> (String, String) {
    compile_export(&doc(name), &CompileOptions::default()).unwrap()
}
fn golden(name: &str, ext: &str) -> std::path::PathBuf {
    std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join(format!("src/fixtures/a3/{name}.{ext}"))
}

#[test]
fn goldens_for_each_first_child_case() {
    for name in CASES {
        let (html, css) = export_named(name);
        if std::env::var("A33_BLESS").is_ok() {
            std::fs::write(golden(name, "html"), &html).unwrap();
            std::fs::write(golden(name, "css"), &css).unwrap();
            continue;
        }
        assert_eq!(html, std::fs::read_to_string(golden(name, "html")).unwrap(), "{name} html");
        assert_eq!(css, std::fs::read_to_string(golden(name, "css")).unwrap(), "{name} css");
        assert_eq!(export_named(name), (html, css), "{name} not deterministic"); // G6
    }
}

#[test]
fn pairable_children_get_id_for_and_describedby() {
    for (name, control) in [
        ("a33-input", "input"),
        ("a33-textarea", "textarea"),
        ("a33-checkbox", "input"),
        ("a33-select", "select"),
    ] {
        let (html, _) = export_named(name);
        assert!(html.contains("<label for=\"f1\">ชื่อ</label>"), "{name}: {html}");
        assert!(html.contains(&format!("<{control}")), "{name}");
        assert!(html.contains("id=\"f1\""), "{name}: {html}");
        assert!(html.contains("aria-describedby=\"f1-d f1-e\""), "{name}: {html}");
        assert!(html.contains("<p class=\"t-field-d\" id=\"f1-d\">คำอธิบายสั้น</p>"), "{name}");
        assert!(html.contains("<p class=\"t-field-e\" id=\"f1-e\">จำเป็น</p>"), "{name}");
        // Never nested orphan labels for the field caption itself
        assert!(!html.contains("<label>ชื่อ</label>"), "{name}");
    }
}

#[test]
fn unpaired_button_uses_span_never_orphan_label() {
    let (html, _) = export_named("a33-button");
    assert!(html.contains("<span class=\"t-field-label\">ชื่อ</span>"), "{html}");
    assert!(!html.contains("<label for="), "{html}");
    assert!(!html.contains("aria-describedby"), "{html}");
    // desc/error still emit, but without ids (no pairing)
    assert!(html.contains("<p class=\"t-field-d\">คำอธิบายสั้น</p>"), "{html}");
    assert!(html.contains("<p class=\"t-field-e\">จำเป็น</p>"), "{html}");
    assert!(!html.contains("id=\"f1"), "{html}");
}

#[test]
fn empty_field_omits_desc_error_and_has_no_pairing() {
    let (html, _) = export_named("a33-empty");
    assert!(html.contains("<label") == false || html.contains("t-field-label") || html.contains(">ว่าง<"), "{html}");
    // empty has a label "ว่าง" but no children → span (unpaired)
    assert!(html.contains("<span class=\"t-field-label\">ว่าง</span>"), "{html}");
    assert!(!html.contains("t-field-d") && !html.contains("t-field-e"), "{html}");
    assert!(!html.contains("for=\""), "{html}");
}

#[test]
fn axe_style_every_label_has_a_matching_for_target() {
    for name in CASES {
        let (html, _) = export_named(name);
        // Collect id="…" and for="…"
        let mut ids: HashSet<String> = HashSet::new();
        let mut fors: Vec<String> = Vec::new();
        let mut rest = html.as_str();
        while let Some(i) = rest.find("id=\"") {
            rest = &rest[i + 4..];
            let end = rest.find('"').unwrap();
            ids.insert(rest[..end].to_string());
            rest = &rest[end + 1..];
        }
        rest = html.as_str();
        while let Some(i) = rest.find("for=\"") {
            rest = &rest[i + 5..];
            let end = rest.find('"').unwrap();
            fors.push(rest[..end].to_string());
            rest = &rest[end + 1..];
        }
        for f in &fors {
            assert!(ids.contains(f), "{name}: <label for=\"{f}\"> has no matching id; ids={ids:?}\n{html}");
        }
    }
}

#[test]
fn field_look_and_layout_are_shared_constants() {
    let (_, css) = export_named("a33-input");
    assert!(css.contains(".t-field{display:flex;flex-direction:column;gap:6px;align-items:stretch;justify-content:flex-start}"), "{css}");
    assert!(css.contains(".t-field>label,.t-field>.t-field-label{font-size:14px;font-weight:500}"), "{css}");
    assert!(css.contains(".t-field>.t-field-d{margin:0px;color:#64748b;font-size:14px}"), "{css}");
    assert!(css.contains(".t-field>.t-field-e{margin:0px;color:#b91c1c;font-size:14px}"), "{css}");
    let l = kind_looks();
    assert!(l.a3_kinds.contains_key("field"));
    assert!(!l.kinds.contains_key("field"));
}

#[test]
fn field_is_a3_version4_kind() {
    assert!(is_a3_kind(NodeType::Field) && is_version4_kind(NodeType::Field));
    let d = doc("a33-input");
    // A document that holds a field saves as version 4 (normalize keeps it).
    assert!(d.nodes.values().any(|n| n.node_type == NodeType::Field));
}

#[test]
fn label_description_error_are_escaped() {
    let hostile = src("a33-input")
        .replace("ชื่อ", "<b>&x")
        .replace("คำอธิบายสั้น", "<i>&d")
        .replace("จำเป็น", "<u>&e");
    let (html, _) = compile_export(
        &parse_document(&serde_json::from_str(&hostile).unwrap()).unwrap(),
        &CompileOptions::default(),
    )
    .unwrap();
    assert!(html.contains("&lt;b&gt;&amp;x"), "{html}");
    assert!(html.contains("&lt;i&gt;&amp;d"), "{html}");
    assert!(html.contains("&lt;u&gt;&amp;e"), "{html}");
}

#[test]
fn no_script_no_handlers() {
    for name in CASES {
        let (html, css) = export_named(name);
        for bad in ["<script", "onclick", "javascript:", "expression("] {
            assert!(!html.contains(bad) && !css.contains(bad), "{name} {bad}");
        }
    }
}
