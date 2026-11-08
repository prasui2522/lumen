//! B3.1 (PHASE-11-SPEC §9.B): `backgroundGradient` + `textGradient` plumbing.
use super::*;
use crate::defaults::{
    GradientKind, GradientStop, GradientValue, StyleBreakpoints, StyleProps,
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
fn b3_gradient_goldens_match_decls() {
    for name in [
        "grad-linear",
        "grad-radial",
        "grad-conic",
        "grad-text",
        "grad-exclusive",
        "grad-unsorted",
    ] {
        let style = style_from_json(&fx(name, "json"));
        assert_eq!(decls_css(&style), fx(name, "css"), "{name}");
    }
}

#[test]
fn b3_exclusive_background_wins_over_text() {
    let style = style_from_json(&fx("grad-exclusive", "json"));
    let css = decls_css(&style);
    assert!(css.contains("linear-gradient(0deg, #000 0%, #fff 100%)"), "{css}");
    assert!(!css.contains("color: transparent"), "{css}");
    assert!(!css.contains("background-clip"), "{css}");
    assert!(!uses_text_gradient(&style));
}

#[test]
fn b3_stops_sorted_by_at() {
    let style = style_from_json(&fx("grad-unsorted", "json"));
    let css = decls_css(&style);
    assert!(
        css.contains("#eee 10%, #888 50%, #111 80%"),
        "{css}"
    );
}

#[test]
fn b3_hostile_stops_dropped_needs_two() {
    let g = GradientValue {
        kind: Some(GradientKind::Linear),
        angle: Some(180.0),
        stops: Some(vec![
            GradientStop {
                color: Some("url(x)".into()),
                at: Some(0.0),
            },
            GradientStop {
                color: Some("#abc".into()),
                at: Some(50.0),
            },
            GradientStop {
                color: Some("}".into()),
                at: Some(100.0),
            },
        ]),
    };
    assert!(gradient_css(&g).is_none());
    let ok = GradientValue {
        kind: Some(GradientKind::Linear),
        angle: None,
        stops: Some(vec![
            GradientStop {
                color: Some("#abc".into()),
                at: Some(0.0),
            },
            GradientStop {
                color: Some("#def".into()),
                at: Some(100.0),
            },
        ]),
    };
    assert_eq!(
        gradient_css(&ok).as_deref(),
        Some("linear-gradient(180deg, #abc 0%, #def 100%)")
    );
}

#[test]
fn b3_empty_gradient_is_unset_for_is_empty_and_breakpoint() {
    let empty = StyleProps {
        background_gradient: Some(GradientValue {
            kind: Some(GradientKind::Linear),
            angle: None,
            stops: Some(vec![]),
        }),
        ..StyleProps::default()
    };
    assert!(empty.is_empty());
    let only = StyleProps {
        background_gradient: Some(GradientValue {
            kind: Some(GradientKind::Linear),
            angle: None,
            stops: Some(vec![
                GradientStop {
                    color: Some("#000".into()),
                    at: Some(0.0),
                },
                GradientStop {
                    color: Some("#fff".into()),
                    at: Some(100.0),
                },
            ]),
        }),
        ..StyleProps::default()
    };
    assert!(!only.is_empty());
    // Breakpoint holding *only* a gradient must survive drop_empty (is_empty trap).
    let bp = StyleBreakpoints {
        phone: Some(only.clone()),
        ..StyleBreakpoints::default()
    };
    let json = serde_json::to_string(&bp).unwrap();
    assert!(json.contains("backgroundGradient") || json.contains("background_gradient") || json.contains("stops"), "{json}");
    let back: StyleBreakpoints = serde_json::from_str(&json).unwrap();
    assert!(back.phone.as_ref().unwrap().background_gradient.is_some());
}

#[test]
fn b3_text_gradient_forced_colors_in_export() {
    let doc = parse_document(&serde_json::json!({
        "version": 1,
        "meta": { "title": "b3", "lang": "th" },
        "root": "root",
        "nodes": {
            "root": {
                "id": "root",
                "type": "page",
                "props": { "type": "page", "children": ["t"] },
                "style": {}
            },
            "t": {
                "id": "t",
                "type": "heading",
                "props": { "type": "heading", "level": 1, "content": "Hi" },
                "style": {
                    "textGradient": {
                        "kind": "linear",
                        "angle": 180,
                        "stops": [
                            { "color": "#0ea5e9", "at": 0 },
                            { "color": "#a855f7", "at": 100 }
                        ]
                    }
                }
            }
        }
    }))
    .unwrap();
    let (html, css) = compile_export(&doc, &CompileOptions::default()).unwrap();
    assert!(css.contains("background-clip:text") || css.contains("background-clip: text"), "{css}");
    assert!(
        css.contains("@media (forced-colors:active)")
            && css.contains("color:CanvasText")
            && css.contains("background:none"),
        "{css}"
    );
    assert!(html.contains("Hi"), "{html}");
}
