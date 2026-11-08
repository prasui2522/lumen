//! B6.1 (PHASE-11-SPEC §9.B): `filter` + `backdropFilter`.
use super::*;
use crate::defaults::{BackdropFilterValue, FilterValue, StyleProps};

fn fx(name: &str, ext: &str) -> String {
    let from_crate = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("src/fixtures/style");
    std::fs::read_to_string(from_crate.join(format!("{name}.{ext}"))).unwrap()
}

fn decls_css(s: &StyleProps) -> String {
    let mut lines: Vec<String> = decls_for_test(s)
        .into_iter()
        .map(|(k, v)| format!("{k}: {v};"))
        .collect();
    lines.sort();
    let mut out = lines.join("\n");
    if !out.is_empty() {
        out.push('\n');
    }
    out
}

#[test]
fn b6_filter_backdrop_goldens() {
    for name in ["filter-basic", "backdrop-blur"] {
        let style: StyleProps = serde_json::from_str(&fx(name, "json")).unwrap();
        assert_eq!(decls_css(&style), fx(name, "css"), "{name}");
    }
}

#[test]
fn b6_blur_capped_and_prefixed() {
    let style = StyleProps {
        filter: Some(FilterValue {
            blur: Some(999.0),
            ..Default::default()
        }),
        backdrop_filter: Some(BackdropFilterValue {
            blur: Some(50.0),
            ..Default::default()
        }),
        ..Default::default()
    };
    let css = decls_css(&style);
    assert!(css.contains("filter: blur(40px)"), "{css}");
    assert!(css.contains("-webkit-backdrop-filter: blur(40px)"), "{css}");
    assert!(css.contains("backdrop-filter: blur(40px)"), "{css}");
}

#[test]
fn b6_empty_unset() {
    assert!(FilterValue::default().is_unset());
    assert!(BackdropFilterValue::default().is_unset());
    let only = StyleProps {
        filter: Some(FilterValue::default()),
        backdrop_filter: Some(BackdropFilterValue::default()),
        ..Default::default()
    };
    assert!(only.is_empty());
}
