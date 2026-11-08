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

use db::{databases_dir, db_path, open_db, DbState};
use assets::assets_dir;
use std::sync::Mutex;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
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
            commands::export_project,
            commands::import_image,
            commands::asset_file_path,
            commands::library_list,
            commands::library_put,
            commands::library_delete,
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
            }
        });
}
