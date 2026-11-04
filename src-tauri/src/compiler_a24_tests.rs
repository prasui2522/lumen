//! PHASE-11 A2.4 tests (skeleton, spinner, aspectRatio, scrollArea, buttonGroup) and the A2.3 follow-ups N2 / N3.
//! Goldens live in fixtures/a2/a24-*.{html,css}; regenerate with `A24_BLESS=1 cargo test a24_tests`.
use super::*;

const KINDS: &str = include_str!("fixtures/a2/a24-kinds.json");
const SCROLL_BP: &str = include_str!("fixtures/a2/a24-scroll-bp.json");
const HOSTILE: &str = include_str!("fixtures/a2/a24-hostile.json");
const FIXTURES: [(&str, &str); 3] = [("kinds", KINDS), ("scroll-bp", SCROLL_BP), ("hostile", HOSTILE)];

fn export(src: &str) -> (String, String) {
    let doc = parse_document(&serde_json::from_str(src).unwrap()).unwrap();
    compile_export(&doc, &CompileOptions::default()).unwrap()
}

fn golden_path(name: &str, ext: &str) -> std::path::PathBuf {
    std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join(format!("src/fixtures/a2/a24-{name}.{ext}"))
}

#[test]
fn goldens_for_the_three_a24_fixtures() {
    for (name, src) in FIXTURES {
        let (html, css) = export(src);
        if std::env::var("A24_BLESS").is_ok() {
            std::fs::write(golden_path(name, "html"), &html).unwrap();
            std::fs::write(golden_path(name, "css"), &css).unwrap();
            continue;
        }
        assert_eq!(html, std::fs::read_to_string(golden_path(name, "html")).unwrap(), "{name}.html");
        assert_eq!(css, std::fs::read_to_string(golden_path(name, "css")).unwrap(), "{name}.css");
        assert_eq!(export(src), (html, css), "{name} not deterministic");
    }
}

// ---- a tiny cascade: the four corner radii an element ends up with (what `getComputedStyle` reports) ----

/// Declarations of every rule whose selector is exactly `sel` outside any @media, in file order.
fn rule_decls(css: &str, sel: &str) -> Vec<(String, String)> {
    // drop the reduced-motion block (nested braces) and everything from the first breakpoint query on
    let css = css.replace("@media (prefers-reduced-motion:reduce){.t-spinner svg{animation:none}}", "").replace("@keyframes t-spin{to{transform:rotate(360deg)}}", "");
    let outside = css.split("@media (").next().unwrap_or("");
    let mut out = vec![];
    for chunk in outside.split('}') {
        if let Some((s, body)) = chunk.split_once('{') {
            if s.trim() == sel {
                for d in body.split(';').filter(|d| !d.is_empty()) {
                    let (k, v) = d.split_once(':').unwrap();
                    out.push((k.to_string(), v.to_string()));
                }
            }
        }
    }
    out
}

/// [top-left, top-right, bottom-right, bottom-left] after the cascade `.t-button` then `.nN` (shorthand resets all four).
fn radii(html: &str, css: &str, label: &str) -> [String; 4] {
    let at = html.find(&format!(">{label}</span>")).unwrap_or_else(|| panic!("no button {label}"));
    let open = html[..at].rfind("<span class=\"").unwrap();
    let classes = html[open + 13..at].split('"').next().unwrap().to_string();
    let mut r: [String; 4] = Default::default();
    for c in classes.split(' ') {
        for (k, v) in rule_decls(css, &format!(".{c}")) {
            match k.as_str() {
                "border-radius" => r = [v.clone(), v.clone(), v.clone(), v],
                "border-top-left-radius" => r[0] = v,
                "border-top-right-radius" => r[1] = v,
                "border-bottom-right-radius" => r[2] = v,
                "border-bottom-left-radius" => r[3] = v,
                _ => {}
            }
        }
    }
    r
}

fn px(a: &str, b: &str, c: &str, d: &str) -> [String; 4] {
    [a, b, c, d].map(|s| s.to_string())
}

#[test]
fn a_group_of_three_buttons_rounds_only_the_outer_corners() {
    let (html, css) = export(KINDS);
    // default buttons (radius 8): first = left side only, middle none, last = right side only
    assert_eq!(radii(&html, &css, "หนึ่ง"), px("8px", "0px", "0px", "8px"));
    assert_eq!(radii(&html, &css, "สอง"), px("0px", "0px", "0px", "0px"));
    assert_eq!(radii(&html, &css, "สาม"), px("0px", "8px", "8px", "0px"));
    // spec: a child with radius 20 gets 20 on its outer corners
    assert_eq!(radii(&html, &css, "ซ้าย"), px("20px", "0px", "0px", "20px"));
    assert_eq!(radii(&html, &css, "กลาง"), px("0px", "0px", "0px", "0px"));
    assert_eq!(radii(&html, &css, "ขวา"), px("0px", "20px", "20px", "0px"));
    // a column group rounds the top and bottom edges instead
    assert_eq!(radii(&html, &css, "บน"), px("20px", "20px", "0px", "0px"));
    assert_eq!(radii(&html, &css, "ล่าง"), px("0px", "0px", "20px", "20px"));
    // a middle child with its own radius 20 still has none; its neighbours keep their own radius (each child uses its OWN radius)
    assert_eq!(radii(&html, &css, "ข"), px("0px", "0px", "0px", "0px"));
    assert_eq!(radii(&html, &css, "ก"), px("8px", "0px", "0px", "8px"));
    assert_eq!(radii(&html, &css, "ค"), px("0px", "8px", "8px", "0px"));
    // a group of one is a plain button: all four corners keep the radius
    assert_eq!(radii(&html, &css, "เดี่ยว"), px("20px", "20px", "20px", "20px"));
}

#[test]
fn the_group_is_a_role_group_flex_row_with_no_gap_and_a_column_when_asked() {
    let (html, css) = export(KINDS);
    assert!(html.contains("<div class=\"t-buttonGroup\" role=\"group\" aria-label=\"สามปุ่ม\">"), "{html}");
    assert!(css.contains(".t-buttonGroup{display:flex;flex-direction:row;gap:0px;align-items:stretch;justify-content:flex-start}"));
    assert!(css.contains(".n7{flex-direction:column}"), "{css}");
}

#[test]
fn skeleton_is_a_static_aria_hidden_block() {
    let (html, css) = export(KINDS);
    assert!(html.contains("<div class=\"t-skeleton\" aria-hidden=\"true\"></div>"), "{html}");
    assert_eq!(rule_decls(&css, ".t-skeleton").iter().filter(|(k, _)| k.contains("animation") || k.contains("transition")).count(), 0);
    // a skeleton page on its own has no animation of any kind
    let only_skeleton = KINDS.replace("\"type\": \"spinner\"", "\"type\": \"skeleton\"");
    let (_, css) = export(&only_skeleton);
    assert!(!css.contains("infinite") && !css.contains("@keyframes") && !css.contains("animation"), "{css}");
}

#[test]
fn spinner_is_an_inline_svg_status_with_a_name_and_a_reduced_motion_stop() {
    let (html, css) = export(KINDS);
    assert!(html.contains("<span class=\"t-spinner\" role=\"status\" aria-label=\"กำลังโหลด\"><svg viewBox=\"0 0 24 24\" width=\"24\" height=\"24\""), "{html}");
    assert!(html.contains("aria-label=\"กำลังบันทึก\"><svg viewBox=\"0 0 24 24\" width=\"32\" height=\"32\""), "{html}");
    assert!(html.contains("aria-hidden=\"true\" focusable=\"false\"><path d="), "{html}");
    assert!(css.contains(".t-spinner svg{display:block;animation:t-spin 1s linear infinite}"));
    assert!(css.contains("@media (prefers-reduced-motion:reduce){.t-spinner svg{animation:none}}"));
    assert_eq!(css.matches("@keyframes").count(), 1);
}

#[test]
fn aspect_ratio_writes_the_ratio_and_the_descendant_fill_rule() {
    let (html, css) = export(KINDS);
    assert!(css.contains(".t-aspectRatio>*{width:100%;height:100%}"));
    for (cls, r) in [("n16", "16 / 9"), ("n17", "4 / 3"), ("n18", "1 / 1"), ("n19", "3 / 2"), ("n20", "21 / 9")] {
        assert!(css.contains(&format!(".{cls}{{aspect-ratio:{r}}}")), "{cls}");
        assert!(html.contains(&format!("<div class=\"t-aspectRatio {cls}\">")), "{cls}");
    }
    // a page without an aspectRatio carries neither the type rule nor the descendant rule
    let (_, none) = export(SCROLL_BP);
    assert!(!none.contains("t-aspectRatio"));
}

#[test]
fn scroll_area_is_a_focusable_region_with_overflow_auto_and_an_axis_rule() {
    let (html, css) = export(KINDS);
    assert!(html.contains("<div class=\"t-scrollArea n21\" role=\"region\" aria-label=\"รายการ\" tabindex=\"0\">"), "{html}");
    // a layer name is the fallback label; an unnamed one is a focusable div (no empty region)
    assert!(html.contains("<div class=\"t-scrollArea n22\" role=\"region\" aria-label=\"แถบเลื่อน\" tabindex=\"0\">"), "{html}");
    assert!(html.contains("<div class=\"t-scrollArea n23\" tabindex=\"0\"></div>"), "{html}");
    assert!(css.contains(".t-scrollArea{display:flex;width:100%;overflow:auto}"));
    assert!(css.contains("overflow-x:hidden}") && css.contains("overflow-y:hidden}"));
}

#[test]
fn n3_the_scroll_area_has_a_literal_hex_focus_ring_only_when_one_is_used() {
    let ring = ".t-scrollArea:focus-visible{outline:2px solid #0077c2;outline-offset:2px}";
    for (name, src) in FIXTURES {
        let (html, css) = export(src);
        let used = html.contains("t-scrollArea");
        assert_eq!(css.matches(ring).count(), usize::from(used), "{name}");
        if used {
            // after the type rule, before any per-node rule
            let (a, b, c) = (css.find(".t-scrollArea{").unwrap(), css.find(ring).unwrap(), css.find(".n1{").unwrap());
            assert!(a < b && b < c, "{name}");
        }
    }
}

/// N2: the axis rule follows the overflow in force at each breakpoint.
fn media_block<'a>(css: &'a str, query: &str) -> &'a str {
    let at = css.find(&format!("@media {query}{{")).unwrap_or_else(|| panic!("no {query}"));
    let body = &css[at + query.len() + 8..];
    // the block ends at the first `}}` (last rule's `}` + the media's `}`); keep that last rule's `}`
    let end = body.find("}}").unwrap();
    &body[..end + 1]
}

#[test]
fn n2_a_breakpoint_overflow_brings_its_own_axis_rule() {
    let (_, css) = export(SCROLL_BP);
    let tablet = media_block(&css, "(max-width:1024px)");
    let phone = media_block(&css, "(max-width:719px)");
    let fold = media_block(&css, "(horizontal-viewport-segments: 2)");
    // base hidden + tablet auto: the old code scrolled both axes here
    assert!(tablet.contains(".n1{overflow:auto;overflow-x:hidden}"), "{tablet}");
    // auto -> hidden (nothing to add) -> scroll (axis rule again, in the phone rule that follows the tablet one)
    assert!(tablet.contains(".n2{overflow:hidden}") && phone.contains(".n2{overflow:scroll;overflow-y:hidden}"), "{css}");
    // both: no axis rule; visible: none; a breakpoint without overflow: untouched
    assert!(tablet.contains(".n3{overflow:auto}") && tablet.contains(".n5{overflow:visible}") && tablet.contains(".n7{width:300px}"), "{tablet}");
    // fold-open has its own rule too
    assert!(fold.contains(".n4{overflow:scroll;overflow-x:hidden}"), "{fold}");
    // the control and the base rules are unchanged
    assert!(css.contains(".n6{height:100px;display:flex;flex-direction:column;gap:0px;align-items:stretch;justify-content:flex-start;overflow-x:hidden}"));
    assert!(!tablet.contains(".n6") && !phone.contains(".n6"));
    // the axis declaration always comes AFTER the shorthand it must survive
    for rule in tablet.split('}').chain(phone.split('}')).chain(fold.split('}')) {
        if let (Some(a), Some(b)) = (rule.find("overflow:"), rule.find("overflow-")) {
            assert!(a < b, "{rule}");
        }
    }
}

#[test]
fn scroll_axis_decls_is_the_one_table_for_base_and_breakpoints() {
    use crate::defaults::ScrollOrientation as O;
    assert_eq!(scroll_axis_decls(O::Vertical, Some("scroll")), vec![("overflow-x", "hidden".to_string())]);
    assert_eq!(scroll_axis_decls(O::Horizontal, Some("auto")), vec![("overflow-y", "hidden".to_string())]);
    assert!(scroll_axis_decls(O::Both, Some("auto")).is_empty());
    assert!(scroll_axis_decls(O::Vertical, Some("hidden")).is_empty());
    assert!(scroll_axis_decls(O::Vertical, Some("visible")).is_empty());
    assert!(scroll_axis_decls(O::Vertical, None).is_empty());
}

#[test]
fn hostile_text_is_escaped_and_hostile_css_cannot_leave_its_declaration() {
    let (html, css) = export(HOSTILE);
    assert!(!html.contains("<img") && !html.contains("<script"), "{html}");
    assert!(html.contains("aria-label=\"&quot;&gt;&lt;img src=x onerror=alert(1)&gt;\""), "{html}");
    for bad in ["var(", "gradient", "url(", "!important", "</style>", "<"] {
        assert!(!css.contains(bad), "{bad} in {css}");
    }
    // `}` / `{` / `;` from a value never survive, so no extra rule or declaration appears
    assert!(!css.contains("body{display:none") && !css.contains("x{y:z"), "{css}");
    // the rule count equals the node rules plus the type rules we expect
    assert_eq!(css.matches("{").count(), css.matches("}").count());
    // a negative or absurd radius in a group never reaches a corner longhand as a positive size
    assert_eq!(radii(&html, &css, "&#39;x&#39;"), px("0px", "8px", "8px", "0px"));
}

#[test]
fn only_the_spinner_animates_across_every_a2_fixture() {
    let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("src/fixtures/a2");
    let mut seen = 0;
    let mut with_spinner = 0;
    for e in std::fs::read_dir(dir).unwrap() {
        let p = e.unwrap().path();
        let n = p.file_name().unwrap().to_string_lossy().to_string();
        if !n.ends_with(".json") || n.starts_with("seed") || ["corner-table.json", "default-styles.json", "scroll-orientation.json"].contains(&n.as_str()) {
            continue;
        }
        let (html, css) = export(&std::fs::read_to_string(&p).unwrap());
        seen += 1;
        let spinner = html.contains("class=\"t-spinner");
        with_spinner += usize::from(spinner);
        assert_eq!(css.matches("infinite").count(), usize::from(spinner), "{n}");
        assert_eq!(css.matches("@keyframes").count(), usize::from(spinner), "{n}");
        assert_eq!(css.matches("animation").count(), if spinner { 2 } else { 0 }, "{n}");
        assert_eq!(css.matches("transition").count(), 0, "{n}");
    }
    assert!(seen >= 14 && with_spinner >= 5, "{seen} {with_spinner}");
}
