//! PageDocument (schema v1.1) → static HTML + CSS.
//!
//! * Types and defaults come from `defaults.rs`: `default_styles`,
//!   `heading_font_size`, `resolved_style`, container/image defaults.
//! * CSS: one rule per node *type* (defaults, emitted once per used type),
//!   one rule per heading level used, and a per-node class (`nN`) only for
//!   declarations that differ from the type/level default (sparse output).
//!   Tablet and phone overrides are extra rules on that same `nN` selector,
//!   inside `@media (max-width: 1024px)` then `@media (max-width: 719px)`.
//!   Fold-open is last, and only inside `@media (horizontal-viewport-segments: 2)`.
//!   It is not a width query: a 750px frame without viewport segments keeps
//!   the tablet rules.
//! * The CSS mapping mirrors `src/components/editor/node-view.tsx` and the
//!   app's Tailwind preflight so Preview matches the Design canvas.
//! * All text/attribute values are HTML-escaped; CSS values are sanitised;
//!   hrefs are limited to safe schemes. No JavaScript is emitted.
//! * Preview → one document with inline `<style>`, inert links, strict CSP.
//!   Export → `index.html` linking `styles.css`, real links (see `compile_export`).

use crate::defaults::{
    a2_layout_defaults, a3_layout_defaults, a5_layout_defaults, default_styles, heading_font_size, resolved_style, Align, AssetRef, BoxSpacing,
    ButtonAction, ContainerPropDefaults, CssSize, Direction, FontWeight, Justify, LineOrientation, Node, ScrollOrientation,
    EdgeAlign, AspectRatioValue, NodeProps, NodeStates, NodeType, ObjectFit, PageDocument, SheetSide, StateStyle, StyleProps, BoxShadowLayer,
    BackdropFilterValue, BorderRadiusCorners, BorderSide, BorderSides, FilterValue,
    GradientKind, GradientValue, TransformValue, TransitionValue, DEFAULT_IMAGE_OBJECT_FIT,
};
use serde::Deserialize;
use serde_json::Value;
use std::collections::{BTreeSet, HashMap, HashSet};

/// File name the exported `index.html` links to.
pub const EXPORT_CSS_FILE: &str = "styles.css";

/// Phase 11 A3.4: max `<option>` count for `select` (mirrors `MAX_SELECT_OPTIONS` in TS).
pub const MAX_SELECT_OPTIONS: usize = 100;
/// Phase 11 A4.1: max list items (mirrors `MAX_LIST_ITEMS` in TS).
pub const MAX_LIST_ITEMS: usize = 50;
/// Phase 11 A4.2: max table columns / rows (mirrors TS `MAX_TABLE_*`).
pub const MAX_TABLE_COLS: usize = 20;
pub const MAX_TABLE_ROWS: usize = 100;

/* ------------------------------------------------------------------ */
/* Parsing                                                             */
/* ------------------------------------------------------------------ */

/// Validate + parse a TS-shaped document into the typed schema.
pub fn parse_document(value: &Value) -> Result<PageDocument, String> {
    PageDocument::deserialize(value).map_err(|e| format!("เอกสารไม่ถูกต้อง: {e}"))
}

/* ------------------------------------------------------------------ */
/* Options / entry points                                              */
/* ------------------------------------------------------------------ */

#[derive(Debug, Clone, Default)]
pub struct CompileOptions {
    /// In-app Preview: links are inert (no href) and a strict CSP meta blocks
    /// every remote load. The iframe is also sandboxed without scripts.
    pub preview: bool,
    /// Base URL for asset ids. `None` → every image is a placeholder, never a
    /// broken `src`. Export uses `assets`. Preview uses an asset-origin base
    /// only so a missing row still emits an `img`.
    pub asset_base_url: Option<String>,
    /// `src.id` → extension from the assets table (no dot). The node does not
    /// store the extension. Appended when the sanitized id does not already
    /// end with it.
    pub asset_exts: HashMap<String, String>,
    /// `src.id` → full img src. Preview sets a Tauri asset URL here because
    /// `convertFileSrc` encodes the whole path as one component, which a
    /// shared base cannot be joined onto. Wins over `asset_base_url`.
    pub asset_urls: HashMap<String, String>,
    /// Page path (`/signup`, `/signup/`) → relative HTML file (`signup.html`).
    /// Preview also maps the file forms (`signup.html`, `./signup.html`).
    pub page_paths: HashMap<String, String>,
    /// Preview only (PHASE-9-SPEC §6): page file → inert marker href
    /// (`about:blank#wb-page=%2Fsignup`). The open page has no entry, so a link
    /// to it gets no href. Values not starting with `PAGE_MARKER_PREFIX` are
    /// ignored. Export never sets this.
    pub page_markers: HashMap<String, String>,
    /// Export stylesheet href (`styles.css` or `login.css`). Default `styles.css`.
    pub export_css_href: Option<String>,
    /// B0.2 item 3: the ProjectPage.id that scopes every hook rule (`data-wb-page`). Preview and
    /// per-page export set this. When absent, a single-page doc uses `"home"` (same as `pages_for_export`).
    pub page_id: Option<String>,
}

pub fn compile_value(value: &Value, opts: &CompileOptions) -> Result<String, String> {
    compile(&parse_document(value)?, opts)
}

/// Convenience for tests.
#[cfg_attr(not(test), allow(dead_code))]
pub fn compile_json(json: &str, opts: &CompileOptions) -> Result<String, String> {
    let v: Value = serde_json::from_str(json).map_err(|e| format!("JSON ไม่ถูกต้อง: {e}"))?;
    compile_value(&v, opts)
}

/// Single document with inline `<style>` (Preview).
pub fn compile(doc: &PageDocument, opts: &CompileOptions) -> Result<String, String> {
    let (css, body) = build(doc, opts)?;
    Ok(assemble(doc, opts, CssMode::Inline(&css), &body))
}

/// Export: `(index.html, styles.css)`; the HTML links the stylesheet.
pub fn compile_export(doc: &PageDocument, opts: &CompileOptions) -> Result<(String, String), String> {
    let (mut css, body) = build(doc, opts)?;
    css.push('\n');
    let css_href = opts.export_css_href.as_deref().unwrap_or(EXPORT_CSS_FILE);
    Ok((assemble(doc, opts, CssMode::Linked(css_href), &body), css))
}

enum CssMode<'a> {
    Inline(&'a str),
    Linked(&'a str),
}

/// Render body + collect CSS.
fn build(doc: &PageDocument, opts: &CompileOptions) -> Result<(String, String), String> {
    let root = doc
        .nodes
        .get(&doc.root)
        .ok_or_else(|| "ไม่พบโหนดราก (root)".to_string())?;
    if root.node_type != NodeType::Page {
        return Err("โหนดรากต้องเป็นหน้า (page)".into());
    }

    let mut c = Compiler {
        doc,
        opts,
        body: String::with_capacity(4096),
        node_css: String::new(),
        bp_tablet: String::new(),
        bp_phone: String::new(),
        bp_fold: String::new(),
        used_types: BTreeSet::new(),
        used_levels: BTreeSet::new(),
        visiting: HashSet::new(),
        next_class: 1,
        next_uid: 1,
        dyn_css: String::new(),
        group_slots: HashMap::new(),
        control_attrs: HashMap::new(),
        hook_base: String::new(),
        pending_hook: None,
        page_attr_done: false,
        text_grad_forced: String::new(),
        state_css: String::new(),
        state_reduced: String::new(),
        state_forced: String::new(),
    };
    c.render(&doc.root, 0);

    let mut css = String::from(PREFLIGHT);
    for t in ALL_TYPES {
        if c.used_types.contains(&(t as u8)) {
            css.push_str(&type_rule(t));
        }
    }
    for lvl in &c.used_levels {
        css.push_str(&format!(".t-h{lvl}{{font-size:{}}}", px(heading_font_size(*lvl))));
    }
    if c.used_types.contains(&(NodeType::Image as u8)) {
        css.push_str(IMAGE_PLACEHOLDER_RULE);
    }
    // F2 Ruling 1: inputs (datalist inputs included) get a 2px solid ring, not WebKit's orange outline:auto.
    if c.used_types.contains(&(NodeType::Input as u8)) {
        css.push_str(INPUT_FOCUS_RULE);
    }
    css.push_str(&c.dyn_css);
    // Preview-only press feedback. Export CSS must stay free of these rules.
    if opts.preview && c.used_types.contains(&(NodeType::Button as u8)) {
        css.push_str(PREVIEW_BUTTON_FEEDBACK);
    }
    css.push_str(&c.node_css);
    // B0: everything after the node rules comes from the ONE shared generator (§9.B P1).
    css.push_str(&c.style_block());
    Ok((css, c.body))
}

/// B0 (§9.B B-prelude P1): the shared style-CSS generator. The block `compile_export` / Preview append after the
/// node rules, and that the Vite export writes (byte for byte, per page) into `src/styles/site.css`.
pub fn style_css(doc: &PageDocument, opts: &CompileOptions) -> Result<String, String> {
    let root = doc.nodes.get(&doc.root).ok_or_else(|| "ไม่พบโหนดราก (root)".to_string())?;
    if root.node_type != NodeType::Page {
        return Err("โหนดรากต้องเป็นหน้า (page)".into());
    }
    let mut c = Compiler {
        doc,
        opts,
        body: String::new(),
        node_css: String::new(),
        bp_tablet: String::new(),
        bp_phone: String::new(),
        bp_fold: String::new(),
        used_types: BTreeSet::new(),
        used_levels: BTreeSet::new(),
        visiting: HashSet::new(),
        next_class: 1,
        next_uid: 1,
        dyn_css: String::new(),
        group_slots: HashMap::new(),
        control_attrs: HashMap::new(),
        hook_base: String::new(),
        pending_hook: None,
        page_attr_done: false,
        text_grad_forced: String::new(),
        state_css: String::new(),
        state_reduced: String::new(),
        state_forced: String::new(),
    };
    c.render(&doc.root, 0);
    Ok(c.style_block())
}

/// B0.1 item 1: kinds the Vite template draws with the static export's own markup (`.t-switch` track and thumb,
/// `.t-checkbox` input, `.t-spinner` svg). Their `.t-x` type rules ship in the zip as `src/styles/kinds.css`
/// (imported before `site.css`), so the generator's state / at-rules for them have the same base under them.
pub(crate) const MARKUP_KINDS: [NodeType; 3] = [NodeType::Switch, NodeType::Checkbox, NodeType::Spinner];

/// B0.1 item 1: the `.t-x` type rules (same bytes as `styles.css`) of the markup kinds a document uses.
pub fn markup_kind_types(doc: &PageDocument, opts: &CompileOptions) -> Result<BTreeSet<u8>, String> {
    let root = doc.nodes.get(&doc.root).ok_or_else(|| "ไม่พบโหนดราก (root)".to_string())?;
    if root.node_type != NodeType::Page {
        return Err("โหนดรากต้องเป็นหน้า (page)".into());
    }
    let mut c = Compiler {
        doc,
        opts,
        body: String::new(),
        node_css: String::new(),
        bp_tablet: String::new(),
        bp_phone: String::new(),
        bp_fold: String::new(),
        used_types: BTreeSet::new(),
        used_levels: BTreeSet::new(),
        visiting: HashSet::new(),
        next_class: 1,
        next_uid: 1,
        dyn_css: String::new(),
        group_slots: HashMap::new(),
        control_attrs: HashMap::new(),
        hook_base: String::new(),
        pending_hook: None,
        page_attr_done: false,
        text_grad_forced: String::new(),
        state_css: String::new(),
        state_reduced: String::new(),
        state_forced: String::new(),
    };
    c.render(&doc.root, 0);
    Ok(MARKUP_KINDS.iter().map(|t| *t as u8).filter(|t| c.used_types.contains(t)).collect())
}

/// `.t-x` rules for the given used markup kinds, in `ALL_TYPES` order.
pub fn markup_kinds_css(used: &BTreeSet<u8>) -> String {
    let mut out = String::new();
    for t in ALL_TYPES {
        if MARKUP_KINDS.contains(&t) && used.contains(&(t as u8)) {
            out.push_str(&type_rule(t));
        }
    }
    out
}

impl Compiler<'_> {
    /// §7.2 order: hook base restatements → type look rules → **node state rules** → `@keyframes` →
    /// breakpoint blocks (tablet, phone, fold-open: a narrower width query wins over tablet; fold-open
    /// wins only when the segments query matches, because it is last; no width stand-in) → other
    /// at-rules (`@supports`) → `@media (prefers-reduced-motion: reduce)` → `@media (forced-colors: active)`.
    fn style_block(&self) -> String {
        let mut state = String::new();
        let mut keyframes = String::new();
        let mut other_at = String::new();
        let mut reduced = String::new();
        let mut forced = String::new();
        for t in ALL_TYPES {
            if !self.used_types.contains(&(t as u8)) {
                continue;
            }
            for r in type_gen_rules(t) {
                let bucket = if r.starts_with("@keyframes") {
                    &mut keyframes
                } else if r.starts_with("@media (prefers-reduced-motion") {
                    &mut reduced
                } else if r.starts_with("@media (forced-colors") {
                    &mut forced
                } else if r.starts_with('@') {
                    &mut other_at
                } else {
                    &mut state
                };
                bucket.push_str(r);
            }
        }
        let mut css = String::new();
        css.push_str(&self.hook_base);
        css.push_str(&state);
        // B7.2 §7.2: per-node `:hover` / `:focus-visible` / `:active` (after `.nN` base in `build`).
        css.push_str(&self.state_css);
        css.push_str(&keyframes);
        if !self.bp_tablet.is_empty() {
            css.push_str("@media (max-width:1024px){");
            css.push_str(&self.bp_tablet);
            css.push('}');
        }
        if !self.bp_phone.is_empty() {
            css.push_str("@media (max-width:719px){");
            css.push_str(&self.bp_phone);
            css.push('}');
        }
        if !self.bp_fold.is_empty() {
            css.push_str("@media (horizontal-viewport-segments: 2){");
            css.push_str(&self.bp_fold);
            css.push('}');
        }
        css.push_str(&other_at);
        css.push_str(&reduced);
        css.push_str(&self.state_reduced);
        css.push_str(&forced);
        // B3.1 §7.3: per-node text-gradient forced-colours fallback (after type forced rules).
        css.push_str(&self.text_grad_forced);
        css.push_str(&self.state_forced);
        css
    }
}

fn assemble(doc: &PageDocument, opts: &CompileOptions, css: CssMode<'_>, body: &str) -> String {
    let meta = &doc.meta;
    let lang = meta.lang.as_deref().unwrap_or("th");
    let mut out = String::with_capacity(body.len() + 1024);
    out.push_str("<!doctype html>\n<html lang=\"");
    out.push_str(&esc(lang));
    out.push_str("\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">");
    if opts.preview {
        out.push_str("<meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; style-src 'unsafe-inline'; img-src data: asset: http://asset.localhost https://asset.localhost\">");
    }
    out.push_str("<title>");
    out.push_str(&esc(&meta.title));
    out.push_str("</title>");
    if let Some(d) = meta.description.as_deref().filter(|d| !d.is_empty()) {
        out.push_str("<meta name=\"description\" content=\"");
        out.push_str(&esc(d));
        out.push_str("\">");
    }
    match css {
        CssMode::Inline(css) => {
            out.push_str("<style>");
            out.push_str(css);
            out.push_str("</style>");
        }
        CssMode::Linked(href) => {
            out.push_str("<link rel=\"stylesheet\" href=\"");
            out.push_str(&esc(href));
            out.push_str("\">");
        }
    }
    out.push_str("</head><body>");
    out.push_str(body);
    out.push_str("</body></html>\n");
    out
}

/* ------------------------------------------------------------------ */
/* CSS                                                                 */
/* ------------------------------------------------------------------ */

/// Mirrors the Tailwind v4 preflight the Design canvas renders under.
/// Unset border colour = currentColor (defaults.rs has no border_color default;
/// node-view.tsx falls back to currentColor too, overriding the app's gray).
const PREFLIGHT: &str = "*,::before,::after{box-sizing:border-box;margin:0;padding:0;border:0 solid currentColor}\
html{line-height:1.5;-webkit-text-size-adjust:100%}html,body{height:100%}body{margin:0}\
h1,h2,h3,h4,h5,h6{font-size:inherit;font-weight:inherit}a{color:inherit;text-decoration:inherit}\
img{display:block;max-width:100%}";

/// node-view.tsx image placeholder (its extras override node styles → 2 classes).
const IMAGE_PLACEHOLDER_RULE: &str = ".t-image.ph{background-color:#e2e8f0;min-height:120px;\
display:flex;align-items:center;justify-content:center;color:#64748b;font-size:14px}";

/// F2 Ruling 1: Preview + static export focus ring for `.t-input` (the select ring lives in kind-looks.json).
const INPUT_FOCUS_RULE: &str = ".t-input:focus-visible{outline:2px solid #0077c2;outline-offset:2px}";

/// Preview only. Not in export CSS. Subtle press; no :hover.
/// B8.3: scoped to `:not(.fx)` so a button with user `states` keeps only the authored rule.
/// Under prefers-reduced-motion: reduce the press has no transform (cursor stays).
const PREVIEW_BUTTON_FEEDBACK: &str = ".t-button{cursor:pointer}.t-button:not(.fx):active{transform:translateY(1px)}\
@media (prefers-reduced-motion:reduce){.t-button:not(.fx):active{transform:none}}";

  const ALL_TYPES: [NodeType; 59] = [
    NodeType::Page,
    NodeType::Section,
    NodeType::Container,
    NodeType::Heading,
    NodeType::Text,
    NodeType::Image,
    NodeType::Button,
    NodeType::Link,
    NodeType::Spacer,
    NodeType::Input,
    NodeType::Switch,
    NodeType::Textarea,
    NodeType::Kbd,
    NodeType::Avatar,
    NodeType::Progress,
    NodeType::Slider,
    NodeType::Empty,
    NodeType::Item,
    NodeType::Marker,
    NodeType::Bubble,
    NodeType::Message,
    NodeType::Select,
    NodeType::Radio,
    NodeType::Toggle,
    NodeType::ToggleGroup,
    NodeType::Tabs,
    NodeType::InputGroup,
    NodeType::InputOtp,
    NodeType::Accordion,
    NodeType::Collapsible,
    NodeType::Breadcrumb,
    NodeType::Pagination,
    NodeType::NavigationMenu,
    NodeType::Menubar,
    NodeType::DropdownMenu,
    NodeType::Dialog,
    NodeType::AlertDialog,
    NodeType::Sheet,
    NodeType::Drawer,
    NodeType::Popover,
    NodeType::Tooltip,
    NodeType::HoverCard,
    NodeType::Card,
    NodeType::Alert,
    NodeType::Badge,
    NodeType::Separator,
    NodeType::Skeleton,
    NodeType::Spinner,
    NodeType::AspectRatio,
    NodeType::ScrollArea,
    NodeType::ButtonGroup,
    NodeType::Checkbox,
    NodeType::Field,
    NodeType::List,
    NodeType::Table,
    NodeType::Icon,
    NodeType::Carousel,
    NodeType::Chart,
    NodeType::Calendar,
];

pub(crate) fn type_name(t: NodeType) -> &'static str {
    match t {
        NodeType::Page => "page",
        NodeType::Section => "section",
        NodeType::Container => "container",
        NodeType::Heading => "heading",
        NodeType::Text => "text",
        NodeType::Image => "image",
        NodeType::Button => "button",
        NodeType::Link => "link",
        NodeType::Spacer => "spacer",
        NodeType::Input => "input",
        NodeType::Switch => "switch",
        NodeType::Textarea => "textarea",
        NodeType::Kbd => "kbd",
        NodeType::Avatar => "avatar",
        NodeType::Progress => "progress",
        NodeType::Slider => "slider",
        NodeType::Empty => "empty",
        NodeType::Item => "item",
        NodeType::Marker => "marker",
        NodeType::Bubble => "bubble",
        NodeType::Message => "message",
        NodeType::Select => "select",
        NodeType::Radio => "radio",
        NodeType::Toggle => "toggle",
        NodeType::ToggleGroup => "toggleGroup",
        NodeType::Tabs => "tabs",
        NodeType::InputGroup => "inputGroup",
        NodeType::InputOtp => "inputOtp",
        NodeType::Accordion => "accordion",
        NodeType::Collapsible => "collapsible",
        NodeType::Breadcrumb => "breadcrumb",
        NodeType::Pagination => "pagination",
        NodeType::NavigationMenu => "navigationMenu",
        NodeType::Menubar => "menubar",
        NodeType::DropdownMenu => "dropdownMenu",
        NodeType::Dialog => "dialog",
        NodeType::AlertDialog => "alertDialog",
        NodeType::Sheet => "sheet",
        NodeType::Drawer => "drawer",
        NodeType::Popover => "popover",
        NodeType::Tooltip => "tooltip",
        NodeType::HoverCard => "hoverCard",
        NodeType::Card => "card",
        NodeType::Alert => "alert",
        NodeType::Badge => "badge",
        NodeType::Separator => "separator",
        NodeType::Skeleton => "skeleton",
        NodeType::Spinner => "spinner",
        NodeType::AspectRatio => "aspectRatio",
        NodeType::ScrollArea => "scrollArea",
        NodeType::ButtonGroup => "buttonGroup",
        NodeType::Checkbox => "checkbox",
        NodeType::Field => "field",
        NodeType::List => "list",
        NodeType::Table => "table",
        NodeType::Icon => "icon",
        NodeType::Carousel => "carousel",
        NodeType::Chart => "chart",
        NodeType::Calendar => "calendar",
    }
}

/// Shared look constants (PHASE-11 A1.4). ONE file, `src/lib/kind-looks.json`, is the
/// source of every per-type declaration and descendant rule below; the Design canvas
/// (`src/lib/kind-looks.ts`, `phase6b-view.tsx`) imports the same file, so no number or
/// colour exists twice. Literal hex only (G2): `{{name}}` is replaced by the palette
/// entry, so the emitted CSS has no `var(`, gradient, `url(` or `!important`.
const KIND_LOOKS_JSON: &str = include_str!("../../src/lib/kind-looks.json");

pub(crate) struct KindLook {
    /// Declarations merged over the type's default styles (a node's own style wins, G1).
    pub extras: Vec<(&'static str, String)>,
    /// Descendant / pseudo-class rules (every entry, in file order).
    pub css: String,
    /// What `.t-x` is followed by in the type rules: `css` minus `gen_rules` (B0).
    pub type_css: String,
    /// B0 (§9.B B-prelude P1): a2 / a3 / a4 / a5 entries that are state rules (`:focus-visible`) or at-rules
    /// (`@keyframes`, `@media (prefers-reduced-motion…)`, `@media (forced-colors…)`). They are emitted by the
    /// shared style generator (`style_block`), not after `.t-x`.
    pub gen_rules: Vec<String>,
}

pub(crate) struct KindLooks {
    pub kinds: HashMap<&'static str, KindLook>,
    /// Read by the tests that bind the sheet / drawer border rules to the shared file.
    #[cfg_attr(not(test), allow(dead_code))]
    pub facing_border: String,
    /// "sheet:right" | "sheet:left" | "drawer" -> the one side that keeps a border.
    #[cfg_attr(not(test), allow(dead_code))]
    pub facing: HashMap<String, String>,
    /// Phase 11 A2.3: the `a2.kinds` table (card/alert/separator/skeleton/spinner/aspectRatio/
    /// buttonGroup looks), same shape as `kinds`, kept apart so the A1 tables are unchanged.
    pub a2_kinds: HashMap<&'static str, KindLook>,
    /// `a2.texts`: generated strings and SVG data (spinner label, spinner arc path).
    pub a2_texts: HashMap<String, String>,
    /// Phase 11 A3.1: the `a3.kinds` table (checkbox box + checkmark), same shape as `kinds`.
    pub a3_kinds: HashMap<&'static str, KindLook>,
    /// Phase 11 A4.1: the `a4.kinds` table (list markers), same shape as `kinds`.
    pub a4_kinds: HashMap<&'static str, KindLook>,
    /// Phase 11 A5.1: the `a5.kinds` table (carousel), same shape as `kinds`.
    pub a5_kinds: HashMap<&'static str, KindLook>,
}

fn expand_tokens(s: &str, palette: &HashMap<String, String>) -> String {
    let mut out = String::with_capacity(s.len());
    let mut rest = s;
    while let Some(i) = rest.find("{{") {
        match rest[i + 2..].find("}}") {
            Some(j) => {
                let name = &rest[i + 2..i + 2 + j];
                match palette.get(name) {
                    Some(v) => {
                        out.push_str(&rest[..i]);
                        out.push_str(v);
                    }
                    // Unknown token: leave it visible (a test fails on it).
                    None => out.push_str(&rest[..i + 2 + j + 2]),
                }
                rest = &rest[i + 2 + j + 2..];
            }
            None => break,
        }
    }
    out.push_str(rest);
    out
}

/// Parse the shared look file. A missing or malformed section is a HARD error (F9): the file is
/// embedded at build time, so silently falling back to empty looks would drop every kind's look.
fn parse_kind_looks_checked(json: &str) -> Result<KindLooks, String> {
    let v: Value = serde_json::from_str(json).map_err(|e| format!("kind-looks.json is not valid JSON: {e}"))?;
    let section = |parent: &'_ Value, key: &str, path: &str| -> Result<Value, String> {
        parent.get(key).cloned().ok_or_else(|| format!("kind-looks.json: missing section `{path}`"))
    };
    let palette: HashMap<String, String> = section(&v, "palette", "palette")?
        .as_object()
        .ok_or("kind-looks.json: `palette` must be an object")?
        .iter()
        .filter_map(|(k, x)| Some((k.clone(), x.as_str()?.to_string())))
        .collect();
    let kinds = parse_kind_table(&section(&v, "kinds", "kinds")?, &palette).ok_or("kind-looks.json: malformed `kinds` table")?;
    let a2 = section(&v, "a2", "a2")?;
    let a2_kinds = parse_kind_table_split(&section(&a2, "kinds", "a2.kinds")?, &palette, true).ok_or("kind-looks.json: malformed `a2.kinds` table")?;
    let a2_texts: HashMap<String, String> = section(&a2, "texts", "a2.texts")?
        .as_object()
        .ok_or("kind-looks.json: `a2.texts` must be an object")?
        .iter()
        .map(|(k, x)| Some((k.clone(), x.as_str()?.to_string())))
        .collect::<Option<_>>()
        .ok_or("kind-looks.json: `a2.texts` values must be strings")?;
    let facing = section(&v, "facing", "facing")?
        .as_object()
        .ok_or("kind-looks.json: `facing` must be an object")?
        .iter()
        .filter_map(|(k, x)| Some((k.clone(), x.as_str()?.to_string())))
        .collect();
    let facing_border = section(&v, "facingBorder", "facingBorder")?
        .as_str()
        .map(|s| expand_tokens(s, &palette))
        .ok_or("kind-looks.json: `facingBorder` must be a string")?;
    let a3 = section(&v, "a3", "a3")?;
    let a3_kinds = parse_kind_table_split(&section(&a3, "kinds", "a3.kinds")?, &palette, true).ok_or("kind-looks.json: malformed `a3.kinds` table")?;
    let a4 = section(&v, "a4", "a4")?;
    let a4_kinds = parse_kind_table_split(&section(&a4, "kinds", "a4.kinds")?, &palette, true).ok_or("kind-looks.json: malformed `a4.kinds` table")?;
    let a5 = section(&v, "a5", "a5")?;
    let a5_kinds = parse_kind_table_split(&section(&a5, "kinds", "a5.kinds")?, &palette, true).ok_or("kind-looks.json: malformed `a5.kinds` table")?;
    Ok(KindLooks { kinds, facing_border, facing, a2_kinds, a2_texts, a3_kinds, a4_kinds, a5_kinds })
}

/// Option view of `parse_kind_looks_checked` (the A1.3 tests only ask accepted / refused).
#[cfg(test)]
fn parse_kind_looks(json: &str) -> Option<KindLooks> {
    parse_kind_looks_checked(json).ok()
}

fn parse_kind_table(table: &Value, palette: &HashMap<String, String>) -> Option<HashMap<&'static str, KindLook>> {
    parse_kind_table_split(table, palette, false)
}

/// B0: a rule the shared generator owns (state pseudo-class or at-rule).
fn is_generator_rule(r: &str) -> bool {
    r.starts_with('@') || r.contains(":focus-visible") || r.contains(":hover") || r.contains(":active")
}

fn parse_kind_table_split(table: &Value, palette: &HashMap<String, String>, split: bool) -> Option<HashMap<&'static str, KindLook>> {
    let mut kinds = HashMap::new();
    for (name, k) in table.as_object()? {
        let name: &'static str = Box::leak(name.clone().into_boxed_str());
        let mut extras = Vec::new();
        for pair in k.get("extras")?.as_array()? {
            let pair = pair.as_array()?;
            let key: &'static str = Box::leak(pair.first()?.as_str()?.to_string().into_boxed_str());
            extras.push((key, expand_tokens(pair.get(1)?.as_str()?, palette)));
        }
        let mut css = String::new();
        let mut type_css = String::new();
        let mut gen_rules = Vec::new();
        for r in k.get("css")?.as_array()? {
            let r = expand_tokens(r.as_str()?, palette);
            css.push_str(&r);
            if split && is_generator_rule(&r) {
                gen_rules.push(r);
            } else {
                type_css.push_str(&r);
            }
        }
        kinds.insert(name, KindLook { extras, css, type_css, gen_rules });
    }
    Some(kinds)
}

pub(crate) fn kind_looks() -> &'static KindLooks {
    static LOOKS: std::sync::OnceLock<KindLooks> = std::sync::OnceLock::new();
    LOOKS.get_or_init(|| {
        parse_kind_looks_checked(KIND_LOOKS_JSON).unwrap_or_else(|e| panic!("{e}"))
    })
}

/// Descendant / pseudo-class rules for the A1 fidelity pass (see `kind-looks.json`).
#[cfg(test)]
pub(crate) fn type_css_for_test(t: NodeType) -> &'static str { type_css(t) }

fn type_css(t: NodeType) -> &'static str {
    let l = kind_looks();
    l.kinds
        .get(type_name(t))
        .or_else(|| l.a2_kinds.get(type_name(t)))
        .or_else(|| l.a3_kinds.get(type_name(t)))
        .or_else(|| l.a4_kinds.get(type_name(t)))
        .or_else(|| l.a5_kinds.get(type_name(t)))
        .map_or("", |k| k.type_css.as_str())
}

/// B0: the a2 / a3 generator-owned rules of a type (empty for the other tables).
fn type_gen_rules(t: NodeType) -> &'static [String] {
    let l = kind_looks();
    if l.kinds.contains_key(type_name(t)) {
        return &[];
    }
    // B0.2 item 2: a4 (table) and a5 (carousel) state rules join a2 / a3 in the shared generator.
    l.a2_kinds
        .get(type_name(t))
        .or_else(|| l.a3_kinds.get(type_name(t)))
        .or_else(|| l.a4_kinds.get(type_name(t)))
        .or_else(|| l.a5_kinds.get(type_name(t)))
        .map_or(&[], |k| k.gen_rules.as_slice())
}

/// A2 container kinds lay their children out like `container`, from the per-kind
/// defaults (`a2_layout_defaults`, spec §9 A2) instead of the container's.
fn a2_container_defaults(t: NodeType) -> Option<(Direction, u32, Align, Justify)> {
    match t {
        NodeType::Card | NodeType::Alert | NodeType::AspectRatio | NodeType::ButtonGroup => a2_layout_defaults(t),
        // Phase 11 A3.3: field reuses the same type-extras path (column / gap 6).
        NodeType::Field => a3_layout_defaults(t),
        // Phase 11 A5.1: carousel (row / gap 16).
        NodeType::Carousel => a5_layout_defaults(t),
        _ => None,
    }
}

fn type_extras(t: NodeType) -> Vec<(&'static str, String)> {
    match t {
        NodeType::Container => container_layout(
            ContainerPropDefaults::DIRECTION,
            ContainerPropDefaults::GAP,
            ContainerPropDefaults::ALIGN,
            ContainerPropDefaults::JUSTIFY,
        ),
        _ => {
            if let Some((d, g, a, j)) = a2_container_defaults(t) {
                return container_layout(d, g, a, j);
            }
            let l = kind_looks();
            l.kinds
                .get(type_name(t))
                .or_else(|| l.a2_kinds.get(type_name(t)))
                .or_else(|| l.a3_kinds.get(type_name(t)))
                .or_else(|| l.a4_kinds.get(type_name(t)))
                .or_else(|| l.a5_kinds.get(type_name(t)))
                .map_or_else(Vec::new, |k| k.extras.clone())
        }
    }
}

/// A dropdownMenu / popover whose label is empty would export a nameless `<summary>`:
/// fall back to the layer name (A1.3 follow-up). Never invents text when both are empty.
pub(crate) fn summary_label<'a>(label: &'a str, node: &'a Node) -> &'a str {
    if label.trim().is_empty() {
        node.name.as_deref().map(str::trim).filter(|n| !n.is_empty()).unwrap_or(label)
    } else {
        label
    }
}

fn type_rule(t: NodeType) -> String {
    let mut d = decls(&default_styles(t));
    merge(&mut d, type_extras(t));
    let mut out = rule(&format!(".t-{}", type_name(t)), &d);
    out.push_str(type_css(t));
    out
}

/// Append declarations; an existing property is replaced in place (later wins,
/// matching node-view's `{ ...style, ...extra }`) so nothing is emitted twice.
fn merge(d: &mut Vec<(&'static str, String)>, extra: Vec<(&'static str, String)>) {
    for (k, v) in extra {
        match d.iter_mut().find(|(dk, _)| *dk == k) {
            Some(slot) => slot.1 = v,
            None => d.push((k, v)),
        }
    }
}

fn rule(selector: &str, d: &[(&'static str, String)]) -> String {
    let mut s = String::with_capacity(selector.len() + d.len() * 24);
    s.push_str(selector);
    s.push('{');
    for (i, (k, v)) in d.iter().enumerate() {
        if i > 0 {
            s.push(';');
        }
        s.push_str(k);
        s.push(':');
        s.push_str(v);
    }
    s.push('}');
    s
}

fn container_layout(dir: Direction, gap: u32, align: Align, justify: Justify) -> Vec<(&'static str, String)> {
    vec![
        ("display", "flex".into()),
        (
            "flex-direction",
            match dir {
                Direction::Row => "row",
                Direction::Column => "column",
            }
            .into(),
        ),
        ("gap", px(gap as f64)),
        (
            "align-items",
            match align {
                Align::Start => "flex-start",
                Align::Center => "center",
                Align::End => "flex-end",
                Align::Stretch => "stretch",
            }
            .into(),
        ),
        (
            "justify-content",
            match justify {
                Justify::Start => "flex-start",
                Justify::Center => "center",
                Justify::End => "flex-end",
                Justify::Between => "space-between",
            }
            .into(),
        ),
    ]
}

/// StyleProps → CSS declarations (same mapping as node-view.tsx `styleToCss`).

/// B1.1 (§9.B): colour validator for **new** colour-bearing keys.
/// Accepts `#rgb` / `#rgba` / `#rrggbb` / `#rrggbbaa`, `transparent`, `currentColor`
/// (any ASCII case). Returns a lowercase hex form (or the two keywords as written
/// below), or `None` when the value is rejected. Never runs `css_safe` — structured
/// colour keys must not accept free-form CSS.
pub fn css_color(s: &str) -> Option<String> {
    let t = s.trim();
    if t.is_empty() {
        return None;
    }
    let lower = t.to_ascii_lowercase();
    if lower == "transparent" {
        return Some("transparent".into());
    }
    if lower == "currentcolor" {
        return Some("currentColor".into());
    }
    if !lower.starts_with('#') {
        return None;
    }
    let hex = &lower[1..];
    let ok = matches!(hex.len(), 3 | 4 | 6 | 8) && hex.bytes().all(|b| b.is_ascii_hexdigit());
    if !ok {
        return None;
    }
    Some(format!("#{hex}"))
}

fn clamp_f(n: f64, lo: f64, hi: f64) -> f64 {
    if !n.is_finite() {
        return 0.0;
    }
    n.clamp(lo, hi)
}

/// B1.2: compile `boxShadow` layers → a `box-shadow` value, or `None` if nothing remains.
/// Caps (§4.2): ≤ 6 layers; x/y ±200; blur 0–200; spread ±100; colour via `css_color`.
/// Hostile / invalid layers (bad colour, empty after clamp) are dropped; no panic.
fn box_shadow_css(layers: &[BoxShadowLayer]) -> Option<String> {
    let mut out: Vec<String> = Vec::new();
    for layer in layers.iter().take(6) {
        let color = match layer.color.as_deref().and_then(css_color) {
            Some(c) => c,
            None => continue, // no / bad colour → drop layer
        };
        let x = clamp_f(layer.x.unwrap_or(0.0), -200.0, 200.0);
        let y = clamp_f(layer.y.unwrap_or(0.0), -200.0, 200.0);
        let blur = clamp_f(layer.blur.unwrap_or(0.0), 0.0, 200.0);
        let spread = clamp_f(layer.spread.unwrap_or(0.0), -100.0, 100.0);
        let mut part = String::new();
        if layer.inset == Some(true) {
            part.push_str("inset ");
        }
        part.push_str(&format!("{} {} {} {} {}", px(x), px(y), px(blur), px(spread), color));
        out.push(part);
    }
    if out.is_empty() {
        None
    } else {
        Some(out.join(", "))
    }
}

/// B3.1: compile a gradient → CSS function, or `None` if fewer than 2 valid stops remain.
/// Caps (§4.2): 2–8 stops; `at` 0–100; angle 0–360; stops sorted by `at`; colour via `css_color`.
fn gradient_css(g: &GradientValue) -> Option<String> {
    let stops_in = g.stops.as_deref().unwrap_or(&[]);
    let mut stops: Vec<(f64, String)> = Vec::new();
    for stop in stops_in.iter().take(8) {
        let color = match stop.color.as_deref().and_then(css_color) {
            Some(c) => c,
            None => continue,
        };
        let at = clamp_f(stop.at.unwrap_or(0.0), 0.0, 100.0);
        stops.push((at, color));
    }
    if stops.len() < 2 {
        return None;
    }
    stops.sort_by(|a, b| a.0.partial_cmp(&b.0).unwrap_or(std::cmp::Ordering::Equal));
    let stop_css: String = stops
        .iter()
        .map(|(at, color)| format!("{} {}%", color, num(*at)))
        .collect::<Vec<_>>()
        .join(", ");
    let kind = g.kind.unwrap_or(GradientKind::Linear);
    let default_angle = match kind {
        GradientKind::Linear => 180.0,
        GradientKind::Conic | GradientKind::Radial => 0.0,
    };
    let angle = clamp_f(g.angle.unwrap_or(default_angle), 0.0, 360.0);
    Some(match kind {
        GradientKind::Linear => format!("linear-gradient({}deg, {stop_css})", num(angle)),
        GradientKind::Radial => format!("radial-gradient(circle, {stop_css})"),
        GradientKind::Conic => format!("conic-gradient(from {}deg, {stop_css})", num(angle)),
    })
}

/// Whether `decls` will emit a text-gradient (background wins when both are set — §4.2 exclusive).
fn uses_text_gradient(s: &StyleProps) -> bool {
    let bg_ok = s
        .background_gradient
        .as_ref()
        .and_then(gradient_css)
        .is_some();
    if bg_ok {
        return false;
    }
    s.text_gradient.as_ref().and_then(gradient_css).is_some()
}

/// B4.1: allowlisted border style keyword (uniform + per-side).
fn border_style_kw(raw: &str) -> Option<&'static str> {
    match raw.trim().to_ascii_lowercase().as_str() {
        "solid" => Some("solid"),
        "dashed" => Some("dashed"),
        "dotted" => Some("dotted"),
        "none" => Some("none"),
        _ => None,
    }
}

/// B4.1: push longhands for one side after the uniform border (§4.2).
fn push_border_side(
    push: &mut impl FnMut(&'static str, Option<String>),
    side: &BorderSide,
    width_k: &'static str,
    color_k: &'static str,
    style_k: &'static str,
) {
    if side.is_unset() {
        return;
    }
    if let Some(w) = side.width {
        push(width_k, Some(px(clamp_f(w, 0.0, 20.0))));
    }
    if let Some(c) = side.color.as_deref().and_then(css_color) {
        push(color_k, Some(c));
    }
    if let Some(st) = side.style.as_deref().and_then(border_style_kw) {
        push(style_k, Some(st.into()));
    }
}

fn push_border_sides(push: &mut impl FnMut(&'static str, Option<String>), sides: &BorderSides) {
    if let Some(s) = sides.t.as_ref() {
        push_border_side(push, s, "border-top-width", "border-top-color", "border-top-style");
    }
    if let Some(s) = sides.r.as_ref() {
        push_border_side(push, s, "border-right-width", "border-right-color", "border-right-style");
    }
    if let Some(s) = sides.b.as_ref() {
        push_border_side(push, s, "border-bottom-width", "border-bottom-color", "border-bottom-style");
    }
    if let Some(s) = sides.l.as_ref() {
        push_border_side(push, s, "border-left-width", "border-left-color", "border-left-style");
    }
}

fn push_border_radius_corners(
    push: &mut impl FnMut(&'static str, Option<String>),
    c: &BorderRadiusCorners,
) {
    if let Some(n) = c.tl {
        push("border-top-left-radius", Some(px(clamp_f(n, 0.0, 400.0))));
    }
    if let Some(n) = c.tr {
        push("border-top-right-radius", Some(px(clamp_f(n, 0.0, 400.0))));
    }
    if let Some(n) = c.br {
        push("border-bottom-right-radius", Some(px(clamp_f(n, 0.0, 400.0))));
    }
    if let Some(n) = c.bl {
        push("border-bottom-left-radius", Some(px(clamp_f(n, 0.0, 400.0))));
    }
}

const TRANSFORM_ORIGINS: &[&str] = &[
    "top left",
    "top",
    "top right",
    "left",
    "center",
    "right",
    "bottom left",
    "bottom",
    "bottom right",
];

/// B5.1: fixed order translate → rotate → scale → skew. `None` if no function parts.
fn transform_css(t: &TransformValue) -> Option<String> {
    let mut parts: Vec<String> = Vec::new();
    let tx = t.translate_x.map(|n| clamp_f(n, -1000.0, 1000.0));
    let ty = t.translate_y.map(|n| clamp_f(n, -1000.0, 1000.0));
    if tx.is_some() || ty.is_some() {
        parts.push(format!(
            "translate({}px, {}px)",
            num(tx.unwrap_or(0.0)),
            num(ty.unwrap_or(0.0))
        ));
    }
    if let Some(r) = t.rotate {
        parts.push(format!("rotate({}deg)", num(clamp_f(r, -360.0, 360.0))));
    }
    if let Some(s) = t.scale {
        parts.push(format!("scale({})", num(clamp_f(s, 0.0, 5.0))));
    } else if t.scale_x.is_some() || t.scale_y.is_some() {
        parts.push(format!(
            "scale({}, {})",
            num(clamp_f(t.scale_x.unwrap_or(1.0), 0.0, 5.0)),
            num(clamp_f(t.scale_y.unwrap_or(1.0), 0.0, 5.0))
        ));
    }
    let sx = t.skew_x.map(|n| clamp_f(n, -360.0, 360.0));
    let sy = t.skew_y.map(|n| clamp_f(n, -360.0, 360.0));
    if sx.is_some() || sy.is_some() {
        parts.push(format!(
            "skew({}deg, {}deg)",
            num(sx.unwrap_or(0.0)),
            num(sy.unwrap_or(0.0))
        ));
    }
    if parts.is_empty() {
        None
    } else {
        Some(parts.join(" "))
    }
}

fn transform_origin_kw(raw: &str) -> Option<&'static str> {
    let t = raw.trim().to_ascii_lowercase();
    TRANSFORM_ORIGINS.iter().copied().find(|k| *k == t)
}

const TRANSITION_PAINT: &str =
    "background-color,color,border-color,box-shadow,opacity,transform,filter,backdrop-filter";
const TRANSITION_SPRING: &str = "cubic-bezier(0.34,1.56,0.64,1)";

fn transition_easing(raw: &str) -> Option<String> {
    let t = raw.trim().to_ascii_lowercase();
    match t.as_str() {
        "ease" | "ease-in" | "ease-out" | "ease-in-out" | "linear" => Some(t),
        "spring" => Some(TRANSITION_SPRING.into()),
        _ if t.starts_with("cubic-bezier(") && t.ends_with(')') => {
            // Accept cubic-bezier(n,n,n,n) with x in 0–1 (loose parse).
            let inner = &t["cubic-bezier(".len()..t.len() - 1];
            let nums: Vec<&str> = inner.split(',').map(str::trim).collect();
            if nums.len() != 4 {
                return None;
            }
            let parsed: Vec<f64> = nums.iter().filter_map(|s| s.parse().ok()).collect();
            if parsed.len() != 4 {
                return None;
            }
            if !(0.0..=1.0).contains(&parsed[0]) || !(0.0..=1.0).contains(&parsed[2]) {
                return None;
            }
            Some(format!(
                "cubic-bezier({},{},{},{})",
                num(parsed[0]),
                num(parsed[1]),
                num(parsed[2]),
                num(parsed[3])
            ))
        }
        _ => None,
    }
}

/// B5.1: emit transition longhands when any field is set. `property` only `"paint"`.
fn push_transition(push: &mut impl FnMut(&'static str, Option<String>), t: &TransitionValue) {
    if t.is_unset() {
        return;
    }
    let prop = t.property.as_deref().unwrap_or("paint");
    if prop != "paint" {
        // v1: refuse unknown property lists (never layout).
        return;
    }
    push("transition-property", Some(TRANSITION_PAINT.into()));
    if let Some(d) = t.duration_ms {
        push(
            "transition-duration",
            Some(format!("{}ms", num(clamp_f(d, 0.0, 2000.0)))),
        );
    }
    if let Some(e) = t.easing.as_deref().and_then(transition_easing) {
        push("transition-timing-function", Some(e));
    }
    if let Some(d) = t.delay_ms {
        push(
            "transition-delay",
            Some(format!("{}ms", num(clamp_f(d, 0.0, 2000.0)))),
        );
    }
}

/// B6.1: `filter` function list. Percentages stored as 0–300 (100 = 100%).
fn filter_css(f: &FilterValue) -> Option<String> {
    let mut parts: Vec<String> = Vec::new();
    if let Some(b) = f.blur {
        parts.push(format!("blur({}px)", num(clamp_f(b, 0.0, 40.0))));
    }
    if let Some(b) = f.brightness {
        parts.push(format!("brightness({}%)", num(clamp_f(b, 0.0, 300.0))));
    }
    if let Some(c) = f.contrast {
        parts.push(format!("contrast({}%)", num(clamp_f(c, 0.0, 300.0))));
    }
    if let Some(s) = f.saturate {
        parts.push(format!("saturate({}%)", num(clamp_f(s, 0.0, 300.0))));
    }
    if let Some(g) = f.grayscale {
        parts.push(format!("grayscale({}%)", num(clamp_f(g, 0.0, 100.0))));
    }
    if let Some(h) = f.hue_rotate {
        parts.push(format!("hue-rotate({}deg)", num(clamp_f(h, 0.0, 360.0))));
    }
    if parts.is_empty() {
        None
    } else {
        Some(parts.join(" "))
    }
}

fn backdrop_filter_css(f: &BackdropFilterValue) -> Option<String> {
    let mut parts: Vec<String> = Vec::new();
    if let Some(b) = f.blur {
        parts.push(format!("blur({}px)", num(clamp_f(b, 0.0, 40.0))));
    }
    if let Some(s) = f.saturate {
        parts.push(format!("saturate({}%)", num(clamp_f(s, 0.0, 300.0))));
    }
    if let Some(b) = f.brightness {
        parts.push(format!("brightness({}%)", num(clamp_f(b, 0.0, 300.0))));
    }
    if parts.is_empty() {
        None
    } else {
        Some(parts.join(" "))
    }
}

pub(crate) fn decls_for_test(s: &StyleProps) -> Vec<(&'static str, String)> { decls(s) }

pub(crate) fn state_decls_for_test(s: &StateStyle) -> Vec<(&'static str, String)> { state_decls(s) }

/// B7.2: paint-only allowlist → same CSS longhands as `decls` (defence in depth: `StateStyle` has only these keys).
fn state_as_style(s: &StateStyle) -> StyleProps {
    StyleProps {
        background_color: s.background_color.clone(),
        color: s.color.clone(),
        border_color: s.border_color.clone(),
        opacity: s.opacity,
        box_shadow: s.box_shadow.clone(),
        background_gradient: s.background_gradient.clone(),
        text_gradient: s.text_gradient.clone(),
        filter: s.filter.clone(),
        backdrop_filter: s.backdrop_filter.clone(),
        transform: s.transform.clone(),
        ..Default::default()
    }
}

fn state_decls(s: &StateStyle) -> Vec<(&'static str, String)> {
    decls(&state_as_style(s))
}

/// B7.2 / §7.3: `:focus-visible` only when the compiled root is a focusable control.
fn state_focusable(node: &Node, opts: &CompileOptions) -> bool {
    match &node.props {
        NodeProps::Button { href, action, .. } => {
            let linkable = !matches!(action, Some(ButtonAction::None))
                && href.as_deref().is_some_and(|h| !h.trim().is_empty());
            if !linkable {
                return false;
            }
            if opts.preview {
                preview_page_marker(href.as_deref().unwrap_or(""), opts).is_some()
            } else {
                true
            }
        }
        NodeProps::Link { .. }
        | NodeProps::Input { .. }
        | NodeProps::Textarea { .. }
        | NodeProps::Select { .. }
        | NodeProps::Checkbox { .. }
        | NodeProps::Switch { .. } => true,
        _ => false,
    }
}

fn decls(s: &StyleProps) -> Vec<(&'static str, String)> {
    let mut d: Vec<(&'static str, String)> = Vec::new();
    let mut push = |k: &'static str, v: Option<String>| {
        if let Some(v) = v.filter(|v| !v.is_empty()) {
            d.push((k, v));
        }
    };
    let xform = s.transform.as_ref().and_then(transform_css);
    // B5.1: transform has no effect on display:inline → promote to inline-block (T105).
    let display = s.display.as_deref().and_then(|raw| {
        let d = css_safe(raw);
        if d.is_empty() {
            None
        } else if d == "inline" && xform.is_some() {
            Some("inline-block".into())
        } else {
            Some(d)
        }
    });
    push("display", display);
    push("width", s.width.as_ref().map(css_len));
    push("height", s.height.as_ref().map(css_len));
    push("min-height", s.min_height.as_ref().map(css_len));
    push("max-width", s.max_width.as_ref().map(css_len));
    push("margin", s.margin.as_ref().map(spacing));
    push("padding", s.padding.as_ref().map(spacing));
    push("background-color", s.background_color.as_deref().map(css_safe));
    // B3.1: backgroundGradient wins over textGradient when both are set (§4.2 exclusive).
    let bg_grad = s.background_gradient.as_ref().and_then(gradient_css);
    let text_grad = if bg_grad.is_none() {
        s.text_gradient.as_ref().and_then(gradient_css)
    } else {
        None
    };
    if let Some(img) = bg_grad {
        push("background-image", Some(img));
    } else if let Some(img) = text_grad.clone() {
        push("background-image", Some(img));
        push("-webkit-background-clip", Some("text".into()));
        push("background-clip", Some("text".into()));
    }
    if text_grad.is_some() {
        push("color", Some("transparent".into()));
    } else {
        push("color", s.color.as_deref().map(css_safe));
    }
    push("font-family", s.font_family.as_deref().map(css_safe));
    push("font-size", s.font_size.map(px));
    push(
        "font-weight",
        s.font_weight.as_ref().map(|w| match w {
            FontWeight::Number(n) => n.to_string(),
            FontWeight::Keyword(k) => css_safe(k),
        }),
    );
    // Numbers are unitless for line-height (React leaves lineHeight unitless).
    push(
        "line-height",
        s.line_height.as_ref().map(|v| match v {
            CssSize::Px(n) => num(*n),
            CssSize::Raw(r) => css_safe(r),
        }),
    );
    push("text-align", s.text_align.as_deref().map(css_safe));
    // B4.1: uniform radius first, then set corners only.
    push("border-radius", s.border_radius.map(px));
    if let Some(corners) = s.border_radius_corners.as_ref() {
        push_border_radius_corners(&mut push, corners);
    }
    push("border-width", s.border_width.map(px));
    push("border-color", s.border_color.as_deref().map(css_safe));
    // B4.1: dashed/dotted join the allowlist (hostile free-strings drop).
    push(
        "border-style",
        s.border_style
            .as_deref()
            .and_then(border_style_kw)
            .map(|k| k.to_string()),
    );
    // B4.1: per-side overrides after the uniform border.
    if let Some(sides) = s.border_sides.as_ref() {
        push_border_sides(&mut push, sides);
    }
    push("opacity", s.opacity.map(num));
    push("overflow", s.overflow.as_deref().map(css_safe));
    push("box-shadow", s.box_shadow.as_ref().and_then(|layers| box_shadow_css(layers)));
    // B5.1: transform + origin + transition longhands.
    if let Some(tf) = xform {
        push("transform", Some(tf));
    }
    if let Some(origin) = s
        .transform
        .as_ref()
        .and_then(|t| t.origin.as_deref())
        .and_then(transform_origin_kw)
    {
        push("transform-origin", Some(origin.into()));
    }
    if let Some(tr) = s.transition.as_ref() {
        push_transition(&mut push, tr);
    }
    // B6.1: filter + backdrop-filter (prefixed).
    push("filter", s.filter.as_ref().and_then(filter_css));
    if let Some(bf) = s.backdrop_filter.as_ref().and_then(backdrop_filter_css) {
        push("-webkit-backdrop-filter", Some(bf.clone()));
        push("backdrop-filter", Some(bf));
    }
    d
}

/// Declarations in `eff` that differ from `base` (sparse per-node output).
fn diff(eff: &[(&'static str, String)], base: &[(&'static str, String)]) -> Vec<(&'static str, String)> {
    eff.iter()
        .filter(|(k, v)| !base.iter().any(|(bk, bv)| bk == k && bv == v))
        .cloned()
        .collect()
}

fn num(n: f64) -> String {
    if !n.is_finite() {
        return "0".into();
    }
    if n.fract() == 0.0 && n.abs() < 1e15 {
        return format!("{}", n as i64);
    }
    let s = format!("{n:.4}");
    s.trim_end_matches('0').trim_end_matches('.').to_string()
}

fn px(n: f64) -> String {
    format!("{}px", num(n))
}

fn css_len(v: &CssSize) -> String {
    match v {
        CssSize::Px(n) => px(*n),
        CssSize::Raw(s) => css_safe(s),
    }
}

fn spacing(b: &BoxSpacing) -> String {
    match b {
        BoxSpacing::All(n) => px(*n),
        BoxSpacing::Sides { t, r, b, l } => format!(
            "{} {} {} {}",
            px(t.unwrap_or(0.0)),
            px(r.unwrap_or(0.0)),
            px(b.unwrap_or(0.0)),
            px(l.unwrap_or(0.0))
        ),
    }
}

/// Tokens that must never reach an emitted declaration (matched against the
/// ASCII-lowercased, fully cleaned value). `var(`, `calc(`, `min(`, `clamp(`,
/// `rgb(` and quoted font names are deliberately allowed.
const CSS_DENY: [&str; 8] = [
    "url(",
    "image-set(",
    "expression(",
    "@import",
    "javascript:",
    "-moz-binding",
    "vbscript:",
    "gradient(",
];

/// Keep a CSS value inside its declaration (PHASE-11 A1.3 contract).
/// 1. A backslash rejects the value (no CSS-escape decoding).
/// 2. Strip `{ } ; < >` and control characters.
/// 3. Remove `/*` and `*/` repeatedly until neither is left.
/// 4. Trim, then reject (return `""`) when the lowercased result holds a
///    denied token or `behavior` + optional spaces + `:`.
/// The deny test runs on the cleaned string, so no combination of strips and
/// comment removal can produce a denied token.
/// Two behaviours that look odd but are intended (documented, not bugs):
/// - An UNQUOTED apostrophe (`Mak's Sans`) is rejected: it opens a quote that never
///   closes. Write the family as `"Mak's Sans"` instead.
/// - A QUOTED `"url(x)"` is rejected too: the deny list tests the text, not CSS tokens,
///   so `url(` is refused even inside a string.
pub fn css_safe(s: &str) -> String {
    if s.contains('\\') {
        return String::new();
    }
    // Strip `{ } ; < >` and control characters, and remove every `/*` and `*/`
    // marker (also the ones that removal itself creates) in ONE linear pass:
    // a marker is dropped the moment its second character is pushed, so the
    // output can never contain one. (Repeated `replace` was quadratic on
    // nested input such as 200k x "/" followed by 200k x "*".)
    let mut out: Vec<char> = Vec::with_capacity(s.len());
    for c in s.chars() {
        if matches!(c, '{' | '}' | ';' | '<' | '>') || c.is_control() {
            continue;
        }
        out.push(c);
        let n = out.len();
        if n >= 2 && matches!((out[n - 2], out[n - 1]), ('/', '*') | ('*', '/')) {
            out.truncate(n - 2);
        }
    }
    let t: String = out.into_iter().collect();
    let t = t.trim();
    let lower = t.to_ascii_lowercase();
    if CSS_DENY.iter().any(|d| lower.contains(d)) {
        return String::new();
    }
    let mut rest = lower.as_str();
    while let Some(p) = rest.find("behavior") {
        rest = &rest[p + "behavior".len()..];
        if rest.trim_start().starts_with(':') {
            return String::new();
        }
    }
    // An unterminated quote or paren would swallow the rest of the
    // declaration block, and a stray `)` is never valid: reject both.
    // (A backslash was rejected above, so there are no escapes to track.)
    if !css_balanced(t) {
        return String::new();
    }
    t.to_string()
}

/// True when every quote is closed and every `(` has its `)` (parens inside
/// a quoted string do not count).
fn css_balanced(t: &str) -> bool {
    let mut quote: Option<char> = None;
    let mut depth: i32 = 0;
    for c in t.chars() {
        match quote {
            Some(q) => {
                if c == q {
                    quote = None;
                }
            }
            None => match c {
                '"' | '\'' => quote = Some(c),
                '(' => depth += 1,
                ')' => {
                    depth -= 1;
                    if depth < 0 {
                        return false;
                    }
                }
                _ => {}
            },
        }
    }
    quote.is_none() && depth == 0
}

/* ------------------------------------------------------------------ */
/* HTML                                                                */
/* ------------------------------------------------------------------ */

/// Escape text and attribute values (always used inside double quotes).
pub fn esc(s: &str) -> String {
    let mut o = String::with_capacity(s.len() + 8);
    for ch in s.chars() {
        match ch {
            '&' => o.push_str("&amp;"),
            '<' => o.push_str("&lt;"),
            '>' => o.push_str("&gt;"),
            '"' => o.push_str("&quot;"),
            '\'' => o.push_str("&#39;"),
            c => o.push(c),
        }
    }
    o
}

/// Allow relative URLs, fragments and http(s)/mailto/tel only.
pub fn safe_href(raw: &str) -> String {
    let h: String = raw.chars().filter(|c| !c.is_control()).collect();
    let h = h.trim();
    if h.is_empty() {
        return "#".into();
    }
    // Scheme = text before ':' when no '/', '?' or '#' comes first.
    let squashed: String = h.chars().filter(|c| !c.is_whitespace()).collect::<String>().to_ascii_lowercase();
    let first_delim = squashed.find(['/', '?', '#']).unwrap_or(squashed.len());
    match squashed.find(':') {
        Some(i) if i < first_delim => {
            let scheme = &squashed[..i];
            if matches!(scheme, "http" | "https" | "mailto" | "tel") {
                h.to_string()
            } else {
                "#".into()
            }
        }
        _ => h.to_string(),
    }
}

/// Rewrite an href whose path matches a page path (optional trailing `/`).
/// Keeps `?query` and `#fragment`. Unmatched hrefs pass through `safe_href` only.
///
/// INTENTIONAL (Phase 9, PM-approved): a fragment/query-only href (`#top`, `?q`,
/// or the `#` that `safe_href` returns for a blocked scheme) has no path and is
/// never a page, so it is exported exactly as written. Before Phase 9 the empty
/// path fell through to the `/` entry and became `index.html#top`, which jumped
/// to the home page from every other page. Golden: compiler_tests.rs
/// `fragment_and_query_only_hrefs_export_as_written`.
pub fn rewrite_page_href(raw: &str, paths: &HashMap<String, String>) -> String {
    let safe = safe_href(raw);
    match page_file(&safe, paths) {
        Some((file, rest)) => format!("{file}{rest}"),
        None => safe,
    }
}

/// Page file for an already `safe_href`-ed href, plus its `?`/`#` tail. The
/// path part must be non-empty (see `rewrite_page_href`); a trailing `/` is
/// optional. Shared by export rewriting and Preview markers.
fn page_file<'a>(safe: &'a str, paths: &'a HashMap<String, String>) -> Option<(&'a str, &'a str)> {
    if paths.is_empty() {
        return None;
    }
    let path_end = safe.find(['?', '#']).unwrap_or(safe.len());
    let (path, rest) = safe.split_at(path_end);
    if path.is_empty() {
        return None;
    }
    let key = if path.len() > 1 && path.ends_with('/') {
        path.trim_end_matches('/')
    } else {
        path
    };
    paths
        .get(path)
        .or_else(|| paths.get(key))
        .or_else(|| paths.get(&format!("{key}/")))
        .map(|file| (file.as_str(), rest))
}

/// Preview page-link marker prefix. Must match `PAGE_MARKER_PREFIX` in
/// src/lib/preview-links.ts.
pub const PAGE_MARKER_PREFIX: &str = "about:blank#wb-page=";

/// Preview only: the inert marker href for an href that resolves to a page
/// other than the open one (`page_markers`), else `None` (no href at all).
/// `safe_href` trims, so stray spaces still match.
fn preview_page_marker(raw: &str, opts: &CompileOptions) -> Option<String> {
    if !opts.preview {
        return None;
    }
    let safe = safe_href(raw);
    let (file, _) = page_file(&safe, &opts.page_paths)?;
    opts.page_markers
        .get(file)
        .filter(|m| m.starts_with(PAGE_MARKER_PREFIX))
        .cloned()
}

/// `role` + `aria-label=title` for a visible in-page panel, only when the
/// title is non-empty. Never `aria-modal` (a static page cannot trap focus).
fn panel_role(role: &'static str, title: &str) -> Vec<(&'static str, String)> {
    if title.trim().is_empty() {
        vec![]
    } else {
        vec![("role", role.to_string()), ("aria-label", title.to_string())]
    }
}

/// Phase 11 A2.3: where a direct child of a `buttonGroup` sits.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum GroupPos {
    First,
    Middle,
    Last,
}

/// Corner declarations of one `buttonGroup` child (spec section 9 A2: "only outer corners
/// round, using each child's own radius value"). `radius` is the child's resolved
/// `borderRadius`. First and last keep the radius on the two outer corners of the group's
/// axis (row: left / right; column: top / bottom) and get 0 on the inner two; a middle child
/// gets 0 everywhere; a child without a radius needs nothing. Declarations are merged after
/// the child's own `border-radius`, so the outer corners keep the child's own value.
pub(crate) fn group_corner_decls(dir: Direction, pos: GroupPos, radius: f64) -> Vec<(&'static str, String)> {
    if !(radius > 0.0) {
        return vec![];
    }
    if pos == GroupPos::Middle {
        return vec![("border-radius", px(0.0))];
    }
    let first = pos == GroupPos::First;
    // (top-left, top-right, bottom-right, bottom-left) keep the radius?
    let keep = match (dir, first) {
        (Direction::Row, true) => (true, false, false, true),
        (Direction::Row, false) => (false, true, true, false),
        (Direction::Column, true) => (true, true, false, false),
        (Direction::Column, false) => (false, false, true, true),
    };
    let v = |k: bool| if k { px(radius) } else { px(0.0) };
    vec![
        ("border-top-left-radius", v(keep.0)),
        ("border-top-right-radius", v(keep.1)),
        ("border-bottom-right-radius", v(keep.2)),
        ("border-bottom-left-radius", v(keep.3)),
    ]
}

/// True when the compiler draws an element for this node (used to decide which children of a
/// `buttonGroup` are its first / last).
pub(crate) fn emits_element(node: &Node) -> bool {
    node.is_visible()
        && !matches!(
            &node.props,
            NodeProps::Dialog { open: false, .. } | NodeProps::Sheet { open: false, .. } | NodeProps::Drawer { open: false, .. }
        )
}

/// scrollArea axis rule from `orientation` (A2.3 part 2). Only while the node's resolved
/// `overflow` is `auto` / `scroll` (an explicit `visible` / `hidden` wins, G1): `vertical` keeps the
/// horizontal axis clipped, `horizontal` keeps the vertical axis clipped, `both` adds nothing.
/// Same table as `scrollAxes` in a2-looks.ts (shared fixture `scroll-orientation.json`). `node_class` calls it for
/// the base overflow and again for every breakpoint that sets its own `overflow` (N2).
pub(crate) fn scroll_axis_decls(o: ScrollOrientation, overflow: Option<&str>) -> Vec<(&'static str, String)> {
    if !matches!(overflow, Some("auto") | Some("scroll")) {
        return vec![];
    }
    match o {
        ScrollOrientation::Vertical => vec![("overflow-x", "hidden".into())],
        ScrollOrientation::Horizontal => vec![("overflow-y", "hidden".into())],
        ScrollOrientation::Both => vec![],
    }
}

pub(crate) fn ratio_css(r: AspectRatioValue) -> &'static str {
    match r {
        AspectRatioValue::R16x9 => "16 / 9",
        AspectRatioValue::R4x3 => "4 / 3",
        AspectRatioValue::R1x1 => "1 / 1",
        AspectRatioValue::R3x2 => "3 / 2",
        AspectRatioValue::R21x9 => "21 / 9",
    }
}

/// Phase 11 A5.1: compute flex-basis for a carousel slide.
/// `calc((100% - gap*(n-1)px) / n)` where n = slidesPerView.
fn slide_basis(slides_per_view: u32, gap_px: u32) -> String {
    let n = slides_per_view.clamp(1, 4);
    format!("calc((100% - {}px) / {})", gap_px * (n - 1), n)
}

/// Spinner size is 12-64 px (spec section 9 A2); a hand-edited value is clamped.
pub(crate) fn spinner_px(size: u32) -> u32 {
    size.clamp(12, 64)
}

/// Icon size is 12–128 px (A4.5); a hand-edited value is clamped.
pub(crate) fn icon_size_px(size: u32) -> u32 {
    size.clamp(12, 128)
}

/// Icon stroke width is 1–4 (A4.5); a hand-edited value is clamped.
pub(crate) fn icon_stroke(width: f64) -> f64 {
    if !width.is_finite() {
        return 2.0;
    }
    width.clamp(1.0, 4.0)
}

fn format_stroke(w: f64) -> String {
    if (w - w.round()).abs() < 1e-9 {
        format!("{}", w.round() as i32)
    } else {
        format!("{w}")
    }
}

#[allow(clippy::type_complexity)]
fn a2_layout_props(p: &NodeProps) -> Option<(Option<Direction>, Option<u32>, Option<Align>, Option<Justify>)> {
    match p {
        NodeProps::Card { direction, gap, align, justify, .. }
        | NodeProps::Alert { direction, gap, align, justify, .. }
        | NodeProps::Field { direction, gap, align, justify, .. }
        | NodeProps::AspectRatio { direction, gap, align, justify, .. }
        | NodeProps::ScrollArea { direction, gap, align, justify, .. }
        | NodeProps::ButtonGroup { direction, gap, align, justify, .. }
        | NodeProps::Carousel { direction, gap, align, justify, .. } => Some((*direction, *gap, *align, *justify)),
        _ => None,
    }
}

struct Compiler<'a> {
    doc: &'a PageDocument,
    opts: &'a CompileOptions,
    body: String,
    node_css: String,
    /// Declarations for `@media (max-width: 1024px)`, already wrapped as rules.
    bp_tablet: String,
    /// Declarations for `@media (max-width: 719px)`, already wrapped as rules.
    bp_phone: String,
    /// Declarations for `@media (horizontal-viewport-segments: 2)`.
    bp_fold: String,
    used_types: BTreeSet<u8>,
    used_levels: BTreeSet<u8>,
    /// Cycle guard for malformed documents.
    visiting: HashSet<String>,
    next_class: u32,
    /// Per-document deterministic counter for generated ids (tabs, tooltip).
    next_uid: u32,
    /// Rules that depend on generated ids (tabs panels); emitted after the
    /// type rules and before the per-node rules.
    dyn_css: String,
    /// Phase 11 A2.3: corner slot of each direct child of a `buttonGroup` (set just before
    /// the children are rendered; only when the group has two or more drawn children).
    group_slots: HashMap<String, (Direction, GroupPos)>,
    /// Phase 11 A3.3: attrs a `field` injects onto its first pairable child's control
    /// (`id`, `aria-describedby`). Keyed by the child node id; taken once when that control opens.
    control_attrs: HashMap<String, Vec<(&'static str, String)>>,
    /// B0: base rules `[data-wb-id="…"]{…}` for the keys a node overrides at a breakpoint (shared generator).
    hook_base: String,
    /// B0: `(class, node id)` of the node whose root element must carry `data-wb-id` (set by `node_class`,
    /// taken by the next `open` whose classes contain that class).
    pending_hook: Option<(String, String)>,
    /// B0.1 item 3: set once the page root's `data-wb-page` is written.
    page_attr_done: bool,
    /// B3.1 (§7.3): `.nN` classes that emit a text gradient — need forced-colours fallback.
    text_grad_forced: String,
    /// B7.2 §7.2: per-node state rules (`@media (hover:hover){.nN:hover}`, `:focus-visible`, `:active`).
    state_css: String,
    /// B7.2 §7.4: per-node `prefers-reduced-motion` overrides (transition/transform under states).
    state_reduced: String,
    /// B7.2 §7.3: per-node `forced-colors` fallbacks for state rings (focus-visible + box-shadow).
    state_forced: String,
}

/// B0 (§9.B P1 selector contract): the attribute both outputs put on a node root that the generated CSS targets.
pub const HOOK_ATTR: &str = "data-wb-id";

/// B0.2 item 3: the page root carries `data-wb-page="<ProjectPage.id>"`; every hook rule is scoped by it, so the same
/// node id on two pages (or two pages that share a root id) keeps its own breakpoint values. Specificity (0, 2, 0).
pub const PAGE_ATTR: &str = "data-wb-page";

/// B0.2 item 3: the scope id for `data-wb-page` / hook selectors. Prefers `opts.page_id`; else the matching
/// `doc.pages` entry; else the synthetic single-page id `"home"` (see `export::pages_for_export`).
pub fn page_scope_id(doc: &PageDocument, opts: &CompileOptions) -> String {
    if let Some(id) = opts.page_id.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
        return id.to_string();
    }
    if let Some(p) = doc.pages.iter().find(|p| p.root == doc.root) {
        return p.id.clone();
    }
    if doc.pages.len() == 1 {
        return doc.pages[0].id.clone();
    }
    "home".into()
}

/// B0.1 item 2: kinds whose Vite rendering takes the shared base defaults (template `PLAIN_KINDS`). For these the
/// hook base restates the type default; every other kind (drawn with shadcn in Vite) restates only its own keys.
pub(crate) const RESTATE_KINDS: [NodeType; 11] = [
    NodeType::Page,
    NodeType::Section,
    NodeType::Container,
    NodeType::Card,
    NodeType::Alert,
    NodeType::ButtonGroup,
    NodeType::AspectRatio,
    NodeType::Field,
    NodeType::ScrollArea,
    NodeType::Heading,
    NodeType::Text,
];

/// `[data-wb-id="<id>"]`, the id escaped as a CSS string (quote, backslash, `<`, control chars).
pub(crate) fn hook_selector(id: &str) -> String {
    attr_selector(HOOK_ATTR, id)
}

/// B0.2 item 3: `[data-wb-page="P"] [data-wb-id="X"]`. When the hooked node is the page root, both attrs sit on
/// the same element (`same_el`), so the selector has no descendant combinator.
pub(crate) fn scoped_hook_selector(page: &str, id: &str, same_el: bool) -> String {
    let sep = if same_el { "" } else { " " };
    format!("{}{sep}{}", attr_selector(PAGE_ATTR, page), hook_selector(id))
}

fn attr_selector(attr: &str, id: &str) -> String {
    let mut s = String::with_capacity(id.len() + 16);
    s.push('[');
    s.push_str(attr);
    s.push_str("=\"");
    for ch in id.chars() {
        match ch {
            '"' | '\\' => {
                s.push('\\');
                s.push(ch);
            }
            '<' | '>' | '&' => s.push_str(&format!("\\{:x} ", ch as u32)),
            c if (c as u32) < 0x20 || c as u32 == 0x7f => s.push_str(&format!("\\{:x} ", c as u32)),
            c => s.push(c),
        }
    }
    s.push_str("\"]");
    s
}

/// B0: longhands and their shorthand move together (a breakpoint `margin` also takes `margin-top` off the
/// inline style in Vite, and the other way round). Same table as `propFamily` in the template's `style.ts`.
pub(crate) fn prop_family(p: &str) -> &str {
    if p.starts_with("margin") {
        "margin"
    } else if p.starts_with("padding") {
        "padding"
    } else if p.starts_with("overflow") {
        "overflow"
    } else if p == "border-radius" || (p.starts_with("border-") && p.ends_with("-radius")) {
        "border-radius"
    } else {
        p
    }
}


/// Keys present on a breakpoint override. Empty / absent → no rule.
fn breakpoint_decls(style: Option<&StyleProps>) -> Vec<(&'static str, String)> {
    match style {
        Some(style) if !style.is_empty() => decls(style),
        _ => Vec::new(),
    }
}

impl<'a> Compiler<'a> {
    fn render(&mut self, id: &str, depth: usize) {
        if depth > 256 || self.visiting.contains(id) {
            return;
        }
        let Some(node) = self.doc.nodes.get(id) else { return };
        if !node.is_visible() {
            return;
        }
        self.visiting.insert(id.to_string());
        self.render_node(node, depth);
        self.visiting.remove(id);
    }

    fn render_children(&mut self, node: &Node, depth: usize) {
        for child in node.children() {
            self.render(child, depth + 1);
        }
    }

    
/// Per-node rule for declarations not covered by type/level defaults.
    fn node_class(&mut self, node: &Node, extra: Vec<(&'static str, String)>) -> Option<String> {
        let mut base_style = default_styles(node.node_type);
        if let NodeProps::Heading { level, .. } = &node.props {
            base_style.font_size = Some(heading_font_size(*level));
        }
        let eff = resolved_style(node);
        // G1: the base a node is diffed against is the type defaults *plus*
        // the type's own extras (what `.t-x` really emits). A key the node set
        // explicitly always wins, even when it equals a plain default but
        // differs from an extra (`.nN` follows `.t-x` at equal specificity).
        let def = decls(&base_style);
        let mut base = def.clone();
        merge(&mut base, type_extras(node.node_type));
        let explicit = decls(&node.style);
        let mut d: Vec<(&'static str, String)> = decls(&eff)
            .into_iter()
            .filter(|(k, v)| {
                let is_explicit = explicit.iter().any(|(ek, _)| ek == k);
                let in_def = def.iter().any(|(dk, dv)| dk == k && dv == v);
                let in_base = base.iter().any(|(bk, bv)| bk == k && bv == v);
                (is_explicit || !in_def) && !in_base
            })
            .collect();
        if node.node_type == NodeType::Spacer {
            d.retain(|(k, _)| *k != "width"); // node-view forces width:100%
        }
        merge(&mut d, extra);
        // A2.3: a buttonGroup child rounds only the group's outer corners.
        if let Some((dir, pos)) = self.group_slots.get(node.id.as_str()).copied() {
            merge(&mut d, group_corner_decls(dir, pos, eff.border_radius.unwrap_or(0.0)));
        }
        // Breakpoint maps store only keys that differ from the base. Emit
        // those keys as-is (not re-diffed against the type default). An empty
        // object emits nothing. Fold-open is not inherited from tablet/phone
        // and is not turned into a width query.
        let map = node.style_breakpoints.as_ref();
        let mut tablet = breakpoint_decls(map.and_then(|m| m.tablet.as_ref()));
        let mut phone = breakpoint_decls(map.and_then(|m| m.phone.as_ref()));
        let mut fold = breakpoint_decls(map.and_then(|m| m.fold_open.as_ref()));
        // F1: a grouped child whose breakpoint sets `borderRadius` exports that as the shorthand only,
        // which would give every corner the radius again. Inside the SAME media rule, after the
        // shorthand, re-apply the corner table with the breakpoint's own radius (middle: `border-radius:0px`).
        if let Some((dir, pos)) = self.group_slots.get(node.id.as_str()).copied() {
            for (decls_bp, style) in [
                (&mut tablet, map.and_then(|m| m.tablet.as_ref())),
                (&mut phone, map.and_then(|m| m.phone.as_ref())),
                (&mut fold, map.and_then(|m| m.fold_open.as_ref())),
            ] {
                if let Some(r) = style.and_then(|s| s.border_radius) {
                    merge(decls_bp, group_corner_decls(dir, pos, r));
                }
            }
        }
        // N2: the axis rule follows the overflow in force at each breakpoint. A breakpoint that sets `overflow`
        // writes the shorthand (it resets both axes), so inside the SAME media rule, after it, the orientation's
        // axis rule is re-applied when that overflow is auto / scroll (hidden / visible need none, G1).
        if let NodeProps::ScrollArea { orientation, .. } = &node.props {
            for (decls_bp, style) in [
                (&mut tablet, map.and_then(|m| m.tablet.as_ref())),
                (&mut phone, map.and_then(|m| m.phone.as_ref())),
                (&mut fold, map.and_then(|m| m.fold_open.as_ref())),
            ] {
                if let Some(o) = style.and_then(|s| s.overflow.as_deref()) {
                    merge(decls_bp, scroll_axis_decls(*orientation, Some(o)));
                }
            }
        }
        let states = node.states.as_ref().filter(|s| !s.is_empty());
        let has_states = states.is_some();
        let has_transition = node
            .style
            .transition
            .as_ref()
            .is_some_and(|t| !t.is_unset());
        if d.is_empty() && tablet.is_empty() && phone.is_empty() && fold.is_empty() && !has_states {
            return None;
        }
        let class = format!("n{}", self.next_class);
        self.next_class += 1;
        if !d.is_empty() {
            self.node_css.push_str(&rule(&format!(".{class}"), &d));
        }
        // B3.1 §7.3: text gradient → forced-colours restore readable text (CanvasText).
        if uses_text_gradient(&eff) {
            self.text_grad_forced.push_str(&format!(
                "@media (forced-colors:active){{.{class}{{color:CanvasText;background:none}}}}"
            ));
        }
        // B7.2: state rules after the base `.nN` rule; order hover → focus-visible → active.
        if let Some(st) = states {
            self.emit_node_states(&class, node, st, &eff, has_transition);
        } else if has_transition {
            self.state_reduced.push_str(&format!(
                "@media (prefers-reduced-motion:reduce){{.{class}{{transition:none}}}}"
            ));
        }
        // B0 (§9.B P1): breakpoint rules belong to the shared generator and target the node's `data-wb-id` hook, so
        // the Vite export (base styles inline) can use the very same bytes. The generator also restates the base
        // value of every overridden key (whole shorthand family) as it stands in this output's cascade
        // (`.t-x` defaults + extras, then `.nN`), so Vite can take those keys off the inline style (PM ruling:
        // no `!important`). In the static output the restatement equals what `.t-x` / `.nN` already give.
        if !(tablet.is_empty() && phone.is_empty() && fold.is_empty()) {
            let sel = scoped_hook_selector(&page_scope_id(self.doc, self.opts), &node.id, node.id == self.doc.root);
            let fams: BTreeSet<&str> = tablet.iter().chain(phone.iter()).chain(fold.iter()).map(|(k, _)| prop_family(k)).collect();
            // B0.1 item 2: only plain kinds restate the type default; a shadcn-drawn kind restates its own keys.
            let eff_static = if RESTATE_KINDS.contains(&node.node_type) {
                let mut e = def.clone();
                merge(&mut e, type_extras(node.node_type));
                merge(&mut e, d.clone());
                e
            } else {
                // Own keys as this output renders them: the stored keys, then `.nN` (group corners, extras diffs).
                let mut e = explicit.clone();
                merge(&mut e, d.clone());
                e
            };
            let base_hook: Vec<(&'static str, String)> = eff_static.into_iter().filter(|(k, _)| fams.contains(prop_family(k))).collect();
            if !base_hook.is_empty() {
                self.hook_base.push_str(&rule(&sel, &base_hook));
            }
            if !tablet.is_empty() {
                self.bp_tablet.push_str(&rule(&sel, &tablet));
            }
            if !phone.is_empty() {
                self.bp_phone.push_str(&rule(&sel, &phone));
            }
            if !fold.is_empty() {
                self.bp_fold.push_str(&rule(&sel, &fold));
            }
            self.pending_hook = Some((class.clone(), node.id.clone()));
        }
        // B7.2 / §7.2: nodes with states carry `fx` (scopes legacy Preview press feedback in B8.3).
        if has_states {
            Some(format!("{class} fx"))
        } else {
            Some(class)
        }
    }

    /// B7.2: emit hover (inside `@media (hover:hover)`), focus-visible (focusable only), active last;
    /// reduced-motion + forced-colors fallbacks.
    fn emit_node_states(
        &mut self,
        class: &str,
        node: &Node,
        st: &NodeStates,
        base_eff: &StyleProps,
        has_transition: bool,
    ) {
        let focusable = state_focusable(node, self.opts);
        let mut transform_pseudos: Vec<&'static str> = Vec::new();

        if let Some(hover) = st.hover.as_ref().filter(|s| !s.is_empty()) {
            let d = state_decls(hover);
            if !d.is_empty() {
                let inner = rule(&format!(".{class}:hover"), &d);
                self.state_css
                    .push_str(&format!("@media (hover:hover){{{inner}}}"));
                if hover.transform.as_ref().is_some_and(|t| !t.is_unset()) {
                    transform_pseudos.push(":hover");
                }
                if uses_text_gradient(&state_as_style(hover)) {
                    self.text_grad_forced.push_str(&format!(
                        "@media (forced-colors:active){{.{class}{{color:CanvasText;background:none}}}}"
                    ));
                }
            }
        }

        if focusable {
            if let Some(fv) = st.focus_visible.as_ref().filter(|s| !s.is_empty()) {
                let d = state_decls(fv);
                if !d.is_empty() {
                    self.state_css
                        .push_str(&rule(&format!(".{class}:focus-visible"), &d));
                    if fv.transform.as_ref().is_some_and(|t| !t.is_unset()) {
                        transform_pseudos.push(":focus-visible");
                    }
                    if fv.box_shadow.as_ref().is_some_and(|layers| !layers.is_empty()) {
                        self.state_forced.push_str(&format!(
                            "@media (forced-colors:active){{.{class}:focus-visible{{outline:2px solid CanvasText}}}}"
                        ));
                    }
                    if uses_text_gradient(&state_as_style(fv)) {
                        self.text_grad_forced.push_str(&format!(
                            "@media (forced-colors:active){{.{class}{{color:CanvasText;background:none}}}}"
                        ));
                    }
                }
            }
        }

        if let Some(active) = st.active.as_ref().filter(|s| !s.is_empty()) {
            let d = state_decls(active);
            if !d.is_empty() {
                self.state_css
                    .push_str(&rule(&format!(".{class}:active"), &d));
                if active.transform.as_ref().is_some_and(|t| !t.is_unset()) {
                    transform_pseudos.push(":active");
                }
                if uses_text_gradient(&state_as_style(active)) {
                    self.text_grad_forced.push_str(&format!(
                        "@media (forced-colors:active){{.{class}{{color:CanvasText;background:none}}}}"
                    ));
                }
            }
        }

        // §7.4: nodes with transition and/or states lose transition under reduced motion; transform
        // state changes restore the base transform (or `none`). `has_transition` is informational —
        // states always emit `transition:none` (matches B9.1).
        let _ = has_transition;
        let mut reduced = format!(".{class}{{transition:none}}");
        if !transform_pseudos.is_empty() {
            let restore = base_eff
                .transform
                .as_ref()
                .and_then(transform_css)
                .unwrap_or_else(|| "none".into());
            let sels: String = transform_pseudos
                .iter()
                .map(|p| format!(".{class}{p}"))
                .collect::<Vec<_>>()
                .join(",");
            reduced.push_str(&format!("{sels}{{transform:{restore}}}"));
        }
        self.state_reduced.push_str(&format!(
            "@media (prefers-reduced-motion:reduce){{{reduced}}}"
        ));
    }

    fn open(&mut self, tag: &str, classes: &[&str], attrs: &[(&str, String)]) {
        self.body.push('<');
        self.body.push_str(tag);
        self.body.push_str(" class=\"");
        self.body.push_str(&esc(&classes.iter().filter(|c| !c.is_empty()).cloned().collect::<Vec<_>>().join(" ")));
        self.body.push('"');
        for (k, v) in attrs {
            self.body.push(' ');
            self.body.push_str(k);
            self.body.push_str("=\"");
            self.body.push_str(&esc(v));
            self.body.push('"');
        }
        // B0.1 item 3: the first element opened is the page root.
        if !self.page_attr_done {
            self.page_attr_done = true;
            self.body.push(' ');
            self.body.push_str(PAGE_ATTR);
            self.body.push_str("=\"");
            self.body.push_str(&esc(&page_scope_id(self.doc, self.opts)));
            self.body.push('"');
        }
        // B7.2: `ncls` may be `"n3 fx"` — match the bare `nN` token.
        if self.pending_hook.as_ref().is_some_and(|(c, _)| {
            classes.iter().any(|x| x == c || x.split_whitespace().any(|p| p == c.as_str()))
        }) {
            let (_, id) = self.pending_hook.take().unwrap_or_default();
            self.body.push(' ');
            self.body.push_str(HOOK_ATTR);
            self.body.push_str("=\"");
            self.body.push_str(&esc(&id));
            self.body.push('"');
        }
        self.body.push('>');
    }

    fn open_inner(&mut self, tag: &str, attrs: &[(&str, String)]) {
        self.body.push('<');
        self.body.push_str(tag);
        for (k, v) in attrs {
            self.body.push(' ');
            self.body.push_str(k);
            self.body.push_str("=\"");
            self.body.push_str(&esc(v));
            self.body.push('"');
        }
        self.body.push('>');
    }

    fn close(&mut self, tag: &str) {
        self.body.push_str("</");
        self.body.push_str(tag);
        self.body.push('>');
    }

    /// card, alert, aspectRatio, buttonGroup: a `div` with the container layout (per-kind defaults),
    /// the node's children, and for aspectRatio the `aspect-ratio` declaration.
    fn render_a2_container(&mut self, node: &Node, depth: usize, tcls: &str, attrs: Vec<(&str, String)>) {
        let t = node.node_type;
        let (d0, g0, a0, j0) = a2_layout_defaults(t).unwrap_or((Direction::Column, 0, Align::Stretch, Justify::Start));
        let (dir, gap, align, justify) = a2_layout_props(&node.props).unwrap_or((None, None, None, None));
        let want = container_layout(dir.unwrap_or(d0), gap.unwrap_or(g0), align.unwrap_or(a0), justify.unwrap_or(j0));
        let base = type_extras(t);
        let mut layout = diff(&want, &base);
        // Like container: the layout is a flex layout even if style.display says otherwise.
        if resolved_style(node).display.as_deref().is_some_and(|d| d != "flex") {
            layout.push(("display", "flex".into()));
        }
        if let NodeProps::AspectRatio { ratio, .. } = &node.props {
            layout.push(("aspect-ratio", ratio_css(*ratio).into()));
        }
        if let NodeProps::ScrollArea { orientation, .. } = &node.props {
            layout.extend(scroll_axis_decls(*orientation, resolved_style(node).overflow.as_deref()));
        }
        let ncls = self.node_class(node, layout).unwrap_or_default();
        if t == NodeType::ButtonGroup {
            let drawn: Vec<&String> = node
                .children()
                .iter()
                .filter(|id| self.doc.nodes.get(*id).is_some_and(emits_element))
                .collect();
            if drawn.len() >= 2 {
                let dir = dir.unwrap_or(d0);
                let last = drawn.len() - 1;
                for (i, id) in drawn.iter().enumerate() {
                    let pos = if i == 0 {
                        GroupPos::First
                    } else if i == last {
                        GroupPos::Last
                    } else {
                        GroupPos::Middle
                    };
                    self.group_slots.insert((*id).clone(), (dir, pos));
                }
            }
        }
        self.open("div", &[tcls, ncls.as_str()], &attrs);
        self.render_children(node, depth);
        self.close("div");
    }

    fn render_node(&mut self, node: &Node, depth: usize) {
        // Phase 11 A2.3: every A2 kind has a render arm (badge and scrollArea: part 2).
        self.used_types.insert(node.node_type as u8);
        let tcls = format!("t-{}", type_name(node.node_type));

        match &node.props {
            NodeProps::Page { .. } | NodeProps::Section { .. } => {
                let tag = if node.node_type == NodeType::Page { "div" } else { "section" };
                let ncls = self.node_class(node, vec![]).unwrap_or_default();
                self.open(tag, &[tcls.as_str(), ncls.as_str()], &[]);
                self.render_children(node, depth);
                self.close(tag);
            }
            NodeProps::Container { direction, gap, align, justify, .. } => {
                let want = container_layout(
                    direction.unwrap_or(ContainerPropDefaults::DIRECTION),
                    gap.unwrap_or(ContainerPropDefaults::GAP),
                    align.unwrap_or(ContainerPropDefaults::ALIGN),
                    justify.unwrap_or(ContainerPropDefaults::JUSTIFY),
                );
                let base = type_extras(NodeType::Container);
                let mut layout = diff(&want, &base);
                // node-view forces display:flex even if style.display says otherwise.
                if resolved_style(node).display.as_deref().is_some_and(|d| d != "flex") {
                    layout.push(("display", "flex".into()));
                }
                let ncls = self.node_class(node, layout).unwrap_or_default();
                self.open("div", &[tcls.as_str(), ncls.as_str()], &[]);
                self.render_children(node, depth);
                self.close("div");
            }
            NodeProps::Heading { level, content } => {
                let lvl = (*level).clamp(1, 6);
                self.used_levels.insert(lvl);
                let tag = format!("h{lvl}");
                let lcls = format!("t-h{lvl}");
                let ncls = self.node_class(node, vec![]).unwrap_or_default();
                self.open(&tag, &[tcls.as_str(), lcls.as_str(), ncls.as_str()], &[]);
                self.body.push_str(&esc(content));
                self.close(&tag);
            }
            NodeProps::Text { content } => {
                let ncls = self.node_class(node, vec![]).unwrap_or_default();
                self.open("p", &[tcls.as_str(), ncls.as_str()], &[]);
                self.body.push_str(&esc(content));
                self.close("p");
            }
            NodeProps::Image { src, object_fit } => self.render_image(node, src, *object_fit, &tcls),
            NodeProps::Button { label, href, action } => {
                let ncls = self.node_class(node, vec![]).unwrap_or_default();
                let linkable = !matches!(action, Some(ButtonAction::None))
                    && href.as_deref().is_some_and(|h| !h.trim().is_empty());
                // Preview: a page link (not the open page) gets the inert marker;
                // everything else stays the span it always was.
                let target = if !linkable {
                    None
                } else if self.opts.preview {
                    preview_page_marker(href.as_deref().unwrap_or(""), self.opts)
                } else {
                    Some(rewrite_page_href(href.as_deref().unwrap_or(""), &self.opts.page_paths))
                };
                if let Some(h) = target {
                    self.open("a", &[tcls.as_str(), ncls.as_str()], &[("href", h)]);
                    self.body.push_str(&esc(label));
                    self.close("a");
                } else {
                    self.open("span", &[tcls.as_str(), ncls.as_str()], &[]);
                    self.body.push_str(&esc(label));
                    self.close("span");
                }
            }
            NodeProps::Link { label, href, open_in_new_tab } => {
                let ncls = self.node_class(node, vec![]).unwrap_or_default();
                let mut attrs: Vec<(&str, String)> = Vec::new();
                if self.opts.preview {
                    // Page link (not the open page) → inert marker the parent turns
                    // into a page switch. Anything else: no href. Never a target.
                    if let Some(m) = preview_page_marker(href, self.opts) {
                        attrs.push(("href", m));
                    }
                    attrs.push(("title", href.clone()));
                } else {
                    attrs.push(("href", rewrite_page_href(href, &self.opts.page_paths)));
                    if *open_in_new_tab == Some(true) {
                        attrs.push(("target", "_blank".into()));
                        attrs.push(("rel", "noopener noreferrer".into()));
                    }
                }
                self.open("a", &[tcls.as_str(), ncls.as_str()], &attrs);
                self.body.push_str(&esc(label));
                self.close("a");
            }
            NodeProps::Spacer { size } => {
                let ncls = self
                    .node_class(node, vec![("height", px(*size as f64))])
                    .unwrap_or_default();
                self.open("div", &[tcls.as_str(), ncls.as_str()], &[("aria-hidden", "true".into())]);
                self.close("div");
            }
            NodeProps::Input {
                label,
                placeholder,
                suggestions,
            } => {
                let ncls = self.node_class(node, vec![]).unwrap_or_default();
                let mut attrs = vec![
                    ("type", "text".into()),
                    ("placeholder", placeholder.clone()),
                ];
                // Phase 11 A3.3: a parent field may inject id / aria-describedby.
                attrs.extend(self.take_control_attrs(&node.id));
                // Phase 11 A3.5: non-empty suggestions → list=dlN + <datalist id=dlN>.
                let dl_id = if suggestions.is_empty() {
                    None
                } else {
                    let id = self.uid("dl");
                    attrs.push(("list", id.clone()));
                    Some(id)
                };
                if !label.is_empty() {
                    self.body.push_str("<label>");
                    self.body.push_str(&esc(label));
                }
                self.open("input", &[tcls.as_str(), ncls.as_str()], &attrs);
                if !label.is_empty() {
                    self.body.push_str("</label>");
                }
                if let Some(id) = dl_id {
                    self.open_inner("datalist", &[("id", id)]);
                    for s in suggestions.iter().take(MAX_SELECT_OPTIONS) {
                        self.open_inner("option", &[("value", s.clone())]);
                        self.close("option");
                    }
                    self.close("datalist");
                }
            }
            NodeProps::Textarea { .. }
            | NodeProps::Kbd { .. }
            | NodeProps::Avatar { .. }
            | NodeProps::Progress { .. }
            | NodeProps::Slider { .. }
            | NodeProps::Empty { .. }
            | NodeProps::Item { .. }
            | NodeProps::Marker { .. }
            | NodeProps::Bubble { .. }
            | NodeProps::Message { .. }
            | NodeProps::Select { .. }
            | NodeProps::Radio { .. }
            | NodeProps::Toggle { .. }
            | NodeProps::ToggleGroup { .. }
            | NodeProps::Tabs { .. }
            | NodeProps::InputGroup { .. }
            | NodeProps::InputOtp { .. }
            | NodeProps::Accordion { .. }
            | NodeProps::Collapsible { .. }
            | NodeProps::Breadcrumb { .. }
            | NodeProps::Pagination { .. }
            | NodeProps::NavigationMenu { .. }
            | NodeProps::Menubar { .. }
            | NodeProps::DropdownMenu { .. }
            | NodeProps::Dialog { .. }
            | NodeProps::AlertDialog { .. }
            | NodeProps::Sheet { .. }
            | NodeProps::Drawer { .. }
            | NodeProps::Popover { .. }
            | NodeProps::Tooltip { .. }
            | NodeProps::HoverCard { .. } => self.render_v4(node),
            NodeProps::Carousel { slides_per_view, gap, direction: _, .. } => {
                // Phase 11 A5.1: `<div class="t-carousel" role="region" aria-roledescription="carousel" tabindex="0">`
                // with flex row, overflow-x:auto, scroll-snap-type:x mandatory.
                // Each drawn child is wrapped in `<div class="t-carousel__slide">` with flex/snap.
                let t = node.node_type;
                let (_, g0, _, _) = a5_layout_defaults(t).unwrap_or((Direction::Row, 16, Align::Stretch, Justify::Start));
                let (_, gap_opt, _, _) = a2_layout_props(&node.props).unwrap_or((None, None, None, None));
                let eff_gap = gap_opt.unwrap_or(g0);
                let n = slides_per_view.unwrap_or(1).clamp(1, 4);
                let basis = slide_basis(n, eff_gap);
                // Force row direction; override any column from layout props.
                let mut layout = vec![
                    ("flex-direction", "row".into()),
                    ("gap", format!("{}px", eff_gap)),
                    ("overflow-x", "auto".into()),
                    ("scroll-snap-type", "x mandatory".into()),
                ];
                // Force display flex.
                if resolved_style(node).display.as_deref().is_some_and(|d| d != "flex") {
                    layout.push(("display", "flex".into()));
                }
                let ncls = self.node_class(node, layout).unwrap_or_default();
                let mut attrs: Vec<(&str, String)> = vec![
                    ("role", "region".into()),
                    ("aria-roledescription", "carousel".into()),
                ];
                // F2.1.1 b: accessible name = trimmed layer name, else "Carousel" (same rule as Table's fallback).
                let aria = node.name.as_deref().map(str::trim).filter(|s| !s.is_empty()).unwrap_or("Carousel");
                attrs.push(("aria-label", aria.to_string()));
                // F2.1 b: an empty carousel (no drawn slide) has nothing to scroll, so it is not a Tab stop.
                let has_slides = node.children().iter().any(|c| self.doc.nodes.get(c).is_some_and(emits_element));
                if has_slides {
                    attrs.push(("tabindex", "0".into()));
                }
                self.open("div", &[tcls.as_str(), ncls.as_str()], &attrs);
                // Render children wrapped in slide divs.
                let children = node.children();
                for child_id in children {
                    if let Some(child) = self.doc.nodes.get(child_id) {
                        if !emits_element(child) {
                            continue;
                        }
                        let slide_style = format!(
                            "flex:0 0 {};scroll-snap-align:start",
                            basis
                        );
                        self.body.push_str(&format!("<div class=\"t-carousel__slide\" style=\"{}\">", slide_style));
                        self.render(child_id, depth + 1);
                        self.body.push_str("</div>");
                    }
                }
                self.close("div");
            }
            NodeProps::Checkbox { label, checked } => {
                // Phase 11 A3.1: `<label class="t-checkbox"><input type="checkbox" [checked]><span>label</span></label>`.
                // The box and the checkmark are `a3.kinds.checkbox` constants (appearance:none + a data: SVG
                // on :checked), never a style key. An empty label omits the span (G3); the input is then named
                // by the layer name (G4), else by the type label "Checkbox" (A3.1.1).
                let ncls = self.node_class(node, vec![]).unwrap_or_default();
                self.open("label", &[tcls.as_str(), ncls.as_str()], &[]);
                let mut attrs: Vec<(&str, String)> = vec![("type", "checkbox".into())];
                if *checked {
                    attrs.push(("checked", "checked".into()));
                }
                if label.trim().is_empty() {
                    // A3.1.1: no label and no layer name -> the type label "Checkbox" (G4), never unnamed.
                    let n = node.name.as_deref().map(str::trim).filter(|n| !n.is_empty()).unwrap_or("Checkbox");
                    attrs.push(("aria-label", n.to_string()));
                }
                // Phase 11 A3.3: a parent field may inject id / aria-describedby onto the input.
                attrs.extend(self.take_control_attrs(&node.id));
                self.open_inner("input", &attrs);
                if !label.trim().is_empty() {
                    self.open_inner("span", &[]);
                    self.body.push_str(&esc(label));
                    self.close("span");
                }
                self.close("label");
            }
            NodeProps::List { items, ordered, marker } => {
                // Phase 11 A4.1: `<ul|ol class="t-list t-list--{marker}">` + `<li>` text items.
                // Cap MAX_LIST_ITEMS. G5: list-style:none markers (check/none) get role="list".
                use crate::defaults::ListMarker;
                let ncls = self.node_class(node, vec![]).unwrap_or_default();
                let marker_cls = match marker {
                    ListMarker::Disc => "t-list--disc",
                    ListMarker::Decimal => "t-list--decimal",
                    ListMarker::Check => "t-list--check",
                    ListMarker::None => "t-list--none",
                };
                let tag = if *ordered || matches!(marker, ListMarker::Decimal) {
                    "ol"
                } else {
                    "ul"
                };
                let attrs: Vec<(&str, String)> = if matches!(marker, ListMarker::Check | ListMarker::None) {
                    vec![("role", "list".into())]
                } else {
                    vec![]
                };
                self.open(tag, &[tcls.as_str(), marker_cls, ncls.as_str()], &attrs);
                for item in items.iter().take(MAX_LIST_ITEMS) {
                    self.open_inner("li", &[]);
                    self.body.push_str(&esc(item));
                    self.close("li");
                }
                self.close(tag);
            }
            NodeProps::Table {
                columns,
                rows,
                caption,
                header_row,
                striped,
            } => {
                // Phase 11 A4.2: scroll wrapper + `<table class="t-table">`; caps MAX_TABLE_*.
                let cols: Vec<&str> = columns.iter().take(MAX_TABLE_COLS).map(String::as_str).collect();
                let n = cols.len();
                let aria = caption
                    .as_deref()
                    .map(str::trim)
                    .filter(|s| !s.is_empty())
                    .or_else(|| node.name.as_deref().map(str::trim).filter(|s| !s.is_empty()))
                    .unwrap_or("Table");
                let wrap_attrs = vec![
                    ("role", "region".into()),
                    ("aria-label", aria.to_string()),
                    ("tabindex", "0".into()),
                ];
                self.open("div", &["t-tablewrap"], &wrap_attrs);
                let ncls = self.node_class(node, vec![]).unwrap_or_default();
                let mut table_cls = vec![tcls.as_str(), ncls.as_str()];
                if *striped {
                    table_cls.push("t-table--striped");
                }
                self.open("table", &table_cls, &[]);
                if let Some(cap) = caption.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
                    self.open_inner("caption", &[]);
                    self.body.push_str(&esc(cap));
                    self.close("caption");
                }
                if *header_row && n > 0 {
                    self.open_inner("thead", &[]);
                    self.open_inner("tr", &[]);
                    for col in &cols {
                        self.open_inner("th", &[("scope", "col".into())]);
                        self.body.push_str(&esc(col));
                        self.close("th");
                    }
                    self.close("tr");
                    self.close("thead");
                }
                self.open_inner("tbody", &[]);
                for row in rows.iter().take(MAX_TABLE_ROWS) {
                    self.open_inner("tr", &[]);
                    for i in 0..n {
                        let cell = row.get(i).map(String::as_str).unwrap_or("");
                        self.open_inner("td", &[]);
                        self.body.push_str(&esc(cell));
                        self.close("td");
                    }
                    self.close("tr");
                }
                self.close("tbody");
                self.close("table");
                self.close("div");
            }
            NodeProps::Icon {
                name,
                label,
                size,
                stroke_width,
            } => {
                // Phase 11 A4.5: inline Lucide SVG; colour = currentColor (text colour).
                // Empty label → aria-hidden; else role=img + aria-label. Unknown name → star.
                let ncls = self.node_class(node, vec![]).unwrap_or_default();
                let px = icon_size_px(*size);
                let sw = icon_stroke(*stroke_width);
                let glyph = name.trim();
                let inner = crate::icon_paths::icon_inner(glyph)
                    .or_else(|| crate::icon_paths::icon_inner(crate::icon_paths::DEFAULT_ICON_NAME))
                    .unwrap_or("");
                let lab = label
                    .as_deref()
                    .map(str::trim)
                    .filter(|s| !s.is_empty());
                let mut attrs: Vec<(&str, String)> = vec![
                    ("xmlns", "http://www.w3.org/2000/svg".into()),
                    ("viewBox", "0 0 24 24".into()),
                    ("width", px.to_string()),
                    ("height", px.to_string()),
                    ("fill", "none".into()),
                    ("stroke", "currentColor".into()),
                    ("stroke-width", format_stroke(sw)),
                    ("stroke-linecap", "round".into()),
                    ("stroke-linejoin", "round".into()),
                ];
                if let Some(l) = lab {
                    attrs.push(("role", "img".into()));
                    attrs.push(("aria-label", l.to_string()));
                } else {
                    attrs.push(("aria-hidden", "true".into()));
                }
                // Root is the SVG itself (class on svg via open()).
                self.open("svg", &[tcls.as_str(), ncls.as_str()], &attrs);
                // Path data is author-curated trusted markup (same as spinner path).
                self.body.push_str(inner);
                self.close("svg");
            }
            NodeProps::Chart {
                kind,
                categories,
                series,
                caption,
            } => {
                // Phase 11 A5.3: static chart SVG (bar/line/area). Shared with TS chart-render.
                let ncls = self.node_class(node, vec![]).unwrap_or_default();
                let model = crate::chart_render::ChartModelIn {
                    kind: *kind,
                    categories: categories.clone(),
                    series: series
                        .iter()
                        .map(|s| crate::chart_render::ChartSeriesIn {
                            name: s.name.clone(),
                            values: s.values.clone(),
                            color: s.color.clone(),
                        })
                        .collect(),
                    caption: caption.clone(),
                };
                let svg = crate::chart_render::render_chart_svg(&model);
                // Wrap so node class / style apply around the SVG (matches canvas `.t-chart`).
                self.open("div", &["t-chart", tcls.as_str(), ncls.as_str()], &[]);
                self.body.push_str(&svg);
                self.close("div");
            }
            NodeProps::Calendar {
                year,
                month,
                selected_day,
                week_start,
                era,
            } => {
                // Phase 11 A5.5: static month grid. Shared with TS calendar-render.
                let ncls = self.node_class(node, vec![]).unwrap_or_default();
                let model = crate::calendar_render::CalendarModelIn {
                    year: *year,
                    month: *month,
                    selected_day: *selected_day,
                    week_start: *week_start,
                    era: *era,
                };
                let html = crate::calendar_render::render_calendar_html(&model);
                self.open("div", &["t-calendarwrap", tcls.as_str(), ncls.as_str()], &[]);
                self.body.push_str(&html);
                self.close("div");
            }
            NodeProps::Badge { label } => {
                let ncls = self.node_class(node, vec![]).unwrap_or_default();
                self.open("span", &[tcls.as_str(), ncls.as_str()], &[]);
                self.body.push_str(&esc(label));
                self.close("span");
            }
            NodeProps::ScrollArea { label, .. } => {
                // A focusable scroll region (spec: role=region, aria-label, tabindex=0). The name is the
                // `label` prop, else the layer name; with no name the role is left out (an unnamed
                // region is not a landmark) but the element stays keyboard-scrollable.
                let name = label
                    .as_deref()
                    .map(str::trim)
                    .filter(|n| !n.is_empty())
                    .or_else(|| node.name.as_deref().map(str::trim).filter(|n| !n.is_empty()));
                let mut attrs: Vec<(&str, String)> = vec![];
                if let Some(n) = name {
                    attrs.push(("role", "region".into()));
                    attrs.push(("aria-label", n.to_string()));
                }
                attrs.push(("tabindex", "0".into()));
                self.render_a2_container(node, depth, &tcls, attrs)
            }
            NodeProps::Card { .. } => self.render_a2_container(node, depth, &tcls, vec![]),
            NodeProps::Alert { .. } => self.render_a2_container(node, depth, &tcls, vec![("role", "note".into())]),
            NodeProps::Field { .. } => self.render_field(node, depth, &tcls),
            NodeProps::AspectRatio { .. } => self.render_a2_container(node, depth, &tcls, vec![]),
            NodeProps::ButtonGroup { .. } => {
                // role=group is named by the layer name when there is one (G4).
                let mut attrs: Vec<(&str, String)> = vec![("role", "group".into())];
                if let Some(n) = node.name.as_deref().filter(|n| !n.trim().is_empty()) {
                    attrs.push(("aria-label", n.to_string()));
                }
                self.render_a2_container(node, depth, &tcls, attrs)
            }
            NodeProps::Separator { orientation } => {
                let vertical = *orientation == LineOrientation::Vertical;
                // Vertical: width 1, stretch, from the shared file; a key the node set itself wins (G1).
                let extra = if vertical {
                    let own = decls(&node.style);
                    let mut v: Vec<(&'static str, String)> = kind_looks()
                        .a2_kinds
                        .get("separatorVertical")
                        .map_or_else(Vec::new, |k| k.extras.clone());
                    v.retain(|(k, _)| !own.iter().any(|(ok, _)| ok == k));
                    v
                } else {
                    vec![]
                };
                let ncls = self.node_class(node, extra).unwrap_or_default();
                if vertical {
                    self.open(
                        "div",
                        &[tcls.as_str(), ncls.as_str()],
                        &[("role", "separator".into()), ("aria-orientation", "vertical".into())],
                    );
                    self.close("div");
                } else {
                    self.open("hr", &[tcls.as_str(), ncls.as_str()], &[]);
                }
            }
            NodeProps::Skeleton {} => {
                let ncls = self.node_class(node, vec![]).unwrap_or_default();
                self.open("div", &[tcls.as_str(), ncls.as_str()], &[("aria-hidden", "true".into())]);
                self.close("div");
            }
            NodeProps::Spinner { size } => {
                let ncls = self.node_class(node, vec![]).unwrap_or_default();
                let l = kind_looks();
                let name = node.name.as_deref().map(str::trim).filter(|n| !n.is_empty());
                let label = name
                    .map(str::to_string)
                    .or_else(|| l.a2_texts.get("spinnerLabel").cloned())
                    .unwrap_or_default();
                let path = l.a2_texts.get("spinnerPath").cloned().unwrap_or_default();
                let n = spinner_px(*size);
                self.open(
                    "span",
                    &[tcls.as_str(), ncls.as_str()],
                    &[("role", "status".into()), ("aria-label", label)],
                );
                self.body.push_str(&format!(
                    "<svg viewBox=\"0 0 24 24\" width=\"{n}\" height=\"{n}\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\"><path d=\"{}\"/></svg>",
                    esc(&path)
                ));
                self.close("span");
            }
            NodeProps::Switch { label, checked } => {
                // Phase 11 A3.2: `<label class="t-switch"><input type="checkbox" class="sw" [checked]>
                // <span class="sw-track"><span class="sw-thumb"></span></span><span>label</span></label>`.
                // Track + thumb are `a3.kinds.switch` constants; the input is visually hidden but focusable
                // and the ring is drawn on the track. Empty label: no span; the input is named by the layer
                // name, else "Switch" (G3/G4). Stored data is unchanged (§10).
                let ncls = self.node_class(node, vec![]).unwrap_or_default();
                self.open("label", &[tcls.as_str(), ncls.as_str()], &[]);
                let mut attrs: Vec<(&str, String)> = vec![("type", "checkbox".into()), ("class", "sw".into())];
                if *checked {
                    attrs.push(("checked", "checked".into()));
                }
                if label.trim().is_empty() {
                    let n = node.name.as_deref().map(str::trim).filter(|n| !n.is_empty()).unwrap_or("Switch");
                    attrs.push(("aria-label", n.to_string()));
                }
                self.open_inner("input", &attrs);
                self.body.push_str("<span class=\"sw-track\"><span class=\"sw-thumb\"></span></span>");
                if !label.trim().is_empty() {
                    self.open_inner("span", &[]);
                    self.body.push_str(&esc(label));
                    self.close("span");
                }
                self.close("label");
            }
        }
    }


    fn asset_url(&self, raw_id: &str) -> Option<String> {
        let id = raw_id.trim();
        if id.is_empty() {
            return None;
        }
        if let Some(url) = self.opts.asset_urls.get(id) {
            return Some(url.clone());
        }
        let base = self.opts.asset_base_url.as_ref()?;
        let safe: String = id
            .chars()
            .filter(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.'))
            .collect();
        let file = match self.opts.asset_exts.get(id) {
            Some(ext)
                if !ext.is_empty()
                    && ext.chars().all(|c| c.is_ascii_alphanumeric())
                    && !safe.ends_with(&format!(".{ext}")) =>
            {
                format!("{safe}.{ext}")
            }
            _ => safe,
        };
        Some(format!("{}/{}", base.trim_end_matches('/'), file))
    }

    /// Generated id, unique inside this document and stable across runs
    /// (tabs, tooltip, field for/describedby). Never derived from user text.
    fn uid(&mut self, prefix: &str) -> String {
        let n = self.next_uid;
        self.next_uid += 1;
        format!("{prefix}{n}")
    }

    /// Phase 11 A3.3: take (and clear) any attrs a parent `field` queued for this control.
    fn take_control_attrs(&mut self, node_id: &str) -> Vec<(&'static str, String)> {
        self.control_attrs.remove(node_id).unwrap_or_default()
    }

    /// Phase 11 A3.3: `field` export — labelled form row with optional id/for/describedby pairing.
    fn render_field(&mut self, node: &Node, depth: usize, tcls: &str) {
        let (label, description, error) = match &node.props {
            NodeProps::Field {
                label,
                description,
                error,
                ..
            } => (label.clone(), description.clone(), error.clone()),
            _ => return,
        };
        let (d0, g0, a0, j0) = a3_layout_defaults(NodeType::Field).unwrap();
        let (dir, gap, align, justify) = a2_layout_props(&node.props).unwrap_or((None, None, None, None));
        let want = container_layout(dir.unwrap_or(d0), gap.unwrap_or(g0), align.unwrap_or(a0), justify.unwrap_or(j0));
        let base = type_extras(NodeType::Field);
        let mut layout = diff(&want, &base);
        if resolved_style(node).display.as_deref().is_some_and(|d| d != "flex") {
            layout.push(("display", "flex".into()));
        }
        let ncls = self.node_class(node, layout).unwrap_or_default();

        // First visible child that emits: pair when it is input / textarea / checkbox / select.
        let first_id: Option<String> = node.children().iter().find_map(|id| {
            self.doc
                .nodes
                .get(id)
                .filter(|n| emits_element(n))
                .map(|_| (*id).clone())
        });
        let pairable = first_id.as_ref().and_then(|id| self.doc.nodes.get(id)).is_some_and(|n| {
            matches!(
                n.node_type,
                NodeType::Input | NodeType::Textarea | NodeType::Checkbox | NodeType::Select
            )
        });

        let has_d = description.as_deref().is_some_and(|s| !s.trim().is_empty());
        let has_e = error.as_deref().is_some_and(|s| !s.trim().is_empty());
        let fid = if pairable { Some(self.uid("f")) } else { None };

        if let (Some(fid), Some(child_id)) = (fid.as_ref(), first_id) {
            let mut attrs: Vec<(&'static str, String)> = vec![("id", fid.clone())];
            let mut described: Vec<String> = Vec::new();
            if has_d {
                described.push(format!("{fid}-d"));
            }
            if has_e {
                described.push(format!("{fid}-e"));
            }
            if !described.is_empty() {
                attrs.push(("aria-describedby", described.join(" ")));
            }
            self.control_attrs.insert(child_id, attrs);
        }

        self.open("div", &[tcls, ncls.as_str()], &[]);
        if !label.trim().is_empty() {
            if let Some(fid) = fid.as_ref() {
                self.open_inner("label", &[("for", fid.clone())]);
                self.body.push_str(&esc(&label));
                self.close("label");
            } else {
                // Never an orphan <label> (spec): unpaired fields use a span.
                self.open_inner("span", &[("class", "t-field-label".into())]);
                self.body.push_str(&esc(&label));
                self.close("span");
            }
        }
        self.render_children(node, depth);
        if has_d {
            let desc = description.as_deref().unwrap_or("");
            let mut attrs: Vec<(&str, String)> = vec![("class", "t-field-d".into())];
            if let Some(fid) = fid.as_ref() {
                attrs.push(("id", format!("{fid}-d")));
            }
            self.open_inner("p", &attrs);
            self.body.push_str(&esc(desc));
            self.close("p");
        }
        if has_e {
            let err = error.as_deref().unwrap_or("");
            let mut attrs: Vec<(&str, String)> = vec![("class", "t-field-e".into())];
            if let Some(fid) = fid.as_ref() {
                attrs.push(("id", format!("{fid}-e")));
            }
            self.open_inner("p", &attrs);
            self.body.push_str(&esc(err));
            self.close("p");
        }
        self.close("div");
    }

    /// `<tag>text</tag>`, omitted when the text is empty (G3).
    fn text_tag(&mut self, tag: &str, text: &str) {
        if !text.trim().is_empty() {
            self.open_inner(tag, &[]);
            self.body.push_str(&esc(text));
            self.close(tag);
        }
    }

    /// Href for a list item (Preview: inert marker for page links only;
    /// export: the page-path rewrite). `None` → render a span.
    fn item_target(&self, href: &str) -> Option<String> {
        if href.trim().is_empty() {
            None
        } else if self.opts.preview {
            preview_page_marker(href, self.opts)
        } else {
            Some(rewrite_page_href(href, &self.opts.page_paths))
        }
    }

    /// Phase 6b leaves. No script. Closed dialog, sheet, and drawer emit nothing.
    fn render_v4(&mut self, node: &Node) {
        let tcls = format!("t-{}", type_name(node.node_type));
        let align_end = matches!(
            &node.props,
            NodeProps::Bubble { align: EdgeAlign::End, .. } | NodeProps::Message { align: EdgeAlign::End, .. }
        );
        // Bubble / message alignment is `margin-left:auto` only (no text-align).
        // G1: an explicit margin (including 0) wins, so `margin-left:auto` is only
        // added when the node has no margin of its own.
        let extra = if align_end && node.style.margin.is_none() {
            vec![("margin-left", "auto".into())]
        } else {
            vec![]
        };
        match &node.props {
            NodeProps::Dialog { open: false, .. }
            | NodeProps::Sheet { open: false, .. }
            | NodeProps::Drawer { open: false, .. } => return,
            _ => {}
        }
        let ncls = self.node_class(node, extra).unwrap_or_default();
        let cls: [&str; 2] = [tcls.as_str(), ncls.as_str()];
        // G4: controls with no visible label are named by the layer name.
        let name_attr: Vec<(&str, String)> = match node.name.as_deref() {
            Some(n) if !n.trim().is_empty() => vec![("aria-label", n.to_string())],
            _ => vec![],
        };
        match &node.props {
            NodeProps::Textarea { label, placeholder } => {
                if !label.is_empty() {
                    self.body.push_str("<label>");
                    self.body.push_str(&esc(label));
                }
                let mut attrs = vec![("placeholder", placeholder.clone())];
                attrs.extend(self.take_control_attrs(&node.id));
                self.open("textarea", &cls, &attrs);
                self.close("textarea");
                if !label.is_empty() {
                    self.body.push_str("</label>");
                }
            }
            NodeProps::Kbd { text } => {
                self.open("kbd", &cls, &[]);
                self.body.push_str(&esc(text));
                self.close("kbd");
            }
            NodeProps::Avatar { src, fallback } => match self.asset_url(&src.id) {
                Some(url) => {
                    let alt = src.alt.clone().unwrap_or_default();
                    self.open("img", &cls, &[("src", url), ("alt", alt)]);
                }
                None => {
                    self.open("div", &cls, &[]);
                    self.body.push_str(&esc(fallback));
                    self.close("div");
                }
            },
            NodeProps::Progress { value } => {
                let v = (*value).min(100);
                let mut attrs = vec![("value", v.to_string()), ("max", "100".into())];
                attrs.extend(name_attr);
                self.open("progress", &cls, &attrs);
                self.close("progress");
            }
            NodeProps::Slider { value, min, max, step } => {
                let min_v = min.unwrap_or(0);
                let max_v = max.unwrap_or(100).max(min_v);
                let step_v = step.unwrap_or(1).max(1);
                let v = (*value).clamp(min_v, max_v);
                let mut attrs = vec![
                    ("type", "range".into()),
                    ("min", min_v.to_string()),
                    ("max", max_v.to_string()),
                    ("step", step_v.to_string()),
                    ("value", v.to_string()),
                ];
                attrs.extend(name_attr);
                self.open("input", &cls, &attrs);
            }
            NodeProps::Empty {
                title,
                message,
                action_label,
                action_href,
            } => {
                self.open("div", &cls, &[]);
                self.text_tag("h3", title);
                self.text_tag("p", message);
                if let Some(label) = action_label {
                    if !label.trim().is_empty() {
                        let href = action_href.as_deref().unwrap_or("");
                        if let Some(h) = self.item_target(href) {
                            self.open_inner("a", &[("href", h), ("class", "act".into())]);
                            self.body.push_str(&esc(label));
                            self.close("a");
                        } else {
                            self.open_inner("span", &[("class", "act".into())]);
                            self.body.push_str(&esc(label));
                            self.close("span");
                        }
                    }
                }
                self.close("div");
            }
            NodeProps::Item { title, description } => {
                self.open("div", &cls, &[]);
                self.text_tag("h3", title);
                self.text_tag("p", description);
                self.close("div");
            }
            NodeProps::Marker { text } => {
                self.open("div", &cls, &[]);
                self.body.push_str(&esc(text));
                self.close("div");
            }
            NodeProps::Bubble { text, .. } => {
                self.open("div", &cls, &[]);
                self.body.push_str(&esc(text));
                self.close("div");
            }
            NodeProps::Message { sender, text, .. } => {
                self.open("div", &cls, &[]);
                self.text_tag("strong", sender);
                self.text_tag("p", text);
                self.close("div");
            }
            NodeProps::Select { value, options } => {
                // A3.4: at most 100 options (same cap as the T22 editor).
                let mut attrs = name_attr;
                attrs.extend(self.take_control_attrs(&node.id));
                self.open("select", &cls, &attrs);
                for opt in options.iter().take(MAX_SELECT_OPTIONS) {
                    if opt == value {
                        self.open_inner("option", &[("selected", "selected".into()), ("value", opt.clone())]);
                    } else {
                        self.open_inner("option", &[("value", opt.clone())]);
                    }
                    self.body.push_str(&esc(opt));
                    self.close("option");
                }
                self.close("select");
            }
            NodeProps::Radio { value, options } => {
                let mut attrs = vec![("role", "radiogroup".to_string())];
                attrs.extend(name_attr);
                self.open("div", &cls, &attrs);
                for opt in options {
                    self.body.push_str("<label>");
                    if opt == value {
                        self.open_inner("input", &[("type", "radio".into()), ("name", node.id.clone()), ("checked", "checked".into())]);
                    } else {
                        self.open_inner("input", &[("type", "radio".into()), ("name", node.id.clone())]);
                    }
                    self.body.push_str(&esc(opt));
                    self.body.push_str("</label>");
                }
                self.close("div");
            }
            NodeProps::Toggle { label, pressed } => {
                // Native checkbox in a label: real state, no JS, no aria-pressed.
                self.open("label", &cls, &[]);
                if *pressed {
                    self.open_inner("input", &[("type", "checkbox".into()), ("checked", "checked".into())]);
                } else {
                    self.open_inner("input", &[("type", "checkbox".into())]);
                }
                self.open_inner("span", &[]);
                self.body.push_str(&esc(label));
                self.close("span");
                self.close("label");
            }
            NodeProps::ToggleGroup { active, items } => {
                // Role radiogroup needs a name (G4); tabs have no role and get none.
                let mut attrs = vec![("role", "radiogroup".to_string())];
                attrs.extend(name_attr);
                self.open("div", &cls, &attrs);
                for (i, item) in items.iter().enumerate() {
                    self.body.push_str("<label>");
                    if i as u32 == *active {
                        self.open_inner("input", &[("type", "radio".into()), ("name", node.id.clone()), ("checked", "checked".into())]);
                    } else {
                        self.open_inner("input", &[("type", "radio".into()), ("name", node.id.clone())]);
                    }
                    self.open_inner("span", &[]);
                    self.body.push_str(&esc(item));
                    self.close("span");
                    self.body.push_str("</label>");
                }
                self.close("div");
            }
            NodeProps::Tabs { active, items } => {
                // No-JS radio strip. Inputs and labels first, panels after, so
                // `#in:checked ~ #panel` can show the chosen panel. No tab roles (G6).
                self.open("div", &cls, &[]);
                let base = self.uid("tab");
                let checked = if (*active as usize) < items.len() { *active as usize } else { 0 };
                for (i, item) in items.iter().enumerate() {
                    let mut attrs = vec![
                        ("type", "radio".to_string()),
                        ("name", node.id.clone()),
                        ("id", format!("{base}-{i}")),
                    ];
                    if i == checked {
                        attrs.push(("checked", "checked".into()));
                    }
                    self.open_inner("input", &attrs);
                    self.open_inner("label", &[("for", format!("{base}-{i}"))]);
                    self.body.push_str(&esc(&item.label));
                    self.close("label");
                }
                for (i, item) in items.iter().enumerate() {
                    self.open("div", &["p6panel"], &[("id", format!("{base}-p{i}"))]);
                    self.body.push_str(&esc(&item.text));
                    self.close("div");
                    self.dyn_css.push_str(&format!("#{base}-{i}:checked~#{base}-p{i}{{display:block}}"));
                }
                self.close("div");
            }
            NodeProps::InputGroup { prefix, placeholder, suffix } => {
                self.open("div", &cls, &[]);
                self.text_tag("span", prefix);
                let mut attrs = vec![("type", "text".to_string()), ("placeholder", placeholder.clone())];
                attrs.extend(name_attr);
                self.open_inner("input", &attrs);
                self.text_tag("span", suffix);
                self.close("div");
            }
            NodeProps::InputOtp { length, value } => {
                let n = (*length).clamp(1, 8) as usize;
                let mut attrs = vec![];
                if !name_attr.is_empty() {
                    attrs.push(("role", "group".to_string()));
                    attrs.extend(name_attr);
                }
                self.open("div", &cls, &attrs);
                for i in 0..n {
                    let ch = value.chars().nth(i).map(|c| c.to_string()).unwrap_or_default();
                    self.open_inner(
                        "input",
                        &[
                            ("type", "text".into()),
                            ("maxlength", "1".into()),
                            ("inputmode", "numeric".into()),
                            ("aria-label", format!("digit {} of {}", i + 1, n)),
                            ("value", ch),
                        ],
                    );
                }
                self.close("div");
            }
            NodeProps::Accordion { open, items } => {
                self.open("div", &cls, &[]);
                for (i, item) in items.iter().enumerate() {
                    if i as u32 == *open {
                        self.open_inner("details", &[("open", "open".into())]);
                    } else {
                        self.open_inner("details", &[]);
                    }
                    self.open_inner("summary", &[]);
                    self.body.push_str(&esc(&item.label));
                    self.close("summary");
                    self.text_tag("div", &item.text);
                    self.close("details");
                }
                self.close("div");
            }
            NodeProps::Collapsible { label, text, open } => {
                if *open {
                    self.open("details", &cls, &[("open", "open".into())]);
                } else {
                    self.open("details", &cls, &[]);
                }
                self.open_inner("summary", &[]);
                self.body.push_str(&esc(label));
                self.close("summary");
                self.text_tag("div", text);
                self.close("details");
            }
            NodeProps::Breadcrumb { items } => {
                self.open("nav", &cls, &[("aria-label", "breadcrumb".into())]);
                if !items.is_empty() {
                    self.open_inner("ol", &[("role", "list".into())]);
                    for (i, item) in items.iter().enumerate() {
                        self.open_inner("li", &[]);
                        let last = i + 1 == items.len();
                        // The current page is never a link.
                        let target = if last { None } else { self.item_target(&item.href) };
                        if let Some(h) = target {
                            self.open_inner("a", &[("href", h)]);
                            self.body.push_str(&esc(&item.label));
                            self.close("a");
                        } else if last {
                            self.open_inner("span", &[("aria-current", "page".into())]);
                            self.body.push_str(&esc(&item.label));
                            self.close("span");
                        } else {
                            self.open_inner("span", &[]);
                            self.body.push_str(&esc(&item.label));
                            self.close("span");
                        }
                        self.close("li");
                    }
                    self.close("ol");
                }
                self.close("nav");
            }
            NodeProps::NavigationMenu { items } => {
                self.open("nav", &cls, &[("aria-label", "navigation".into())]);
                if !items.is_empty() {
                    self.open_inner("ul", &[("role", "list".into())]);
                    for item in items {
                        self.open_inner("li", &[]);
                        // Preview: page items (not the open page) get the inert marker;
                        // other items become spans, so the frame never navigates to a
                        // real URL (it used to load the app's dev URL and go blank).
                        if let Some(h) = self.item_target(&item.href) {
                            self.open_inner("a", &[("href", h)]);
                            self.body.push_str(&esc(&item.label));
                            self.close("a");
                        } else {
                            self.open_inner("span", &[]);
                            self.body.push_str(&esc(&item.label));
                            self.close("span");
                        }
                        self.close("li");
                    }
                    self.close("ul");
                }
                self.close("nav");
            }
            NodeProps::Pagination { active, items } => {
                self.open("nav", &cls, &[("aria-label", "pagination".into())]);
                if !items.is_empty() {
                    self.open_inner("ul", &[("role", "list".into())]);
                    for (i, item) in items.iter().enumerate() {
                        self.open_inner("li", &[]);
                        let current = i as u32 == *active;
                        if let Some(h) = self.item_target(&item.href) {
                            let mut attrs = vec![("href", h)];
                            if current {
                                attrs.push(("aria-current", "page".into()));
                            }
                            self.open_inner("a", &attrs);
                            self.body.push_str(&esc(&item.label));
                            self.close("a");
                        } else {
                            let attrs = if current {
                                vec![("aria-current", "page".into())]
                            } else {
                                vec![]
                            };
                            self.open_inner("span", &attrs);
                            self.body.push_str(&esc(&item.label));
                            self.close("span");
                        }
                        self.close("li");
                    }
                    self.close("ul");
                }
                self.close("nav");
            }
            NodeProps::Menubar { items } => {
                // Native `details` per menu; items are links or spans. No menubar role (G6).
                self.open("div", &cls, &[]);
                for menu in items {
                    self.open_inner("details", &[]);
                    self.open_inner("summary", &[]);
                    self.body.push_str(&esc(&menu.label));
                    self.close("summary");
                    if !menu.items.is_empty() {
                        self.open_inner("div", &[]);
                        for item in &menu.items {
                            if let Some(h) = self.item_target(&item.href) {
                                self.open_inner("a", &[("href", h)]);
                                self.body.push_str(&esc(&item.label));
                                self.close("a");
                            } else if !item.label.trim().is_empty() {
                                self.open_inner("span", &[]);
                                self.body.push_str(&esc(&item.label));
                                self.close("span");
                            }
                        }
                        self.close("div");
                    }
                    self.close("details");
                }
                self.close("div");
            }
            NodeProps::DropdownMenu { label, items } => {
                self.open("details", &cls, &[]);
                self.open_inner("summary", &[]);
                self.body.push_str(&esc(summary_label(label, node)));
                self.close("summary");
                if !items.is_empty() {
                    self.open_inner("div", &[]);
                    for item in items {
                        if let Some(h) = self.item_target(&item.href) {
                            self.open_inner("a", &[("href", h)]);
                            self.body.push_str(&esc(&item.label));
                            self.close("a");
                        } else if !item.label.trim().is_empty() {
                            self.open_inner("div", &[]);
                            self.body.push_str(&esc(&item.label));
                            self.close("div");
                        }
                    }
                    self.close("div");
                }
                self.close("details");
            }
            NodeProps::Dialog { title, message, open: _ } => {
                self.open("div", &cls, &panel_role("dialog", title));
                self.text_tag("h2", title);
                self.text_tag("p", message);
                self.close("div");
            }
            NodeProps::Sheet { title, message, side, open: _ }
            | NodeProps::Drawer {
                title,
                message,
                side,
                open: _,
            } => {
                let side = match side {
                    SheetSide::Top => "top",
                    SheetSide::Right => "right",
                    SheetSide::Bottom => "bottom",
                    SheetSide::Left => "left",
                };
                let mut attrs = vec![("data-side", side.to_string())];
                attrs.extend(panel_role("dialog", title));
                self.open("div", &cls, &attrs);
                self.text_tag("h2", title);
                self.text_tag("p", message);
                self.close("div");
            }
            NodeProps::AlertDialog {
                title,
                message,
                confirm,
                cancel,
                confirm_href,
                cancel_href,
            } => {
                self.open("div", &cls, &panel_role("alertdialog", title));
                self.text_tag("h2", title);
                self.text_tag("p", message);
                if !confirm.trim().is_empty() || !cancel.trim().is_empty() {
                    self.open_inner("div", &[]);
                    if !confirm.trim().is_empty() {
                        let href = confirm_href.as_deref().unwrap_or("");
                        if let Some(h) = self.item_target(href) {
                            self.open_inner("a", &[("href", h), ("class", "ok".into())]);
                            self.body.push_str(&esc(confirm));
                            self.close("a");
                        } else {
                            self.open_inner(
                                "button",
                                &[("type", "button".into()), ("class", "ok".into())],
                            );
                            self.body.push_str(&esc(confirm));
                            self.close("button");
                        }
                    }
                    if !cancel.trim().is_empty() {
                        let href = cancel_href.as_deref().unwrap_or("");
                        if let Some(h) = self.item_target(href) {
                            self.open_inner("a", &[("href", h), ("class", "no".into())]);
                            self.body.push_str(&esc(cancel));
                            self.close("a");
                        } else {
                            self.open_inner(
                                "button",
                                &[("type", "button".into()), ("class", "no".into())],
                            );
                            self.body.push_str(&esc(cancel));
                            self.close("button");
                        }
                    }
                    self.close("div");
                }
                self.close("div");
            }
            NodeProps::Popover { label, text } => {
                self.open("details", &cls, &[]);
                self.open_inner("summary", &[]);
                self.body.push_str(&esc(summary_label(label, node)));
                self.close("summary");
                self.text_tag("div", text);
                self.close("details");
            }
            NodeProps::Tooltip { label, tip } => {
                self.open("div", &cls, &[]);
                let has_tip = !tip.trim().is_empty();
                let id = if has_tip { Some(self.uid("tip")) } else { None };
                if !label.trim().is_empty() {
                    match &id {
                        Some(id) => self.open_inner("span", &[("aria-describedby", id.clone())]),
                        None => self.open_inner("span", &[]),
                    }
                    self.body.push_str(&esc(label));
                    self.close("span");
                }
                if let Some(id) = id {
                    self.open_inner("span", &[("role", "tooltip".into()), ("id", id)]);
                    self.body.push_str(&esc(tip));
                    self.close("span");
                }
                self.close("div");
            }
            NodeProps::HoverCard { title, text } => {
                self.open("div", &cls, &[]);
                self.text_tag("h3", title);
                self.text_tag("p", text);
                self.close("div");
            }
            _ => {}
        }
    }

    fn render_image(&mut self, node: &Node, src: &AssetRef, object_fit: Option<ObjectFit>, tcls: &str) {
        let alt = src.alt.clone().unwrap_or_default();
        let id = src.id.trim();
        let resolved = if id.is_empty() {
            None
        } else if let Some(url) = self.opts.asset_urls.get(id) {
            Some(url.clone())
        } else if let Some(base) = &self.opts.asset_base_url {
            let safe: String = id
                .chars()
                .filter(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.'))
                .collect();
            let file = match self.opts.asset_exts.get(id) {
                Some(ext)
                    if !ext.is_empty()
                        && ext.chars().all(|c| c.is_ascii_alphanumeric())
                        && !safe.ends_with(&format!(".{ext}")) =>
                {
                    format!("{safe}.{ext}")
                }
                _ => safe,
            };
            Some(format!("{}/{}", base.trim_end_matches('/'), file))
        } else {
            None
        };
        match resolved {
            Some(url) => {
                let fit = object_fit.unwrap_or(DEFAULT_IMAGE_OBJECT_FIT);
                let fit = match fit {
                    ObjectFit::Cover => "cover",
                    ObjectFit::Contain => "contain",
                    ObjectFit::Fill => "fill",
                };
                let ncls = self
                    .node_class(node, vec![("object-fit", fit.into())])
                    .unwrap_or_default();
                self.open("img", &[tcls, ncls.as_str()], &[("src", url), ("alt", alt)]);
            }
            None => {
                // No asset (or no pipeline yet): placeholder, never a broken src.
                let label = if alt.is_empty() { "รูปภาพ".to_string() } else { alt };
                let ncls = self.node_class(node, vec![]).unwrap_or_default();
                self.open(
                    "div",
                    &[tcls, "ph", ncls.as_str()],
                    &[("role", "img".to_string()), ("aria-label", label.clone())],
                );
                self.body.push_str(&esc(&label));
                self.close("div");
            }
        }
    }
}

#[cfg(test)]
#[path = "compiler_tests.rs"]
mod tests;

#[cfg(test)]
#[path = "compiler_a13_tests.rs"]
mod a13_tests;

#[cfg(test)]
#[path = "compiler_a21_tests.rs"]
mod a21_tests;

#[cfg(test)]
#[path = "compiler_a22_tests.rs"]
mod a22_tests;

#[cfg(test)]
#[path = "compiler_a23_tests.rs"]
mod a23_tests;

/// Test helper shared with `db_a21_tests.rs`.
#[cfg(test)]
pub(crate) use a21_tests::norm as a21_norm;

#[cfg(test)]
#[path = "compiler_a23b_tests.rs"]
mod a23b_tests;

#[cfg(test)]
#[path = "compiler_a24_tests.rs"]
mod a24_tests;

#[cfg(test)]
#[path = "compiler_a25_tests.rs"]
mod a25_tests;

#[cfg(test)]
#[path = "compiler_a31_tests.rs"]
mod a31_tests;

#[cfg(test)]
#[path = "compiler_a32_tests.rs"]
mod a32_tests;

#[cfg(test)]
#[path = "compiler_a33_tests.rs"]
mod a33_tests;

#[cfg(test)]
#[path = "compiler_a34_tests.rs"]
mod a34_tests;

#[cfg(test)]
#[path = "compiler_a35_tests.rs"]
mod a35_tests;

#[cfg(test)]
#[path = "compiler_a41_tests.rs"]
mod a41_tests;

#[cfg(test)]
#[path = "compiler_a42_tests.rs"]
mod a42_tests;

#[cfg(test)]
#[path = "compiler_a45_tests.rs"]
mod a45_tests;

#[cfg(test)]
#[path = "compiler_a51_tests.rs"]
mod a51_tests;

#[cfg(test)]
#[path = "compiler_a53_tests.rs"]
mod a53_tests;

#[cfg(test)]
#[path = "compiler_a55_tests.rs"]
mod a55_tests;

#[cfg(test)]
#[path = "compiler_f2_tests.rs"]
mod f2_tests;

#[cfg(test)]
#[path = "compiler_b0_tests.rs"]
mod b0_tests;

#[cfg(test)]
#[path = "compiler_b1_tests.rs"]
mod b1_tests;

#[cfg(test)]
#[path = "compiler_b3_tests.rs"]
mod b3_tests;

#[cfg(test)]
#[path = "compiler_b4_tests.rs"]
mod b4_tests;

#[cfg(test)]
#[path = "compiler_b5_tests.rs"]
mod b5_tests;

#[cfg(test)]
#[path = "compiler_b6_tests.rs"]
mod b6_tests;

#[cfg(test)]
#[path = "compiler_b7_tests.rs"]
mod b7_tests;

#[cfg(test)]
#[path = "compiler_b9_tests.rs"]
mod b9_tests;
