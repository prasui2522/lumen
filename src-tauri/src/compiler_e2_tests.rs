//! Phase 11 E2/E3: entrance motion compiler emission.
use super::*;
use crate::defaults::{MotionEntrance, NodeMotion};

fn heading_doc(entrance: MotionEntrance) -> PageDocument {
    parse_document(&serde_json::json!({
        "version": 2,
        "meta": { "title": "e2", "lang": "th" },
        "root": "root",
        "nodes": {
            "root": {
                "id": "root",
                "type": "page",
                "props": { "type": "page", "children": ["h"] },
                "style": {}
            },
            "h": {
                "id": "h",
                "type": "heading",
                "props": { "type": "heading", "level": 2, "content": "สวัสดี" },
                "style": {},
                "motion": { "entrance": entrance }
            }
        }
    }))
    .unwrap()
}

fn entrance(preset: &str, trigger: &str) -> MotionEntrance {
    MotionEntrance {
        preset: preset.into(),
        trigger: trigger.into(),
        duration_ms: 300,
        delay_ms: 40,
        easing: "ease-out".into(),
    }
}

#[test]
fn e2_load_fade_emits_keyframes_backwards_no_forwards() {
    let (html, css) = compile_export(&heading_doc(entrance("fade", "load")), &CompileOptions::default()).unwrap();
    assert!(html.contains("class=\"t-heading t-h2 n1\""), "{html}");
    assert!(css.contains("@keyframes wb-in-fade{from{opacity:0}to{opacity:1}}"), "{css}");
    assert!(
        css.contains(".n1{animation:wb-in-fade 300ms ease-out 40ms backwards}"),
        "{css}"
    );
    assert!(!css.contains("forwards"), "{css}");
    assert!(
        css.contains("@media (prefers-reduced-motion:reduce){.n1{animation:none}}"),
        "{css}"
    );
    assert!(!html.to_ascii_lowercase().contains("<script"));
}

#[test]
fn e2_all_six_presets_have_transform_or_opacity_only() {
    for preset in ["fade", "slideUp", "slideDown", "slideLeft", "slideRight", "scaleIn"] {
        let (_, css) =
            compile_export(&heading_doc(entrance(preset, "load")), &CompileOptions::default()).unwrap();
        let name = format!("@keyframes wb-in-{preset}");
        assert!(css.contains(&name), "{preset}: {css}");
        assert!(
            css.contains(&format!("animation:wb-in-{preset} 300ms ease-out 40ms backwards")),
            "{preset}: {css}"
        );
        let body = motion_keyframe_body(preset).unwrap();
        assert!(!body.contains("padding") && !body.contains("width") && !body.contains("display"));
    }
}

#[test]
fn e2_identical_presets_dedupe_keyframes() {
    let doc = parse_document(&serde_json::json!({
        "version": 2,
        "meta": { "title": "e2-dedupe", "lang": "th" },
        "root": "root",
        "nodes": {
            "root": {
                "id": "root",
                "type": "page",
                "props": { "type": "page", "children": ["a", "b"] },
                "style": {}
            },
            "a": {
                "id": "a",
                "type": "text",
                "props": { "type": "text", "content": "หนึ่ง" },
                "style": {},
                "motion": { "entrance": {
                    "preset": "fade", "trigger": "load",
                    "durationMs": 200, "delayMs": 0, "easing": "ease"
                }}
            },
            "b": {
                "id": "b",
                "type": "text",
                "props": { "type": "text", "content": "สอง" },
                "style": {},
                "motion": { "entrance": {
                    "preset": "fade", "trigger": "load",
                    "durationMs": 500, "delayMs": 10, "easing": "linear"
                }}
            }
        }
    }))
    .unwrap();
    let (_, css) = compile_export(&doc, &CompileOptions::default()).unwrap();
    assert_eq!(
        css.matches("@keyframes wb-in-fade").count(),
        1,
        "dedupe: {css}"
    );
    assert!(css.contains(".n1{animation:wb-in-fade 200ms ease 0ms backwards}"));
    assert!(css.contains(".n2{animation:wb-in-fade 500ms linear 10ms backwards}"));
}

#[test]
fn e2_spring_easing_compiles_to_bezier() {
    let mut e = entrance("scaleIn", "load");
    e.easing = "spring".into();
    let (_, css) = compile_export(&heading_doc(e), &CompileOptions::default()).unwrap();
    assert!(
        css.contains("animation:wb-in-scaleIn 300ms cubic-bezier(0.34,1.56,0.64,1) 40ms backwards"),
        "{css}"
    );
}

#[test]
fn e3_view_trigger_hides_from_only_inside_supports() {
    let (_, css) = compile_export(&heading_doc(entrance("fade", "view")), &CompileOptions::default()).unwrap();
    assert!(css.contains("@keyframes wb-in-fade{from{opacity:0}to{opacity:1}}"), "{css}");
    assert!(
        css.contains("@supports (animation-timeline:view()){.n1{opacity:0;animation-name:wb-in-fade;"),
        "{css}"
    );
    assert!(css.contains("animation-timeline:view()"), "{css}");
    assert!(css.contains("animation-range:entry 0% entry 60%"), "{css}");
    assert!(css.contains("animation-fill-mode:backwards"), "{css}");
    // Strip @supports → no *applied* hide on the node (keyframes from{} alone don't hide).
    let stripped = strip_supports_blocks(&css);
    assert!(
        !stripped.contains(".n1{opacity:0") && !stripped.contains(".n1{opacity:0;"),
        "fallback must not hide content: {stripped}"
    );
    assert!(!stripped.contains("animation-timeline:view()"), "{stripped}");
}

#[test]
fn e3_view_slide_from_inside_supports_only() {
    let (_, css) =
        compile_export(&heading_doc(entrance("slideUp", "view")), &CompileOptions::default()).unwrap();
    assert!(
        css.contains("@supports (animation-timeline:view()){.n1{opacity:0;transform:translateY(24px);"),
        "{css}"
    );
    let stripped = strip_supports_blocks(&css);
    assert!(
        !stripped.contains(".n1{opacity:0") && !stripped.contains("transform:translateY(24px);animation"),
        "{stripped}"
    );
}

/// Drop every `@supports (…){…}` block (brace-balanced) for the E3 fallback test.
fn strip_supports_blocks(css: &str) -> String {
    let mut out = String::new();
    let bytes = css.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if css[i..].starts_with("@supports") {
            if let Some(rel) = css[i..].find('{') {
                let mut depth = 0usize;
                let mut j = i + rel;
                while j < bytes.len() {
                    match bytes[j] as char {
                        '{' => depth += 1,
                        '}' => {
                            depth -= 1;
                            if depth == 0 {
                                j += 1;
                                break;
                            }
                        }
                        _ => {}
                    }
                    j += 1;
                }
                i = j;
                continue;
            }
        }
        out.push(bytes[i] as char);
        i += 1;
    }
    out
}

#[test]
fn e2_empty_motion_emits_nothing() {
    let doc = parse_document(&serde_json::json!({
        "version": 1,
        "meta": { "title": "plain", "lang": "th" },
        "root": "root",
        "nodes": {
            "root": {
                "id": "root",
                "type": "page",
                "props": { "type": "page", "children": ["h"] },
                "style": {}
            },
            "h": {
                "id": "h",
                "type": "heading",
                "props": { "type": "heading", "level": 2, "content": "x" },
                "style": {}
            }
        }
    }))
    .unwrap();
    let (_, css) = compile_export(&doc, &CompileOptions::default()).unwrap();
    assert!(!css.contains("@keyframes wb-in-"), "{css}");
    assert!(!css.contains("animation:"), "{css}");
    let _ = NodeMotion { entrance: None };
}

/// E7 Preview path proxy: 30 load-fade nodes → one keyframe + 30 animations (no script).
#[test]
fn e7_thirty_animated_nodes_dedupe_keyframes() {
    let kids: Vec<String> = (0..30).map(|i| format!("t{i}")).collect();
    let mut map = serde_json::Map::new();
    for (i, id) in kids.iter().enumerate() {
        map.insert(
            id.clone(),
            serde_json::json!({
                "id": id,
                "type": "text",
                "props": { "type": "text", "content": format!("n{i}") },
                "style": {},
                "motion": { "entrance": {
                    "preset": "fade", "trigger": "load",
                    "durationMs": 300, "delayMs": (i % 5) * 20, "easing": "ease-out"
                }}
            }),
        );
    }
    map.insert(
        "root".into(),
        serde_json::json!({
            "id": "root",
            "type": "page",
            "props": { "type": "page", "children": kids },
            "style": {}
        }),
    );
    let doc = parse_document(&serde_json::json!({
        "version": 2,
        "meta": { "title": "e7", "lang": "th" },
        "root": "root",
        "nodes": map
    }))
    .unwrap();
    let (html, css) = compile_export(&doc, &CompileOptions::default()).unwrap();
    assert_eq!(css.matches("@keyframes wb-in-fade").count(), 1, "{css}");
    assert!(
        css.matches("animation:wb-in-fade").count() >= 30,
        "expected ≥30 load animations, got {}",
        css.matches("animation:wb-in-fade").count()
    );
    assert!(!html.contains("<script"), "{html}");
    assert!(css.contains("@media (prefers-reduced-motion:reduce)"));
}
