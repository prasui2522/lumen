//! B4.1 (PHASE-11-SPEC §9.B): `borderSides` + `borderRadiusCorners` + dashed/dotted.
use super::*;
use crate::defaults::{
    BorderRadiusCorners, BorderSide, BorderSides, StyleBreakpoints, StyleProps,
};

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
fn b4_border_goldens_match_decls() {
    for name in ["border-side-override", "border-corners", "border-dashed"] {
        let style = style_from_json(&fx(name, "json"));
        assert_eq!(decls_css(&style), fx(name, "css"), "{name}");
    }
}

#[test]
fn b4_side_after_uniform_and_corners_only_set() {
    let style = style_from_json(&fx("border-side-override", "json"));
    let order: Vec<&str> = decls_for_test(&style).into_iter().map(|(k, _)| k).collect();
    let uni = order.iter().position(|k| *k == "border-width").expect("uniform");
    let side = order
        .iter()
        .position(|k| *k == "border-top-width")
        .expect("side");
    assert!(side > uni, "side override must follow uniform border");

    let corners = style_from_json(&fx("border-corners", "json"));
    let css = decls_css(&corners);
    assert!(css.contains("border-top-left-radius: 16px"), "{css}");
    assert!(css.contains("border-bottom-right-radius: 0px"), "{css}");
    assert!(!css.contains("border-top-right-radius"), "{css}");
    assert!(!css.contains("border-bottom-left-radius"), "{css}");
}

#[test]
fn b4_hostile_side_clamped_or_dropped() {
    let style = StyleProps {
        border_sides: Some(BorderSides {
            t: Some(BorderSide {
                width: Some(999.0),
                color: Some("url(evil)".into()),
                style: Some("groove".into()),
            }),
            r: None,
            b: None,
            l: None,
        }),
        ..Default::default()
    };
    let css = decls_css(&style);
    assert!(css.contains("border-top-width: 20px"), "{css}");
    assert!(!css.contains("url("), "{css}");
    assert!(!css.contains("groove"), "{css}");
}

#[test]
fn b4_empty_sides_and_corners_are_unset() {
    assert!(BorderSides::default().is_unset());
    assert!(BorderRadiusCorners::default().is_unset());
    let only_empty = StyleProps {
        border_sides: Some(BorderSides::default()),
        border_radius_corners: Some(BorderRadiusCorners::default()),
        ..Default::default()
    };
    assert!(only_empty.is_empty());
    let bp = StyleBreakpoints {
        phone: Some(StyleProps {
            border_sides: Some(BorderSides {
                t: Some(BorderSide {
                    width: Some(2.0),
                    color: None,
                    style: None,
                }),
                ..Default::default()
            }),
            ..Default::default()
        }),
        ..Default::default()
    };
    assert!(!bp.is_empty());
}
