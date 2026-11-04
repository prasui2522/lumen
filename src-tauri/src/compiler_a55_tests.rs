//! PHASE-11 A5.5 tests: calendar kind + month grid parity (spec §9 A5, T49–T54).
use super::*;
use crate::calendar_render::{days_in_month, render_calendar_html, CalendarModelIn};
use crate::defaults::{
    is_a5_kind, is_version4_kind, CalendarEra, CalendarWeekStart, NodeProps, NodeType,
};

fn golden_html(name: &str) -> String {
    std::fs::read_to_string(
        std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join(format!("src/fixtures/a5/{name}.html")),
    )
    .unwrap()
}

fn model_from_json(src: &str) -> CalendarModelIn {
    let v: serde_json::Value = serde_json::from_str(src).unwrap();
    CalendarModelIn {
        year: v["year"].as_i64().unwrap_or(2026) as i32,
        month: v["month"].as_u64().unwrap_or(1) as u32,
        selected_day: v["selectedDay"].as_u64().map(|d| d as u32),
        week_start: if v["weekStart"].as_u64().unwrap_or(0) == 1 {
            CalendarWeekStart::Monday
        } else {
            CalendarWeekStart::Sunday
        },
        era: if v["era"].as_str() == Some("ce") {
            CalendarEra::Ce
        } else {
            CalendarEra::Be
        },
    }
}

const FIXTURES: [(&str, &str); 3] = [
    ("a55-feb2028", include_str!("fixtures/a5/a55-feb2028.json")),
    ("a55-be", include_str!("fixtures/a5/a55-be.json")),
    ("a55-mon", include_str!("fixtures/a5/a55-mon.json")),
];

#[test]
fn html_goldens_match_shared_fixtures() {
    for (name, src) in FIXTURES {
        let html = render_calendar_html(&model_from_json(src));
        assert_eq!(html, golden_html(name), "{name} html");
    }
}

#[test]
fn feb_2028_is_leap_and_selected_day() {
    assert_eq!(days_in_month(2028, 2), 29);
    let html = render_calendar_html(&model_from_json(FIXTURES[0].1));
    assert!(html.contains("aria-current=\"date\">29</td>"), "{html}");
    assert!(html.contains("กุมภาพันธ์ ค.ศ. 2028"), "{html}");
    assert_eq!(html.matches("class=\"t-calendar__day\"").count(), 28, "{html}");
    assert!(html.contains("t-calendar__day--selected"), "{html}");
}

#[test]
fn be_caption_and_monday_week_start() {
    let be = render_calendar_html(&model_from_json(FIXTURES[1].1));
    assert!(be.contains("<caption>กุมภาพันธ์ 2571</caption>"), "{be}");
    assert!(be.contains("aria-current=\"date\">15</td>"), "{be}");

    let mon = render_calendar_html(&model_from_json(FIXTURES[2].1));
    // Monday-first: first th is จ
    assert!(mon.starts_with("<table class=\"t-calendar\">"), "{mon}");
    assert!(mon.contains("<th scope=\"col\">จ</th><th scope=\"col\">อ</th>"), "{mon}");
}

#[test]
fn calendar_is_version4_kind_and_compiles() {
    assert!(is_a5_kind(NodeType::Calendar));
    assert!(is_version4_kind(NodeType::Calendar));
    assert!(ALL_TYPES.contains(&NodeType::Calendar));
    assert_eq!(ALL_TYPES.len(), 59);
    assert_eq!(type_name(NodeType::Calendar), "calendar");
    let l = kind_looks();
    assert!(l.a5_kinds.contains_key("calendar"));

    let doc = parse_document(&serde_json::json!({
        "version": 4,
        "meta": { "title": "a55", "lang": "th" },
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
                "type": "calendar",
                "props": {
                    "type": "calendar",
                    "year": 2028,
                    "month": 2,
                    "weekStart": 0,
                    "era": "ce",
                    "selectedDay": 29
                },
                "style": {}
            }
        }
    }))
    .unwrap();
    let (html, css) = compile_export(&doc, &CompileOptions::default()).unwrap();
    assert!(html.contains("t-calendar"), "{html}");
    assert!(html.contains("aria-current=\"date\""), "{html}");
    assert!(css.contains(".t-calendar"), "{css}");
    let _ = NodeProps::Calendar {
        year: 2569,
        month: 11,
        selected_day: None,
        week_start: CalendarWeekStart::Sunday,
        era: CalendarEra::Be,
    };
}
