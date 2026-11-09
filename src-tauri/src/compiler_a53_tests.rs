//! PHASE-11 A5.3 tests: chart data model + SVG renderer parity (spec §9 A5).
//! SVG goldens: fixtures/a5/a53-{bar,line,area}.svg — same string from TS (`chart-render.ts`).
use super::*;
use crate::chart_render::{render_chart_svg, ChartModelIn, ChartSeriesIn};
use crate::defaults::{is_a5_kind, is_version4_kind, ChartKind, ChartSeries, NodeProps, NodeType};

fn golden_svg(name: &str) -> String {
    std::fs::read_to_string(
        std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join(format!("src/fixtures/a5/{name}.svg")),
    )
    .unwrap()
}

fn model_from_json(src: &str) -> ChartModelIn {
    let v: serde_json::Value = serde_json::from_str(src).unwrap();
    let kind = match v["kind"].as_str().unwrap_or("bar") {
        "line" => ChartKind::Line,
        "area" => ChartKind::Area,
        _ => ChartKind::Bar,
    };
    let categories: Vec<String> = v["categories"]
        .as_array()
        .unwrap()
        .iter()
        .map(|c| c.as_str().unwrap_or("").to_string())
        .collect();
    let series: Vec<ChartSeriesIn> = v["series"]
        .as_array()
        .unwrap()
        .iter()
        .map(|s| ChartSeriesIn {
            name: s["name"].as_str().unwrap_or("").to_string(),
            values: s["values"]
                .as_array()
                .unwrap()
                .iter()
                .map(|x| {
                    if x.is_null() {
                        None
                    } else {
                        x.as_f64()
                    }
                })
                .collect(),
            color: s["color"].as_str().unwrap_or("").to_string(),
        })
        .collect();
    let caption = v["caption"].as_str().map(|s| s.to_string());
    ChartModelIn {
        kind,
        categories,
        series,
        caption,
    }
}

const FIXTURES: [(&str, &str); 3] = [
    ("a53-bar", include_str!("fixtures/a5/a53-bar.json")),
    ("a53-line", include_str!("fixtures/a5/a53-line.json")),
    ("a53-area", include_str!("fixtures/a5/a53-area.json")),
];

#[test]
fn svg_goldens_match_shared_fixtures() {
    for (name, src) in FIXTURES {
        let svg = render_chart_svg(&model_from_json(src));
        assert_eq!(svg, golden_svg(name), "{name} svg");
        assert_eq!(
            render_chart_svg(&model_from_json(src)),
            svg,
            "{name} not deterministic"
        );
    }
}

#[test]
fn missing_and_nan_values_skip_safely() {
    let model = ChartModelIn {
        kind: ChartKind::Bar,
        categories: vec!["A".into(), "B".into()],
        series: vec![ChartSeriesIn {
            name: "S".into(),
            values: vec![Some(3.0), None],
            color: "#2563eb".into(),
        }],
        caption: Some("t".into()),
    };
    let svg = render_chart_svg(&model);
    assert!(svg.contains("role=\"img\""), "{svg}");
    assert!(svg.contains("<title>t</title>"), "{svg}");
    // Only one bar for the finite value.
    assert_eq!(svg.matches("<rect ").count(), 1, "{svg}");
    assert!(svg.contains("S A: 3"), "{svg}");
    assert!(!svg.contains("S B:"), "{svg}");

    let line = ChartModelIn {
        kind: ChartKind::Line,
        categories: vec!["A".into(), "B".into(), "C".into()],
        series: vec![ChartSeriesIn {
            name: "L".into(),
            values: vec![Some(1.0), None, Some(3.0)],
            color: "#16a34a".into(),
        }],
        caption: None,
    };
    let lsvg = render_chart_svg(&line);
    // Gap breaks the polyline into two single-point circles.
    assert_eq!(lsvg.matches("<circle ").count(), 2, "{lsvg}");
    assert!(!lsvg.contains("<polyline "), "{lsvg}");
}

#[test]
fn chart_is_version4_kind_and_in_all_types() {
    assert!(is_a5_kind(NodeType::Chart));
    assert!(is_version4_kind(NodeType::Chart));
    assert!(ALL_TYPES.contains(&NodeType::Chart));
    assert_eq!(ALL_TYPES.len(), 63);
    assert_eq!(type_name(NodeType::Chart), "chart");
    let l = kind_looks();
    assert!(l.a5_kinds.contains_key("chart"));
}

#[test]
fn chart_compiles_into_export_html() {
    let doc = parse_document(&serde_json::json!({
        "version": 4,
        "meta": { "title": "a53", "lang": "th" },
        "root": "root",
        "nodes": {
            "root": {
                "id": "root",
                "type": "page",
                "props": { "type": "page", "children": ["c"] },
                "style": {}
            },
            "c": {
                "id": "c",
                "type": "chart",
                "props": {
                    "type": "chart",
                    "kind": "bar",
                    "categories": ["A", "B", "C"],
                    "series": [{ "name": "ชุดที่ 1", "values": [3, 5, 2], "color": "#2563eb" }],
                    "caption": "ยอดขาย"
                },
                "style": {}
            }
        }
    }))
    .unwrap();
    let (html, css) = compile_export(&doc, &CompileOptions::default()).unwrap();
    assert!(html.contains("class=\"t-chart"), "{html}");
    assert!(html.contains("role=\"img\""), "{html}");
    assert!(html.contains("<title>ยอดขาย</title>"), "{html}");
    assert!(html.contains("<rect "), "{html}");
    assert!(css.contains(".t-chart"), "{css}");
    for bad in ["<script", "onclick", "javascript:"] {
        assert!(!html.contains(bad) && !css.contains(bad), "{bad}");
    }
    let _ = NodeProps::Chart {
        kind: ChartKind::Bar,
        categories: vec![],
        series: vec![ChartSeries {
            name: "x".into(),
            values: vec![],
            color: "#000".into(),
        }],
        caption: None,
    };
}
