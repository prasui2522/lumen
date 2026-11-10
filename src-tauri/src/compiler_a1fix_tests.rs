//! A1 fix (audit High 2): per-node fx rules (states, transition reduced-motion, entrance motion, glass fallback,
//! text-gradient forced colours) target the `[data-wb-page] [data-wb-id]` hook in the shared `style_css` block,
//! so static, Preview, Tier 1 and the Vite export all get them. `fixtures/a1fix/fx-families.json` is the golden
//! shared with the template test (`src/lib/a1fix-vite-fx.test.ts`).
use super::*;

const FX: &str = include_str!("fixtures/a1fix/fx-sample.json");
const FAMS: &str = include_str!("fixtures/a1fix/fx-families.json");

fn doc() -> PageDocument {
    parse_document(&serde_json::from_str(FX).unwrap()).unwrap()
}

fn h(id: &str) -> String {
    scoped_hook_selector("home", id, id == "root")
}

/// Every `.nN` selector token in `css` (a `.n` followed by a digit).
fn node_class_tokens(css: &str) -> Vec<String> {
    let b = css.as_bytes();
    let mut out = Vec::new();
    for i in 0..b.len().saturating_sub(2) {
        if b[i] == b'.' && b[i + 1] == b'n' && b[i + 2].is_ascii_digit() {
            out.push(css[i..(i + 6).min(css.len())].to_string());
        }
    }
    out
}

#[test]
fn a1_shared_block_has_no_node_class_selectors() {
    let block = style_css(&doc(), &CompileOptions::default()).unwrap();
    assert!(node_class_tokens(&block).is_empty(), "shared block must not use .nN: {block}");
}

#[test]
fn a1_static_preview_carry_hooks_and_same_block() {
    let d = doc();
    let opts = CompileOptions::default();
    let block = style_css(&d, &opts).unwrap();
    let (html, css) = compile_export(&d, &opts).unwrap();
    assert!(css.ends_with(&format!("{block}\n")), "static styles.css ends with the shared block");
    for id in ["root", "btn", "glass", "head", "txt", "box", "grad", "bpbtn", "gtxt"] {
        assert!(html.contains(&format!("data-wb-id=\"{id}\"")), "hook on {id}: {html}");
    }
    assert!(!html.contains("data-wb-id=\"plain\""), "{html}");
    assert!(html.contains("data-wb-page=\"home\" data-wb-id=\"root\""), "{html}");
    assert_eq!(html.matches(" fx\"").count(), 3, "btn + bpbtn + gtxt carry fx: {html}");
    let popts = CompileOptions { preview: true, ..CompileOptions::default() };
    let preview = compile(&d, &popts).unwrap();
    let pblock = style_css(&d, &popts).unwrap();
    assert!(preview.contains(&pblock), "Preview inlines its shared block");
    assert!(node_class_tokens(&pblock).is_empty(), "{pblock}");
}

#[test]
fn a1_fx_rules_target_hooks() {
    let block = style_css(&doc(), &CompileOptions::default()).unwrap();
    for want in [
        format!("@media (hover:hover){{{}:hover{{background-color:#38bdf8;transform:translate(0px, -1px)}}}}", h("btn")),
        format!("{}:active{{", h("btn")),
        format!("{}:focus-visible{{", h("bpbtn")),
        format!("@media (forced-colors:active){{{}:focus-visible{{outline:2px solid CanvasText}}}}", h("bpbtn")),
        format!("{}{{transition:none}}", h("box")),
        format!("{}{{transition:none}}", h("root")),
        format!("{}{{transition:none}}{}:hover,{}:active{{transform:none}}", h("btn"), h("btn"), h("btn")),
        format!("{}{{animation:wb-in-fade 300ms ease-out 40ms backwards}}", h("txt")),
        format!("{}{{animation:none}}", h("txt")),
        format!("@supports (animation-timeline:view()){{{}{{opacity:0;transform:translateY(24px);", h("head")),
        format!(
            "@media (prefers-reduced-transparency:reduce){{{}{{-webkit-backdrop-filter:none;backdrop-filter:none;background-color:",
            h("glass")
        ),
        format!("@media (forced-colors:active){{{}{{color:CanvasText;background:none}}}}", h("grad")),
    ] {
        assert!(block.contains(&want), "missing {want}\nin {block}");
    }
    assert_eq!(h("root"), "[data-wb-page=\"home\"][data-wb-id=\"root\"]");
}

#[test]
fn a1_hook_base_restates_fx_families() {
    let block = style_css(&doc(), &CompileOptions::default()).unwrap();
    let rule_of = |id: &str| -> String {
        let start = format!("{}{{", h(id));
        let i = block.find(&start).unwrap_or_else(|| panic!("no hook base for {id}: {block}"));
        let rest = &block[i + start.len()..];
        rest[..rest.find('}').unwrap()].to_string()
    };
    let btn = rule_of("btn");
    assert!(btn.contains("box-shadow:0px 6px 0px 0px #0369a1, 0px 10px 12px 0px #00000033"), "{btn}");
    assert!(btn.contains("transition-duration:120ms") && btn.contains("transition-timing-function:ease-out"), "{btn}");
    let glass = rule_of("glass");
    assert!(glass.contains("background-color:#ffffff80") && glass.contains("backdrop-filter:"), "{glass}");
    assert!(!glass.contains("padding"), "only fx families are restated: {glass}");
    assert!(rule_of("head").contains("opacity:0.9"));
    let bp = rule_of("bpbtn");
    assert!(bp.contains("padding") && bp.contains("color:#ffffff") && bp.contains("background-color:#0f766e"), "{bp}");
}

fn families_json(d: &PageDocument) -> serde_json::Value {
    let mut ids: Vec<&String> = d.nodes.keys().collect();
    ids.sort();
    let mut m = serde_json::Map::new();
    for id in ids {
        let (hook, fams) = node_fx(&d.nodes[id]);
        m.insert(
            id.clone(),
            serde_json::json!({ "hook": hook, "families": fams.into_iter().collect::<Vec<_>>() }),
        );
    }
    serde_json::Value::Object(m)
}

/// Shared golden with the template's `fxFamilies` / `hasFxHook` (Rust ↔ TS lock).
#[test]
fn a1_fx_families_golden() {
    let got = families_json(&doc());
    if std::env::var("A1FIX_BLESS").is_ok() {
        let path = concat!(env!("CARGO_MANIFEST_DIR"), "/src/fixtures/a1fix/fx-families.json");
        std::fs::write(path, format!("{}\n", serde_json::to_string_pretty(&got).unwrap())).unwrap();
        return;
    }
    let want: serde_json::Value = serde_json::from_str(FAMS).unwrap();
    assert_eq!(got, want);
}

/// Goldens for the real-Chromium parity test (`src/lib/a1fix-vite-fx.test.ts`): static `index.html` +
/// `styles.css`, the zip's `site.json` / `site.css` / `kinds.css`. Re-bless with `A1FIX_BLESS=1`.
#[test]
fn a1_parity_goldens() {
    let d = doc();
    let opts = CompileOptions { preview: false, asset_base_url: Some("assets".into()), ..CompileOptions::default() };
    let (html, css) = compile_export(&d, &opts).unwrap();
    let site_css = crate::export::build_site_css(&d, &opts).unwrap();
    let kinds_css = crate::export::build_kinds_css(&d, &opts).unwrap();
    let site_json = crate::export::build_site_json(&d, &std::collections::HashMap::new()).unwrap();
    assert!(css.ends_with(&site_css), "static styles.css closes with the zip's site.css");
    let files = [
        ("fx-sample.html", html),
        ("fx-sample.css", css),
        ("fx-sample.site.css", site_css),
        ("fx-sample.kinds.css", kinds_css),
        ("fx-sample.site.json", site_json),
    ];
    let dir = concat!(env!("CARGO_MANIFEST_DIR"), "/src/fixtures/a1fix");
    for (name, body) in files {
        let path = format!("{dir}/{name}");
        if std::env::var("A1FIX_BLESS").is_ok() {
            std::fs::write(&path, &body).unwrap();
        } else {
            assert_eq!(std::fs::read_to_string(&path).unwrap(), body, "{name} drifted (A1FIX_BLESS=1 to re-bless)");
        }
    }
}
