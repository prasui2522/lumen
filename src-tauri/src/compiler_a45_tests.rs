//! PHASE-11 A4.5 tests: the icon kind (spec §9 A4, T36–T38).
//! Goldens: fixtures/a4/a45-{star,labelled}.{html,css}; regenerate with `A45_BLESS=1 cargo test a45_tests`.
use super::*;
use crate::defaults::{is_a4_kind, is_version4_kind, NodeProps, NodeType, PageDocument};

fn doc(src: &str) -> PageDocument {
    parse_document(&serde_json::from_str(src).unwrap()).unwrap()
}
fn export(src: &str) -> (String, String) {
    compile_export(&doc(src), &CompileOptions::default()).unwrap()
}
fn golden(name: &str, ext: &str) -> std::path::PathBuf {
    std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join(format!("src/fixtures/a4/{name}.{ext}"))
}

const FIXTURES: [(&str, &str); 2] = [
    ("a45-star", include_str!("fixtures/a4/a45-star.json")),
    ("a45-labelled", include_str!("fixtures/a4/a45-labelled.json")),
];

#[test]
fn goldens_for_icon_variants() {
    for (name, src) in FIXTURES {
        let (html, css) = export(src);
        if std::env::var("A45_BLESS").is_ok() {
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
fn decorative_vs_labelled_svg_shape() {
    let (h, css) = export(FIXTURES[0].1);
    assert!(h.contains("class=\"t-icon"), "{h}");
    assert!(h.contains("aria-hidden=\"true\""), "{h}");
    assert!(!h.contains("role=\"img\""), "{h}");
    assert!(h.contains("viewBox=\"0 0 24 24\""), "{h}");
    assert!(h.contains("stroke=\"currentColor\""), "{h}");
    assert!(h.contains("width=\"24\""), "{h}");
    assert!(h.contains("<path "), "{h}");
    assert!(css.contains(".t-icon{display:inline-block"), "{css}");

    let (lab, _) = export(FIXTURES[1].1);
    assert!(lab.contains("role=\"img\""), "{lab}");
    assert!(lab.contains("aria-label=\"ติ๊กถูก &lt;ok&gt;&amp;&quot;\""), "{lab}");
    assert!(!lab.contains("aria-hidden"), "{lab}");
    assert!(lab.contains("width=\"32\""), "{lab}");
    assert!(lab.contains("stroke-width=\"1.5\""), "{lab}");
}

#[test]
fn unknown_name_falls_back_to_star_and_clamps() {
    let src = FIXTURES[0].1.replace("\"star\"", "\"not-a-real-icon\"");
    let (h, _) = export(&src);
    let star_inner = crate::icon_paths::icon_inner("star").unwrap();
    assert!(h.contains(star_inner), "{h}");

    let big = FIXTURES[0].1.replace("\"size\": 24", "\"size\": 999");
    let (h2, _) = export(&big);
    assert!(h2.contains("width=\"128\""), "{h2}");
}

#[test]
fn icon_is_version4_kind_and_in_all_types() {
    assert!(is_a4_kind(NodeType::Icon));
    assert!(is_version4_kind(NodeType::Icon));
    assert!(ALL_TYPES.contains(&NodeType::Icon));
    assert_eq!(ALL_TYPES.len(), 59);
    assert_eq!(ALL_TYPES.iter().filter(|t| is_a4_kind(**t)).count(), 3);
    assert_eq!(type_name(NodeType::Icon), "icon");
    let l = kind_looks();
    assert!(l.a4_kinds.contains_key("icon"));
    assert_eq!(crate::icon_paths::ICON_NAMES.len(), 80);
}

#[test]
fn no_script_in_icon_export() {
    for (_, src) in FIXTURES {
        let (html, css) = export(src);
        for bad in ["<script", "onclick", "javascript:"] {
            assert!(!html.contains(bad) && !css.contains(bad), "{bad}");
        }
    }
    let _ = NodeProps::Icon {
        name: "star".into(),
        label: None,
        size: 24,
        stroke_width: 2.0,
    };
}
