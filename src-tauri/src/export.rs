//! Vite + React + TypeScript project export.
//! Packs `export-templates/vite-react` with generated `src/data/site.json`
//! and images under `public/assets/`.

use crate::compiler::CompileOptions;
use crate::defaults::{Node, NodeProps, PageDocument, ProjectPage};
use serde_json::{json, Map, Value};
use std::collections::HashMap;
use std::io::{Cursor, Write};
use std::path::{Path, PathBuf};
use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipWriter};

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
            "src/pages/SitePage.tsx",
            include_bytes!("../../export-templates/vite-react/src/pages/SitePage.tsx"),
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
    serde_json::to_string_pretty(&Value::Object(root)).map_err(|e| format!("site.json: {e}"))
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

/// Build the Vite project zip in memory.
/// `files` are `(assets/<name>, bytes)` from `export_parts`; they are stored as
/// `public/assets/<name>`.
pub fn build_zip(
    doc: &PageDocument,
    opts: &CompileOptions,
    files: &[(String, Vec<u8>)],
) -> Result<Vec<u8>, String> {
    let mut zw = ZipWriter::new(Cursor::new(Vec::with_capacity(64 * 1024)));
    let err = |e: zip::result::ZipError| format!("สร้างไฟล์ zip ไม่สำเร็จ: {e}");

    for (name, bytes) in template_files() {
        zip_put(&mut zw, name, bytes)?;
    }

    let site = build_site_json(doc, &opts.asset_exts)?;
    zip_put(&mut zw, "src/data/site.json", site.as_bytes())?;

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
    let bytes = build_zip(doc, opts, files)?;
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
