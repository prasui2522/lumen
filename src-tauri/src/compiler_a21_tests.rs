//! PHASE-11 A2.1 tests: the nine A2 kinds are plumbed (enum, `ALL_TYPES`, `type_name`,
//! `default_styles`, version marker); the A2.3 arms (compiler_a23_tests.rs / compiler_a23b_tests.rs) draw them.
use super::*;
use crate::defaults::{default_styles, is_a2_kind, is_version4_kind, NodeType};

const A2_NAMES: [&str; 9] = [
    "card", "alert", "badge", "separator", "skeleton", "spinner", "aspectRatio", "scrollArea", "buttonGroup",
];
const SEED: &str = include_str!("fixtures/a2/seed-a2.json");
const DEFAULTS_GOLDEN: &str = include_str!("fixtures/a2/default-styles.json");

/// Integral floats → ints so `12.0` (Rust f64) equals `12` (JS number).
pub(crate) fn norm(v: serde_json::Value) -> serde_json::Value {
    use serde_json::Value;
    match v {
        Value::Number(n) => match n.as_f64() {
            Some(f) if f.fract() == 0.0 && f.abs() < 9e15 => Value::from(f as i64),
            _ => Value::Number(n),
        },
        Value::Array(a) => Value::Array(a.into_iter().map(norm).collect()),
        Value::Object(o) => Value::Object(o.into_iter().map(|(k, v)| (k, norm(v))).collect()),
        other => other,
    }
}

#[test]
fn all_types_is_51_unique_and_names_match_the_wire_names() {
    // 51 through A2; A3.1 checkbox → 52; A3.3 field → 53; A4.1 list → 54; A4.2 table → 55; A4.5 icon → 56; A5.1 carousel → 57; A5.3 chart → 58; A5.5 calendar → 59 (F1.1).
    assert_eq!(ALL_TYPES.len(), 63);
    let names: Vec<&str> = ALL_TYPES.iter().map(|t| type_name(*t)).collect();
    let set: std::collections::BTreeSet<&str> = names.iter().copied().collect();
    assert_eq!(set.len(), ALL_TYPES.len(), "duplicate type name");
    for n in A2_NAMES {
        assert!(set.contains(n), "{n} missing from ALL_TYPES");
    }
    // `type_name` must be the same string serde writes for the enum.
    for t in ALL_TYPES {
        let wire = serde_json::to_value(t).unwrap();
        assert_eq!(wire, serde_json::Value::String(type_name(t).into()), "{t:?}");
    }
}

#[test]
fn a2_kinds_count_for_the_version_4_marker_but_are_not_phase_6b() {
    let a2: Vec<NodeType> = ALL_TYPES.iter().copied().filter(|t| is_a2_kind(*t)).collect();
    assert_eq!(a2.len(), 9);
    for t in &a2 {
        assert!(is_version4_kind(*t), "{t:?}");
    }
    for t in [NodeType::Page, NodeType::Section, NodeType::Container, NodeType::Heading, NodeType::Text, NodeType::Image, NodeType::Button, NodeType::Link, NodeType::Spacer, NodeType::Input, NodeType::Switch] {
        assert!(!is_version4_kind(t), "{t:?} must not force version 4");
    }
    // 31 phase 6b + 9 A2 + A3.1 checkbox + A3.3 field + A4.1 list + A4.2 table + A4.5 icon + A5.1 carousel + A5.3 chart + A5.5 calendar (F1.1).
    assert_eq!(ALL_TYPES.iter().filter(|t| is_version4_kind(**t)).count(), 48);
}

#[test]
fn default_styles_for_the_nine_kinds_match_the_shared_golden() {
    let golden: serde_json::Value = serde_json::from_str(DEFAULTS_GOLDEN).unwrap();
    for name in A2_NAMES {
        let t: NodeType = serde_json::from_value(serde_json::Value::String(name.into())).unwrap();
        let got = norm(serde_json::to_value(default_styles(t)).unwrap());
        assert_eq!(got, norm(golden[name].clone()), "{name}");
    }
    assert_eq!(golden.as_object().unwrap().len(), 9);
}

#[test]
fn every_a2_kind_of_the_seed_document_is_drawn_in_the_export_and_in_preview() {
    // Since A2.3 part 2 there is no deferred kind left: badge and scrollArea draw too.
    let v: serde_json::Value = serde_json::from_str(SEED).unwrap();
    let doc = parse_document(&v).unwrap();
    let (html, css) = compile_export(&doc, &CompileOptions::default()).unwrap();
    for n in A2_NAMES {
        assert!(html.contains(&format!("t-{n}")) && css.contains(&format!(".t-{n}")), "{n}");
    }
    assert!(html.contains("ใหม่") && html.contains("เนื้อหายาว") && html.contains("หัวข้อการ์ด") && html.contains("<hr"));
    let prev = compile_json(SEED, &CompileOptions { preview: true, ..Default::default() }).unwrap();
    assert!(prev.contains("t-page") && prev.contains("t-card") && prev.contains("t-badge") && prev.contains("t-scrollArea"));
}

#[test]
fn a_doc_without_any_a2_kind_compiles_exactly_as_before() {
    // The page alone (no A2 node at all) has no A2 residue: no A2 type rule, class or text.
    let mut v: serde_json::Value = serde_json::from_str(SEED).unwrap();
    v["nodes"]["root"]["props"]["children"] = serde_json::json!([]);
    let doc = parse_document(&v).unwrap();
    let (html, css) = compile_export(&doc, &CompileOptions::default()).unwrap();
    for n in A2_NAMES {
        assert!(!html.contains(&format!("t-{n}")) && !css.contains(&format!("t-{n}")), "{n}");
    }
    assert!(!css.contains("@keyframes"));
}
