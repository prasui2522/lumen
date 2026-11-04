//! PHASE-11 A5.1 tests: the carousel kind (spec §9 A5, T39–T40).
//! Goldens: fixtures/a5/a51-n{1,2,3}.{html,css}; regenerate with `A51_BLESS=1 cargo test a51_tests`.
use super::*;
use crate::defaults::{is_a5_kind, is_version4_kind, NodeProps, NodeType, PageDocument};

fn doc(src: &str) -> PageDocument {
    parse_document(&serde_json::from_str(src).unwrap()).unwrap()
}
fn export(src: &str) -> (String, String) {
    compile_export(&doc(src), &CompileOptions::default()).unwrap()
}
fn golden(name: &str, ext: &str) -> std::path::PathBuf {
    std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join(format!("src/fixtures/a5/{name}.{ext}"))
}

const FIXTURES: [(&str, &str); 3] = [
    ("a51-n1", include_str!("fixtures/a5/a51-n1.json")),
    ("a51-n2", include_str!("fixtures/a5/a51-n2.json")),
    ("a51-n3", include_str!("fixtures/a5/a51-n3.json")),
];

#[test]
fn goldens_for_carousel_slides_per_view() {
    for (name, src) in FIXTURES {
        let (html, css) = export(src);
        if std::env::var("A51_BLESS").is_ok() {
            std::fs::write(golden(name, "html"), &html).unwrap();
            std::fs::write(golden(name, "css"), &css).unwrap();
            continue;
        }
        assert_eq!(html, std::fs::read_to_string(golden(name, "html")).unwrap(), "{name} html");
        assert_eq!(css, std::fs::read_to_string(golden(name, "css")).unwrap(), "{name} css");
        assert_eq!(export(src), (html, css), "{name} not deterministic");
    }
}

#[test]
fn carousel_region_and_slide_basis() {
    let (h1, css) = export(FIXTURES[0].1);
    assert!(h1.contains("class=\"t-carousel"), "{h1}");
    assert!(h1.contains("role=\"region\""), "{h1}");
    assert!(h1.contains("aria-roledescription=\"carousel\""), "{h1}");
    assert!(h1.contains("tabindex=\"0\""), "{h1}");
    // Track layout lives on the node class in CSS (not inline on the root).
    assert!(css.contains("scroll-snap-type:x mandatory"), "{css}");
    assert!(css.contains("flex-direction:row"), "{css}");
    // n=1, default gap 16 → calc((100% - 0px) / 1) on each slide (inline).
    assert!(h1.contains("flex:0 0 calc((100% - 0px) / 1)"), "{h1}");
    assert_eq!(h1.matches("t-carousel__slide").count(), 3, "{h1}");
    assert!(css.contains(".t-carousel"), "{css}");

    let (h2, css2) = export(FIXTURES[1].1);
    // n=2, gap 16 → calc((100% - 16px) / 2)
    assert!(h2.contains("flex:0 0 calc((100% - 16px) / 2)"), "{h2}");
    assert!(css2.contains("gap:16px"), "{css2}");

    let (h3, css3) = export(FIXTURES[2].1);
    // n=3, gap 8 → calc((100% - 16px) / 3)
    assert!(h3.contains("flex:0 0 calc((100% - 16px) / 3)"), "{h3}");
    assert!(css3.contains("gap:8px"), "{css3}");
}

#[test]
fn carousel_is_version4_kind_and_in_all_types() {
    assert!(is_a5_kind(NodeType::Carousel));
    assert!(is_version4_kind(NodeType::Carousel));
    assert!(ALL_TYPES.contains(&NodeType::Carousel));
    assert_eq!(ALL_TYPES.len(), 59);
    assert_eq!(ALL_TYPES.iter().filter(|t| is_a5_kind(**t)).count(), 3);
    assert_eq!(type_name(NodeType::Carousel), "carousel");
    let l = kind_looks();
    assert!(l.a5_kinds.contains_key("carousel"));
}

#[test]
fn no_script_in_carousel_export() {
    for (_, src) in FIXTURES {
        let (html, css) = export(src);
        for bad in ["<script", "onclick", "javascript:"] {
            assert!(!html.contains(bad) && !css.contains(bad), "{bad}");
        }
    }
    let _ = NodeProps::Carousel {
        children: vec![],
        direction: None,
        gap: None,
        align: None,
        justify: None,
        slides_per_view: Some(2),
    };
}
