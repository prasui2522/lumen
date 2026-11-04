//! PHASE-11 A2.3 (part 1) tests: card, alert, separator, skeleton, spinner, aspectRatio and
//! buttonGroup compile to real HTML + CSS (badge and scrollArea: compiler_a23b_tests.rs). Goldens live in fixtures/a2/a23-*.{html,css}; regenerate them
//! with `A23_BLESS=1 cargo test a23_tests` and read the diff.
use super::*;

const DEFAULT: &str = include_str!("fixtures/a2/a23-default.json");
const OVERRIDES: &str = include_str!("fixtures/a2/a23-overrides.json");
const NESTED: &str = include_str!("fixtures/a2/a23-nested.json");
const HOSTILE: &str = include_str!("fixtures/a2/a23-hostile.json");
const CORNERS: &str = include_str!("fixtures/a2/corner-table.json");
const KIND_LOOKS_SRC: &str = include_str!("../../src/lib/kind-looks.json");

const MIXED: &str = include_str!("fixtures/a2/a23-group-mixed.json");
const EDGE: &str = include_str!("fixtures/a2/a23-layout-edge.json");
const BPC: &str = include_str!("fixtures/a2/a23-bp-corners.json");

const FIXTURES: [(&str, &str); 7] = [
    ("default", DEFAULT),
    ("overrides", OVERRIDES),
    ("nested", NESTED),
    ("hostile", HOSTILE),
    ("group-mixed", MIXED),
    ("layout-edge", EDGE),
    ("bp-corners", BPC),
];

fn export(src: &str) -> (String, String) {
    let doc = parse_document(&serde_json::from_str(src).unwrap()).unwrap();
    compile_export(&doc, &CompileOptions::default()).unwrap()
}

fn golden_path(name: &str, ext: &str) -> std::path::PathBuf {
    std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join(format!("src/fixtures/a2/a23-{name}.{ext}"))
}

#[test]
fn goldens_for_the_seven_a23_fixtures() {
    for (name, src) in FIXTURES {
        let (html, css) = export(src);
        if std::env::var("A23_BLESS").is_ok() {
            std::fs::write(golden_path(name, "html"), &html).unwrap();
            std::fs::write(golden_path(name, "css"), &css).unwrap();
            continue;
        }
        let gh = std::fs::read_to_string(golden_path(name, "html")).unwrap();
        let gc = std::fs::read_to_string(golden_path(name, "css")).unwrap();
        assert_eq!(html, gh, "{name}.html");
        assert_eq!(css, gc, "{name}.css");
        // the export is deterministic
        assert_eq!(export(src), (html, css), "{name} not deterministic");
    }
}

#[test]
fn default_output_has_the_spec_tags_roles_and_classes() {
    let (html, css) = export(DEFAULT);
    assert!(html.contains("<div class=\"t-card\"><h2"), "{html}");
    assert!(html.contains("<div class=\"t-alert\" role=\"note\"><p class=\"t-text\">ข้อความแจ้งเตือน</p></div>"), "{html}");
    // horizontal separator is a void <hr>; vertical is a div with role + orientation
    assert!(html.contains("<hr class=\"t-separator\">") && !html.contains("</hr>"), "{html}");
    assert!(html.contains("role=\"separator\" aria-orientation=\"vertical\"></div>"), "{html}");
    assert!(html.contains("<div class=\"t-skeleton\" aria-hidden=\"true\"></div>"), "{html}");
    assert!(html.contains("<span class=\"t-spinner\" role=\"status\" aria-label=\"กำลังโหลด\"><svg viewBox=\"0 0 24 24\" width=\"24\" height=\"24\""), "{html}");
    assert!(html.contains("aria-hidden=\"true\" focusable=\"false\"><path d=\"M21 12a9 9 0 1 1-6.219-8.56\"/></svg></span>"), "{html}");
    assert!(html.contains("<div class=\"t-buttonGroup\" role=\"group\">"), "{html}");
    // no name -> no aria-label on the group
    assert!(!html.contains("role=\"group\" aria-label"), "{html}");
    // default styles (A2.1) are unchanged and the layout defaults are in the type rules
    for rule in [
        ".t-card{display:flex;width:100%;padding:24px;background-color:#ffffff;border-radius:12px;border-width:1px;border-color:#e2e8f0;border-style:solid;flex-direction:column;gap:16px;align-items:stretch;justify-content:flex-start}",
        ".t-alert{display:flex;width:100%;padding:16px;background-color:#f8fafc;border-radius:8px;border-width:1px;border-color:#e2e8f0;border-style:solid;flex-direction:column;gap:8px;align-items:stretch;justify-content:flex-start}",
        ".t-separator{display:block;width:100%;height:1px;background-color:#e2e8f0;color:inherit}",
        ".t-skeleton{display:block;width:100%;height:16px;background-color:#e2e8f0;border-radius:6px}",
        ".t-spinner{display:inline-block;color:#0f172a}",
        ".t-aspectRatio{display:flex;width:100%;overflow:hidden;flex-direction:column;gap:0px;align-items:stretch;justify-content:flex-start}",
        ".t-buttonGroup{display:flex;flex-direction:row;gap:0px;align-items:stretch;justify-content:flex-start}",
    ] {
        assert!(css.contains(rule), "missing {rule}\n{css}");
    }
    // 16/9 is a per-node class, not a type rule
    assert!(css.contains("aspect-ratio:16 / 9") && !css.contains(".t-aspectRatio{display:flex;width:100%;overflow:hidden;flex-direction:column;gap:0px;align-items:stretch;justify-content:flex-start;aspect-ratio"), "{css}");
    // buttons of the group: outer corners keep the button radius, the middle one has none
    assert!(css.contains("{border-top-left-radius:8px;border-top-right-radius:0px;border-bottom-right-radius:0px;border-bottom-left-radius:8px}"), "{css}");
    assert!(css.contains("{border-radius:0px}"), "{css}");
    assert!(css.contains("{border-top-left-radius:0px;border-top-right-radius:8px;border-bottom-right-radius:8px;border-bottom-left-radius:0px}"), "{css}");
}

#[test]
fn preview_has_the_same_structure_as_the_export() {
    for (name, src) in FIXTURES {
        let (ex, _) = export(src);
        let prev = compile_json(src, &CompileOptions { preview: true, ..Default::default() }).unwrap();
        for tag in ["t-card", "t-alert", "t-separator", "t-skeleton", "t-spinner", "t-aspectRatio", "t-buttonGroup"] {
            assert_eq!(ex.matches(tag).count() > 0, prev.matches(tag).count() > 0, "{name} {tag}");
        }
        assert!(prev.contains("<style>"), "{name}");
    }
}

#[test]
fn layout_props_reach_the_output() {
    let (html, css) = export(OVERRIDES);
    // card: direction row, gap 4, align center, justify between (and its own colours / width / radius)
    for d in [
        "flex-direction:row", "gap:4px", "align-items:center", "justify-content:space-between",
        "background-color:#fef3c7", "padding:8px", "border-radius:0px", "border-color:#000000", "width:50%",
    ] {
        assert!(css.contains(d), "{d}\n{css}");
    }
    // alert row, own bg + border
    assert!(css.contains("background-color:#fee2e2") && css.contains("border-width:2px") && css.contains("border-color:#ef4444"), "{css}");
    // aspectRatio 1/1 and 21/9, row + centre
    assert!(css.contains("aspect-ratio:1 / 1") && css.contains("aspect-ratio:21 / 9"), "{css}");
    // buttonGroup column + gap 2 + aria-label from the layer name (G4)
    assert!(html.contains("<div class=\"t-buttonGroup n") && html.contains("role=\"group\" aria-label=\"กลุ่มคอลัมน์\""), "{html}");
    assert!(css.contains("flex-direction:column") && css.contains("gap:2px"), "{css}");
    // spinner sizes are clamped 12..64
    assert!(html.contains("width=\"64\" height=\"64\"") && html.contains("width=\"12\" height=\"12\""), "{html}");
    assert!(!html.contains("width=\"99\"") && !html.contains("width=\"5\""), "{html}");
    assert!(css.contains("color:#ef4444"), "{css}");
}

#[test]
fn the_vertical_separator_stretches_unless_the_node_sets_the_size() {
    let (html, css) = export(DEFAULT);
    assert!(html.contains("<div class=\"t-separator n"), "{html}");
    assert!(css.contains("{width:1px;height:auto;min-height:16px;align-self:stretch}"), "{css}");
    // explicit width 3 and height 40 win over the stretch extras (G1)
    let (_, css) = export(OVERRIDES);
    assert!(css.contains("width:3px") && css.contains("height:40px") && css.contains("min-height:16px;align-self:stretch"), "{css}");
    assert!(!css.contains("width:1px;height:auto") && !css.contains("height:auto;min-height:16px;align-self:stretch;height"), "{css}");
}

#[test]
fn button_group_corners_count_only_the_children_that_are_drawn() {
    let (html, css) = export(OVERRIDES);
    // column group: first = top corners, last = bottom corners (12px), middle 0; the child's own
    // `border-radius` shorthand stays in front, the longhands follow and win
    assert!(css.contains("border-radius:12px;border-top-left-radius:12px;border-top-right-radius:12px;border-bottom-right-radius:0px;border-bottom-left-radius:0px}"), "{css}");
    assert!(css.contains("border-radius:12px;border-top-left-radius:0px;border-top-right-radius:0px;border-bottom-right-radius:12px;border-bottom-left-radius:12px}"), "{css}");
    assert!(css.contains(".n12{border-radius:0px}"), "{css}");
    // a lone child keeps its own radius: its class has the shorthand and no longhands
    assert!(css.contains(".n14{border-radius:12px}"), "{css}");
    assert!(html.contains("class=\"t-button n14\">เดี่ยว</span>"), "{html}");
    // hidden third child: the second one is the last drawn one (row: right corners round)
    assert!(!html.contains("ซ่อน"), "{html}");
    assert!(css.contains("border-radius:12px;border-top-left-radius:0px;border-top-right-radius:12px;border-bottom-right-radius:12px;border-bottom-left-radius:0px}"), "{css}");
    // a child without a radius gets nothing from the group (no class); the other one rounds its outer corner
    assert!(html.contains("<span class=\"t-button n18\">ไม่มีมุม</span>") || html.contains("<span class=\"t-button\">ไม่มีมุม</span>"), "{html}");
    assert!(css.contains(".n19{border-radius:6px;border-top-left-radius:0px;border-top-right-radius:6px;border-bottom-right-radius:6px;border-bottom-left-radius:0px}"), "{css}");
}

#[test]
fn corner_table_is_shared_with_the_canvas() {
    let rows: Vec<serde_json::Value> = serde_json::from_str(CORNERS).unwrap();
    assert!(rows.len() >= 10);
    for r in rows {
        let dir = if r["dir"] == "row" { Direction::Row } else { Direction::Column };
        let pos = match r["pos"].as_str().unwrap() {
            "first" => GroupPos::First,
            "middle" => GroupPos::Middle,
            _ => GroupPos::Last,
        };
        let got: Vec<serde_json::Value> = group_corner_decls(dir, pos, r["radius"].as_f64().unwrap())
            .into_iter()
            .map(|(k, v)| serde_json::json!([k, v]))
            .collect();
        assert_eq!(serde_json::Value::Array(got), r["decls"], "{r}");
    }
    // NaN / negative radius never produce declarations
    assert!(group_corner_decls(Direction::Row, GroupPos::First, f64::NAN).is_empty());
    assert!(group_corner_decls(Direction::Row, GroupPos::Last, -3.0).is_empty());
}

#[test]
fn nested_children_render_inside_their_containers() {
    let (html, css) = export(NESTED);
    let inner = "<section class=\"t-section\"><div class=\"t-card n1\"><div class=\"t-alert\" role=\"note\"><div class=\"t-buttonGroup\" role=\"group\" aria-label=\"กลุ่มซ้อน\">";
    assert!(html.contains(inner), "{html}");
    assert!(html.contains("<div class=\"t-aspectRatio n"), "{html}");
    // the card inside the aspectRatio holds the spinner; the skeleton follows it inside the box
    assert!(html.contains("<div class=\"t-card\"><span class=\"t-spinner\" role=\"status\" aria-label=\"กำลังโหลด\"><svg viewBox=\"0 0 24 24\" width=\"32\" height=\"32\""), "{html}");
    assert!(html.contains("<p class=\"t-text\">ท้ายการ์ด</p></div></section>"), "{html}");
    // the container (row) holds a column buttonGroup of card + empty alert
    assert!(html.contains("<div class=\"t-container"), "{html}");
    // (they sit in a column group, so the card keeps its top corners and the alert its bottom ones)
    assert!(html.contains("<div class=\"t-card n7\"><p class=\"t-text\">ในการ์ด</p></div><div class=\"t-alert n8\" role=\"note\"></div>"), "{html}");
    assert!(css.contains(".n7{border-top-left-radius:12px;border-top-right-radius:12px;border-bottom-right-radius:0px;border-bottom-left-radius:0px}"), "{css}");
    assert!(css.contains(".n8{border-top-left-radius:0px;border-top-right-radius:0px;border-bottom-right-radius:8px;border-bottom-left-radius:8px}"), "{css}");
    // fill rule for aspectRatio children comes from the shared file
    assert!(css.contains(".t-aspectRatio>*{width:100%;height:100%}"), "{css}");
    assert!(css.contains("gap:4px"), "{css}");
}

#[test]
fn hostile_names_labels_and_values_cannot_break_out() {
    let (html, css) = export(HOSTILE);
    assert!(!html.contains("<script") && !html.contains("<b onload"), "{html}");
    assert!(html.contains("aria-label=\"&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;\""), "{html}");
    assert!(html.contains("<h2 class=\"t-heading t-h2\">&lt;/style&gt;&lt;b onload=x&gt;</h2>"), "{html}");
    assert!(html.contains("a&amp;b &#39;q&#39; &quot;x&quot;") || html.contains("a&amp;b &#x27;q&#x27; &quot;x&quot;"), "{html}");
    // a blank spinner name falls back to the Thai text
    assert!(html.contains("aria-label=\"กำลังโหลด\""), "{html}");
    // size 999999 clamps to 64
    assert!(html.contains("width=\"64\" height=\"64\"") && !html.contains("999999"), "{html}");
    // hostile style values are neutralised (css_safe) and never reach the sheet
    for bad in ["</style", "<script", "url(", "expression", "gradient(", "evil.test", "!important", "var("] {
        assert!(!css.contains(bad), "{bad}\n{css}");
    }
    // every emitted rule is still a closed rule (no `}x{y:z` injection)
    assert!(!css.contains("x{y:z"), "{css}");
}

#[test]
fn emitted_a2_css_has_no_var_gradient_url_important_and_one_infinite_animation() {
    for (name, src) in FIXTURES {
        let (_, css) = export(src);
        for bad in ["var(", "gradient(", "url(", "!important"] {
            assert!(!css.contains(bad), "{name} {bad}");
        }
    }
    // `infinite` exists exactly once, in the spinner rule, with a reduced-motion override
    let (_, css) = export(DEFAULT);
    assert_eq!(css.matches("infinite").count(), 1, "{css}");
    assert!(css.contains(".t-spinner svg{display:block;animation:t-spin 1s linear infinite}"));
    assert!(css.contains("@keyframes t-spin{to{transform:rotate(360deg)}}"));
    assert!(css.contains("@media (prefers-reduced-motion:reduce){.t-spinner svg{animation:none}}"));
    // a page without a spinner has no animation at all
    let (_, css) = export(NESTED.replace("\"spinner\"", "\"skeleton\"").as_str());
    let _ = css;
    let (_, css) = export(include_str!("fixtures/a2/seed-a2-nest.json"));
    assert!(!css.contains("infinite") && !css.contains("@keyframes"), "{css}");
}

#[test]
fn shared_a2_section_is_required_and_parsed() {
    let l = kind_looks();
    assert_eq!(l.kinds.len(), 30, "A1 table must not change (A3.2 moved switch to a3.kinds)");
    let mut names: Vec<&&str> = l.a2_kinds.keys().collect();
    names.sort();
    assert_eq!(names, [&"aspectRatio", &"badge", &"scrollArea", &"separator", &"separatorVertical", &"spinner"]);
    assert_eq!(l.a2_texts["spinnerLabel"], "กำลังโหลด");
    assert!(!KIND_LOOKS_SRC.is_empty());
    // no token is left unexpanded, no `#` token mistakes
    for k in l.a2_kinds.values() {
        assert!(!k.css.contains("{{") && k.extras.iter().all(|(_, v)| !v.contains("{{")));
    }
    // a file without the a2 section is rejected as a whole (the A1 tests would fail loudly)
    let mut v: serde_json::Value = serde_json::from_str(KIND_LOOKS_SRC).unwrap();
    v.as_object_mut().unwrap().remove("a2");
    assert!(parse_kind_looks(&v.to_string()).is_none());
    let mut v: serde_json::Value = serde_json::from_str(KIND_LOOKS_SRC).unwrap();
    v["a2"]["texts"] = serde_json::json!({"spinnerLabel": 3});
    assert!(parse_kind_looks(&v.to_string()).is_none());
    // badge holds only non-StyleProps declarations; display / overflow are never repeated here
    let badge: Vec<&str> = l.a2_kinds["badge"].extras.iter().map(|(k, _)| *k).collect();
    assert_eq!(badge, ["align-items", "gap"]);
    for k in l.a2_kinds.values() {
        assert!(k.extras.iter().all(|(p, _)| *p != "display" && *p != "overflow"));
    }
    // N3: scrollArea holds only its keyboard focus ring (literal hex, G5); its overflow stays a default style
    assert!(l.a2_kinds["scrollArea"].extras.is_empty());
    assert_eq!(l.a2_kinds["scrollArea"].css, ".t-scrollArea:focus-visible{outline:2px solid #0077c2;outline-offset:2px}");
    // no A2 key leaked into the A1 table (A1.4 tests rely on it)
    for k in ["card", "alert", "separator", "skeleton", "spinner", "aspectRatio", "buttonGroup"] {
        assert!(!l.kinds.contains_key(k), "{k}");
    }
}

#[test]
fn a_hr_never_has_children_and_ids_are_not_used() {
    for (_, src) in FIXTURES {
        let (html, _) = export(src);
        // a void element: never a closing tag, so it cannot hold children
        assert_eq!(html.matches("<hr").count(), html.matches("<hr class=\"t-separator").count(), "{html}");
        assert!(!html.contains("</hr>"));
        assert!(!html.contains(" id=\""), "{html}");
    }
}

#[test]
fn a_breakpoint_override_on_a_child_still_compiles() {
    // known edge: a breakpoint borderRadius on a buttonGroup child overrides the corner longhands.
    let mut v: serde_json::Value = serde_json::from_str(OVERRIDES).unwrap();
    v["nodes"]["c1"]["styleBreakpoints"] = serde_json::json!({"tablet": {"borderRadius": 4}});
    let (_, css) = export(&v.to_string());
    assert!(css.contains("border-radius:4px"), "{css}");
}

#[test]
fn ratio_and_spinner_tables_match_the_canvas() {
    // the same literals are asserted in src/lib/a2-looks.test.ts
    let got: Vec<&str> = [
        AspectRatioValue::R16x9,
        AspectRatioValue::R4x3,
        AspectRatioValue::R1x1,
        AspectRatioValue::R3x2,
        AspectRatioValue::R21x9,
    ]
    .into_iter()
    .map(ratio_css)
    .collect();
    assert_eq!(got, ["16 / 9", "4 / 3", "1 / 1", "3 / 2", "21 / 9"]);
    assert_eq!([5, 12, 24, 64, 99, u32::MAX].map(spinner_px), [12, 12, 24, 64, 64, 64]);
}

#[test]
fn a_button_group_with_non_button_children_gets_the_corner_rule_on_every_drawn_child() {
    // Golden: a23-group-mixed. Row group: button, card, input, badge, spinner (the hidden alert is
    // not counted); column group: text, skeleton, separator, scrollArea; nested groups.
    let (html, css) = export(MIXED);
    assert!(html.contains("role=\"group\" aria-label=\"ผสม\""), "{html}");
    assert!(!html.contains("t-alert"), "a hidden child is not drawn");
    // first = left corners, last (spinner has no radius -> nothing), middle ones square
    assert!(css.contains("border-top-left-radius:10px;border-top-right-radius:0px;border-bottom-right-radius:0px;border-bottom-left-radius:10px"), "{css}");
    assert_eq!(css.matches("border-radius:0px}").count() >= 3, true, "{css}");
    // column group: the skeleton / separator / scrollArea with a radius get the top / bottom rule
    assert!(css.contains("border-top-left-radius:0px;border-top-right-radius:0px;border-bottom-right-radius:10px;border-bottom-left-radius:10px"), "{css}");
    // nothing is skipped or dropped: every kind is in the output
    for here in ["t-button", "t-card", "t-input", "t-badge", "t-spinner", "t-text", "t-skeleton", "t-separator", "t-scrollArea", "t-link"] {
        assert!(html.contains(here), "{here}\n{html}");
    }
    assert!(html.matches("role=\"group\"").count() == 4, "{html}");
}

#[test]
fn extreme_gap_and_every_align_justify_value_stay_valid_css() {
    // Golden: a23-layout-edge. u32::MAX gap is written as a plain number; the closed enums
    // (align / justify) cannot carry a string into CSS.
    let (_, css) = export(EDGE);
    assert!(css.contains("gap:4294967295px"), "{css}");
    for d in ["align-items:flex-end", "justify-content:space-between", "align-items:center", "justify-content:center", "align-items:flex-start", "justify-content:flex-end"] {
        assert!(css.contains(d), "{d}\n{css}");
    }
    assert!(!css.contains("e+") && !css.contains("NaN") && !css.contains("inf"), "{css}");
    // a hostile string in align / justify / direction is refused when the document is read
    for (field, bad) in [("align", "center;}x{y:z"), ("justify", "url(x)"), ("direction", "row;}")] {
        let mut v: serde_json::Value = serde_json::from_str(EDGE).unwrap();
        v["nodes"]["c1"]["props"][field] = serde_json::json!(bad);
        assert!(parse_document(&v).is_err(), "{field}");
    }
    // so is a negative or fractional gap
    for bad in [serde_json::json!(-1), serde_json::json!(1.5)] {
        let mut v: serde_json::Value = serde_json::from_str(EDGE).unwrap();
        v["nodes"]["c1"]["props"]["gap"] = bad;
        assert!(parse_document(&v).is_err());
    }
}
