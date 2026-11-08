mod assets;
mod commands;
mod compiler;
mod db;
mod dbmodel;
mod library;
mod sqlexport;
mod testdb;
mod testmigrate;
mod defaults;
mod export;
mod icon_paths;
mod chart_render;
mod calendar_render;
mod sidecar;

use db::{databases_dir, db_path, open_db, DbState};
use assets::assets_dir;
use std::sync::{Arc, Mutex};
use tauri::Manager;

fn respond_vite_bridge(
    port: Option<u16>,
    uri: String,
    responder: tauri::UriSchemeResponder,
    log_dir: Option<std::path::PathBuf>,
) {
    std::thread::spawn(move || {
        let path = sidecar::vite_bridge_path(&uri);
        let resp = match port {
            Some(p) => sidecar::proxy_vite(p, &path),
            None => Err("stopped".into()),
        };
        if let (Some(dir), Err(e)) = (&log_dir, &resp) {
            sidecar::log_event(dir, &format!("bridge-fail {path} {e}"));
        }
        let http_resp = match resp {
            Ok((status, ctype, body)) => tauri::http::Response::builder()
                .status(status)
                .header("content-type", ctype)
                .header("cache-control", "no-store")
                .header("access-control-allow-origin", "*")
                .body(body)
                .unwrap_or_else(|_| tauri::http::Response::new(Vec::new())),
            Err(_) => tauri::http::Response::builder()
                .status(502)
                .header("content-type", "text/plain; charset=utf-8")
                .body(b"preview unavailable".to_vec())
                .unwrap_or_else(|_| tauri::http::Response::new(Vec::new())),
        };
        responder.respond(http_resp);
    });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .register_asynchronous_uri_scheme_protocol("wbpreview", |ctx, request, responder| {
            let handle = ctx.app_handle();
            let port = handle
                .try_state::<Arc<sidecar::Sidecar>>()
                .and_then(|s| s.status().port);
            let log_dir = handle
                .try_state::<Arc<sidecar::Sidecar>>()
                .map(|s| s.log_dir.clone());
            respond_vite_bridge(port, request.uri().to_string(), responder, log_dir);
        })
        .setup(|app| {
            let app_data = app
                .path()
                .app_data_dir()
                .map_err(|e| format!("app_data_dir: {e}"))?;
            let path = db_path(&app_data);
            let conn = open_db(&path)?;
            app.manage(DbState {
                conn: Mutex::new(conn),
                assets_dir: assets_dir(&app_data),
                databases_dir: databases_dir(&app_data),
            });
            // Phase 10 step 6: empty slot only; no test file is touched here.
            app.manage(testdb::TestDbState::default());
            let cache = app.path().app_cache_dir().unwrap_or_else(|_| app_data.clone());
            let logs = app.path().app_log_dir().unwrap_or_else(|_| app_data.join("logs"));
            let resource = app.path().resource_dir().ok();
            let bun = sidecar::resolve_bun(resource.as_deref());
            let _ = sidecar::sweep_orphans(&cache);
            app.manage(sidecar::Sidecar::new(cache, logs, bun));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::list_projects,
            commands::create_project,
            commands::open_project,
            commands::save_project,
            commands::delete_project,
            commands::db_model_load,
            commands::db_sql_export,
            commands::db_test_open,
            commands::db_test_close,
            commands::db_test_rows,
            commands::db_test_insert,
            commands::db_test_update,
            commands::db_test_delete,
            commands::db_test_reset,
            commands::db_test_plan,
            commands::db_test_apply,
            commands::db_test_discard,
            commands::compile_preview,
            commands::preview_bundle,
            commands::export_project,
            commands::list_export_files,
            commands::parse_site_json,
            commands::open_export_folder,
            commands::import_image,
            commands::asset_file_path,
            commands::library_list,
            commands::library_put,
            commands::library_delete,
            commands::preview_sidecar_sweep,
            commands::preview_sidecar_status,
            commands::preview_sidecar_stop,
            commands::preview_sidecar_start,
            commands::preview_sidecar_note_activity,
            commands::preview_sidecar_set_visible,
            commands::preview_sidecar_write_site,
            commands::preview_sidecar_open_log,
        ])
        .build(tauri::generate_context!())
        .expect("error while running tauri application")
        .run(|app, event| {
            // Drop the test-file connection on exit (spec §10).
            if let tauri::RunEvent::Exit = event {
                if let Some(s) = app.try_state::<testdb::TestDbState>() {
                    if let Ok(mut g) = s.inner.lock() {
                        *g = None;
                    }
                }
                if let Some(sc) = app.try_state::<std::sync::Arc<sidecar::Sidecar>>() {
                    sc.stop();
                }
            }
        });
}
