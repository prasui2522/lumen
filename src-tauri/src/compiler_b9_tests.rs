//! B9.1 (PHASE-11-SPEC §9.B): 3D press-down button worked example as automated acceptance.
//!
//! Criteria covered here (automated): (1) compiled CSS shape, (7) no `<script` in export,
//! (8) unlinked variant is `<span>` (desktop-only; §7.5 / Phase 9).
//! Real-app only: (5) pointer screenshots, (6) OS reduced-motion.
use super::*;
use crate::defaults::{
    BoxShadowLayer, NodeStates, StateStyle, StyleProps, TransformValue, TransitionValue,
};

const PRESS: &str = include_str!("fixtures/b9/press-button.json");

fn press_doc() -> PageDocument {
    parse_document(&serde_json::from_str(PRESS).unwrap()).unwrap()
}

/// (1) Cargo golden — declaration set matches the B9.1 worked example (formatting may use `0px` / `translate(x,y)`).
#[test]
fn b91_compiled_css_matches_worked_example() {
    let (html, css) = compile_export(&press_doc(), &CompileOptions::default()).unwrap();
    assert!(html.contains("class=\"t-button n1 fx\""), "{html}");
    assert!(html.contains("<a "), "linked button → <a> (acceptance uses linked)");

    assert!(
        css.contains("box-shadow:0px 6px 0px 0px #0369a1, 0px 10px 12px 0px #00000033")
            && css.contains("transition-property:background-color,color,border-color,box-shadow,opacity,transform,filter,backdrop-filter")
            && css.contains("transition-duration:120ms")
            && css.contains("transition-timing-function:ease-out")
            && css.contains("transition-delay:0ms"),
        "base {css}"
    );
    assert!(
        css.contains("@media (hover:hover){[data-wb-page=\"home\"] [data-wb-id=\"btn\"]:hover{background-color:#38bdf8;transform:translate(0px, -1px)}}"),
        "hover {css}"
    );
    assert!(
        css.contains("transform:translate(0px, 5px)")
            && css.contains("box-shadow:0px 1px 0px 0px #0369a1, 0px 2px 4px 0px #00000033")
            && css.contains("[data-wb-page=\"home\"] [data-wb-id=\"btn\"]:active{"),
        "active {css}"
    );
    assert!(
        css.contains("@media (prefers-reduced-motion:reduce){[data-wb-page=\"home\"] [data-wb-id=\"btn\"]{transition:none}[data-wb-page=\"home\"] [data-wb-id=\"btn\"]:hover,[data-wb-page=\"home\"] [data-wb-id=\"btn\"]:active{transform:none}}"),
        "reduced {css}"
    );
    // Sink invariant: translateY(d) + primary-shadow-y(6−d) = 6 (active: 5 + 1).
    assert_eq!(5 + 1, 6);
}

/// (7) Export HTML contains no `<script`.
#[test]
fn b91_export_has_no_script() {
    let (html, _) = compile_export(&press_doc(), &CompileOptions::default()).unwrap();
    let lower = html.to_ascii_lowercase();
    assert!(!lower.contains("<script"), "{html}");
    assert!(!lower.contains("javascript:"), "{html}");
}

/// (8) Unlinked button exports as `<span>` — press effect is desktop-only (§7.5).
#[test]
fn b91_unlinked_button_is_span_desktop_only() {
    let style = StyleProps {
        box_shadow: Some(vec![BoxShadowLayer {
            x: Some(0.0),
            y: Some(6.0),
            blur: Some(0.0),
            spread: Some(0.0),
            color: Some("#0369a1".into()),
            inset: None,
        }]),
        transition: Some(TransitionValue {
            duration_ms: Some(120.0),
            delay_ms: Some(0.0),
            easing: Some("ease-out".into()),
            property: Some("paint".into()),
        }),
        ..Default::default()
    };
    let states = NodeStates {
        active: Some(StateStyle {
            transform: Some(TransformValue {
                translate_y: Some(5.0),
                ..Default::default()
            }),
            ..Default::default()
        }),
        hover: None,
        focus_visible: None,
    };
    let doc = parse_document(&serde_json::json!({
        "version": 2,
        "meta": { "title": "b9-unlinked", "lang": "th" },
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
                "props": { "type": "button", "label": "กด", "action": "none" },
                "style": style,
                "states": states
            }
        }
    }))
    .unwrap();
    let (html, css) = compile_export(&doc, &CompileOptions::default()).unwrap();
    assert!(html.contains("<span class=\"t-button n1 fx\""), "unlinked → span (desktop-only :active) {html}");
    assert!(!html.contains("<a "), "{html}");
    assert!(css.contains("[data-wb-page=\"home\"] [data-wb-id=\"b\"]:active{"), "{css}");
    // focus-visible not emitted for unlinked span.
    assert!(!css.contains(":focus-visible"), "{css}");
}

/// Shared style_css block includes the state rules (Preview / Vite / static).
#[test]
fn b91_state_rules_live_in_shared_style_block() {
    let d = press_doc();
    let block = style_css(&d, &CompileOptions::default()).unwrap();
    assert!(block.contains("@media (hover:hover)"), "{block}");
    assert!(block.contains("[data-wb-page=\"home\"] [data-wb-id=\"btn\"]:active{"), "{block}");
    let (_, css) = compile_export(&d, &CompileOptions::default()).unwrap();
    assert!(css.ends_with(&format!("{block}\n")));
}
