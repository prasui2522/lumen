//! B5.1 (PHASE-11-SPEC §9.B): `transform` + `transition` plumbing.
use super::*;
use crate::defaults::{StyleProps, TransformValue, TransitionValue};

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

fn style_from_json(raw: &str) -> StyleProps {
    serde_json::from_str(raw).expect("style json")
}

#[test]
fn b5_transform_transition_goldens() {
    for name in ["transform-rotate", "transform-full", "transition-paint"] {
        let style = style_from_json(&fx(name, "json"));
        assert_eq!(decls_css(&style), fx(name, "css"), "{name}");
    }
}

#[test]
fn b5_inline_promotes_to_inline_block() {
    let style = style_from_json(&fx("transform-rotate", "json"));
    let css = decls_css(&style);
    assert!(css.contains("display: inline-block"), "{css}");
    assert!(!css.contains("display: inline;"), "{css}");
}

#[test]
fn b5_transform_order_translate_rotate_scale_skew() {
    let css = decls_css(&style_from_json(&fx("transform-full", "json")));
    let tf = css
        .lines()
        .find(|l| l.starts_with("transform:"))
        .expect("transform line");
    let ti = tf.find("translate").unwrap();
    let ri = tf.find("rotate").unwrap();
    let si = tf.find("scale").unwrap();
    let ki = tf.find("skew").unwrap();
    assert!(ti < ri && ri < si && si < ki, "{tf}");
}

#[test]
fn b5_transition_paint_excludes_layout_and_spring() {
    let css = decls_css(&style_from_json(&fx("transition-paint", "json")));
    assert!(css.contains("transition-property: background-color,color,border-color,box-shadow,opacity,transform,filter,backdrop-filter"));
    assert!(!css.contains("width"));
    assert!(!css.contains("padding"));
    let spring = StyleProps {
        transition: Some(TransitionValue {
            duration_ms: Some(200.0),
            delay_ms: None,
            easing: Some("spring".into()),
            property: Some("paint".into()),
        }),
        ..Default::default()
    };
    let sc = decls_css(&spring);
    assert!(sc.contains("cubic-bezier(0.34,1.56,0.64,1)"), "{sc}");
}

#[test]
fn b5_empty_transform_transition_unset() {
    assert!(TransformValue::default().is_unset());
    assert!(TransitionValue::default().is_unset());
    let only = StyleProps {
        transform: Some(TransformValue::default()),
        transition: Some(TransitionValue::default()),
        ..Default::default()
    };
    assert!(only.is_empty());
}
