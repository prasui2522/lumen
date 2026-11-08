//! Local SQLite persistence for Web Builder projects (Phase 1).
//! One PageDocument per project — kept light for fast load / low RAM.

use crate::defaults::{
    normalize_saved_document, Node, NodeProps, NodeType, PageDocument, PageMeta, StyleProps,
};
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use uuid::Uuid;

/// Minimal PageDocument for a new project (schema v1.1). Kept here so defaults.rs stays untouched.
fn empty_page_document(title: &str) -> PageDocument {
    let root_id = Uuid::new_v4().to_string();
    let mut nodes = HashMap::new();
    nodes.insert(
        root_id.clone(),
        Node {
            id: root_id.clone(),
            node_type: NodeType::Page,
            name: Some("Page".into()),
            visible: None,
            locked: None,
            class_names: None,
            props: NodeProps::Page {
                children: Vec::new(),
            },
            style: StyleProps::default(),
            style_breakpoints: None,
            states: None,
            motion: None,
        },
    );
    PageDocument {
        version: 1,
        meta: PageMeta {
            title: title.to_string(),
            description: None,
            lang: Some("th".into()),
            favicon: None,
            dark_mode: None,
        },
        root: root_id,
        nodes,
        pages: Vec::new(),
    }
}

pub struct DbState {
    pub conn: Mutex<Connection>,
    pub assets_dir: PathBuf,
    /// `app_data_dir/databases` (Phase 10 per-project test files). Only a path:
    /// nothing under it is opened or listed at startup.
    pub databases_dir: PathBuf,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectSummary {
    pub id: String,
    pub name: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectWithDocument {
    pub id: String,
    pub name: String,
    pub created_at: String,
    pub updated_at: String,
    pub document: PageDocument,
}

fn now_iso() -> String {
    // RFC 3339-ish UTC without chrono dep: millis since epoch is fine for Phase 1 ordering.
    // Prefer human-readable ISO if system clock available via `date` — use UNIX EPOCH format.
    use std::time::{SystemTime, UNIX_EPOCH};
    let dur = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    let secs = dur.as_secs();
    let millis = dur.subsec_millis();
    // Approximate UTC formatting without chrono (YYYY-MM-DDTHH:MM:SS.mmmZ) via simple math.
    // For Phase 1 sorting/display this is adequate; values are monotonic.
    format_unix_millis(secs, millis)
}

fn format_unix_millis(secs: u64, millis: u32) -> String {
    // Civil date from Unix days (proleptic Gregorian) — no external crate.
    let days = (secs / 86400) as i64;
    let tod = secs % 86400;
    let (y, m, d) = civil_from_days(days);
    let hh = tod / 3600;
    let mm = (tod % 3600) / 60;
    let ss = tod % 60;
    format!("{y:04}-{m:02}-{d:02}T{hh:02}:{mm:02}:{ss:02}.{millis:03}Z")
}

/// Algorithm from Howard Hinnant (civil_from_days).
fn civil_from_days(z: i64) -> (i32, u32, u32) {
    let z = z + 719468;
    let era = if z >= 0 { z } else { z - 146096 } / 146097;
    let doe = (z - era * 146097) as u64;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = (yoe as i64) + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };
    (y as i32, m as u32, d as u32)
}

pub fn db_path(app_data_dir: &Path) -> PathBuf {
    app_data_dir.join("web_builder.db")
}

/// Phase 10 test-data folder (PHASE-10-SPEC §4). Not created here.
pub fn databases_dir(app_data_dir: &Path) -> PathBuf {
    app_data_dir.join("databases")
}

/// `<id>.sqlite`, its `-journal`, and a leftover rebuild `.sqlite.tmp`.
/// Empty when the id is not a plain uuid-like name (never a path).
pub fn test_db_files(databases_dir: &Path, project_id: &str) -> Vec<PathBuf> {
    let safe = !project_id.is_empty()
        && project_id.len() <= 64
        && project_id.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-');
    if !safe {
        return Vec::new();
    }
    ["sqlite", "sqlite-journal", "sqlite.tmp"]
        .iter()
        .map(|ext| databases_dir.join(format!("{project_id}.{ext}")))
        .collect()
}

/// Best-effort removal after `delete_project` committed. A failure is left
/// for the lazy sweep (spec §4); it never fails the delete.
pub fn remove_test_db_files(databases_dir: &Path, project_id: &str) {
    for f in test_db_files(databases_dir, project_id) {
        let _ = std::fs::remove_file(f);
    }
}

pub fn open_db(path: &Path) -> Result<Connection, String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let conn = Connection::open(path).map_err(|e| e.to_string())?;
    conn.execute_batch(
        "PRAGMA journal_mode=WAL;
         PRAGMA synchronous=NORMAL;
         PRAGMA foreign_keys=ON;",
    )
    .map_err(|e| e.to_string())?;
    migrate(&conn)?;
    Ok(conn)
}

/// Open an in-memory or path DB for tests / smoke.
#[allow(dead_code)]
pub fn open_db_at(path: &Path) -> Result<Connection, String> {
    open_db(path)
}

fn migrate(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS projects (
            id TEXT PRIMARY KEY NOT NULL,
            name TEXT NOT NULL,
            document_json TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_projects_updated_at ON projects(updated_at DESC);",
    )
    .map_err(|e| e.to_string())?;
    crate::assets::migrate_assets(conn)?;
    // Phase 10 (PHASE-10-SPEC §2): additive only. IF NOT EXISTS makes it a
    // no-op on later runs; no existing table or row is read or rewritten.
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS db_models (
            project_id TEXT PRIMARY KEY NOT NULL,
            model_json TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );",
    )
    .map_err(|e| e.to_string())?;
    // Phase 11 C6: user-saved presets (app-wide). Additive; project rows untouched.
    crate::library::migrate_library(conn)?;
    Ok(())
}

pub fn list_projects(conn: &Connection) -> Result<Vec<ProjectSummary>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, name, updated_at FROM projects ORDER BY updated_at DESC, name ASC",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok(ProjectSummary {
                id: row.get(0)?,
                name: row.get(1)?,
                updated_at: row.get(2)?,
            })
        })
        .map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r.map_err(|e| e.to_string())?);
    }
    Ok(out)
}

pub fn create_project(conn: &Connection, name: String) -> Result<ProjectWithDocument, String> {
    let name = name.trim().to_string();
    if name.is_empty() {
        return Err("Project name must not be empty".into());
    }
    let id = Uuid::new_v4().to_string();
    let document = empty_page_document(&name);
    let document_json = serde_json::to_string(&document).map_err(|e| e.to_string())?;
    let ts = now_iso();
    conn.execute(
        "INSERT INTO projects (id, name, document_json, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![id, name, document_json, ts, ts],
    )
    .map_err(|e| e.to_string())?;
    Ok(ProjectWithDocument {
        id,
        name,
        created_at: ts.clone(),
        updated_at: ts,
        document,
    })
}

pub fn open_project(conn: &Connection, id: &str) -> Result<ProjectWithDocument, String> {
    conn.query_row(
        "SELECT id, name, document_json, created_at, updated_at FROM projects WHERE id = ?1",
        params![id],
        |row| {
            let id: String = row.get(0)?;
            let name: String = row.get(1)?;
            let document_json: String = row.get(2)?;
            let created_at: String = row.get(3)?;
            let updated_at: String = row.get(4)?;
            Ok((id, name, document_json, created_at, updated_at))
        },
    )
    .map_err(|e| match e {
        rusqlite::Error::QueryReturnedNoRows => format!("Project not found: {id}"),
        other => other.to_string(),
    })
    .and_then(|(id, name, document_json, created_at, updated_at)| {
        let document: PageDocument =
            serde_json::from_str(&document_json).map_err(|e| format!("เอกสารในฐานข้อมูลไม่ถูกต้อง: {e}"))?;
        Ok(ProjectWithDocument {
            id,
            name,
            created_at,
            updated_at,
            document,
        })
    })
}

/// Document-only save (tests and callers without a model).
#[allow(dead_code)]
pub fn save_project(
    conn: &Connection,
    id: &str,
    name: Option<String>,
    document: &PageDocument,
) -> Result<(), String> {
    save_project_with_model(conn, id, name, document, None)
}

/// `save_project` plus the optional Phase 10 model, in ONE transaction: the
/// project row and the `db_models` row are both written or neither is.
/// `db_model` only has to parse (a draft may be invalid, spec §2); it is
/// stored in canonical form. `None` leaves any stored model as it is.
pub fn save_project_with_model(
    conn: &Connection,
    id: &str,
    name: Option<String>,
    document: &PageDocument,
    db_model: Option<&serde_json::Value>,
) -> Result<(), String> {
    let model_json = match db_model {
        Some(v) => {
            let model = crate::dbmodel::parse_model(v)?;
            Some(serde_json::to_string(&model).map_err(|_| crate::dbmodel::MODEL_PARSE_ERROR.to_string())?)
        }
        None => None,
    };
    let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;
    let ts = write_project_row(&tx, id, name, document)?;
    if let Some(json) = model_json {
        tx.execute(
            "INSERT INTO db_models (project_id, model_json, updated_at) VALUES (?1, ?2, ?3)
             ON CONFLICT(project_id) DO UPDATE SET model_json = excluded.model_json, updated_at = excluded.updated_at",
            params![id, json, ts],
        )
        .map_err(|e| e.to_string())?;
    }
    tx.commit().map_err(|e| e.to_string())
}

/// The stored model as JSON, or `None` when the project has none yet.
pub fn load_db_model(conn: &Connection, project_id: &str) -> Result<Option<serde_json::Value>, String> {
    const READ_ERROR: &str = "อ่านโครงสร้างไม่ได้";
    let raw: Option<String> = match conn.query_row(
        "SELECT model_json FROM db_models WHERE project_id = ?1",
        params![project_id],
        |r| r.get(0),
    ) {
        Ok(s) => Some(s),
        Err(rusqlite::Error::QueryReturnedNoRows) => None,
        Err(_) => return Err(READ_ERROR.into()),
    };
    match raw {
        None => Ok(None),
        Some(s) => serde_json::from_str(&s).map(Some).map_err(|_| READ_ERROR.into()),
    }
}

/// Writes the project row; returns the timestamp used.
fn write_project_row(
    conn: &Connection,
    id: &str,
    name: Option<String>,
    document: &PageDocument,
) -> Result<String, String> {
    let mut document = document.clone();
    normalize_saved_document(&mut document);
    let document_json = serde_json::to_string(&document).map_err(|e| e.to_string())?;
    let ts = now_iso();
    let changed = if let Some(name) = name {
        let name = name.trim().to_string();
        if name.is_empty() {
            return Err("Project name must not be empty".into());
        }
        conn.execute(
            "UPDATE projects SET name = ?1, document_json = ?2, updated_at = ?3 WHERE id = ?4",
            params![name, document_json, ts, id],
        )
    } else {
        conn.execute(
            "UPDATE projects SET document_json = ?1, updated_at = ?2 WHERE id = ?3",
            params![document_json, ts, id],
        )
    }
    .map_err(|e| e.to_string())?;
    if changed == 0 {
        return Err(format!("Project not found: {id}"));
    }
    Ok(ts)
}

/// Deletes the project row and its `db_models` row in one transaction.
/// Test-file removal is the caller's best-effort step after this succeeds.
pub fn delete_project(conn: &Connection, id: &str) -> Result<(), String> {
    let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM db_models WHERE project_id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    let changed = tx
        .execute("DELETE FROM projects WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    if changed == 0 {
        return Err(format!("Project not found: {id}"));
    }
    tx.commit().map_err(|e| e.to_string())
}

#[cfg(test)]
#[path = "db_phase10_tests.rs"]
mod phase10_tests;

#[cfg(test)]
#[path = "db_a21_tests.rs"]
mod a21_tests;

#[cfg(test)]
#[path = "db_a22_tests.rs"]
mod a22_tests;

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn mem() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys=ON;").unwrap();
        migrate(&conn).unwrap();
        conn
    }

    #[test]
    fn create_save_open_delete() {
        let conn = mem();
        let created = create_project(&conn, "Demo".into()).unwrap();
        assert_eq!(created.name, "Demo");
        assert_eq!(created.document.version, 1);
        assert_eq!(created.document.meta.title, "Demo");
        assert!(created.document.nodes.contains_key(&created.document.root));

        let mut doc = created.document.clone();
        doc.meta.title = "Demo Renamed".into();
        save_project(&conn, &created.id, Some("Demo Renamed".into()), &doc).unwrap();

        let opened = open_project(&conn, &created.id).unwrap();
        assert_eq!(opened.name, "Demo Renamed");
        assert_eq!(opened.document.meta.title, "Demo Renamed");
        assert_eq!(opened.document.root, created.document.root);

        let list = list_projects(&conn).unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].id, created.id);

        delete_project(&conn, &created.id).unwrap();
        assert!(list_projects(&conn).unwrap().is_empty());
        assert!(open_project(&conn, &created.id).is_err());
    }

    /// Typed save/open keeps camelCase variant fields (were dropped before 3b).
    #[test]
    fn camel_case_variant_fields_survive_save_and_open() {
        let conn = mem();
        let created = create_project(&conn, "P".into()).unwrap();
        let root = created.document.root.clone();
        let mut v = serde_json::to_value(&created.document).unwrap();
        v["nodes"][&root]["props"]["children"] = json!(["l", "i"]);
        v["nodes"]["l"] = json!({"id":"l","type":"link","props":{"type":"link",
            "label":"x","href":"https://a","openInNewTab":true},"style":{}});
        v["nodes"]["i"] = json!({"id":"i","type":"image","props":{"type":"image",
            "src":{"id":""},"objectFit":"contain"},"style":{}});
        let doc: PageDocument = serde_json::from_value(v).unwrap();
        save_project(&conn, &created.id, None, &doc).unwrap();

        let stored: String = conn
            .query_row("SELECT document_json FROM projects WHERE id = ?1", params![created.id], |r| r.get(0))
            .unwrap();
        assert!(stored.contains("\"openInNewTab\":true"), "{stored}");
        assert!(stored.contains("\"objectFit\":\"contain\""), "{stored}");
        assert!(!stored.contains("open_in_new_tab") && !stored.contains("object_fit"));

        let opened = serde_json::to_value(open_project(&conn, &created.id).unwrap()).unwrap();
        assert_eq!(opened["document"]["nodes"]["l"]["props"]["openInNewTab"], true);
        assert_eq!(opened["document"]["nodes"]["i"]["props"]["objectFit"], "contain");
    }

    /// P4-S2: a phone override round-trips, base style stays, empty maps are not stored,
    /// and version becomes 2 only when an override is saved.
    #[test]
    fn breakpoint_override_save_bumps_version_and_reloads() {
        let conn = mem();
        let created = create_project(&conn, "P".into()).unwrap();
        let fresh: String = conn
            .query_row(
                "SELECT document_json FROM projects WHERE id = ?1",
                params![created.id],
                |r| r.get(0),
            )
            .unwrap();
        assert!(fresh.contains("\"version\":1"), "{fresh}");
        assert!(!fresh.contains("styleBreakpoints"), "{fresh}");

        let root = created.document.root.clone();
        let mut v = serde_json::to_value(&created.document).unwrap();
        v["nodes"][&root]["style"] = json!({"color": "#111111"});
        v["nodes"][&root]["styleBreakpoints"] = json!({
            "phone": {"color": "#222222"},
            "tablet": {},
            "foldOpen": {}
        });
        let doc: PageDocument = serde_json::from_value(v).unwrap();
        let node = doc.nodes.get(&root).unwrap();
        assert_eq!(node.style.color.as_deref(), Some("#111111"));
        let phone = node
            .style_breakpoints
            .as_ref()
            .and_then(|b| b.phone.as_ref())
            .and_then(|s| s.color.as_deref());
        assert_eq!(phone, Some("#222222"));

        save_project(&conn, &created.id, None, &doc).unwrap();
        let stored: String = conn
            .query_row(
                "SELECT document_json FROM projects WHERE id = ?1",
                params![created.id],
                |r| r.get(0),
            )
            .unwrap();
        assert!(stored.contains("\"version\":2"), "{stored}");
        assert!(stored.contains("\"styleBreakpoints\""), "{stored}");
        assert!(stored.contains("\"phone\""), "{stored}");
        assert!(!stored.contains("\"tablet\""), "{stored}");
        assert!(!stored.contains("\"foldOpen\""), "{stored}");

        let opened = open_project(&conn, &created.id).unwrap();
        assert_eq!(opened.document.version, 2);
        let again = opened.document.nodes.get(&root).unwrap();
        assert_eq!(again.style.color.as_deref(), Some("#111111"));
        assert_eq!(
            again
                .style_breakpoints
                .as_ref()
                .and_then(|b| b.phone.as_ref())
                .and_then(|s| s.color.as_deref()),
            Some("#222222")
        );

        // Clearing the override saves version 1 and writes no map.
        let mut cleared = opened.document.clone();
        cleared.nodes.get_mut(&root).unwrap().style_breakpoints = None;
        save_project(&conn, &created.id, None, &cleared).unwrap();
        let back: String = conn
            .query_row(
                "SELECT document_json FROM projects WHERE id = ?1",
                params![created.id],
                |r| r.get(0),
            )
            .unwrap();
        assert!(back.contains("\"version\":1"), "{back}");
        assert!(!back.contains("styleBreakpoints"), "{back}");
        assert_eq!(open_project(&conn, &created.id).unwrap().document.version, 1);
    }

    /// An image id is not bytes and does not bump version on its own.
    #[test]
    fn saving_an_image_id_does_not_bump_version() {
        let conn = mem();
        let created = create_project(&conn, "P".into()).unwrap();
        let root = created.document.root.clone();
        let mut v = serde_json::to_value(&created.document).unwrap();
        v["nodes"][&root]["props"]["children"] = json!(["i"]);
        v["nodes"]["i"] = json!({"id":"i","type":"image","props":{"type":"image",
            "src":{"id":"abc"},"objectFit":"contain"},"style":{}});
        let doc: PageDocument = serde_json::from_value(v).unwrap();
        save_project(&conn, &created.id, None, &doc).unwrap();
        let opened = open_project(&conn, &created.id).unwrap();
        assert_eq!(opened.document.version, 1);
        match &opened.document.nodes["i"].props {
            NodeProps::Image { src, .. } => assert_eq!(src.id, "abc"),
            other => panic!("expected image, got {other:?}"),
        }
    }

    /// Version 3 only while an input or a switch remains. A breakpoint alone
    /// stays version 2. Opening does not rewrite the stored version.
    #[test]
    fn field_nodes_save_as_version_3() {
        let conn = mem();
        let created = create_project(&conn, "P".into()).unwrap();
        let root = created.document.root.clone();

        let mut v = serde_json::to_value(&created.document).unwrap();
        v["nodes"][&root]["props"]["children"] = json!(["in", "sw"]);
        v["nodes"]["in"] = json!({"id":"in","type":"input","props":{"type":"input",
            "label":"","placeholder":"พิมพ์ที่นี่"},"style":{}});
        v["nodes"]["sw"] = json!({"id":"sw","type":"switch","props":{"type":"switch",
            "label":"Checkbox","checked":false},"style":{}});
        let doc: PageDocument = serde_json::from_value(v).unwrap();
        save_project(&conn, &created.id, None, &doc).unwrap();
        let stored: String = conn
            .query_row("SELECT document_json FROM projects WHERE id = ?1", params![created.id], |r| r.get(0))
            .unwrap();
        assert!(stored.contains("\"version\":3"), "{stored}");
        assert!(stored.contains("\"checked\":false"), "{stored}");
        let opened = open_project(&conn, &created.id).unwrap();
        assert_eq!(opened.document.version, 3);
        match &opened.document.nodes["in"].props {
            NodeProps::Input {
                label,
                placeholder,
                suggestions,
            } => {
                assert_eq!(label, "");
                assert_eq!(placeholder, "พิมพ์ที่นี่");
                assert!(suggestions.is_empty());
            }
            other => panic!("expected input, got {other:?}"),
        }

        let mut both = opened.document.clone();
        both.nodes.get_mut(&root).unwrap().style_breakpoints = Some(crate::defaults::StyleBreakpoints {
            phone: Some(StyleProps { color: Some("#222222".into()), ..StyleProps::default() }),
            ..crate::defaults::StyleBreakpoints::default()
        });
        save_project(&conn, &created.id, None, &both).unwrap();
        let opened = open_project(&conn, &created.id).unwrap();
        assert_eq!(opened.document.version, 3);
        assert!(opened.document.nodes[&root].style_breakpoints.is_some());

        let mut dropped = opened.document.clone();
        dropped.nodes.get_mut(&root).unwrap().props = NodeProps::Page { children: vec![] };
        dropped.nodes.remove("in");
        dropped.nodes.remove("sw");
        save_project(&conn, &created.id, None, &dropped).unwrap();
        let opened = open_project(&conn, &created.id).unwrap();
        assert_eq!(opened.document.version, 2, "breakpoint remains, field nodes do not");

        let mut cleared = opened.document.clone();
        cleared.nodes.get_mut(&root).unwrap().style_breakpoints = None;
        save_project(&conn, &created.id, None, &cleared).unwrap();
        let opened = open_project(&conn, &created.id).unwrap();
        assert_eq!(opened.document.version, 1);

        // Opening a stored version 2 file does not bump it.
        let raw = conn
            .query_row("SELECT document_json FROM projects WHERE id = ?1", params![created.id], |r| r.get::<_, String>(0))
            .unwrap()
            .replace("\"version\":1", "\"version\":2");
        conn.execute(
            "UPDATE projects SET document_json = ?1 WHERE id = ?2",
            params![raw, created.id],
        )
        .unwrap();
        assert_eq!(open_project(&conn, &created.id).unwrap().document.version, 2);
    }

    /// A phase 6b kind saves as version 4 and does not replace the 1/2/3 rule.
    #[test]
    fn phase6b_kind_saves_as_version_4() {
        let conn = mem();
        let created = create_project(&conn, "P".into()).unwrap();
        let root = created.document.root.clone();
        let mut v = serde_json::to_value(&created.document).unwrap();
        v["nodes"][&root]["props"]["children"] = json!(["ta", "sw"]);
        v["nodes"]["ta"] = json!({"id":"ta","type":"textarea","props":{"type":"textarea","label":"","placeholder":"Type here"},"style":{}});
        v["nodes"]["sw"] = json!({"id":"sw","type":"switch","props":{"type":"switch","label":"Checkbox","checked":false},"style":{}});
        let doc: PageDocument = serde_json::from_value(v).unwrap();
        save_project(&conn, &created.id, None, &doc).unwrap();
        assert_eq!(open_project(&conn, &created.id).unwrap().document.version, 4);

        let mut dropped = open_project(&conn, &created.id).unwrap().document;
        dropped.nodes.get_mut(&root).unwrap().props = NodeProps::Page { children: vec!["sw".into()] };
        dropped.nodes.remove("ta");
        save_project(&conn, &created.id, None, &dropped).unwrap();
        assert_eq!(open_project(&conn, &created.id).unwrap().document.version, 3);

        let mut only_bp = open_project(&conn, &created.id).unwrap().document;
        only_bp.nodes.get_mut(&root).unwrap().props = NodeProps::Page { children: vec![] };
        only_bp.nodes.remove("sw");
        only_bp.nodes.get_mut(&root).unwrap().style_breakpoints = Some(crate::defaults::StyleBreakpoints {
            phone: Some(StyleProps { color: Some("#222222".into()), ..StyleProps::default() }),
            ..crate::defaults::StyleBreakpoints::default()
        });
        save_project(&conn, &created.id, None, &only_bp).unwrap();
        assert_eq!(open_project(&conn, &created.id).unwrap().document.version, 2);

        let raw = conn
            .query_row("SELECT document_json FROM projects WHERE id = ?1", params![created.id], |r| r.get::<_, String>(0))
            .unwrap()
            .replace("\"version\":2", "\"version\":3");
        conn.execute("UPDATE projects SET document_json = ?1 WHERE id = ?2", params![raw, created.id]).unwrap();
        assert_eq!(open_project(&conn, &created.id).unwrap().document.version, 3);
    }


    #[test]
    fn multi_page_saves_as_version_5_and_collapses_to_single() {
        let conn = mem();
        let created = create_project(&conn, "P".into()).unwrap();
        let pid = created.id;
        let mut doc = created.document;
        // Build two pages in the document.
        let home_root = doc.root.clone();
        let home_nodes = doc.nodes.clone();
        let other_root = uuid::Uuid::new_v4().to_string();
        let mut other_nodes = std::collections::HashMap::new();
        other_nodes.insert(
            other_root.clone(),
            Node {
                id: other_root.clone(),
                node_type: NodeType::Page,
                name: Some("Login".into()),
                visible: None,
                locked: None,
                class_names: None,
                props: NodeProps::Page { children: Vec::new() },
                style: StyleProps::default(),
                style_breakpoints: None,
                states: None,
                motion: None,
            },
        );
        doc.pages = vec![
            crate::defaults::ProjectPage {
                id: "home".into(),
                name: "หน้าแรก".into(),
                path: "/".into(),
                root: home_root.clone(),
                nodes: home_nodes,
            },
            crate::defaults::ProjectPage {
                id: "login".into(),
                name: "Login".into(),
                path: "/login".into(),
                root: other_root,
                nodes: other_nodes,
            },
        ];
        doc.version = 5;
        save_project(&conn, &pid, None, &doc).unwrap();
        let opened = open_project(&conn, &pid).unwrap();
        assert_eq!(opened.document.version, 5);
        assert_eq!(opened.document.pages.len(), 2);
        assert_eq!(opened.document.pages[1].path, "/login");
        // Drop to one page → versions 1–4 shape.
        doc.pages = vec![doc.pages[0].clone()];
        doc.root = doc.pages[0].root.clone();
        doc.nodes = doc.pages[0].nodes.clone();
        save_project(&conn, &pid, None, &doc).unwrap();
        let opened2 = open_project(&conn, &pid).unwrap();
        assert!(opened2.document.version <= 4, "version {}", opened2.document.version);
        // Wire JSON for a one-page save has no pages key.
        let raw: String = conn
            .query_row("SELECT document_json FROM projects WHERE id = ?1", params![pid], |r| r.get(0))
            .unwrap();
        assert!(!raw.contains("\"pages\""), "{raw}");
    }

    #[test]
    fn empty_document_roundtrip_json() {
        let doc = empty_page_document("T");
        let json = serde_json::to_string(&doc).unwrap();
        let back: PageDocument = serde_json::from_str(&json).unwrap();
        assert_eq!(back.root, doc.root);
        let root = back.nodes.get(&back.root).unwrap();
        match &root.props {
            NodeProps::Page { children } => assert!(children.is_empty()),
            other => panic!("expected Page props, got {other:?}"),
        }
    }
}
