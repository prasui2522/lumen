//! Tauri command handlers: project CRUD, preview compile, export.

use crate::db::{
    create_project as db_create, delete_project as db_delete, list_projects as db_list,
    open_project as db_open, save_project_with_model as db_save, DbState, ProjectSummary, ProjectWithDocument,
};
use crate::compiler::{compile, parse_document, CompileOptions};
use crate::defaults::PageDocument;
use crate::export::write_zip;
use serde_json::Value;
use std::path::{Path, PathBuf};
use crate::testdb::{self, OpenResult, Rows, TestDbState};
use crate::testmigrate::{self, PlanResult};
use tauri::State;

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
    db_create(&conn, name)
}

#[tauri::command]
pub fn open_project(
    state: State<'_, DbState>,
    id: String,
) -> Result<ProjectWithDocument, String> {
    let conn = state.conn.lock().map_err(|_| "DB lock poisoned".to_string())?;
    db_open(&conn, &id)
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
    Ok(())
}

/// Compile the in-memory document (unsaved edits included) to static HTML for
/// the sandboxed Preview iframe. `project_id` selects asset rows so an image
/// `src` is a Tauri asset URL. Device framing does not call this again.
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
    let (opts, files) = {
        let conn = state.conn.lock().map_err(|_| "DB lock poisoned".to_string())?;
        crate::assets::export_parts(&conn, &state.assets_dir, &project_id, &doc)?
    };
    let written = write_zip(&PathBuf::from(dest), &doc, &opts, &files)?;
    Ok(written.to_string_lossy().into_owned())
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
