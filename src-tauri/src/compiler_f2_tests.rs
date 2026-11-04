//! F2 (D8 = PREVIEW-CODE-VIEW-SPEC S1): a responsive fixture exported both ways. Goldens:
//! fixtures/f2/f2-responsive.{html,css} (static export) and f2-responsive.site.json (what the Vite template reads).
//! F2.1 adds fixtures/f2/f21-kinds.* (scrollArea defaults, empty carousel, table ring).
//! Regenerate with `F2_BLESS=1 cargo test f2_tests`. `src/lib/f2-bp-parity.test.ts` renders both in headless Chromium
//! at 375 / 768 / 1280 and compares computed styles per breakpoint.
use super::*;

const DOC: &str = include_str!("fixtures/f2/f2-responsive.json");
const KINDS: &str = include_str!("fixtures/f2/f21-kinds.json");

fn golden(ext: &str) -> std::path::PathBuf {
    golden_of("f2-responsive", ext)
}

fn golden_of(name: &str, ext: &str) -> std::path::PathBuf {
    std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join(format!("src/fixtures/f2/{name}.{ext}"))
}

/// F2.1: scrollArea / carousel / table fixture (f21-kinds), same three goldens; read by f2-bp-parity.test.ts.
#[test]
fn f21_kinds_goldens_static_and_site_json() {
    let doc = parse_document(&serde_json::from_str(KINDS).unwrap()).unwrap();
    let (html, css) = compile_export(&doc, &CompileOptions::default()).unwrap();
    let site = crate::export::build_site_json(&doc, &std::collections::HashMap::new()).unwrap();
    if std::env::var("F2_BLESS").is_ok() {
        std::fs::write(golden_of("f21-kinds", "html"), &html).unwrap();
        std::fs::write(golden_of("f21-kinds", "css"), &css).unwrap();
        std::fs::write(golden_of("f21-kinds", "site.json"), &site).unwrap();
        return;
    }
    assert_eq!(html, std::fs::read_to_string(golden_of("f21-kinds", "html")).unwrap(), "html");
    assert_eq!(css, std::fs::read_to_string(golden_of("f21-kinds", "css")).unwrap(), "css");
    assert_eq!(site, std::fs::read_to_string(golden_of("f21-kinds", "site.json")).unwrap(), "site.json");
}

#[test]
fn f2_responsive_goldens_static_and_site_json() {
    let doc = parse_document(&serde_json::from_str(DOC).unwrap()).unwrap();
    let (html, css) = compile_export(&doc, &CompileOptions::default()).unwrap();
    let site = crate::export::build_site_json(&doc, &std::collections::HashMap::new()).unwrap();
    if std::env::var("F2_BLESS").is_ok() {
        std::fs::write(golden("html"), &html).unwrap();
        std::fs::write(golden("css"), &css).unwrap();
        std::fs::write(golden("site.json"), &site).unwrap();
        return;
    }
    assert_eq!(html, std::fs::read_to_string(golden("html")).unwrap(), "html");
    assert_eq!(css, std::fs::read_to_string(golden("css")).unwrap(), "css");
    assert_eq!(site, std::fs::read_to_string(golden("site.json")).unwrap(), "site.json");
    // the media queries the Vite template mirrors, in the same order
    let t = css.find("@media (max-width:1024px)").expect("tablet");
    let p = css.find("@media (max-width:719px)").expect("phone");
    let f = css.find("@media (horizontal-viewport-segments: 2)").expect("foldOpen");
    assert!(t < p && p < f, "media order");
    assert!(site.contains("\"styleBreakpoints\""), "site.json keeps styleBreakpoints for the Vite template");
}

// ---- F2.1 ----

fn export_nodes(nodes: serde_json::Value, children: &[&str]) -> (String, String) {
    let mut map = nodes.as_object().unwrap().clone();
    map.insert(
        "root".into(),
        serde_json::json!({"id":"root","type":"page","props":{"type":"page","children":children},"style":{}}),
    );
    let src = serde_json::json!({"version":4,"meta":{"title":"f21","lang":"th"},"root":"root","nodes":map});
    let doc = parse_document(&src).unwrap();
    compile_export(&doc, &CompileOptions::default()).unwrap()
}

fn tag_of<'a>(html: &'a str, class: &str) -> Vec<&'a str> {
    html.match_indices(&format!("class=\"{class}"))
        .map(|(i, _)| {
            let start = html[..i].rfind('<').unwrap();
            let end = i + html[i..].find('>').unwrap();
            &html[start..=end]
        })
        .collect()
}

#[test]
fn f21_b_empty_carousel_is_not_a_tab_stop_but_a_filled_one_is() {
    let (html, _) = export_nodes(
        serde_json::json!({
            "c0": {"id":"c0","type":"carousel","props":{"type":"carousel","children":[]},"style":{}},
            "c1": {"id":"c1","type":"carousel","props":{"type":"carousel","children":["s1"]},"style":{}},
            "s1": {"id":"s1","type":"text","props":{"type":"text","content":"สไลด์"},"style":{}},
            "c2": {"id":"c2","type":"carousel","props":{"type":"carousel","children":["gone"]},"style":{}},
            "gone": {"id":"gone","type":"text","props":{"type":"text","content":"ซ่อน"},"style":{},"visible":false}
        }),
        &["c0", "c1", "c2"],
    );
    let tags = tag_of(&html, "t-carousel ");
    let tags: Vec<&str> = if tags.is_empty() { tag_of(&html, "t-carousel") } else { tags };
    let tags: Vec<&str> = tags.into_iter().filter(|t| !t.contains("t-carousel__")).collect();
    assert_eq!(tags.len(), 3, "{html}");
    assert!(!tags[0].contains("tabindex"), "empty carousel must not be a Tab stop: {}", tags[0]);
    assert!(tags[1].contains("tabindex=\"0\""), "carousel with a slide stays a Tab stop: {}", tags[1]);
    assert!(!tags[2].contains("tabindex"), "only hidden slides = empty: {}", tags[2]);
    assert!(tags[0].contains("role=\"region\"") && tags[0].contains("aria-roledescription=\"carousel\""));
}

#[test]
fn f211_b_carousel_aria_label_is_layer_name_else_carousel() {
    let (html, _) = export_nodes(
        serde_json::json!({
            "c0": {"id":"c0","type":"carousel","props":{"type":"carousel","children":["s0"]},"style":{}},
            "s0": {"id":"s0","type":"text","props":{"type":"text","content":"หนึ่ง"},"style":{}},
            "c1": {"id":"c1","type":"carousel","name":"  แกลเลอรี  ","props":{"type":"carousel","children":["s1"]},"style":{}},
            "s1": {"id":"s1","type":"text","props":{"type":"text","content":"สอง"},"style":{}},
            "c2": {"id":"c2","type":"carousel","name":"   ","props":{"type":"carousel","children":["s2"]},"style":{}},
            "s2": {"id":"s2","type":"text","props":{"type":"text","content":"สาม"},"style":{}},
            "c3": {"id":"c3","type":"carousel","name":"ว่าง","props":{"type":"carousel","children":[]},"style":{}}
        }),
        &["c0", "c1", "c2", "c3"],
    );
    let tags: Vec<&str> = tag_of(&html, "t-carousel").into_iter().filter(|t| !t.contains("t-carousel__")).collect();
    assert_eq!(tags.len(), 4, "{html}");
    assert!(tags[0].contains("aria-label=\"Carousel\"") && tags[0].contains("tabindex=\"0\""), "{}", tags[0]);
    assert!(tags[1].contains("aria-label=\"แกลเลอรี\""), "name is trimmed: {}", tags[1]);
    assert!(tags[2].contains("aria-label=\"Carousel\""), "blank name falls back: {}", tags[2]);
    assert!(tags[3].contains("aria-label=\"ว่าง\"") && !tags[3].contains("tabindex"), "{}", tags[3]);
    // Preview (single-file compile) uses the same renderer
    let src = serde_json::json!({"version":4,"meta":{"title":"p","lang":"th"},"root":"root","nodes":{
        "root":{"id":"root","type":"page","props":{"type":"page","children":["c"]},"style":{}},
        "c":{"id":"c","type":"carousel","name":"สไลด์โชว์","props":{"type":"carousel","children":["s"]},"style":{}},
        "s":{"id":"s","type":"text","props":{"type":"text","content":"x"},"style":{}}}});
    let preview = compile(&parse_document(&src).unwrap(), &CompileOptions::default()).unwrap();
    assert!(preview.contains("aria-label=\"สไลด์โชว์\""), "preview lacks the carousel name");
}

#[test]
fn f21_c_table_region_has_the_focus_ring() {
    let (html, css) = export_nodes(
        serde_json::json!({"t": {"id":"t","type":"table","props":{"type":"table","columns":["a"],"rows":[["1"]],"headerRow":true,"striped":false},"style":{}}}),
        &["t"],
    );
    assert!(tag_of(&html, "t-tablewrap")[0].contains("tabindex=\"0\""));
    assert!(css.contains(".t-tablewrap:focus-visible{outline:2px solid #0077c2;outline-offset:2px}"), "{css}");
    // Preview shares the same kind CSS
    let src = serde_json::json!({"version":4,"meta":{"title":"p","lang":"th"},"root":"root","nodes":{
        "root":{"id":"root","type":"page","props":{"type":"page","children":["t"]},"style":{}},
        "t":{"id":"t","type":"table","props":{"type":"table","columns":["a"],"rows":[["1"]],"headerRow":true,"striped":false},"style":{}}}});
    let doc = parse_document(&src).unwrap();
    let preview = compile(&doc, &CompileOptions::default()).unwrap(); // Preview = single-file compile
    let ptxt = preview;
    assert!(ptxt.contains(".t-tablewrap:focus-visible{outline:2px solid #0077c2;outline-offset:2px}"), "preview lacks the ring");
}
