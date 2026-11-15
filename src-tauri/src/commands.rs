//! Tauri command handlers: project CRUD, preview compile, export.

use crate::db::{
    create_project as db_create, delete_project as db_delete, list_projects as db_list,
    open_project as db_open, save_project_with_model as db_save, DbState, ProjectSummary, ProjectWithDocument,
};
use crate::compiler::{compile, parse_document, CompileOptions};
use crate::defaults::PageDocument;
use serde_json::Value;
use std::path::{Path, PathBuf};
use crate::testdb::{self, OpenResult, Rows, TestDbState};
use crate::testmigrate::{self, PlanResult};
use tauri::State;
use tauri_plugin_opener::OpenerExt;

/// A2 (audit Medium): a project id names exactly one folder directly under its root. Ids are UUIDs in
/// practice; anything with a separator, `..`, a leading dot, NUL or other bytes is refused before it can
/// reach the filesystem.
pub(crate) const BAD_PROJECT_ID: &str = "รหัสโปรเจกต์ไม่ถูกต้อง";

pub(crate) fn check_project_id(id: &str) -> Result<(), String> {
    let ok = !id.is_empty()
        && id.len() <= 128
        && !id.starts_with('.')
        && !id.contains("..")
        && id.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_' || b == b'.');
    if ok {
        Ok(())
    } else {
        Err(BAD_PROJECT_ID.into())
    }
}

/// A2: `root/<id>` after `check_project_id`; when the folder exists, its canonical path must still be a
/// direct child of the canonical root (a symlinked project folder pointing elsewhere is refused).
pub(crate) fn project_dir(root: &Path, id: &str) -> Result<PathBuf, String> {
    check_project_id(id)?;
    let dir = root.join(id);
    if Path::new(id).is_absolute() || dir.parent() != Some(root) {
        return Err(BAD_PROJECT_ID.into());
    }
    if std::fs::symlink_metadata(&dir).is_ok() {
        let canon_root = std::fs::canonicalize(root).map_err(|_| BAD_PROJECT_ID.to_string())?;
        let canon = std::fs::canonicalize(&dir).map_err(|_| BAD_PROJECT_ID.to_string())?;
        if canon.parent() != Some(canon_root.as_path()) {
            return Err(BAD_PROJECT_ID.into());
        }
    }
    Ok(dir)
}

#[tauri::command]
pub fn list_projects(state: State<'_, DbState>) -> Result<Vec<ProjectSummary>, String> {
    let conn = state.conn.lock().map_err(|_| "DB lock poisoned".to_string())?;
    db_list(&conn)
}

#[tauri::command]
pub fn create_project(
    state: State<'_, DbState>,
    name: String,
) -> Result<ProjectWithDocument, String> {
    let conn = state.conn.lock().map_err(|_| "DB lock poisoned".to_string())?;
    let created = db_create(&conn, name)?;
    let (opts, files) = crate::assets::export_parts(&conn, &state.assets_dir, &created.id, &created.document)?;
    drop(conn);
    crate::export::sync_project_site(
        &project_dir(&state.sites_dir, &created.id)?,
        &created.document,
        &opts,
        &files,
    )?;
    Ok(created)
}

#[tauri::command]
pub fn open_project(
    state: State<'_, DbState>,
    id: String,
) -> Result<ProjectWithDocument, String> {
    let conn = state.conn.lock().map_err(|_| "DB lock poisoned".to_string())?;
    let mut opened = db_open(&conn, &id)?;
    let (opts, files) = crate::assets::export_parts(&conn, &state.assets_dir, &id, &opened.document)?;
    drop(conn);
    let dir = project_dir(&state.sites_dir, &id)?;
    let site_path = dir.join("src/data/site.json");
    if !site_path.is_file() {
        crate::export::sync_project_site(&dir, &opened.document, &opts, &files)?;
    } else if let Ok(text) = std::fs::read_to_string(&site_path) {
        if let Ok(mut doc) = crate::export::document_from_site_json(&text) {
            doc.version = opened.document.version;
            opened.document = doc;
        }
    }
    Ok(opened)
}

#[tauri::command]
pub fn save_project(
    state: State<'_, DbState>,
    id: String,
    name: Option<String>,
    document: PageDocument,
    db_model: Option<Value>,
) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|_| "DB lock poisoned".to_string())?;
    // Phase 10: the DB model (when pending) is written in the same transaction.
    db_save(&conn, &id, name, &document, db_model.as_ref())?;
    // Next successful save drops files no remaining node AssetRef references.
    // A delete failure leaves the row so a later save can retry. Undo does not call this.
    crate::assets::gc_unreferenced(&conn, &state.assets_dir, &id, &document)?;
    let (opts, files) = crate::assets::export_parts(&conn, &state.assets_dir, &id, &document)?;
    drop(conn);
    crate::export::sync_project_site(&project_dir(&state.sites_dir, &id)?, &document, &opts, &files)?;
    Ok(())
}

/// Static HTML snapshot of a document (S10: snapshot tests / goldens only).
/// Live Preview uses `preview_bundle` (Tier 1) or the Vite sidecar (Tier 2).
#[tauri::command]
pub async fn compile_preview(
    state: State<'_, DbState>,
    document: Value,
    project_id: Option<String>,
) -> Result<String, String> {
    let page_paths = document
        .get("pagePaths")
        .and_then(|v| serde_json::from_value::<std::collections::HashMap<String, String>>(v.clone()).ok())
        .unwrap_or_default();
    // Preview page-link markers (file → `about:blank#wb-page=…`), PHASE-9-SPEC §6.
    let page_markers = document
        .get("pageMarkers")
        .and_then(|v| serde_json::from_value::<std::collections::HashMap<String, String>>(v.clone()).ok())
        .unwrap_or_default();
    let doc = parse_document(&document)?;
    let mut opts = match project_id.as_deref().filter(|id| !id.is_empty()) {
        Some(pid) => {
            let conn = state.conn.lock().map_err(|_| "DB lock poisoned".to_string())?;
            crate::assets::preview_options(&conn, &state.assets_dir, pid, &doc)?
        }
        None => CompileOptions {
            preview: true,
            ..CompileOptions::default()
        },
    };
    opts.page_paths = page_paths;
    opts.page_markers = page_markers;
    // B0.2 item 3: Preview scopes hook rules by the real ProjectPage.id (not the root node id).
    opts.page_id = document
        .get("pageId")
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string);
    compile(&doc, &opts)
}

/// Export a Vite + React + TypeScript project zip
/// (`package.json`, `src/App.tsx`, `src/data/site.json`, `public/assets/`).
///
/// `document` = the in-memory document from the editor (unsaved edits
/// included, same as Preview). When omitted, the saved document is loaded
/// from SQLite. `dest_path` comes from the save dialog; `.zip` is appended
/// when missing. Returns the written path.
#[tauri::command]
pub async fn export_project(
    state: State<'_, DbState>,
    project_id: String,
    dest_path: Option<String>,
    document: Option<Value>,
) -> Result<String, String> {
    let dest = dest_path
        .filter(|p| !p.trim().is_empty())
        .ok_or_else(|| "ไม่ได้เลือกตำแหน่งบันทึก".to_string())?;
    let doc = match document {
        Some(v) => parse_document(&v)?,
        None => {
            let conn = state.conn.lock().map_err(|_| "DB lock poisoned".to_string())?;
            db_open(&conn, &project_id)?.document
        }
    };
    let (opts, files, db_model) = {
        let conn = state.conn.lock().map_err(|_| "DB lock poisoned".to_string())?;
        let parts = crate::assets::export_parts(&conn, &state.assets_dir, &project_id, &doc)?;
        let model = crate::db::load_db_model(&conn, &project_id)?;
        (parts.0, parts.1, model)
    };
    let written = crate::export::write_zip_with_db(
        &PathBuf::from(dest),
        &doc,
        &opts,
        &files,
        db_model.as_ref(),
    )?;
    Ok(written.to_string_lossy().into_owned())
}

/// S2 Tier 1 Preview: `site.json` + generated CSS (export bytes) + asset URLs for the
/// prebuilt runtime frame. Takes the in-memory document (unsaved edits included).
#[tauri::command]
pub async fn preview_bundle(
    state: State<'_, DbState>,
    project_id: String,
    document: Value,
) -> Result<crate::export::PreviewBundle, String> {
    let doc = parse_document(&document)?;
    let (opts, urls) = {
        let conn = state.conn.lock().map_err(|_| "DB lock poisoned".to_string())?;
        crate::assets::preview_bundle_parts(&conn, &state.assets_dir, &project_id, &doc)?
    };
    crate::export::build_preview_bundle(&doc, &opts, urls)
}

/// R3: files on disk for the project folder (not `node_modules`).
#[tauri::command]
pub fn list_project_files(
    state: State<'_, DbState>,
    project_id: String,
) -> Result<Vec<crate::export::ExportListEntry>, String> {
    let dir = project_dir(&state.sites_dir, &project_id)?;
    crate::export::list_site_tree(&dir)
}

/// R3: reveal the Vite project folder in the file manager.
#[tauri::command]
pub fn open_project_folder(app: tauri::AppHandle, state: State<'_, DbState>, project_id: String) -> Result<(), String> {
    let dir = project_dir(&state.sites_dir, &project_id)?;
    if !dir.join("package.json").is_file() {
        return Err("ยังไม่มีโฟลเดอร์โปรเจกต์ — บันทึกก่อน".into());
    }
    let canon = std::fs::canonicalize(&dir).map_err(|_| "เปิดโฟลเดอร์โปรเจกต์ไม่สำเร็จ".to_string())?;
    let root = std::fs::canonicalize(&state.sites_dir).unwrap_or(state.sites_dir.clone());
    if !canon.starts_with(&root) {
        return Err("เปิดโฟลเดอร์โปรเจกต์ไม่สำเร็จ".into());
    }
    app.opener()
        .open_path(canon.to_string_lossy().as_ref(), None::<&str>)
        .map_err(|e| format!("เปิดโฟลเดอร์โปรเจกต์ไม่สำเร็จ: {e}"))
}

/// R5: write a project file other than generated `kinds.css` / `site.json` and flag the override.
#[tauri::command]
pub fn write_project_file(
    state: State<'_, DbState>,
    project_id: String,
    path: String,
    text: String,
) -> Result<(), String> {
    crate::export::safe_rel(&path)?;
    if path == crate::export::KINDS_CSS_REL || path == "src/data/site.json" {
        return Err("ไฟล์นี้สร้างจากข้อมูลหน้า — แก้ที่ผืนผ้าหรือ site.json".into());
    }
    let dir = project_dir(&state.sites_dir, &project_id)?;
    if !dir.join("package.json").is_file() {
        return Err("ยังไม่มีโฟลเดอร์โปรเจกต์ — บันทึกก่อน".into());
    }
    crate::export::write_rel(&dir, &path, text.as_bytes())?;
    crate::export::flag_override(&dir, &path)
}

#[tauri::command]
pub fn list_project_overrides(state: State<'_, DbState>, project_id: String) -> Result<Vec<String>, String> {
    Ok(crate::export::read_overrides(&project_dir(&state.sites_dir, &project_id)?))
}

/// R5: drop the hand-edit flag and write `site.css` from the document again.
#[tauri::command]
pub fn regenerate_site_css(
    state: State<'_, DbState>,
    project_id: String,
    document: PageDocument,
) -> Result<(), String> {
    let dir = project_dir(&state.sites_dir, &project_id)?;
    let conn = state.conn.lock().map_err(|_| "DB lock poisoned".to_string())?;
    let (opts, _) = crate::assets::export_parts(&conn, &state.assets_dir, &project_id, &document)?;
    drop(conn);
    crate::export::clear_override(&dir, crate::export::SITE_CSS_REL)?;
    let css = crate::export::build_site_css(&document, &opts)?;
    crate::export::write_rel(&dir, crate::export::SITE_CSS_REL, css.as_bytes())
}

fn adopt_import(state: &DbState, name: String, src: &Path) -> Result<ProjectWithDocument, String> {
    let doc = crate::export::load_import_document(src)?;
    let conn = state.conn.lock().map_err(|_| "DB lock poisoned".to_string())?;
    let mut created = db_create(&conn, name)?;
    created.document = doc.clone();
    db_save(&conn, &created.id, None, &doc, None)?;
    drop(conn);
    let dest = project_dir(&state.sites_dir, &created.id)?;
    if let Err(e) = crate::export::copy_project_tree(src, &dest) {
        if let Ok(conn) = state.conn.lock() {
            let _ = db_delete(&conn, &created.id);
        }
        let _ = std::fs::remove_dir_all(&dest);
        return Err(e);
    }
    Ok(created)
}

/// R6: open a Vite folder that this app exported.
#[tauri::command]
pub fn import_project_folder(
    state: State<'_, DbState>,
    name: String,
    folder: String,
) -> Result<ProjectWithDocument, String> {
    let src = PathBuf::from(&folder);
    let canon = std::fs::canonicalize(&src).map_err(|_| "เปิดโฟลเดอร์ไม่สำเร็จ".to_string())?;
    adopt_import(&state, name, &canon)
}

/// A3 item 5: zip-bomb limits for `import_project_zip`. Checked against the central directory first, then
/// enforced again on the bytes actually inflated (a lying header cannot get past the real count).
#[derive(Clone, Copy, Debug)]
pub(crate) struct ZipLimits {
    pub entries: usize,
    pub entry_bytes: u64,
    pub total_bytes: u64,
}

pub(crate) const ZIP_LIMITS: ZipLimits = ZipLimits {
    entries: 5_000,
    entry_bytes: 64 * 1024 * 1024,
    total_bytes: 256 * 1024 * 1024,
};

pub(crate) const ZIP_TOO_MANY: &str = "ไฟล์ zip มีไฟล์มากเกินไป (เกิน 5,000 ไฟล์)";
pub(crate) const ZIP_ENTRY_TOO_BIG: &str = "ไฟล์ zip มีไฟล์ที่ใหญ่เกินไป (เกิน 64 MB ต่อไฟล์เมื่อแตกออก)";
pub(crate) const ZIP_TOTAL_TOO_BIG: &str = "ไฟล์ zip ใหญ่เกินไป (รวมเกิน 256 MB เมื่อแตกออก)";

/// A3 item 5: extract `archive` into `dest` within `lim`. Entries without a safe enclosed name and symlink
/// entries are skipped; the caller removes `dest` on error.
pub(crate) fn unzip_bounded<R: std::io::Read + std::io::Seek>(
    archive: &mut zip::ZipArchive<R>,
    dest: &Path,
    lim: ZipLimits,
) -> Result<(), String> {
    use std::io::Read as _;
    if archive.len() > lim.entries {
        return Err(ZIP_TOO_MANY.into());
    }
    // Declared sizes first: refuse before writing anything.
    let mut declared: u64 = 0;
    for i in 0..archive.len() {
        let f = archive.by_index_raw(i).map_err(|_| "ไฟล์ zip ใช้ไม่ได้".to_string())?;
        if f.size() > lim.entry_bytes {
            return Err(ZIP_ENTRY_TOO_BIG.into());
        }
        declared = declared.saturating_add(f.size());
        if declared > lim.total_bytes {
            return Err(ZIP_TOTAL_TOO_BIG.into());
        }
    }
    let mut written: u64 = 0;
    for i in 0..archive.len() {
        let file = archive.by_index(i).map_err(|_| "ไฟล์ zip ใช้ไม่ได้".to_string())?;
        let Some(rel) = file.enclosed_name() else {
            continue;
        };
        if file.is_symlink() {
            continue;
        }
        let out = dest.join(&rel);
        if file.is_dir() {
            std::fs::create_dir_all(&out).map_err(|e| e.to_string())?;
            continue;
        }
        if let Some(parent) = out.parent() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        let mut sink = std::fs::File::create(&out).map_err(|e| e.to_string())?;
        // Read at most one byte past the per-entry cap so an under-declared entry is caught.
        let n = std::io::copy(&mut file.take(lim.entry_bytes + 1), &mut sink).map_err(|e| e.to_string())?;
        if n > lim.entry_bytes {
            return Err(ZIP_ENTRY_TOO_BIG.into());
        }
        written = written.saturating_add(n);
        if written > lim.total_bytes {
            return Err(ZIP_TOTAL_TOO_BIG.into());
        }
    }
    Ok(())
}

/// R6: unzip, then the same path as opening a folder. Bad JSON does not create a project.
/// A3 item 5: bounded extraction; the temp folder is removed on every path (also on errors).
#[tauri::command]
pub fn import_project_zip(
    state: State<'_, DbState>,
    name: String,
    zip_path: String,
) -> Result<ProjectWithDocument, String> {
    let zip_file = std::fs::File::open(&zip_path).map_err(|_| "เปิดไฟล์ zip ไม่สำเร็จ".to_string())?;
    let mut archive = zip::ZipArchive::new(zip_file).map_err(|_| "ไฟล์ zip ใช้ไม่ได้".to_string())?;
    let tmp = std::env::temp_dir().join(format!("wb-import-{}", uuid::Uuid::new_v4().simple()));
    std::fs::create_dir_all(&tmp).map_err(|e| e.to_string())?;
    let result = unzip_bounded(&mut archive, &tmp, ZIP_LIMITS).and_then(|()| adopt_import(&state, name, &tmp));
    let _ = std::fs::remove_dir_all(&tmp);
    result
}

/// R1: validate Code-view `site.json` after stripping renderer-only keys.
#[tauri::command]
pub fn parse_site_json(text: String) -> Result<Value, String> {
    let doc = crate::export::document_from_site_json(&text)?;
    Ok(crate::export::document_to_editor_json(&doc))
}

/// DW-M3: zip file list + text bodies for the read-only Code view (no disk write).
#[tauri::command]
pub async fn list_export_files(
    state: State<'_, DbState>,
    project_id: String,
    document: Option<Value>,
) -> Result<Vec<crate::export::ExportListEntry>, String> {
    let doc = match document {
        Some(v) => parse_document(&v)?,
        None => {
            let conn = state.conn.lock().map_err(|_| "DB lock poisoned".to_string())?;
            db_open(&conn, &project_id)?.document
        }
    };
    let (opts, files) = {
        let conn = state.conn.lock().map_err(|_| "DB lock poisoned".to_string())?;
        crate::assets::export_parts(&conn, &state.assets_dir, &project_id, &doc)?
    };
    crate::export::build_export_listing(&doc, &opts, &files)
}

/// S3 A5: open the folder that contains the last exported zip, after validating
/// it is still the chosen destination (no `..`, no symlink escape).
#[tauri::command]
pub fn open_export_folder(app: tauri::AppHandle, dest_path: String) -> Result<(), String> {
    let folder = crate::export::export_folder_for(Path::new(&dest_path))?;
    app.opener()
        .open_path(folder.to_string_lossy().as_ref(), None::<&str>)
        .map_err(|e| format!("เปิดโฟลเดอร์ไม่สำเร็จ: {e}"))
}

/// Copy a picked image into app-data assets and return its id. Does not
/// change the document or the document version. The panel writes `src.id`.
#[tauri::command]
pub fn import_image(
    state: State<'_, DbState>,
    project_id: String,
    path: String,
) -> Result<crate::assets::ImportedAsset, String> {
    let conn = state.conn.lock().map_err(|_| "DB lock poisoned".to_string())?;
    crate::assets::import_image(&conn, &state.assets_dir, &project_id, Path::new(&path))
}

/// Absolute path of a stored image, or null when the row or the file is missing.
#[tauri::command]
pub fn asset_file_path(
    state: State<'_, DbState>,
    project_id: String,
    id: String,
) -> Result<Option<String>, String> {
    let conn = state.conn.lock().map_err(|_| "DB lock poisoned".to_string())?;
    Ok(crate::assets::existing_file(&conn, &state.assets_dir, &project_id, &id)?
        .map(|p| p.to_string_lossy().into_owned()))
}

#[tauri::command]
pub fn delete_project(
    state: State<'_, DbState>,
    test: State<'_, TestDbState>,
    id: String,
) -> Result<(), String> {
    check_project_id(&id)?;
    let conn = state.conn.lock().map_err(|_| "DB lock poisoned".to_string())?;
    db_delete(&conn, &id)?;
    // Close its test file first so the file can go.
    if let Ok(mut g) = test.inner.lock() {
        if g.as_ref().is_some_and(|t| t.project_id == id) {
            *g = None;
        }
    }
    // After the rows are gone: best-effort test-file cleanup (PHASE-10-SPEC §4).
    crate::db::remove_test_db_files(&state.databases_dir, &id);
    Ok(())
}

/// Phase 10: the saved DB model for a project, or `null`. Called only when the
/// `ฐานข้อมูล` mode opens, never at startup or on project open.
#[tauri::command]
pub fn db_model_load(state: State<'_, DbState>, project_id: String) -> Result<Option<Value>, String> {
    let conn = state.conn.lock().map_err(|_| "อ่านโครงสร้างไม่ได้".to_string())?;
    crate::db::load_db_model(&conn, &project_id)
}

/// Phase 10 step 5: write the PostgreSQL 17 `.sql` for the in-memory model.
/// Invalid model → its first error; no path → `ไม่ได้เลือกตำแหน่งบันทึก`.
/// Written to a temp file in the same folder, then renamed (atomic).
#[tauri::command]
pub fn db_sql_export(model: Value, dest_path: Option<String>) -> Result<String, String> {
    let model = crate::dbmodel::parse_model(&model)?;
    let sql = crate::sqlexport::export_pg(&model)?;
    let dest = dest_path.filter(|p| !p.trim().is_empty()).ok_or_else(|| "ไม่ได้เลือกตำแหน่งบันทึก".to_string())?;
    let dest = std::path::PathBuf::from(dest);
    let name = dest.file_name().ok_or_else(|| "ไม่ได้เลือกตำแหน่งบันทึก".to_string())?.to_string_lossy().to_string();
    let tmp = dest.with_file_name(format!(".{name}.wbtmp"));
    let write = || -> std::io::Result<()> {
        use std::io::Write;
        let mut f = std::fs::File::create(&tmp)?;
        f.write_all(sql.as_bytes())?;
        f.sync_all()?;
        std::fs::rename(&tmp, &dest)
    };
    write().map_err(|e| {
        let _ = std::fs::remove_file(&tmp);
        format!("บันทึกไฟล์ไม่ได้: {e}")
    })?;
    Ok(dest.to_string_lossy().to_string())
}

/* ---------------- Phase 10 step 6: test file (PHASE-10-SPEC §4) ---------------- */

fn slot<'a>(test: &'a State<'_, TestDbState>) -> Result<std::sync::MutexGuard<'a, Option<testdb::TestDb>>, String> {
    test.inner.lock().map_err(|_| testdb::OPEN_ERROR.to_string())
}

/// Opened only by the ข้อมูลทดสอบ tab. Closes any open file first; the first
/// call per app run also sweeps files of deleted projects.
#[tauri::command]
pub fn db_test_open(
    state: State<'_, DbState>,
    test: State<'_, TestDbState>,
    project_id: String,
    model: Value,
) -> Result<OpenResult, String> {
    let mut g = slot(&test)?;
    testdb::sweep_once(&test, &state.databases_dir, || {
        state
            .conn
            .lock()
            .ok()
            .and_then(|c| {
                let mut st = c.prepare("SELECT id FROM projects").ok()?;
                let ids = st.query_map([], |r| r.get::<_, String>(0)).ok()?.flatten().collect();
                Some(ids)
            })
            // Unknown live set: keep everything rather than guess.
            .unwrap_or_else(|| {
                std::fs::read_dir(&state.databases_dir)
                    .map(|it| it.flatten().map(|e| e.file_name().to_string_lossy().split('.').next().unwrap_or("").to_string()).collect())
                    .unwrap_or_default()
            })
    });
    check_project_id(&project_id)?;
    testdb::open(&state.databases_dir, &mut g, &project_id, &model)
}

/// Idempotent; drops the connection (and its page cache).
#[tauri::command]
pub fn db_test_close(test: State<'_, TestDbState>) {
    if let Ok(mut g) = test.inner.lock() {
        *g = None;
    }
}

#[tauri::command]
pub fn db_test_rows(test: State<'_, TestDbState>, table_id: String, offset: i64, limit: u32) -> Result<Rows, String> {
    testdb::rows(&*slot(&test)?, &table_id, offset, limit)
}

#[derive(serde::Serialize)]
pub struct Inserted {
    rowid: i64,
}

#[tauri::command]
pub fn db_test_insert(
    test: State<'_, TestDbState>,
    table_id: String,
    values: serde_json::Map<String, Value>,
) -> Result<Inserted, String> {
    Ok(Inserted { rowid: testdb::insert(&*slot(&test)?, &table_id, &values)? })
}

/// Argon2id hash for Form↔DB password columns (Preview + export adapter).
#[tauri::command]
pub fn hash_password(plain: String) -> Result<String, String> {
    use argon2::{
        password_hash::{PasswordHasher, SaltString},
        Argon2,
    };
    use rand_core::OsRng;
    if plain.is_empty() {
        return Err("รหัสผ่านว่าง".into());
    }
    if plain.chars().count() > 200 {
        return Err("รหัสผ่านยาวเกินไป".into());
    }
    let salt = SaltString::generate(&mut OsRng);
    Argon2::default()
        .hash_password(plain.as_bytes(), &salt)
        .map(|h| h.to_string())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn db_test_update(
    test: State<'_, TestDbState>,
    table_id: String,
    rowid: i64,
    column_id: String,
    value: Value,
) -> Result<Updated, String> {
    Ok(Updated { value: testdb::update(&*slot(&test)?, &table_id, rowid, &column_id, &value)? })
}

/// The stored (normalized) value of the updated cell, on the wire.
#[derive(serde::Serialize)]
pub struct Updated {
    value: Value,
}

#[derive(serde::Serialize)]
pub struct Deleted {
    deleted: usize,
}

#[tauri::command]
pub fn db_test_delete(test: State<'_, TestDbState>, table_id: String, rowids: Vec<i64>) -> Result<Deleted, String> {
    Ok(Deleted { deleted: testdb::delete(&mut *slot(&test)?, &table_id, &rowids)? })
}

/// `ล้างข้อมูลทดสอบ` / `สร้างใหม่` (corrupt): rebuild empty from `model`.
#[tauri::command]
pub fn db_test_reset(
    state: State<'_, DbState>,
    test: State<'_, TestDbState>,
    project_id: String,
    model: Value,
) -> Result<OpenResult, String> {
    check_project_id(&project_id)?;
    testdb::reset(&state.databases_dir, &mut *slot(&test)?, &project_id, &model)
}

/* ---------------- Phase 10 step 7: schema change → test rows (§7) ---------------- */

/// Builds `<id>.sqlite.tmp` from `model` with the open file's rows and returns
/// per-table loss counts plus a token for `db_test_apply`.
#[tauri::command]
pub fn db_test_plan(state: State<'_, DbState>, test: State<'_, TestDbState>, model: Value) -> Result<PlanResult, String> {
    testmigrate::plan(&state.databases_dir, &mut *slot(&test)?, &model)
}

/// Renames the planned file over the old one and reopens it.
#[tauri::command]
pub fn db_test_apply(state: State<'_, DbState>, test: State<'_, TestDbState>, token: String) -> Result<OpenResult, String> {
    testmigrate::apply(&state.databases_dir, &mut *slot(&test)?, &token)
}

/// Drops the plan and its tmp file; the open file stays stale. No errors.
#[tauri::command]
pub fn db_test_discard(test: State<'_, TestDbState>, token: String) {
    if let Ok(mut g) = test.inner.lock() {
        testmigrate::discard(&mut g, &token);
    }
}

/* ---------------- Phase 11 C6: library_items (user presets) ---------------- */

#[tauri::command]
pub fn library_list(
    state: State<'_, DbState>,
    kind: String,
) -> Result<Vec<crate::library::LibraryItem>, String> {
    let conn = state.conn.lock().map_err(|_| "DB lock poisoned".to_string())?;
    crate::library::library_list(&conn, &kind)
}

#[tauri::command]
pub fn library_put(
    state: State<'_, DbState>,
    kind: String,
    id: String,
    name: String,
    json: String,
) -> Result<crate::library::LibraryItem, String> {
    let conn = state.conn.lock().map_err(|_| "DB lock poisoned".to_string())?;
    crate::library::library_put(&conn, &kind, &id, &name, &json)
}

#[tauri::command]
pub fn library_delete(state: State<'_, DbState>, id: String) -> Result<bool, String> {
    let conn = state.conn.lock().map_err(|_| "DB lock poisoned".to_string())?;
    crate::library::library_delete(&conn, &id)
}

#[tauri::command]
pub fn preview_sidecar_sweep(
    sc: State<'_, std::sync::Arc<crate::sidecar::Sidecar>>,
) -> Result<u32, String> {
    crate::sidecar::sweep_orphans(&sc.cache_dir)
}

#[tauri::command]
pub fn preview_sidecar_status(
    sc: State<'_, std::sync::Arc<crate::sidecar::Sidecar>>,
) -> Result<crate::sidecar::SidecarStatus, String> {
    crate::sidecar::reap_if_dead(&sc);
    Ok(sc.status())
}

#[tauri::command]
pub fn preview_sidecar_stop(sc: State<'_, std::sync::Arc<crate::sidecar::Sidecar>>) -> Result<(), String> {
    sc.stop();
    Ok(())
}

#[tauri::command]
pub fn preview_sidecar_note_activity(
    sc: State<'_, std::sync::Arc<crate::sidecar::Sidecar>>,
) -> Result<(), String> {
    sc.note_activity();
    Ok(())
}

#[tauri::command]
pub fn preview_sidecar_set_visible(
    sc: State<'_, std::sync::Arc<crate::sidecar::Sidecar>>,
    visible: bool,
) -> Result<(), String> {
    sc.set_visible(visible);
    Ok(())
}

#[tauri::command]
pub async fn preview_sidecar_start(
    state: State<'_, DbState>,
    sc: State<'_, std::sync::Arc<crate::sidecar::Sidecar>>,
    project_id: String,
    document: Value,
) -> Result<crate::sidecar::SidecarStatus, String> {
    // A1 (audit High 1): claim the start under the sidecar lock first. A 2nd / 3rd caller during the slow
    // export + install below gets the same session back instead of spawning another Vite tree.
    let session = match sc.begin_start() {
        crate::sidecar::StartGate::Existing(st) => return Ok(st),
        crate::sidecar::StartGate::Fresh(n) => n,
    };
    sc.reset_restarts();
    let run = || -> Result<u16, String> {
        let doc = parse_document(&document)?;
        let (opts, files) = {
            let conn = state.conn.lock().map_err(|_| "DB lock poisoned".to_string())?;
            crate::assets::export_parts(&conn, &state.assets_dir, &project_id, &doc)?
        };
        let site = project_dir(&state.sites_dir, &project_id)?;
        let ws = if site.join("package.json").is_file() {
            site.clone()
        } else {
            project_dir(&sc.cache_dir.join("preview").join("ws"), &project_id)?
        };
        if ws == site {
            crate::export::sync_project_site(&ws, &doc, &opts, &files)?;
        } else {
            crate::export::write_export_tree(&ws, &doc, &opts, &files)?;
        }
        let bun_ver = if sc.bun.is_file() {
            std::process::Command::new(&sc.bun)
                .arg("--version")
                .output()
                .ok()
                .and_then(|o| String::from_utf8(o.stdout).ok())
                .unwrap_or_default()
        } else {
            String::new()
        };
        let deps = sc.cache_dir.join("preview").join("deps");
        crate::sidecar::start_vite(&sc, session, &ws, &deps, bun_ver.trim())
    };
    match run() {
        Ok(_) => Ok(sc.status()),
        // Stopped or replaced while preparing: report the current state, not an error.
        Err(code) if code == crate::sidecar::START_SUPERSEDED => Ok(sc.status()),
        Err(code) => {
            sc.fail_start(session, &code);
            let thai = crate::sidecar::error_thai(&code);
            Err(if thai == code { code } else { format!("{code}:{thai}") })
        }
    }
}

#[tauri::command]
pub fn preview_sidecar_open_log(
    app: tauri::AppHandle,
    sc: State<'_, std::sync::Arc<crate::sidecar::Sidecar>>,
) -> Result<(), String> {
    let path = sc.log_dir.join("preview-sidecar.log");
    if !path.is_file() {
        return Err("ยังไม่มีบันทึกเครื่องมือแสดงตัวอย่าง".into());
    }
    app.opener()
        .open_path(path.to_string_lossy().as_ref(), None::<&str>)
        .map_err(|e| format!("เปิดบันทึกไม่สำเร็จ: {e}"))
}

/// S8: rewrite workspace site.json (atomic) while the sidecar is running.
#[tauri::command]
pub async fn preview_sidecar_write_site(
    state: State<'_, DbState>,
    sc: State<'_, std::sync::Arc<crate::sidecar::Sidecar>>,
    project_id: String,
    document: Value,
) -> Result<bool, String> {
    crate::sidecar::hmr_mark(&sc);
    let st = sc.status();
    if st.state != crate::sidecar::SidecarPhase::Running {
        return Ok(false);
    }
    let doc = parse_document(&document)?;
    let (opts, _) = {
        let conn = state.conn.lock().map_err(|_| "DB lock poisoned".to_string())?;
        crate::assets::export_parts(&conn, &state.assets_dir, &project_id, &doc)?
    };
    let ws = project_dir(&sc.cache_dir.join("preview").join("ws"), &project_id)?;
    let json = crate::export::build_site_json(&doc, &opts.asset_exts)?;
    crate::export::write_site_json_atomic(&ws, &json)
}
