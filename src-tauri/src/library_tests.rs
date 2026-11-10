//! Phase 11 C6: library_items migration + CRUD + hostile refusal.

use super::*;
use crate::db::open_db;
use rusqlite::Connection;
use serde_json::json;
use std::path::PathBuf;
use uuid::Uuid;

/// A3 item 12: a file DB in its own temp folder, removed when the test drops it (it used to leak
/// `/tmp/wb-c6-mem-*`). Derefs to the `Connection`.
struct MemDb {
    conn: Option<Connection>,
    dir: PathBuf,
}

impl std::ops::Deref for MemDb {
    type Target = Connection;
    fn deref(&self) -> &Connection {
        self.conn.as_ref().expect("open")
    }
}

impl Drop for MemDb {
    fn drop(&mut self) {
        drop(self.conn.take());
        let _ = std::fs::remove_dir_all(&self.dir);
    }
}

fn mem() -> MemDb {
    let dir = std::env::temp_dir().join(format!("wb-c6-mem-{}", Uuid::new_v4().simple()));
    std::fs::create_dir_all(&dir).unwrap();
    let conn = open_db(&dir.join("web_builder.db")).unwrap();
    MemDb { conn: Some(conn), dir }
}

fn good_preset(id: &str) -> String {
    json!({
        "formatVersion": 1,
        "id": id,
        "name": "ของฉัน",
        "nameEn": "mine",
        "category": "button",
        "appliesTo": ["button", "link"],
        "style": { "backgroundColor": "#0369a1", "color": "#ffffff" },
        "source": { "kind": "user" }
    })
    .to_string()
}

#[test]
fn migrate_creates_library_items_on_fresh_db() {
    let conn = mem();
    let name: String = conn
        .query_row(
            "SELECT name FROM sqlite_master WHERE name='library_items'",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(name, "library_items");
}

#[test]
fn migrate_on_existing_file_db_is_additive() {
    let dir = std::env::temp_dir().join(format!("wb-c6-{}", Uuid::new_v4().simple()));
    std::fs::create_dir_all(&dir).unwrap();
    let path = dir.join("web_builder.db");
    {
        let c = Connection::open(&path).unwrap();
        c.execute_batch(
            "CREATE TABLE projects (
                id TEXT PRIMARY KEY NOT NULL,
                name TEXT NOT NULL,
                document_json TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
             );",
        )
        .unwrap();
        c.execute(
            "INSERT INTO projects VALUES ('p1','Keep','{}','t0','t1')",
            [],
        )
        .unwrap();
    }
    let conn = open_db(&path).unwrap();
    let (name, doc): (String, String) = conn
        .query_row(
            "SELECT name, document_json FROM projects WHERE id='p1'",
            [],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .unwrap();
    assert_eq!(name, "Keep");
    assert_eq!(doc, "{}");
    let has: i64 = conn
        .query_row(
            "SELECT count(*) FROM sqlite_master WHERE name='library_items'",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(has, 1);
    // Second open is idempotent.
    drop(conn);
    let conn2 = open_db(&path).unwrap();
    let n: i64 = conn2
        .query_row("SELECT count(*) FROM projects", [], |r| r.get(0))
        .unwrap();
    assert_eq!(n, 1);
    let _ = std::fs::remove_dir_all(PathBuf::from(&dir));
}

#[test]
fn put_list_delete_round_trip() {
    let conn = mem();
    let json = good_preset("u1");
    let item = library_put(&conn, LIBRARY_KIND_PRESET, "u1", "ของฉัน", &json).unwrap();
    assert_eq!(item.id, "u1");
    assert_eq!(item.name, "ของฉัน");
    let list = library_list(&conn, LIBRARY_KIND_PRESET).unwrap();
    assert_eq!(list.len(), 1);
    assert_eq!(list[0].json, json);
    assert!(library_delete(&conn, "u1").unwrap());
    assert!(library_list(&conn, LIBRARY_KIND_PRESET).unwrap().is_empty());
    assert!(!library_delete(&conn, "u1").unwrap());
}

#[test]
fn put_does_not_touch_project_rows() {
    let conn = mem();
    conn.execute(
        "INSERT INTO projects (id, name, document_json, created_at, updated_at)
         VALUES ('p','N','{\"v\":1}','a','b')",
        [],
    )
    .unwrap();
    library_put(
        &conn,
        LIBRARY_KIND_PRESET,
        "u1",
        "ของฉัน",
        &good_preset("u1"),
    )
    .unwrap();
    let (name, doc): (String, String) = conn
        .query_row(
            "SELECT name, document_json FROM projects WHERE id='p'",
            [],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .unwrap();
    assert_eq!(name, "N");
    assert_eq!(doc, "{\"v\":1}");
}

#[test]
fn hostile_layout_in_states_rejected() {
    let conn = mem();
    let bad = json!({
        "formatVersion": 1,
        "id": "bad",
        "name": "เสีย",
        "nameEn": "bad",
        "category": "button",
        "appliesTo": ["button"],
        "style": { "backgroundColor": "#000", "color": "#fff" },
        "states": { "hover": { "width": 100, "backgroundColor": "#111" } },
        "source": { "kind": "user" }
    })
    .to_string();
    let err = library_put(&conn, LIBRARY_KIND_PRESET, "bad", "เสีย", &bad).unwrap_err();
    assert!(err.contains("width"), "{err}");
}

#[test]
fn oversized_json_rejected() {
    let conn = mem();
    let mut style = String::from("{\"backgroundColor\":\"#000\",\"color\":\"#fff\",\"fontFamily\":\"");
    style.push_str(&"x".repeat(LIBRARY_JSON_MAX_BYTES));
    style.push_str("\"}");
    let big = format!(
        r#"{{"formatVersion":1,"id":"big","name":"ใหญ่","nameEn":"big","category":"button","appliesTo":["button"],"style":{style},"source":{{"kind":"user"}}}}"#
    );
    assert!(big.len() > LIBRARY_JSON_MAX_BYTES);
    let err = library_put(&conn, LIBRARY_KIND_PRESET, "big", "ใหญ่", &big).unwrap_err();
    assert!(err.contains("exceeds"), "{err}");
}

#[test]
fn unknown_applies_to_rejected() {
    let bad = json!({
        "formatVersion": 1,
        "id": "x",
        "name": "x",
        "nameEn": "x",
        "category": "button",
        "appliesTo": ["wizard"],
        "style": { "color": "#fff", "backgroundColor": "#000" },
        "source": { "kind": "user" }
    })
    .to_string();
    let err = validate_preset_json(&bad).unwrap_err();
    assert!(err.contains("preset shape") || err.contains("wizard"), "{err}");
}
