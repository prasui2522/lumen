//! Phase 11 D10: all authored page blocks compile for Preview; emit HTML for scroll checks.
use super::*;

#[test]
fn d10_all_authored_page_blocks_compile() {
    let raw = include_str!("fixtures/d10/preview-blocks.json");
    let v: serde_json::Value = serde_json::from_str(raw).expect("fixture json");
    let doc = parse_document(&v).expect("parse");
    let (html, css) =
        compile_export(&doc, &CompileOptions::default()).expect("compile");
    assert!(html.contains("<"), "html empty");
    assert!(!css.is_empty(), "css empty");
    assert!(!html.contains("<script"), "{html}");
    // Fixed px widths that would force phone-frame overflow (proxy; Chromium check is separate).
    for cap in ["min-width:800px", "min-width:900px", "width:1200px", "width:1440px"] {
        assert!(
            !css.contains(cap),
            "compiled CSS contains overflow-prone {cap}"
        );
    }
    if let Ok(dir) = std::env::var("D10_PREVIEW_OUT") {
        std::fs::create_dir_all(&dir).ok();
        let page = format!(
            "<!doctype html><html><head><meta charset=utf-8><style>{css}</style></head><body>{html}</body></html>"
        );
        std::fs::write(format!("{dir}/index.html"), page).expect("write html");
    }
}
