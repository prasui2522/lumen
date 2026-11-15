//! Vite + React + TypeScript project export.
//! Packs `export-templates/vite-react` with generated `src/data/site.json`
//! and images under `public/assets/`.

use crate::compiler::CompileOptions;
use crate::defaults::{Node, NodeProps, PageDocument, ProjectPage};
use serde::Serialize;
use serde_json::{json, Map, Value};
use std::collections::HashMap;
use std::io::{Cursor, Write};
use std::path::{Path, PathBuf};
use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipWriter};

/// One zip entry for Code view (DW-M3 / PREVIEW-CODE-VIEW S3).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportListEntry {
    pub path: String,
    /// True for images / non-UTF-8 bytes (tree shows name only).
    pub binary: bool,
    /// UTF-8 text when `binary` is false and size ≤ 2 MiB; otherwise null.
    pub text: Option<String>,
    /// S4: `site.json` only — byte range `[start, end)` of each node object.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ranges: Option<HashMap<String, [usize; 2]>>,
}

const CODE_VIEW_TEXT_MAX: usize = 2 * 1024 * 1024;

fn utf8_entry(path: &str, bytes: &[u8]) -> ExportListEntry {
    if bytes.len() > CODE_VIEW_TEXT_MAX {
        return ExportListEntry {
            path: path.to_string(),
            binary: false,
            text: None,
            ranges: None,
        };
    }
    match std::str::from_utf8(bytes) {
        Ok(s) => ExportListEntry {
            path: path.to_string(),
            binary: false,
            text: Some(s.to_string()),
            ranges: None,
        },
        Err(_) => ExportListEntry {
            path: path.to_string(),
            binary: true,
            text: None,
            ranges: None,
        },
    }
}

/// Byte ranges of each `"id": "…"` node's JSON object (first occurrence, exclusive end).
pub fn node_ranges_in_json(json: &str) -> HashMap<String, [usize; 2]> {
    let mut out = HashMap::new();
    let prefix = "\"id\": \"";
    let mut from = 0;
    while let Some(rel) = json[from..].find(prefix) {
        let id_start = from + rel + prefix.len();
        let rest = &json[id_start..];
        let Some(id_end_rel) = rest.find('"') else { break };
        let id = &rest[..id_end_rel];
        let key_at = from + rel;
        if let Some(obj_start) = json[..key_at].rfind('{') {
            if let Some(obj_end) = matching_brace(json, obj_start) {
                if !id.is_empty() {
                    out.entry(id.to_string()).or_insert([obj_start, obj_end]);
                }
            }
        }
        from = id_start + id_end_rel + 1;
    }
    out
}

fn matching_brace(s: &str, start: usize) -> Option<usize> {
    let b = s.as_bytes();
    if start >= b.len() || b[start] != b'{' {
        return None;
    }
    let mut depth = 0i32;
    let mut i = start;
    let mut in_str = false;
    let mut esc = false;
    while i < b.len() {
        let c = b[i];
        if in_str {
            if esc {
                esc = false;
            } else if c == b'\\' {
                esc = true;
            } else if c == b'"' {
                in_str = false;
            }
        } else if c == b'"' {
            in_str = true;
        } else if c == b'{' {
            depth += 1;
        } else if c == b'}' {
            depth -= 1;
            if depth == 0 {
                return Some(i + 1);
            }
        }
        i += 1;
    }
    None
}

/// S2 Tier 1 Preview payload: the export's generated files as strings (same generator,
/// same bytes as the zip) plus per-id asset URLs for the sandboxed frame.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviewBundle {
    pub site_json: String,
    pub site_css: String,
    pub kinds_css: String,
    pub asset_urls: HashMap<String, String>,
}

pub fn build_preview_bundle(
    doc: &PageDocument,
    opts: &CompileOptions,
    asset_urls: HashMap<String, String>,
) -> Result<PreviewBundle, String> {
    Ok(PreviewBundle {
        site_json: build_site_json(doc, &opts.asset_exts)?,
        site_css: build_site_css(doc, opts)?,
        kinds_css: build_kinds_css(doc, opts)?,
        asset_urls,
    })
}

/// S3 A5 เปิดโฟลเดอร์: the folder to open for a written export zip. `written` is the
/// path `write_zip` returned (the destination the user chose). Rules: the zip must
/// still exist as a regular file; its folder must be an existing directory; and the
/// canonical folder must be the canonical form of the zip's own parent — a symlinked
/// zip, a `..` component or a moved file never opens anything outside the chosen
/// destination. Returns the canonical directory.
pub fn export_folder_for(written: &Path) -> Result<PathBuf, String> {
    const ERR: &str = "ยังไม่ได้ส่งออกโปรเจกต์";
    if written.as_os_str().is_empty() || !written.is_absolute() {
        return Err(ERR.into());
    }
    if written.components().any(|c| matches!(c, std::path::Component::ParentDir)) {
        return Err(ERR.into());
    }
    let meta = std::fs::symlink_metadata(written).map_err(|_| ERR.to_string())?;
    if !meta.is_file() {
        return Err(ERR.into());
    }
    let parent = written.parent().ok_or_else(|| ERR.to_string())?;
    let dir = std::fs::canonicalize(parent).map_err(|_| ERR.to_string())?;
    if !dir.is_dir() {
        return Err(ERR.into());
    }
    // The zip's real location must be inside that same directory (no symlink escape).
    let real_zip = std::fs::canonicalize(written).map_err(|_| ERR.to_string())?;
    if real_zip.parent() != Some(dir.as_path()) {
        return Err(ERR.into());
    }
    Ok(dir)
}

fn dark_mode_auto(doc: &PageDocument) -> bool {
    matches!(doc.meta.dark_mode.as_deref(), Some("auto"))
}

/// S5: token overrides only (page / text / borders / control surfaces). Not inlined when darkMode is off.
const DARK_TOKENS: &str = r#"
@media (prefers-color-scheme: dark) {
  :root:not(.light) {
    --background: #0f172a;
    --foreground: #f8fafc;
    --muted: #94a3b8;
    --border: #334155;
    --primary: #f8fafc;
    --primary-foreground: #0f172a;
  }
}
html.dark {
  --background: #0f172a;
  --foreground: #f8fafc;
  --muted: #94a3b8;
  --border: #334155;
  --primary: #f8fafc;
  --primary-foreground: #0f172a;
}
"#;

const DARK_TOGGLE_HTML: &str = r#"<div id="wb-dark-toggle" role="group" aria-label="ธีม" style="position:fixed;right:12px;bottom:12px;z-index:50;display:flex;gap:4px;padding:4px;border-radius:8px;background:var(--background);color:var(--foreground);border:1px solid var(--border);font:12px ui-sans-serif,system-ui,sans-serif">
<button type="button" data-wb-theme="system">ระบบ</button>
<button type="button" data-wb-theme="light">สว่าง</button>
<button type="button" data-wb-theme="dark">มืด</button>
</div>
<script>
(function(){
  var k="wb.export.theme";
  function apply(v){
    var d=v==="dark"||(v==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.classList.toggle("dark", d);
    document.documentElement.classList.toggle("light", v==="light");
  }
  apply(localStorage.getItem(k)||"system");
  var box=document.getElementById("wb-dark-toggle");
  box.addEventListener("click", function(e){
    var t=e.target.closest("[data-wb-theme]");
    if(!t) return;
    var v=t.getAttribute("data-wb-theme");
    localStorage.setItem(k, v);
    apply(v);
  });
})();
</script>
"#;

fn patch_index_html(bytes: &[u8], auto: bool) -> Vec<u8> {
    if !auto {
        return bytes.to_vec();
    }
    let s = String::from_utf8_lossy(bytes);
    if let Some(i) = s.rfind("</body>") {
        let mut out = String::with_capacity(s.len() + DARK_TOGGLE_HTML.len());
        out.push_str(&s[..i]);
        out.push_str(DARK_TOGGLE_HTML);
        out.push_str(&s[i..]);
        return out.into_bytes();
    }
    bytes.to_vec()
}

/// Same file set as `build_zip`, for the read-only Code view (no disk write).
pub fn build_export_listing(
    doc: &PageDocument,
    opts: &CompileOptions,
    files: &[(String, Vec<u8>)],
) -> Result<Vec<ExportListEntry>, String> {
    let mut out: Vec<ExportListEntry> = Vec::new();
    let auto = dark_mode_auto(doc);
    for (name, bytes) in template_files() {
        let owned = if name == "index.html" {
            patch_index_html(bytes, auto)
        } else {
            bytes.to_vec()
        };
        out.push(utf8_entry(name, &owned));
    }
    let site = build_site_json(doc, &opts.asset_exts)?;
    let mut site_entry = utf8_entry("src/data/site.json", site.as_bytes());
    if let Some(ref t) = site_entry.text {
        site_entry.ranges = Some(node_ranges_in_json(t));
    }
    out.push(site_entry);
    let site_css = build_site_css(doc, opts)?;
    out.push(utf8_entry("src/styles/site.css", site_css.as_bytes()));
    let kinds_css = build_kinds_css(doc, opts)?;
    out.push(utf8_entry("src/styles/kinds.css", kinds_css.as_bytes()));
    out.push(ExportListEntry {
        path: "public/assets/.keep".into(),
        binary: false,
        text: Some(String::new()),
        ranges: None,
    });
    for (name, _bytes) in files {
        let leaf = name
            .strip_prefix("assets/")
            .unwrap_or(name.as_str());
        if leaf.is_empty() || leaf.contains("..") || leaf.contains('/') || leaf.ends_with('/') {
            return Err("ชื่อไฟล์รูปในรายการส่งออกไม่ถูกต้อง".into());
        }
        out.push(ExportListEntry {
            path: format!("public/assets/{leaf}"),
            binary: true,
            text: None,
            ranges: None,
        });
    }
    if let Some(notice) = export_icon_notices(doc) {
        out.push(utf8_entry("THIRD-PARTY-NOTICES.txt", notice.as_bytes()));
    }
    out.sort_by(|a, b| a.path.cmp(&b.path));
    Ok(out)
}

fn children_mut(props: &mut NodeProps) -> Option<&mut Vec<String>> {
    match props {
        NodeProps::Page { children }
        | NodeProps::Section { children }
        | NodeProps::Container { children, .. }
        | NodeProps::Card { children, .. }
        | NodeProps::Alert { children, .. }
        | NodeProps::AspectRatio { children, .. }
        | NodeProps::ScrollArea { children, .. }
        | NodeProps::ButtonGroup { children, .. }
        | NodeProps::Field { children, .. } => Some(children),
        _ => None,
    }
}

/// Drop `visible: false` nodes (and strip their ids from parent `children`) so
/// export matches HTML compile: hidden content is not shipped.
fn scrub_invisible(nodes: &HashMap<String, Node>) -> HashMap<String, Node> {
    let hidden: std::collections::HashSet<&str> = nodes
        .iter()
        .filter(|(_, n)| n.visible == Some(false))
        .map(|(id, _)| id.as_str())
        .collect();
    let mut out: HashMap<String, Node> = nodes
        .iter()
        .filter(|(id, _)| !hidden.contains(id.as_str()))
        .map(|(id, n)| (id.clone(), n.clone()))
        .collect();
    if hidden.is_empty() {
        return out;
    }
    for node in out.values_mut() {
        if let Some(children) = children_mut(&mut node.props) {
            children.retain(|c| !hidden.contains(c.as_str()));
        }
    }
    out
}

/// Static scaffold files embedded at compile time (paths relative to zip root).
/// `src/data/site.json` is generated per document and is not listed here.
fn template_files() -> Vec<(&'static str, &'static [u8])> {
    vec![
        (
            "package.json",
            include_bytes!("../../export-templates/vite-react/package.json"),
        ),
        (
            "vite.config.ts",
            include_bytes!("../../export-templates/vite-react/vite.config.ts"),
        ),
        (
            "tsconfig.json",
            include_bytes!("../../export-templates/vite-react/tsconfig.json"),
        ),
        (
            "tsconfig.app.json",
            include_bytes!("../../export-templates/vite-react/tsconfig.app.json"),
        ),
        (
            "tsconfig.node.json",
            include_bytes!("../../export-templates/vite-react/tsconfig.node.json"),
        ),
        (
            "index.html",
            include_bytes!("../../export-templates/vite-react/index.html"),
        ),
        (
            "README.md",
            include_bytes!("../../export-templates/vite-react/README.md"),
        ),
        (
            ".env.example",
            include_bytes!("../../export-templates/vite-react/.env.example"),
        ),
        (
            "src/main.tsx",
            include_bytes!("../../export-templates/vite-react/src/main.tsx"),
        ),
        (
            "src/App.tsx",
            include_bytes!("../../export-templates/vite-react/src/App.tsx"),
        ),
        (
            "src/index.css",
            include_bytes!("../../export-templates/vite-react/src/index.css"),
        ),
        (
            "src/vite-env.d.ts",
            include_bytes!("../../export-templates/vite-react/src/vite-env.d.ts"),
        ),
        (
            "src/lib/utils.ts",
            include_bytes!("../../export-templates/vite-react/src/lib/utils.ts"),
        ),
        (
            "src/lib/style.ts",
            include_bytes!("../../export-templates/vite-react/src/lib/style.ts"),
        ),
        (
            "src/lib/safe.ts",
            include_bytes!("../../export-templates/vite-react/src/lib/safe.ts"),
        ),
        (
            "src/lib/site-types.ts",
            include_bytes!("../../export-templates/vite-react/src/lib/site-types.ts"),
        ),
        (
            "src/lib/render-node.tsx",
            include_bytes!("../../export-templates/vite-react/src/lib/render-node.tsx"),
        ),
        (
            // Phase 11 A4.5/A4.6: curated Lucide path data for exported icon nodes.
            "src/lib/icon-paths.ts",
            include_bytes!("../../export-templates/vite-react/src/lib/icon-paths.ts"),
        ),
        (
            // Phase 11 A5.3/A5.4: chart model helpers + static SVG renderer for export.
            "src/lib/chart-model.ts",
            include_bytes!("../../export-templates/vite-react/src/lib/chart-model.ts"),
        ),
        (
            "src/lib/chart-render.ts",
            include_bytes!("../../export-templates/vite-react/src/lib/chart-render.ts"),
        ),
        (
            // Phase 11 A5.5: static calendar month grid for exported calendar nodes.
            "src/lib/calendar-render.ts",
            include_bytes!("../../export-templates/vite-react/src/lib/calendar-render.ts"),
        ),
        (
            // Form↔DB AuthAdapter + Phase C Supabase (docs/FORM-DB-CRUD-SPEC.md, docs/SUPABASE.md).
            "src/lib/wb-db-runtime.ts",
            include_bytes!("../../export-templates/vite-react/src/lib/wb-db-runtime.ts"),
        ),
        (
            "src/lib/wb-db-supabase.ts",
            include_bytes!("../../export-templates/vite-react/src/lib/wb-db-supabase.ts"),
        ),
        (
            "src/lib/wb-db-client.ts",
            include_bytes!("../../export-templates/vite-react/src/lib/wb-db-client.ts"),
        ),
        (
            "src/lib/wb-db-widgets.tsx",
            include_bytes!("../../export-templates/vite-react/src/lib/wb-db-widgets.tsx"),
        ),
        (
            "src/lib/wb-db-submit.ts",
            include_bytes!("../../export-templates/vite-react/src/lib/wb-db-submit.ts"),
        ),
        (
            // Form↔DB: admin guard + export dbSubmit + dbModel hookup.
            "src/pages/SitePage.tsx",
            include_bytes!("../../export-templates/vite-react/src/pages/SitePage.tsx"),
        ),
        (
            "src/lib/site-routes.tsx",
            include_bytes!("../../export-templates/vite-react/src/lib/site-routes.tsx"),
        ),
        (
            "src/components/ui/button.tsx",
            include_bytes!("../../export-templates/vite-react/src/components/ui/button.tsx"),
        ),
        (
            "src/components/ui/dialog.tsx",
            include_bytes!("../../export-templates/vite-react/src/components/ui/dialog.tsx"),
        ),
        (
            "src/components/ui/tabs.tsx",
            include_bytes!("../../export-templates/vite-react/src/components/ui/tabs.tsx"),
        ),
    ]
}

fn pages_for_export(doc: &PageDocument) -> Vec<ProjectPage> {
    let pages = if !doc.pages.is_empty() {
        doc.pages.clone()
    } else {
        vec![ProjectPage {
            id: "home".into(),
            name: "หน้าแรก".into(),
            path: "/".into(),
            root: doc.root.clone(),
            nodes: doc.nodes.clone(),
        }]
    };
    pages
        .into_iter()
        .map(|mut p| {
            p.nodes = scrub_invisible(&p.nodes);
            p
        })
        .collect()
}

/// Same naming rules as the HTML compiler (`asset_url`): append `.<ext>` unless
/// the id already ends with that extension.
pub fn asset_file_name(id: &str, ext: Option<&str>) -> String {
    let safe: String = id
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.'))
        .collect();
    match ext {
        Some(ext)
            if !ext.is_empty()
                && ext.chars().all(|c| c.is_ascii_alphanumeric())
                && !safe.ends_with(&format!(".{ext}")) =>
        {
            format!("{safe}.{ext}")
        }
        _ => safe,
    }
}

fn asset_files_map(exts: &HashMap<String, String>) -> Map<String, Value> {
    let mut map = Map::new();
    for (id, ext) in exts {
        map.insert(id.clone(), json!(asset_file_name(id, Some(ext.as_str()))));
    }
    map
}

/// Build `src/data/site.json` for the Vite renderer.
pub fn build_site_json(doc: &PageDocument, asset_exts: &HashMap<String, String>) -> Result<String, String> {
    build_site_json_with_db(doc, asset_exts, None)
}

/// Like `build_site_json`, optionally embedding the project's `DbModel` for Form↔DB runtime.
pub fn build_site_json_with_db(
    doc: &PageDocument,
    asset_exts: &HashMap<String, String>,
    db_model: Option<&Value>,
) -> Result<String, String> {
    let pages = pages_for_export(doc);
    let mut root = Map::new();
    root.insert("version".into(), json!(1));
    root.insert(
        "meta".into(),
        serde_json::to_value(&doc.meta).map_err(|e| format!("serialize meta: {e}"))?,
    );
    // Always include pages so React Router gets every path; also keep top-level
    // root/nodes as the first page for single-page consumers.
    let home = &pages[0];
    root.insert("root".into(), json!(&home.root));
    root.insert(
        "nodes".into(),
        serde_json::to_value(&home.nodes).map_err(|e| format!("serialize nodes: {e}"))?,
    );
    root.insert(
        "pages".into(),
        serde_json::to_value(&pages).map_err(|e| format!("serialize pages: {e}"))?,
    );
    let files = asset_files_map(asset_exts);
    if !files.is_empty() {
        root.insert("assetFiles".into(), Value::Object(files));
    }
    // B0 (FOLLOWUPS 92 item 2, shared base-defaults source): the type defaults the static export puts in `.t-x`
    // (defaults.rs `default_styles`), for every kind used on any page, plus the heading sizes per level. The Vite
    // renderer lays a node's own style over these instead of keeping its own copy.
    let mut used: std::collections::BTreeMap<&'static str, Value> = std::collections::BTreeMap::new();
    for page in &pages {
        for node in page.nodes.values() {
            let name = crate::compiler::type_name(node.node_type);
            if !used.contains_key(name) {
                let d = crate::defaults::default_styles(node.node_type);
                used.insert(name, serde_json::to_value(&d).map_err(|e| format!("serialize defaults: {e}"))?);
            }
        }
    }
    root.insert("baseDefaults".into(), json!(used));
    root.insert(
        "headingFontSizes".into(),
        json!((1u8..=6).map(crate::defaults::heading_font_size).collect::<Vec<f64>>()),
    );
    if let Some(m) = db_model {
        root.insert("dbModel".into(), m.clone());
    }
    serde_json::to_string_pretty(&Value::Object(root)).map_err(|e| format!("site.json: {e}"))
}

/// R1: turn Code-view `site.json` text into a document. Drops renderer-only keys
/// (`baseDefaults`, `headingFontSizes`, `assetFiles`, `dbModel`). The file's `version` is
/// always 1; the caller keeps the open document's version.
pub fn document_from_site_json(text: &str) -> Result<PageDocument, String> {
    let mut v: Value = serde_json::from_str(text).map_err(|e| format!("JSON ไม่ถูกต้อง: {e}"))?;
    if let Some(obj) = v.as_object_mut() {
        obj.remove("baseDefaults");
        obj.remove("headingFontSizes");
        obj.remove("assetFiles");
        obj.remove("dbModel");
    } else {
        return Err("JSON ไม่ถูกต้อง: ต้องเป็นอ็อบเจกต์".into());
    }
    crate::compiler::parse_document(&v)
}

/// In-memory shape for the editor (root + nodes + pages), not the on-disk save form.
pub fn document_to_editor_json(doc: &PageDocument) -> Value {
    json!({
        "version": doc.version,
        "meta": doc.meta,
        "root": doc.root,
        "nodes": doc.nodes,
        "pages": doc.pages,
    })
}

fn zip_put(zw: &mut ZipWriter<Cursor<Vec<u8>>>, name: &str, bytes: &[u8]) -> Result<(), String> {
    let file = SimpleFileOptions::default()
        .compression_method(CompressionMethod::Deflated)
        .unix_permissions(0o644);
    let err = |e: zip::result::ZipError| format!("สร้างไฟล์ zip ไม่สำเร็จ: {e}");
    let ioerr = |e: std::io::Error| format!("สร้างไฟล์ zip ไม่สำเร็จ: {e}");
    zw.start_file(name, file).map_err(err)?;
    zw.write_all(bytes).map_err(ioerr)?;
    Ok(())
}

/// B0 (§9.B B-prelude P1): `src/styles/site.css` = the shared generator's block (`compiler::style_css`) for each
/// exported page, in page order. A one-page site gets exactly the bytes its static `styles.css` ends with.
pub fn build_site_css(doc: &PageDocument, opts: &CompileOptions) -> Result<String, String> {
    let mut out = String::new();
    for page in pages_for_export(doc) {
        let pdoc = PageDocument {
            version: doc.version,
            meta: doc.meta.clone(),
            root: page.root.clone(),
            nodes: page.nodes.clone(),
            pages: Vec::new(),
        };
        // B0.2 item 3: scope by the real ProjectPage.id (not the root node id).
        let mut o = opts.clone();
        o.page_id = Some(page.id.clone());
        out.push_str(&crate::compiler::style_css(&pdoc, &o)?);
    }
    out.push('\n');
    if dark_mode_auto(doc) {
        out.push_str(DARK_TOKENS);
    }
    Ok(out)
}

/// B0.1 item 1: `src/styles/kinds.css`, the static `.t-x` rules of the kinds the Vite template draws with the
/// static markup (switch, checkbox, spinner), once per site. Imported by `main.tsx` before `site.css`.
pub fn build_kinds_css(doc: &PageDocument, opts: &CompileOptions) -> Result<String, String> {
    let mut used = std::collections::BTreeSet::new();
    for page in pages_for_export(doc) {
        let pdoc = PageDocument { version: doc.version, meta: doc.meta.clone(), root: page.root.clone(), nodes: page.nodes.clone(), pages: Vec::new() };
        used.extend(crate::compiler::markup_kind_types(&pdoc, opts)?);
    }
    let mut out = crate::compiler::markup_kinds_css(&used);
    out.push('\n');
    Ok(out)
}

/// Build the Vite project zip in memory.
/// `files` are `(assets/<name>, bytes)` from `export_parts`; they are stored as
/// `public/assets/<name>`.
pub fn build_zip(
    doc: &PageDocument,
    opts: &CompileOptions,
    files: &[(String, Vec<u8>)],
) -> Result<Vec<u8>, String> {
    build_zip_with_db(doc, opts, files, None)
}

pub fn build_zip_with_db(
    doc: &PageDocument,
    opts: &CompileOptions,
    files: &[(String, Vec<u8>)],
    db_model: Option<&Value>,
) -> Result<Vec<u8>, String> {
    let mut zw = ZipWriter::new(Cursor::new(Vec::with_capacity(64 * 1024)));
    let err = |e: zip::result::ZipError| format!("สร้างไฟล์ zip ไม่สำเร็จ: {e}");

    let auto = dark_mode_auto(doc);
    for (name, bytes) in template_files() {
        let owned = if name == "index.html" {
            patch_index_html(bytes, auto)
        } else {
            bytes.to_vec()
        };
        zip_put(&mut zw, name, &owned)?;
    }

    let site = build_site_json_with_db(doc, &opts.asset_exts, db_model)?;
    zip_put(&mut zw, "src/data/site.json", site.as_bytes())?;
    // B0: generated per document, never a template file (imported once by `src/main.tsx`).
    let site_css = build_site_css(doc, opts)?;
    zip_put(&mut zw, "src/styles/site.css", site_css.as_bytes())?;
    // B0.1 item 1: static `.t-x` rules of the markup kinds (imported before site.css).
    let kinds_css = build_kinds_css(doc, opts)?;
    zip_put(&mut zw, "src/styles/kinds.css", kinds_css.as_bytes())?;

    zw.add_directory(
        "public/assets/",
        SimpleFileOptions::default().unix_permissions(0o755),
    )
    .map_err(err)?;
    zip_put(&mut zw, "public/assets/.keep", b"")?;

    for (name, bytes) in files {
        let leaf = name
            .strip_prefix("assets/")
            .unwrap_or(name.as_str());
        if leaf.is_empty() || leaf.contains("..") || leaf.contains('/') || leaf.ends_with('/') {
            return Err("ชื่อไฟล์รูปใน zip ไม่ถูกต้อง".into());
        }
        // Prefer the compiler naming when we know the extension for this leaf's id.
        let out_name = format!("public/assets/{leaf}");
        zip_put(&mut zw, &out_name, bytes)?;
    }

    // Phase 11 A4.6 (approved §11 D5 a): notices only when an icon node is present.
    if let Some(notice) = export_icon_notices(doc) {
        zip_put(&mut zw, "THIRD-PARTY-NOTICES.txt", notice.as_bytes())?;
    }

    Ok(zw.finish().map_err(err)?.into_inner())
}

pub(crate) fn write_rel(root: &Path, rel: &str, bytes: &[u8]) -> Result<(), String> {
    if rel.is_empty() || rel.contains("..") || rel.starts_with('/') {
        return Err("ชื่อไฟล์ในโฟลเดอร์ตัวอย่างไม่ถูกต้อง".into());
    }
    let path = root.join(rel);
    if let Some(p) = path.parent() {
        std::fs::create_dir_all(p).map_err(|e| format!("สร้างโฟลเดอร์ตัวอย่างไม่สำเร็จ: {e}"))?;
    }
    std::fs::write(&path, bytes).map_err(|e| format!("เขียนไฟล์ตัวอย่างไม่สำเร็จ: {e}"))
}

/// Same files as the zip, written to `dir` (Tier 2 workspace). Extra Preview-only
/// files (`preview-entry`, rewritten `index.html`) are added by `sidecar`.
pub fn write_export_tree(
    dir: &Path,
    doc: &PageDocument,
    opts: &CompileOptions,
    files: &[(String, Vec<u8>)],
) -> Result<(), String> {
    std::fs::create_dir_all(dir).map_err(|e| format!("สร้างโฟลเดอร์ตัวอย่างไม่สำเร็จ: {e}"))?;
    let auto = dark_mode_auto(doc);
    for (name, bytes) in template_files() {
        let owned = if name == "index.html" {
            patch_index_html(bytes, auto)
        } else {
            bytes.to_vec()
        };
        write_rel(dir, name, &owned)?;
    }
    let site = build_site_json(doc, &opts.asset_exts)?;
    write_rel(dir, "src/data/site.json", site.as_bytes())?;
    write_rel(dir, "src/styles/site.css", build_site_css(doc, opts)?.as_bytes())?;
    write_rel(dir, "src/styles/kinds.css", build_kinds_css(doc, opts)?.as_bytes())?;
    write_rel(dir, "public/assets/.keep", b"")?;
    for (name, bytes) in files {
        let leaf = name
            .strip_prefix("assets/")
            .unwrap_or(name.as_str());
        if leaf.is_empty() || leaf.contains("..") || leaf.contains('/') || leaf.ends_with('/') {
            return Err("ชื่อไฟล์รูปในโฟลเดอร์ตัวอย่างไม่ถูกต้อง".into());
        }
        write_rel(dir, &format!("public/assets/{leaf}"), bytes)?;
    }
    if let Some(notice) = export_icon_notices(doc) {
        write_rel(dir, "THIRD-PARTY-NOTICES.txt", notice.as_bytes())?;
    }
    Ok(())
}

/// R2: durable Vite folder. The template is written once. Later saves refresh
/// generated JSON/CSS/assets and leave `src/pages` and `src/lib` alone.
pub fn sync_project_site(
    dir: &Path,
    doc: &PageDocument,
    opts: &CompileOptions,
    files: &[(String, Vec<u8>)],
) -> Result<(), String> {
    if !dir.join("package.json").is_file() {
        return write_export_tree(dir, doc, opts, files);
    }
    let site = build_site_json(doc, &opts.asset_exts)?;
    write_site_json_atomic(dir, &site)?;
    if !override_contains(dir, SITE_CSS_REL) {
        write_rel(dir, SITE_CSS_REL, build_site_css(doc, opts)?.as_bytes())?;
    }
    write_rel(dir, KINDS_CSS_REL, build_kinds_css(doc, opts)?.as_bytes())?;
    for (name, bytes) in files {
        let leaf = name.strip_prefix("assets/").unwrap_or(name.as_str());
        if leaf.is_empty() || leaf.contains("..") || leaf.contains('/') {
            return Err("ชื่อไฟล์รูปในโฟลเดอร์โปรเจกต์ไม่ถูกต้อง".into());
        }
        write_rel(dir, &format!("public/assets/{leaf}"), bytes)?;
    }
    Ok(())
}

const SITE_LIST_SKIP: &[&str] = &["node_modules", ".git", "dist", "target"];
pub const SITE_CSS_REL: &str = "src/styles/site.css";
pub const KINDS_CSS_REL: &str = "src/styles/kinds.css";
const OVERRIDES_FILE: &str = ".wb-overrides.json";

pub fn read_overrides(dir: &Path) -> Vec<String> {
    let Ok(text) = std::fs::read_to_string(dir.join(OVERRIDES_FILE)) else {
        return Vec::new();
    };
    serde_json::from_str::<serde_json::Value>(&text)
        .ok()
        .and_then(|v| v.get("files").cloned())
        .and_then(|v| serde_json::from_value::<Vec<String>>(v).ok())
        .unwrap_or_default()
}

pub fn override_contains(dir: &Path, rel: &str) -> bool {
    read_overrides(dir).iter().any(|p| p == rel)
}

pub fn flag_override(dir: &Path, rel: &str) -> Result<(), String> {
    if rel.contains("..") || rel.starts_with('/') {
        return Err("ชื่อไฟล์ในโปรเจกต์ไม่ถูกต้อง".into());
    }
    let mut files = read_overrides(dir);
    if !files.iter().any(|p| p == rel) {
        files.push(rel.to_string());
    }
    let body = serde_json::json!({ "files": files });
    write_rel(dir, OVERRIDES_FILE, body.to_string().as_bytes())
}

pub fn clear_override(dir: &Path, rel: &str) -> Result<(), String> {
    let files: Vec<String> = read_overrides(dir).into_iter().filter(|p| p != rel).collect();
    let body = serde_json::json!({ "files": files });
    write_rel(dir, OVERRIDES_FILE, body.to_string().as_bytes())
}

/// R6: a folder is ours only when package name and site.json both match the export.
pub fn load_import_document(dir: &Path) -> Result<PageDocument, String> {
    // A2: the two marker files must be real files in the folder, not links to somewhere else.
    for rel in ["package.json", "src", "src/data", "src/data/site.json"] {
        if std::fs::symlink_metadata(dir.join(rel)).is_ok_and(|m| m.file_type().is_symlink()) {
            return Err("โฟลเดอร์นี้ไม่ใช่โปรเจกต์ที่ส่งออกจากแอป".into());
        }
    }
    let pkg = std::fs::read_to_string(dir.join("package.json"))
        .map_err(|_| "โฟลเดอร์นี้ไม่ใช่โปรเจกต์ที่ส่งออกจากแอป".to_string())?;
    let meta: serde_json::Value = serde_json::from_str(&pkg)
        .map_err(|_| "โฟลเดอร์นี้ไม่ใช่โปรเจกต์ที่ส่งออกจากแอป".to_string())?;
    if meta.get("name").and_then(|n| n.as_str()) != Some("exported-site") {
        return Err("โฟลเดอร์นี้ไม่ใช่โปรเจกต์ที่ส่งออกจากแอป".into());
    }
    let text = std::fs::read_to_string(dir.join("src/data/site.json"))
        .map_err(|_| "ไม่พบ src/data/site.json".to_string())?;
    document_from_site_json(&text)
}

pub fn copy_project_tree(src: &Path, dest: &Path) -> Result<(), String> {
    fn walk(src_root: &Path, dir: &Path, dest: &Path) -> Result<(), String> {
        for ent in std::fs::read_dir(dir).map_err(|e| format!("คัดลอกโปรเจกต์ไม่สำเร็จ: {e}"))? {
            let ent = ent.map_err(|e| format!("คัดลอกโปรเจกต์ไม่สำเร็จ: {e}"))?;
            let name = ent.file_name().to_string_lossy().to_string();
            if SITE_LIST_SKIP.contains(&name.as_str()) {
                continue;
            }
            let path = ent.path();
            let rel = path
                .strip_prefix(src_root)
                .map_err(|_| "ชื่อไฟล์ในโปรเจกต์ไม่ถูกต้อง".to_string())?
                .to_string_lossy()
                .replace('\\', "/");
            if rel.contains("..") {
                continue;
            }
            // A2: never follow a link out of the imported folder: `file_type()` is the entry itself
            // (lstat), so symlinks — to files or folders, inside or outside — are skipped, as are
            // sockets / fifos / devices.
            let Ok(ft) = ent.file_type() else { continue };
            if ft.is_symlink() {
                continue;
            }
            if ft.is_dir() {
                walk(src_root, &path, dest)?;
                continue;
            }
            if !ft.is_file() {
                continue;
            }
            let bytes = std::fs::read(&path).map_err(|e| format!("คัดลอกโปรเจกต์ไม่สำเร็จ: {e}"))?;
            write_rel(dest, &rel, &bytes)?;
            if let Some((_, original)) = template_files().into_iter().find(|(p, _)| *p == rel) {
                if original != bytes.as_slice() {
                    flag_override(dest, &rel)?;
                }
            }
        }
        Ok(())
    }
    walk(src, src, dest)
}

pub fn safe_rel(rel: &str) -> Result<(), String> {
    if rel.is_empty()
        || rel.contains("..")
        || rel.starts_with('/')
        || rel.split('/').any(|p| p.is_empty() || SITE_LIST_SKIP.contains(&p))
    {
        return Err("ชื่อไฟล์ในโปรเจกต์ไม่ถูกต้อง".into());
    }
    Ok(())
}

/// R3: relative files under a project folder. Skips dependency and build dirs.
pub fn list_site_tree(dir: &Path) -> Result<Vec<ExportListEntry>, String> {
    if !dir.is_dir() {
        return Err("ยังไม่มีโฟลเดอร์โปรเจกต์".into());
    }
    let mut out = Vec::new();
    fn walk(root: &Path, dir: &Path, out: &mut Vec<ExportListEntry>) -> Result<(), String> {
        let mut entries: Vec<_> = std::fs::read_dir(dir)
            .map_err(|e| format!("อ่านโฟลเดอร์โปรเจกต์ไม่สำเร็จ: {e}"))?
            .filter_map(|e| e.ok())
            .collect();
        entries.sort_by_key(|e| e.file_name());
        for ent in entries {
            let name = ent.file_name().to_string_lossy().to_string();
            if name.starts_with('.') && name != ".keep" {
                continue;
            }
            if SITE_LIST_SKIP.contains(&name.as_str()) {
                continue;
            }
            let path = ent.path();
            // A2: list the folder itself only — symlinks (and other non-regular entries) are not followed.
            let Ok(ft) = ent.file_type() else { continue };
            if ft.is_symlink() {
                continue;
            }
            if ft.is_dir() {
                walk(root, &path, out)?;
                continue;
            }
            if !ft.is_file() {
                continue;
            }
            let rel = path
                .strip_prefix(root)
                .map_err(|_| "ชื่อไฟล์ในโปรเจกต์ไม่ถูกต้อง".to_string())?
                .to_string_lossy()
                .replace('\\', "/");
            if rel.contains("..") {
                continue;
            }
            let bytes = std::fs::read(&path).map_err(|e| format!("อ่านไฟล์โปรเจกต์ไม่สำเร็จ: {e}"))?;
            out.push(utf8_entry(&rel, &bytes));
        }
        Ok(())
    }
    walk(dir, dir, &mut out)?;
    Ok(out)
}

/// After Vite preview, put `index.html` back on `src/main.tsx`.
pub fn restore_index_after_preview(dir: &Path) {
    let path = dir.join("index.html");
    let Ok(text) = std::fs::read_to_string(&path) else {
        return;
    };
    if !text.contains("preview-entry") {
        return;
    }
    if let Some((_, bytes)) = template_files().into_iter().find(|(n, _)| *n == "index.html") {
        let _ = std::fs::write(path, bytes);
    }
}

/// Atomic `site.json` rewrite for HMR (S8): tmp + fsync + rename; skip if unchanged.
pub fn write_site_json_atomic(dir: &Path, json: &str) -> Result<bool, String> {
    let dest = dir.join("src/data/site.json");
    if dest.is_file() {
        if let Ok(old) = std::fs::read(&dest) {
            if old == json.as_bytes() {
                return Ok(false);
            }
        }
    }
    if let Some(p) = dest.parent() {
        std::fs::create_dir_all(p).map_err(|e| format!("เขียน site.json ไม่สำเร็จ: {e}"))?;
    }
    let tmp = dest.with_extension("json.tmp");
    std::fs::write(&tmp, json.as_bytes()).map_err(|e| format!("เขียน site.json ไม่สำเร็จ: {e}"))?;
    if let Ok(f) = std::fs::File::open(&tmp) {
        let _ = f.sync_all();
    }
    std::fs::rename(&tmp, &dest).map_err(|e| {
        let _ = std::fs::remove_file(&tmp);
        format!("เขียน site.json ไม่สำเร็จ: {e}")
    })?;
    Ok(true)
}

/// True when any page still has a visible `icon` node after scrub.
pub fn document_has_icon(doc: &PageDocument) -> bool {
    for page in pages_for_export(doc) {
        for node in page.nodes.values() {
            if matches!(node.props, crate::defaults::NodeProps::Icon { .. }) {
                return true;
            }
        }
    }
    false
}

/// Collect curated icon `name` props used on any page (for the export notice).
fn used_icon_names(doc: &PageDocument) -> Vec<String> {
    let mut names = Vec::new();
    for page in pages_for_export(doc) {
        for node in page.nodes.values() {
            if let crate::defaults::NodeProps::Icon { name, .. } = &node.props {
                let n = name.trim();
                if !n.is_empty() && !names.iter().any(|x| x == n) {
                    names.push(n.to_string());
                }
            }
        }
    }
    names.sort();
    names
}

/// Lucide ISC + Feather MIT when the zip embeds icon path data (A4.6).
fn export_icon_notices(doc: &PageDocument) -> Option<String> {
    if !document_has_icon(doc) {
        return None;
    }
    let used = used_icon_names(doc);
    let feather: Vec<&str> = used
        .iter()
        .filter(|n| crate::icon_paths::FEATHER_DERIVED_ICON_NAMES.contains(&n.as_str()))
        .map(|s| s.as_str())
        .collect();
    let mut out = String::new();
    out.push_str("THIRD-PARTY NOTICES\n");
    out.push_str("===================\n\n");
    out.push_str("This site embeds SVG path data from Lucide Icons (https://lucide.dev).\n");
    out.push_str("Icons used: ");
    out.push_str(&used.join(", "));
    out.push_str("\n\n");
    out.push_str("Lucide — ISC License\n");
    out.push_str("--------------------\n");
    out.push_str(include_str!("../../node_modules/lucide-react/LICENSE"));
    out.push('\n');
    if !feather.is_empty() {
        out.push_str("\nFeather-derived icons used in this site (also MIT, Cole Bemis):\n");
        out.push_str(&feather.join(", "));
        out.push('\n');
    }
    Some(out)
}

/// Ensure a `.zip` extension (dialogs may return a bare name).
pub fn zip_path(dest: &Path) -> PathBuf {
    let is_zip = dest
        .extension()
        .and_then(|e| e.to_str())
        .is_some_and(|e| e.eq_ignore_ascii_case("zip"));
    if is_zip {
        dest.to_path_buf()
    } else {
        let mut s = dest.as_os_str().to_os_string();
        s.push(".zip");
        PathBuf::from(s)
    }
}

/// Write via a temp file in the same folder, then rename (no half-written zip).
pub fn write_zip(
    dest: &Path,
    doc: &PageDocument,
    opts: &CompileOptions,
    files: &[(String, Vec<u8>)],
) -> Result<PathBuf, String> {
    write_zip_with_db(dest, doc, opts, files, None)
}

pub fn write_zip_with_db(
    dest: &Path,
    doc: &PageDocument,
    opts: &CompileOptions,
    files: &[(String, Vec<u8>)],
    db_model: Option<&Value>,
) -> Result<PathBuf, String> {
    let bytes = build_zip_with_db(doc, opts, files, db_model)?;
    let dest = zip_path(dest);
    let dir = dest
        .parent()
        .filter(|p| !p.as_os_str().is_empty())
        .ok_or_else(|| "ตำแหน่งบันทึกไม่ถูกต้อง".to_string())?;
    if !dir.is_dir() {
        return Err("ไม่พบโฟลเดอร์ปลายทาง".into());
    }
    let name = dest
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or_else(|| "ชื่อไฟล์ไม่ถูกต้อง".to_string())?;
    let tmp = dir.join(format!(".{name}.{}.tmp", uuid::Uuid::new_v4().simple()));
    std::fs::write(&tmp, &bytes).map_err(|e| format!("บันทึกไฟล์ไม่สำเร็จ: {e}"))?;
    std::fs::rename(&tmp, &dest).map_err(|e| {
        let _ = std::fs::remove_file(&tmp);
        format!("บันทึกไฟล์ไม่สำเร็จ: {e}")
    })?;
    Ok(dest)
}

#[cfg(test)]
#[path = "export_tests.rs"]
mod tests;
