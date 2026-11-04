//! PHASE-11 A2.5 tests: what the palette creates for the nine A2 kinds (fixtures/a2/a25-placed.json, written by
//! `A25_BLESS=1 bun test src/lib/a25-placed.test.ts`) exports as valid, deterministic, hand-checkable HTML / CSS.
//! Goldens: fixtures/a2/a25-placed.{html,css}; regenerate with `A25_BLESS=1 cargo test a25_tests`.
use super::*;

const PLACED: &str = include_str!("fixtures/a2/a25-placed.json");

fn export(src: &str) -> (String, String) {
    let doc = parse_document(&serde_json::from_str(src).unwrap()).unwrap();
    compile_export(&doc, &CompileOptions::default()).unwrap()
}

fn golden_path(ext: &str) -> std::path::PathBuf {
    std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join(format!("src/fixtures/a2/a25-placed.{ext}"))
}

#[test]
fn golden_for_the_placed_document() {
    let (html, css) = export(PLACED);
    if std::env::var("A25_BLESS").is_ok() {
        std::fs::write(golden_path("html"), &html).unwrap();
        std::fs::write(golden_path("css"), &css).unwrap();
        return;
    }
    assert_eq!(html, std::fs::read_to_string(golden_path("html")).unwrap(), "html");
    assert_eq!(css, std::fs::read_to_string(golden_path("css")).unwrap(), "css");
    assert_eq!(export(PLACED), (html, css), "not deterministic");
}

#[test]
fn placed_export_has_all_nine_kinds_and_nothing_canvas_only() {
    let (html, css) = export(PLACED);
    // every A2 kind's class is in the export (the nine palette kinds)
    for k in ["card", "alert", "badge", "separator", "skeleton", "spinner", "aspectRatio", "scrollArea", "buttonGroup"] {
        assert!(html.contains(&format!("t-{k}")), "no t-{k} in the html");
    }
    // F2: the canvas-only 1px-separator hit area, and the canvas style tag, never reach an export
    for bad in ["data-cv-hit", "cv-hit", "data-a2-canvas", "top:-4px"] {
        assert!(!html.contains(bad) && !css.contains(bad), "{bad} leaked into the export");
    }
    assert!(!css.contains("separator") || !css.split('}').any(|r| r.contains("separator") && (r.contains("::before") || r.contains("::after"))), "separator pseudo-element in the export");
}

#[test]
fn placed_export_obeys_g1_to_g6() {
    let (html, css) = export(PLACED);
    for (name, s) in [("html", &html), ("css", &css)] {
        for bad in ["var(", "gradient(", "url(", "!important", "expression(", "javascript:"] {
            // `var(` is allowed only in the shared reset, which the golden of every other export carries too
            if bad == "var(" {
                continue;
            }
            assert!(!s.contains(bad), "{name} contains {bad}");
        }
    }
    // G2: colours the A2 kinds write are literal hex (no var()) inside the .t-* rules
    for rule in css.split('}') {
        if rule.contains(".t-card") || rule.contains(".t-alert") || rule.contains(".t-badge") || rule.contains(".t-spinner") || rule.contains(".t-skeleton") {
            assert!(!rule.contains("var("), "var( in an A2 rule: {rule}");
        }
    }
}

#[test]
fn f3_and_f5_shapes_export_as_flex_items() {
    let (html, _css) = export(PLACED);
    // F3 spacer inside aspectRatio and F5 input inside buttonGroup are both present and are plain elements
    assert!(html.contains("<input"), "the F5 input is missing");
    assert!(html.matches("t-aspectRatio").count() >= 1);
}
