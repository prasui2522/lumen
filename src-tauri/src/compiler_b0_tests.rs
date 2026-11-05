//! B0 (PHASE-11-SPEC §9.B B-prelude, PM rulings 2026-11-04): ONE shared style generator (`style_css`) feeds the
//! static `styles.css`, Preview's inline `<style>` and the Vite zip's `src/styles/site.css`, byte for byte.
use super::*;

const F2: &str = include_str!("fixtures/f2/f2-responsive.json");
const KINDS: &str = include_str!("fixtures/f2/f21-kinds.json");

fn doc(s: &str) -> PageDocument {
    parse_document(&serde_json::from_str(s).unwrap()).unwrap()
}

/// The only `!important` uses B0 allows in the generated block (PM ruling: last resort, each listed). None today.
const IMPORTANT_ALLOWED: &[&str] = &[];

#[test]
fn b0_block_is_byte_identical_in_static_preview_and_site_css() {
    for (name, src) in [("f2", F2), ("kinds", KINDS)] {
        let d = doc(src);
        let o = CompileOptions::default();
        let block = style_css(&d, &o).unwrap();
        assert!(!block.is_empty(), "{name}: generator block empty");
        let (_, css) = compile_export(&d, &o).unwrap();
        assert!(css.ends_with(&format!("{block}\n")), "{name}: styles.css ends with the shared block");
        let preview = compile(&d, &CompileOptions { preview: true, ..CompileOptions::default() }).unwrap();
        assert!(preview.contains(&style_css(&d, &CompileOptions { preview: true, ..CompileOptions::default() }).unwrap()), "{name}: preview");
        let site = crate::export::build_site_css(&d, &o).unwrap();
        assert_eq!(site, format!("{block}\n"), "{name}: zip site.css = the same bytes");
    }
}

#[test]
fn b0_every_breakpoint_node_root_carries_the_hook() {
    let d = doc(F2);
    let (html, css) = compile_export(&d, &CompileOptions::default()).unwrap();
    let mut n = 0;
    let v: serde_json::Value = serde_json::from_str(F2).unwrap();
    for (id, node) in v["nodes"].as_object().unwrap() {
        let bp = &node["styleBreakpoints"];
        if bp.as_object().is_some_and(|m| m.values().any(|s| s.as_object().is_some_and(|o| !o.is_empty()))) {
            n += 1;
            assert!(html.contains(&format!("{HOOK_ATTR}=\"{id}\"")), "{id}: hook attribute on its root");
            assert!(css.contains(&hook_selector(id)), "{id}: rules target the hook");
        }
    }
    assert!(n >= 4, "fixture has breakpoint nodes ({n})");
    assert!(!css.contains("[data-wb-bp="), "old Vite-only selector retired");
}

#[test]
fn b0_no_unlisted_important_in_generated_block() {
    for src in [F2, KINDS] {
        let block = style_css(&doc(src), &CompileOptions::default()).unwrap();
        let hits: Vec<&str> = block.split('}').filter(|r| r.contains("!important")).collect();
        for h in &hits {
            assert!(IMPORTANT_ALLOWED.iter().any(|a| h.contains(a)), "unlisted !important: {h}");
        }
    }
}

#[test]
fn b0_hook_base_restates_static_values_before_media() {
    let block = style_css(&doc(F2), &CompileOptions::default()).unwrap();
    let base = block.find(&hook_selector("h")).expect("h hook base");
    let tablet = block.find("@media (max-width:1024px)").expect("tablet");
    assert!(base < tablet, "base restatement precedes the media blocks");
}

#[test]
fn b0_prop_family_groups_longhands() {
    assert_eq!(prop_family("margin-top"), "margin");
    assert_eq!(prop_family("padding"), "padding");
    assert_eq!(prop_family("overflow-x"), "overflow");
    assert_eq!(prop_family("border-top-left-radius"), "border-radius");
    assert_eq!(prop_family("color"), "color");
}

// ---- B0.1 ----

const ALL: &str = include_str!("fixtures/b0/b01-all-kinds.json");

fn b0_golden(ext: &str) -> std::path::PathBuf {
    std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join(format!("src/fixtures/b0/b01-all-kinds.{ext}"))
}

/// B0.1 item 1: all-kinds fixture (a1 all-kinds + a2/a3/a4/a5/f2.1 kinds merged); the Vite coverage test in
/// `src/lib/b01-vite-hooks.test.ts` renders `.site.json` with `.site.css`. Regenerate with `F2_BLESS=1`.
#[test]
fn b01_all_kinds_site_goldens() {
    let d = doc(ALL);
    let o = CompileOptions::default();
    let site = crate::export::build_site_json(&d, &std::collections::HashMap::new()).unwrap();
    let css = crate::export::build_site_css(&d, &o).unwrap();
    if std::env::var("F2_BLESS").is_ok() {
        std::fs::write(b0_golden("site.json"), &site).unwrap();
        std::fs::write(b0_golden("site.css"), &css).unwrap();
        return;
    }
    assert_eq!(site, std::fs::read_to_string(b0_golden("site.json")).unwrap(), "site.json");
    assert_eq!(css, std::fs::read_to_string(b0_golden("site.css")).unwrap(), "site.css");
}

const DUP: &str = include_str!("fixtures/b0/b01-dup-pages.json");

fn page_doc(d: &PageDocument, i: usize) -> PageDocument {
    let p = &d.pages[i];
    PageDocument { version: d.version, meta: d.meta.clone(), root: p.root.clone(), nodes: p.nodes.clone(), pages: Vec::new() }
}

/// B0.1 item 3: one node id ("h", "bt") on two pages. Every hook rule is page-scoped in the shared block, so each
/// page keeps its own breakpoint values in the static export and in the Vite site.css; the page root carries
/// `data-wb-page`. Writes `b01-dup-pages.{site.json,site.css,kinds.css}` for the Vite test with `F2_BLESS=1`.
#[test]
fn b01_breakpoint_rules_are_scoped_per_page() {
    let d = doc(DUP);
    let o = CompileOptions::default();
    let site_css = crate::export::build_site_css(&d, &o).unwrap();
    for (i, (pid, root, fs, other, col)) in [("p1", "r1", 20, 60, "#b00020"), ("p2", "r2", 60, 20, "#00aa00")].into_iter().enumerate() {
        let pd = page_doc(&d, i);
        let o = CompileOptions { page_id: Some(pid.into()), ..CompileOptions::default() };
        let scoped = format!("[{PAGE_ATTR}=\"{pid}\"] [{HOOK_ATTR}=\"h\"]");
        let (html, css) = compile_export(&pd, &o).unwrap();
        assert!(html.contains(&format!("{PAGE_ATTR}=\"{pid}\"")), "{pid}: page root carries {PAGE_ATTR}");
        assert_eq!(html.matches(&format!("{PAGE_ATTR}=")).count(), 1, "{pid}: one page attribute");
        assert!(css.contains(&format!("{scoped}{{color:{col};font-size:{fs}px}}")), "{root}: own phone value\n{css}");
        assert!(!css.contains(&format!("font-size:{other}px")), "{root}: no other page value");
        assert!(site_css.contains(&format!("{scoped}{{color:{col};font-size:{fs}px}}")), "{root}: site.css scoped rule");
        let g = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("src/fixtures/b0");
        let gp = |ext: &str| g.join(format!("b01-dup-pages.p{}.{ext}", i + 1));
        if std::env::var("F2_BLESS").is_ok() {
            std::fs::write(gp("html"), &html).unwrap();
            std::fs::write(gp("css"), &css).unwrap();
        } else {
            assert_eq!(html, std::fs::read_to_string(gp("html")).unwrap(), "{root}: static html golden");
            assert_eq!(css, std::fs::read_to_string(gp("css")).unwrap(), "{root}: static css golden");
        }
        for line in css.lines().chain(site_css.lines()) {
            for rule in line.split('}') {
                if rule.contains(&format!("[{HOOK_ATTR}=")) {
                    assert!(rule.contains(&format!("[{PAGE_ATTR}=")), "unscoped hook rule: {rule}");
                }
            }
        }
    }
    let golden = |ext: &str| std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join(format!("src/fixtures/b0/b01-dup-pages.{ext}"));
    let site = crate::export::build_site_json(&d, &std::collections::HashMap::new()).unwrap();
    let kinds = crate::export::build_kinds_css(&d, &o).unwrap();
    if std::env::var("F2_BLESS").is_ok() {
        std::fs::write(golden("site.json"), &site).unwrap();
        std::fs::write(golden("site.css"), &site_css).unwrap();
        std::fs::write(golden("kinds.css"), &kinds).unwrap();
        return;
    }
    assert_eq!(site, std::fs::read_to_string(golden("site.json")).unwrap());
    assert_eq!(site_css, std::fs::read_to_string(golden("site.css")).unwrap());
    assert_eq!(kinds, std::fs::read_to_string(golden("kinds.css")).unwrap());
}

/// B0.1 item 2: a shadcn-drawn kind (button) restates only its own keys in the hook base, never the type
/// defaults (a hooked button kept its slate background, not #0ea5e9). Plain kinds still restate the defaults.
#[test]
fn b01_shadcn_kinds_restate_only_own_keys() {
    let d = page_doc(&doc(DUP), 0);
    let o = CompileOptions { page_id: Some("p1".into()), ..CompileOptions::default() };
    let block = style_css(&d, &o).unwrap();
    let base = format!("[{PAGE_ATTR}=\"p1\"] [{HOOK_ATTR}=\"bt\"]{{");
    let first = block.split(&base).nth(1).expect("button hook base").split('}').next().unwrap();
    assert_eq!(first, "font-size:18px", "button base = its own keys only");
    assert!(!block.contains("#0ea5e9"), "no button default background in the block (its phone rule sets one)");
    assert!(block.contains("{background-color:#222222;font-size:20px}"), "phone override present: {block}");
    let hb = format!("[{PAGE_ATTR}=\"p1\"] [{HOOK_ATTR}=\"h\"]{{");
    let h = block.split(&hb).nth(1).unwrap().split('}').next().unwrap();
    assert!(h.contains("font-size:40px") && h.contains("color:"), "heading (plain kind) restates defaults: {h}");
    let ts = include_str!("../../export-templates/vite-react/src/lib/render-node.tsx");
    let line = ts.lines().find(|l| l.starts_with("const PLAIN_KINDS")).expect("PLAIN_KINDS");
    for k in RESTATE_KINDS {
        let name = serde_json::to_value(k).unwrap();
        assert!(line.contains(&format!("\"{}\"", name.as_str().unwrap())), "PLAIN_KINDS lists {name}");
    }
    assert_eq!(line.matches('"').count(), 2 * RESTATE_KINDS.len(), "Vite PLAIN_KINDS = Rust RESTATE_KINDS");
}

/// B0.1 item 1: kinds.css carries exactly the static `.t-x` rules of the markup kinds in use.
#[test]
fn b01_kinds_css_is_the_static_type_rules() {
    let d = doc(ALL);
    let o = CompileOptions::default();
    let k = crate::export::build_kinds_css(&d, &o).unwrap();
    let (_, css) = compile_export(&d, &o).unwrap();
    for t in ["switch", "checkbox", "spinner"] {
        assert!(k.contains(&format!(".t-{t}")), "{t} in kinds.css");
    }
    assert!(!k.contains(".t-button"), "only markup kinds");
    for rule in k.trim().split('}').filter(|r| !r.trim().is_empty() && !r.contains('@') && r.contains('{')) {
        assert!(css.contains(&format!("{rule}}}")), "same bytes as static: {rule}");
    }
    if std::env::var("F2_BLESS").is_ok() {
        std::fs::write(b0_golden("kinds.css"), &k).unwrap();
        return;
    }
    assert_eq!(k, std::fs::read_to_string(b0_golden("kinds.css")).unwrap());
}

const DIALOG: &str = include_str!("fixtures/b0/b02-dialog-hook.json");
const SHARED: &str = include_str!("fixtures/b0/b02-shared-root.json");

/// B0.2 item 3: two pages share the same root node id ("r") but have different ProjectPage.ids; each keeps
/// its own phone values under `[data-wb-page="<page id>"]`. Preview/export both emit the page id (not the root).
#[test]
fn b02_scope_uses_page_id_not_root_even_when_roots_collide() {
    let d = doc(SHARED);
    assert_eq!(d.pages[0].root, d.pages[1].root, "fixture: shared root id");
    assert_ne!(d.pages[0].id, d.pages[1].id);
    let site = crate::export::build_site_css(&d, &CompileOptions::default()).unwrap();
    for (pid, fs, col) in [("p1", 18, "#aa0000"), ("p2", 32, "#0066aa")] {
        let scoped = format!("[{PAGE_ATTR}=\"{pid}\"] [{HOOK_ATTR}=\"h\"]");
        assert!(site.contains(&format!("{scoped}{{color:{col};font-size:{fs}px}}")), "{pid}: {site}");
        assert!(!site.contains(&format!("[{PAGE_ATTR}=\"r\"]")), "must not scope by the root id");
    }
    // Per-page static HTML also carries the page id (Preview path uses the same open() write).
    for (i, pid) in ["p1", "p2"].into_iter().enumerate() {
        let pd = page_doc(&d, i);
        let o = CompileOptions { page_id: Some(pid.into()), preview: true, ..CompileOptions::default() };
        let html = compile(&pd, &o).unwrap();
        assert!(html.contains(&format!("{PAGE_ATTR}=\"{pid}\"")), "preview {pid}");
        assert!(!html.contains(&format!("{PAGE_ATTR}=\"r\"")), "preview not root");
    }
    let golden = |ext: &str| std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join(format!("src/fixtures/b0/b02-shared-root.{ext}"));
    let site_json = crate::export::build_site_json(&d, &std::collections::HashMap::new()).unwrap();
    if std::env::var("F2_BLESS").is_ok() {
        std::fs::write(golden("site.css"), &site).unwrap();
        std::fs::write(golden("site.json"), &site_json).unwrap();
        return;
    }
    assert_eq!(site, std::fs::read_to_string(golden("site.css")).unwrap());
    assert_eq!(site_json, std::fs::read_to_string(golden("site.json")).unwrap());
}

/// B0.2 item 2: `.t-carousel:focus-visible` (and `.t-tablewrap:focus-visible`) live in the shared generator, so
/// the Vite site.css carries them (they used to sit only after `.t-x` in the static type CSS).
#[test]
fn b02_carousel_and_table_focus_visible_are_in_style_css() {
    let d = doc(ALL);
    let block = style_css(&d, &CompileOptions::default()).unwrap();
    assert!(block.contains(".t-carousel:focus-visible{"), "carousel ring in generator: {block}");
    assert!(block.contains(".t-tablewrap:focus-visible{"), "table ring in generator");
    // Still absent from the type_css side of those kinds (split out of `.t-x`).
    assert!(!super::type_css_for_test(NodeType::Carousel).contains(":focus-visible"));
}

/// B0.2 item 1: hooked open dialog — static export carries scoped width rules; goldens for the Vite Chromium test.
#[test]
fn b02_dialog_hook_site_goldens() {
    let d = doc(DIALOG);
    let o = CompileOptions { page_id: Some("home".into()), ..CompileOptions::default() };
    let (html, css) = compile_export(&d, &o).unwrap();
    let site = crate::export::build_site_json(&d, &std::collections::HashMap::new()).unwrap();
    let site_css = crate::export::build_site_css(&d, &CompileOptions::default()).unwrap();
    let kinds = crate::export::build_kinds_css(&d, &CompileOptions::default()).unwrap();
    assert!(html.contains(&format!("{PAGE_ATTR}=\"home\"")));
    assert!(css.contains(&format!("[{PAGE_ATTR}=\"home\"] [{HOOK_ATTR}=\"dlg\"]{{")));
    assert!(css.contains("width:300px") && css.contains("width:220px") && css.contains("width:360px"));
    let g = |ext: &str| std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join(format!("src/fixtures/b0/b02-dialog-hook.{ext}"));
    if std::env::var("F2_BLESS").is_ok() {
        std::fs::write(g("html"), &html).unwrap();
        std::fs::write(g("css"), &css).unwrap();
        std::fs::write(g("site.json"), &site).unwrap();
        std::fs::write(g("site.css"), &site_css).unwrap();
        std::fs::write(g("kinds.css"), &kinds).unwrap();
        return;
    }
    assert_eq!(html, std::fs::read_to_string(g("html")).unwrap());
    assert_eq!(css, std::fs::read_to_string(g("css")).unwrap());
    assert_eq!(site, std::fs::read_to_string(g("site.json")).unwrap());
    assert_eq!(site_css, std::fs::read_to_string(g("site.css")).unwrap());
}
