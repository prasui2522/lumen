//! B7.2 (PHASE-11-SPEC §9.B): compiler state rules, `@media (hover:hover)`, `fx`, reduced-motion / forced-colors.
use super::*;
use crate::defaults::{
    BoxShadowLayer, NodeStates, StateStyle, StyleProps, TransformValue, TransitionValue,
};

fn linked_button_doc(states: NodeStates, style: StyleProps) -> PageDocument {
    parse_document(&serde_json::json!({
        "version": 2,
        "meta": { "title": "b7", "lang": "th" },
        "root": "root",
        "nodes": {
            "root": {
                "id": "root",
                "type": "page",
                "props": { "type": "page", "children": ["b"] },
                "style": {}
            },
            "b": {
                "id": "b",
                "type": "button",
                "props": { "type": "button", "label": "กด", "href": "https://example.com" },
                "style": style,
                "states": states
            }
        }
    }))
    .unwrap()
}

fn unlinked_button_doc(states: NodeStates) -> PageDocument {
    parse_document(&serde_json::json!({
        "version": 2,
        "meta": { "title": "b7", "lang": "th" },
        "root": "root",
        "nodes": {
            "root": {
                "id": "root",
                "type": "page",
                "props": { "type": "page", "children": ["b"] },
                "style": {}
            },
            "b": {
                "id": "b",
                "type": "button",
                "props": { "type": "button", "label": "กด" },
                "style": {},
                "states": states
            }
        }
    }))
    .unwrap()
}

#[test]
fn b7_state_decls_paint_only() {
    let s = StateStyle {
        background_color: Some("#38bdf8".into()),
        transform: Some(TransformValue {
            translate_y: Some(-1.0),
            ..Default::default()
        }),
        ..Default::default()
    };
    let d = state_decls_for_test(&s);
    let keys: Vec<&str> = d.iter().map(|(k, _)| *k).collect();
    assert!(keys.contains(&"background-color"), "{keys:?}");
    assert!(keys.contains(&"transform"), "{keys:?}");
    assert!(!keys.iter().any(|k| k.contains("padding") || k.contains("width")), "{keys:?}");
}

#[test]
fn b7_hover_focus_active_order_and_fx_class() {
    let doc = linked_button_doc(
        NodeStates {
            hover: Some(StateStyle {
                background_color: Some("#38bdf8".into()),
                ..Default::default()
            }),
            focus_visible: Some(StateStyle {
                box_shadow: Some(vec![BoxShadowLayer {
                    x: Some(0.0),
                    y: Some(0.0),
                    blur: Some(0.0),
                    spread: Some(4.0),
                    color: Some("#0ea5e933".into()),
                    inset: None,
                }]),
                ..Default::default()
            }),
            active: Some(StateStyle {
                background_color: Some("#0284c7".into()),
                ..Default::default()
            }),
        },
        StyleProps::default(),
    );
    let (html, css) = compile_export(&doc, &CompileOptions::default()).unwrap();
    assert!(html.contains("class=\"t-button n1 fx\""), "{html}");
    assert!(html.contains("<a "), "{html}");

    let hover = css.find("@media (hover:hover){.n1:hover{").expect("hover");
    let focus = css.find(".n1:focus-visible{").expect("focus-visible");
    let active = css.find(".n1:active{").expect("active");
    assert!(hover < focus && focus < active, "order hover→focus→active in {css}");
    assert!(css.contains("background-color:#38bdf8"), "{css}");
    assert!(css.contains("background-color:#0284c7"), "{css}");
    assert!(
        css.contains("@media (forced-colors:active){.n1:focus-visible{outline:2px solid CanvasText}}"),
        "{css}"
    );
    assert!(
        css.contains("@media (prefers-reduced-motion:reduce){.n1{transition:none}}"),
        "{css}"
    );
}

#[test]
fn b7_focus_visible_skipped_for_unlinked_button() {
    let doc = unlinked_button_doc(NodeStates {
        hover: Some(StateStyle {
            background_color: Some("#38bdf8".into()),
            ..Default::default()
        }),
        focus_visible: Some(StateStyle {
            color: Some("#fff".into()),
            ..Default::default()
        }),
        active: None,
    });
    let (html, css) = compile_export(&doc, &CompileOptions::default()).unwrap();
    assert!(html.contains("<span class=\"t-button n1 fx\""), "{html}");
    assert!(css.contains("@media (hover:hover){.n1:hover{"), "{css}");
    assert!(!css.contains(":focus-visible"), "{css}");
}

#[test]
fn b7_press_button_shape_matches_b91_example() {
    // B9.1 worked example (linked button). Class is n1 here (only one styled node).
    let style = StyleProps {
        box_shadow: Some(vec![
            BoxShadowLayer {
                x: Some(0.0),
                y: Some(6.0),
                blur: Some(0.0),
                spread: Some(0.0),
                color: Some("#0369a1".into()),
                inset: None,
            },
            BoxShadowLayer {
                x: Some(0.0),
                y: Some(10.0),
                blur: Some(12.0),
                spread: Some(0.0),
                color: Some("#00000033".into()),
                inset: None,
            },
        ]),
        transition: Some(TransitionValue {
            duration_ms: Some(120.0),
            delay_ms: Some(0.0),
            easing: Some("ease-out".into()),
            property: Some("paint".into()),
        }),
        ..Default::default()
    };
    let states = NodeStates {
        hover: Some(StateStyle {
            background_color: Some("#38bdf8".into()),
            transform: Some(TransformValue {
                translate_y: Some(-1.0),
                ..Default::default()
            }),
            ..Default::default()
        }),
        active: Some(StateStyle {
            transform: Some(TransformValue {
                translate_y: Some(5.0),
                ..Default::default()
            }),
            box_shadow: Some(vec![
                BoxShadowLayer {
                    x: Some(0.0),
                    y: Some(1.0),
                    blur: Some(0.0),
                    spread: Some(0.0),
                    color: Some("#0369a1".into()),
                    inset: None,
                },
                BoxShadowLayer {
                    x: Some(0.0),
                    y: Some(2.0),
                    blur: Some(4.0),
                    spread: Some(0.0),
                    color: Some("#00000033".into()),
                    inset: None,
                },
            ]),
            ..Default::default()
        }),
        focus_visible: None,
    };
    let doc = linked_button_doc(states, style);
    let (_, css) = compile_export(&doc, &CompileOptions::default()).unwrap();

    // B9.1 lists translateY / bare `0`; compiler emits translate(x,y) and `0px` (same as B5).
    assert!(
        css.contains(".n1{")
            && css.contains("box-shadow:0px 6px 0px 0px #0369a1, 0px 10px 12px 0px #00000033")
            && css.contains("transition-property:background-color,color,border-color,box-shadow,opacity,transform,filter,backdrop-filter")
            && css.contains("transition-duration:120ms")
            && css.contains("transition-timing-function:ease-out")
            && css.contains("transition-delay:0ms"),
        "base {css}"
    );
    assert!(
        css.contains("@media (hover:hover){.n1:hover{background-color:#38bdf8;transform:translate(0px, -1px)}}"),
        "hover {css}"
    );
    assert!(
        css.contains(".n1:active{")
            && css.contains("transform:translate(0px, 5px)")
            && css.contains("box-shadow:0px 1px 0px 0px #0369a1, 0px 2px 4px 0px #00000033"),
        "active {css}"
    );
    assert!(
        css.contains("@media (prefers-reduced-motion:reduce){.n1{transition:none}.n1:hover,.n1:active{transform:none}}"),
        "reduced {css}"
    );
    // No focus-visible in this fixture; hover before active.
    let h = css.find("@media (hover:hover)").expect("hover media");
    let a = css.find(".n1:active{").expect("active");
    assert!(h < a, "{css}");
    assert!(!css.contains(":focus-visible"), "{css}");
}

#[test]
fn b83_preview_legacy_press_skips_fx_buttons() {
    let doc = linked_button_doc(
        NodeStates {
            active: Some(StateStyle {
                transform: Some(TransformValue {
                    translate_y: Some(5.0),
                    ..Default::default()
                }),
                ..Default::default()
            }),
            hover: None,
            focus_visible: None,
        },
        StyleProps::default(),
    );
    let preview = compile(
        &doc,
        &CompileOptions {
            preview: true,
            ..CompileOptions::default()
        },
    )
    .unwrap();
    assert!(preview.contains("class=\"t-button n1 fx\""), "{preview}");
    assert!(
        preview.contains(".t-button:not(.fx):active{transform:translateY(1px)}"),
        "{preview}"
    );
    assert!(preview.contains(".n1:active{"), "{preview}");
    // Export must not include the legacy Preview press rule.
    let (_, export_css) = compile_export(&doc, &CompileOptions::default()).unwrap();
    assert!(!export_css.contains(":not(.fx)"), "{export_css}");
    assert!(export_css.contains(".n1:active{"), "{export_css}");
}

#[test]
fn b7_states_in_shared_style_css_block() {
    let doc = linked_button_doc(
        NodeStates {
            hover: Some(StateStyle {
                opacity: Some(0.8),
                ..Default::default()
            }),
            active: None,
            focus_visible: None,
        },
        StyleProps::default(),
    );
    let block = style_css(&doc, &CompileOptions::default()).unwrap();
    assert!(block.contains("@media (hover:hover){.n1:hover{opacity:0.8}}") || block.contains("opacity:0.8"), "{block}");
    let (_, css) = compile_export(&doc, &CompileOptions::default()).unwrap();
    assert!(css.ends_with(&format!("{block}\n")), "state rules live in the shared block");
}
