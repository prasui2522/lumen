//! Local image files for the image node (Phase 5).
//!
//! The page document stores `src.id` only. Bytes live in
//! `<app data>/assets/<id>.<ext>`. The `assets` table is an index
//! (`id`, `project_id`, `ext`), not a blob.
//!
//! Decode and scale happen once, in `import_image`. Open, preview,
//! device switch, and export only read the stored file.

use crate::compiler::CompileOptions;
use crate::defaults::{Node, NodeProps, PageDocument};
use rusqlite::{params, Connection};
use serde::Serialize;
use std::collections::HashSet;
use std::io::Cursor;
use std::path::{Path, PathBuf};
use uuid::Uuid;

pub const MAX_ORIGINAL_BYTES: u64 = 20 * 1024 * 1024;
pub const MAX_STORED_BYTES: u64 = 8 * 1024 * 1024;
pub const MAX_EDGE: u32 = 2560;

const ERR_TYPE: &str = "รองรับเฉพาะ jpeg, png, gif และ webp";
const ERR_ORIGINAL: &str = "ไฟล์ใหญ่เกิน 20MB";
const ERR_STORED: &str = "รูปหลังย่อแล้วยังใหญ่เกิน 8MB";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportedAsset {
    pub id: String,
    pub ext: String,
}

pub fn assets_dir(app_data_dir: &Path) -> PathBuf {
    app_data_dir.join("assets")
}

pub fn migrate_assets(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS assets (
            id TEXT PRIMARY KEY NOT NULL,
            project_id TEXT NOT NULL,
            ext TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_assets_project ON assets(project_id);",
    )
    .map_err(|e| e.to_string())
}

/// Copy the picked file once. Reject an original over 20MB. Otherwise
/// scale so the long edge is at most 2560px, and reject the result if it
/// is still over 8MB. A file already within both limits is stored as the
/// original bytes (no second encode).
pub fn import_image(
    conn: &Connection,
    assets_dir: &Path,
    project_id: &str,
    src: &Path,
) -> Result<ImportedAsset, String> {
    let exists: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM projects WHERE id = ?1",
            params![project_id],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    if exists == 0 {
        return Err(format!("Project not found: {project_id}"));
    }

    let ext = match src
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase())
        .as_deref()
    {
        Some("jpg" | "jpeg") => "jpg",
        Some("png") => "png",
        Some("gif") => "gif",
        Some("webp") => "webp",
        _ => return Err(ERR_TYPE.into()),
    };

    let len = std::fs::metadata(src).map_err(|e| format!("อ่านไฟล์รูปไม่สำเร็จ: {e}"))?.len();
    if len > MAX_ORIGINAL_BYTES {
        return Err(ERR_ORIGINAL.into());
    }

    let bytes = prepare_bytes(src, ext, len)?;
    reject_stored_len(bytes.len() as u64)?;

    let id = Uuid::new_v4().to_string();
    let path = asset_path(assets_dir, &id, ext)?;
    std::fs::create_dir_all(assets_dir).map_err(|e| format!("บันทึกรูปไม่สำเร็จ: {e}"))?;
    let tmp = assets_dir.join(format!("{id}.{ext}.tmp"));
    std::fs::write(&tmp, &bytes).map_err(|e| format!("บันทึกรูปไม่สำเร็จ: {e}"))?;
    if let Err(e) = std::fs::rename(&tmp, &path) {
        let _ = std::fs::remove_file(&tmp);
        return Err(format!("บันทึกรูปไม่สำเร็จ: {e}"));
    }
    if let Err(e) = conn.execute(
        "INSERT INTO assets (id, project_id, ext) VALUES (?1, ?2, ?3)",
        params![id, project_id, ext],
    ) {
        let _ = std::fs::remove_file(&path);
        return Err(e.to_string());
    }
    Ok(ImportedAsset { id, ext: ext.to_string() })
}


fn reject_stored_len(len: u64) -> Result<(), String> {
    if len > MAX_STORED_BYTES {
        Err(ERR_STORED.into())
    } else {
        Ok(())
    }
}

fn prepare_bytes(src: &Path, ext: &str, len: u64) -> Result<Vec<u8>, String> {
    let reader = image::ImageReader::open(src)
        .map_err(|e| format!("อ่านไฟล์รูปไม่สำเร็จ: {e}"))?
        .with_guessed_format()
        .map_err(|e| format!("อ่านไฟล์รูปไม่สำเร็จ: {e}"))?;
    let format = reader.format().ok_or_else(|| ERR_TYPE.to_string())?;
    let magic_ext = match format {
        image::ImageFormat::Jpeg => "jpg",
        image::ImageFormat::Png => "png",
        image::ImageFormat::Gif => "gif",
        image::ImageFormat::WebP => "webp",
        _ => return Err(ERR_TYPE.into()),
    };
    if magic_ext != ext {
        return Err(ERR_TYPE.into());
    }
    let (w, h) = reader.into_dimensions().map_err(|e| format!("อ่านไฟล์รูปไม่สำเร็จ: {e}"))?;
    let (nw, nh) = fit_edge(w, h, MAX_EDGE);
    if nw == w && nh == h {
        if len > MAX_STORED_BYTES {
            return Err(ERR_STORED.into());
        }
        return std::fs::read(src).map_err(|e| format!("อ่านไฟล์รูปไม่สำเร็จ: {e}"));
    }
    let img = image::ImageReader::open(src)
        .map_err(|e| format!("อ่านไฟล์รูปไม่สำเร็จ: {e}"))?
        .with_guessed_format()
        .map_err(|e| format!("อ่านไฟล์รูปไม่สำเร็จ: {e}"))?
        .decode()
        .map_err(|e| format!("อ่านไฟล์รูปไม่สำเร็จ: {e}"))?;
    let img = img.resize_exact(nw, nh, image::imageops::FilterType::Triangle);
    let img = if ext == "jpg" {
        image::DynamicImage::ImageRgb8(img.to_rgb8())
    } else {
        img
    };
    let out_format = match ext {
        "jpg" => image::ImageFormat::Jpeg,
        "png" => image::ImageFormat::Png,
        "gif" => image::ImageFormat::Gif,
        "webp" => image::ImageFormat::WebP,
        _ => return Err(ERR_TYPE.into()),
    };
    let mut buf = Cursor::new(Vec::new());
    img.write_to(&mut buf, out_format).map_err(|e| format!("ย่อรูปไม่สำเร็จ: {e}"))?;
    Ok(buf.into_inner())
}

fn fit_edge(w: u32, h: u32, max_edge: u32) -> (u32, u32) {
    let long = w.max(h);
    if long <= max_edge || long == 0 {
        return (w, h);
    }
    let scale = max_edge as f64 / long as f64;
    let nw = ((w as f64) * scale).round().max(1.0) as u32;
    let nh = ((h as f64) * scale).round().max(1.0) as u32;
    (nw, nh)
}

fn safe_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 80
        && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}

fn safe_ext(ext: &str) -> bool {
    matches!(ext, "jpg" | "png" | "gif" | "webp")
}

pub fn asset_path(dir: &Path, id: &str, ext: &str) -> Result<PathBuf, String> {
    if !safe_id(id) || !safe_ext(ext) {
        return Err("รหัสรูปไม่ถูกต้อง".into());
    }
    Ok(dir.join(format!("{id}.{ext}")))
}

/// Absolute path when the index row exists and the file is on disk.
/// `None` when the row or the file is missing (the canvas shows ไม่พบรูป).
pub fn existing_file(conn: &Connection, dir: &Path, project_id: &str, id: &str) -> Result<Option<PathBuf>, String> {
    let Some(ext) = lookup_ext(conn, project_id, id)? else {
        return Ok(None);
    };
    let path = asset_path(dir, id, &ext)?;
    if path.is_file() {
        Ok(Some(path))
    } else {
        Ok(None)
    }
}

pub fn lookup_ext(conn: &Connection, project_id: &str, id: &str) -> Result<Option<String>, String> {
    match conn.query_row(
        "SELECT ext FROM assets WHERE id = ?1 AND project_id = ?2",
        params![id, project_id],
        |r| r.get::<_, String>(0),
    ) {
        Ok(ext) => Ok(Some(ext)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

/// Non-empty `AssetRef.id` values on nodes. Image and Avatar today; any
/// future `NodeProps` arm that carries `src: AssetRef` should join this match.
/// Walks every page when `doc.pages` is non-empty; otherwise the open tree.
/// `meta.favicon` is not a node and is not consulted (no favicon UI yet).
pub fn image_ids(doc: &PageDocument) -> Vec<String> {
    let mut ids = Vec::new();
    let mut push_nodes = |nodes: &std::collections::HashMap<String, Node>| {
        for node in nodes.values() {
            let src = match &node.props {
                NodeProps::Image { src, .. } | NodeProps::Avatar { src, .. } => src,
                _ => continue,
            };
            let id = src.id.trim();
            if !id.is_empty() {
                ids.push(id.to_string());
            }
        }
    };
    if doc.pages.is_empty() {
        push_nodes(&doc.nodes);
    } else {
        for page in &doc.pages {
            push_nodes(&page.nodes);
        }
    }
    ids
}

/// Delete stored files no remaining node AssetRef references. Undo does not
/// call this. A file that fails to delete keeps its row for the next save.
/// `meta.favicon` is not a node and is not consulted.
pub fn gc_unreferenced(
    conn: &Connection,
    dir: &Path,
    project_id: &str,
    doc: &PageDocument,
) -> Result<(), String> {
    let keep: HashSet<String> = image_ids(doc).into_iter().collect();
    let mut stmt = conn
        .prepare("SELECT id, ext FROM assets WHERE project_id = ?1")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![project_id], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))
        .map_err(|e| e.to_string())?;
    let mut doomed = Vec::new();
    for row in rows {
        doomed.push(row.map_err(|e| e.to_string())?);
    }
    drop(stmt);
    for (id, ext) in doomed {
        if keep.contains(&id) {
            continue;
        }
        if let Ok(path) = asset_path(dir, &id, &ext) {
            match std::fs::remove_file(&path) {
                Ok(()) => {}
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
                Err(_) => continue,
            }
        }
        conn.execute(
            "DELETE FROM assets WHERE id = ?1 AND project_id = ?2",
            params![id, project_id],
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Preview: full Tauri asset URL per id (the path is one encoded component,
/// so it cannot be joined onto a shared base). Export: relative
/// `assets/<id>.<ext>` plus the file bytes when the file is present.
pub fn preview_options(
    conn: &Connection,
    dir: &Path,
    project_id: &str,
    doc: &PageDocument,
) -> Result<CompileOptions, String> {
    let mut opts = CompileOptions {
        preview: true,
        ..CompileOptions::default()
    };
    let ids = image_ids(doc);
    if ids.is_empty() {
        return Ok(opts);
    }
    opts.asset_base_url = Some("asset://localhost".into());
    for id in ids {
        let Some(ext) = lookup_ext(conn, project_id, &id)? else {
            continue;
        };
        opts.asset_exts.insert(id.clone(), ext.clone());
        if let Ok(path) = asset_path(dir, &id, &ext) {
            opts.asset_urls.insert(id, convert_file_src(&path));
        }
    }
    Ok(opts)
}

pub fn export_parts(
    conn: &Connection,
    dir: &Path,
    project_id: &str,
    doc: &PageDocument,
) -> Result<(CompileOptions, Vec<(String, Vec<u8>)>), String> {
    let mut opts = CompileOptions {
        preview: false,
        asset_base_url: Some("assets".into()),
        ..CompileOptions::default()
    };
    let mut files = Vec::new();
    for id in image_ids(doc) {
        let Some(ext) = lookup_ext(conn, project_id, &id)? else {
            continue;
        };
        opts.asset_exts.insert(id.clone(), ext.clone());
        let Ok(path) = asset_path(dir, &id, &ext) else {
            continue;
        };
        if let Ok(bytes) = std::fs::read(&path) {
            let file = crate::export::asset_file_name(&id, Some(&ext));
            files.push((format!("assets/{file}"), bytes));
        }
    }
    Ok((opts, files))
}

/// Same shape as Tauri's `convertFileSrc` on desktop: the whole path is one
/// `encodeURIComponent` component. Linux/macOS use `asset://localhost/`.
/// Windows uses `https://asset.localhost/`.
pub fn convert_file_src(path: &Path) -> String {
    let encoded = encode_uri_component(&path.to_string_lossy());
    if cfg!(windows) {
        format!("https://asset.localhost/{encoded}")
    } else {
        format!("asset://localhost/{encoded}")
    }
}

fn encode_uri_component(s: &str) -> String {
    let mut out = String::new();
    for b in s.bytes() {
        match b {
            b'A'..=b'Z'
            | b'a'..=b'z'
            | b'0'..=b'9'
            | b'-'
            | b'_'
            | b'.'
            | b'!'
            | b'~'
            | b'*'
            | b'\''
            | b'('
            | b')' => out.push(b as char),
            _ => out.push_str(&format!("%{b:02X}")),
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{create_project, open_db, save_project};
    use image::{ImageBuffer, Rgb};

    fn tmp() -> PathBuf {
        let d = std::env::temp_dir().join(format!("wb-assets-{}", Uuid::new_v4().simple()));
        std::fs::create_dir_all(&d).unwrap();
        d
    }

    fn setup() -> (Connection, PathBuf, String) {
        let dir = tmp();
        let conn = open_db(&dir.join("t.db")).unwrap();
        let project = create_project(&conn, "P".into()).unwrap();
        let assets = dir.join("assets");
        (conn, assets, project.id)
    }

    fn write_png(path: &Path, w: u32, h: u32) {
        let img: ImageBuffer<Rgb<u8>, _> = ImageBuffer::from_fn(w, h, |x, y| Rgb([(x % 256) as u8, (y % 256) as u8, 40]));
        img.save(path).unwrap();
    }

    #[test]
    fn small_png_is_copied_not_reencoded_and_open_does_not_touch_it() {
        let (conn, assets, pid) = setup();
        let src_dir = tmp();
        let src = src_dir.join("dot.png");
        write_png(&src, 2, 2);
        let original = std::fs::read(&src).unwrap();
        let imported = import_image(&conn, &assets, &pid, &src).unwrap();
        assert_eq!(imported.ext, "png");
        let stored = asset_path(&assets, &imported.id, "png").unwrap();
        let bytes = std::fs::read(&stored).unwrap();
        assert_eq!(bytes, original, "a file already within the caps is stored as-is");
        let before = std::fs::metadata(&stored).unwrap().modified().unwrap();
        let doc = crate::db::open_project(&conn, &pid).unwrap().document;
        let _ = doc;
        std::thread::sleep(std::time::Duration::from_millis(20));
        let after = std::fs::metadata(&stored).unwrap();
        assert_eq!(after.len(), original.len() as u64);
        assert_eq!(after.modified().unwrap(), before);
        let _ = std::fs::remove_dir_all(src_dir);
        let _ = std::fs::remove_dir_all(assets.parent().unwrap());
    }

    #[test]
    fn long_edge_is_scaled_once_to_2560() {
        let (conn, assets, pid) = setup();
        let src_dir = tmp();
        let src = src_dir.join("wide.png");
        write_png(&src, 3000, 10);
        let imported = import_image(&conn, &assets, &pid, &src).unwrap();
        let stored = asset_path(&assets, &imported.id, "png").unwrap();
        let decoded = image::ImageReader::open(&stored).unwrap().with_guessed_format().unwrap().decode().unwrap();
        assert_eq!(decoded.width(), 2560);
        assert_eq!(decoded.height(), 9);
        let _ = std::fs::remove_dir_all(src_dir);
        let _ = std::fs::remove_dir_all(assets.parent().unwrap());
    }

    #[test]
    fn rejects_over_20mb_without_a_decode_and_rejects_other_types() {
        let (conn, assets, pid) = setup();
        let src_dir = tmp();
        let big = src_dir.join("big.jpg");
        let f = std::fs::File::create(&big).unwrap();
        f.set_len(MAX_ORIGINAL_BYTES + 1).unwrap();
        let err = import_image(&conn, &assets, &pid, &big).unwrap_err();
        assert_eq!(err, ERR_ORIGINAL);
        assert!(!assets.exists() || std::fs::read_dir(&assets).unwrap().next().is_none());

        let svg = src_dir.join("x.svg");
        std::fs::write(&svg, b"<svg></svg>").unwrap();
        assert_eq!(import_image(&conn, &assets, &pid, &svg).unwrap_err(), ERR_TYPE);
        let _ = std::fs::remove_dir_all(src_dir);
        let _ = std::fs::remove_dir_all(assets.parent().unwrap());
    }

    #[test]
    fn stored_limit_rejects_just_over_8mb() {
        assert!(reject_stored_len(MAX_STORED_BYTES).is_ok());
        assert_eq!(reject_stored_len(MAX_STORED_BYTES + 1), Err(ERR_STORED.into()));
    }

    #[test]
    fn gc_drops_unreferenced_file_and_keeps_a_referenced_one() {
        let (conn, assets, pid) = setup();
        let src_dir = tmp();
        let src = src_dir.join("a.png");
        write_png(&src, 1, 1);
        let a = import_image(&conn, &assets, &pid, &src).unwrap();
        let b = import_image(&conn, &assets, &pid, &src).unwrap();
        let mut doc = crate::db::open_project(&conn, &pid).unwrap().document;
        let root = doc.root.clone();
        let mut v = serde_json::to_value(&doc).unwrap();
        v["nodes"][&root]["props"]["children"] = serde_json::json!(["i"]);
        v["nodes"]["i"] = serde_json::json!({
            "id": "i", "type": "image",
            "props": { "type": "image", "src": { "id": a.id }, "objectFit": "contain" },
            "style": {}
        });
        doc = serde_json::from_value(v).unwrap();
        save_project(&conn, &pid, None, &doc).unwrap();
        assert_eq!(crate::db::open_project(&conn, &pid).unwrap().document.version, 1);
        gc_unreferenced(&conn, &assets, &pid, &doc).unwrap();
        assert!(asset_path(&assets, &a.id, "png").unwrap().is_file());
        assert!(!asset_path(&assets, &b.id, "png").unwrap().exists());
        let left: i64 = conn
            .query_row("SELECT COUNT(*) FROM assets WHERE project_id = ?1", params![pid], |r| r.get(0))
            .unwrap();
        assert_eq!(left, 1);
        let _ = std::fs::remove_dir_all(src_dir);
        let _ = std::fs::remove_dir_all(assets.parent().unwrap());
    }

    #[test]
    fn gc_keeps_asset_referenced_only_by_avatar() {
        let (conn, assets, pid) = setup();
        let src_dir = tmp();
        let src = src_dir.join("a.png");
        write_png(&src, 1, 1);
        let a = import_image(&conn, &assets, &pid, &src).unwrap();
        let mut doc = crate::db::open_project(&conn, &pid).unwrap().document;
        let root = doc.root.clone();
        let mut v = serde_json::to_value(&doc).unwrap();
        v["nodes"][&root]["props"]["children"] = serde_json::json!(["av"]);
        v["nodes"]["av"] = serde_json::json!({
            "id": "av", "type": "avatar",
            "props": { "type": "avatar", "src": { "id": a.id }, "fallback": "A" },
            "style": {}
        });
        doc = serde_json::from_value(v).unwrap();
        // First save + GC: Avatar is the only reference.
        save_project(&conn, &pid, None, &doc).unwrap();
        gc_unreferenced(&conn, &assets, &pid, &doc).unwrap();
        assert!(
            asset_path(&assets, &a.id, "png").unwrap().is_file(),
            "Avatar AssetRef must keep the file on GC"
        );
        let left: i64 = conn
            .query_row("SELECT COUNT(*) FROM assets WHERE project_id = ?1", params![pid], |r| r.get(0))
            .unwrap();
        assert_eq!(left, 1, "assets row must remain");
        // Second save + GC: still keep it.
        save_project(&conn, &pid, None, &doc).unwrap();
        gc_unreferenced(&conn, &assets, &pid, &doc).unwrap();
        assert!(asset_path(&assets, &a.id, "png").unwrap().is_file());
        let left2: i64 = conn
            .query_row("SELECT COUNT(*) FROM assets WHERE project_id = ?1", params![pid], |r| r.get(0))
            .unwrap();
        assert_eq!(left2, 1);
        let _ = std::fs::remove_dir_all(src_dir);
        let _ = std::fs::remove_dir_all(assets.parent().unwrap());
    }

    #[test]
    fn convert_file_src_encodes_the_whole_path() {
        let url = convert_file_src(Path::new("/tmp/a b.png"));
        assert_eq!(url, "asset://localhost/%2Ftmp%2Fa%20b.png");
        assert!(!url.contains(' '));
    }

    #[test]
    fn preview_url_and_export_relative_src_differ_and_missing_file_is_omitted() {
        let (conn, assets, pid) = setup();
        let src_dir = tmp();
        let src = src_dir.join("a.jpg");
        let img: ImageBuffer<Rgb<u8>, _> = ImageBuffer::from_pixel(2, 2, Rgb([1, 2, 3]));
        img.save(&src).unwrap();
        let imported = import_image(&conn, &assets, &pid, &src).unwrap();
        assert_eq!(imported.ext, "jpg");
        let mut doc = crate::db::open_project(&conn, &pid).unwrap().document;
        let root = doc.root.clone();
        let mut v = serde_json::to_value(&doc).unwrap();
        v["nodes"][&root]["props"]["children"] = serde_json::json!(["i", "j"]);
        v["nodes"]["i"] = serde_json::json!({
            "id": "i", "type": "image",
            "props": { "type": "image", "src": { "id": imported.id }, "objectFit": "contain" },
            "style": {}
        });
        v["nodes"]["j"] = serde_json::json!({
            "id": "j", "type": "image",
            "props": { "type": "image", "src": { "id": "missing-id" }, "objectFit": "contain" },
            "style": {}
        });
        doc = serde_json::from_value(v).unwrap();

        let prev = preview_options(&conn, &assets, &pid, &doc).unwrap();
        let url = prev.asset_urls.get(&imported.id).unwrap();
        assert!(url.starts_with("asset://localhost/"), "{url}");
        assert!(url.contains(&imported.id));
        assert!(!prev.asset_urls.contains_key("missing-id"));

        let path = asset_path(&assets, &imported.id, "jpg").unwrap();
        std::fs::remove_file(&path).unwrap();
        let (opts, files) = export_parts(&conn, &assets, &pid, &doc).unwrap();
        assert!(files.is_empty(), "a missing file is omitted");
        assert_eq!(opts.asset_exts.get(&imported.id).map(String::as_str), Some("jpg"));
        assert_eq!(opts.asset_base_url.as_deref(), Some("assets"));
        let _ = std::fs::remove_dir_all(src_dir);
        let _ = std::fs::remove_dir_all(assets.parent().unwrap());
    }
}
