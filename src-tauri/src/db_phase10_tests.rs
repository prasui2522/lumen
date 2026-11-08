//! Phase 10 step 1: db_models migration, save/load, atomicity, delete cleanup.

use super::*;
use rusqlite::OptionalExtension;
use serde_json::json;

fn tmp_dir() -> PathBuf {
    let d = std::env::temp_dir().join(format!("wb-p10-{}", Uuid::new_v4().simple()));
    std::fs::create_dir_all(&d).unwrap();
    d
}

fn mem() -> Connection {
    let conn = Connection::open_in_memory().unwrap();
    conn.execute_batch("PRAGMA foreign_keys=ON;").unwrap();
    migrate(&conn).unwrap();
    conn
}

fn model() -> serde_json::Value {
    json!({"version":1,"tables":[{"id":"t1","name":"users","label":"ผู้ใช้","columns":[
        {"id":"c1","name":"id","type":"uuid","nullable":false,"default":{"kind":"uuid"}},
        {"id":"c2","name":"n","type":"integer","nullable":true,"default":{"kind":"literal","value":"9007199254740993"}}
    ],"primaryKey":["c1"],"uniques":[],"foreignKeys":[]}]})
}

fn project_row(conn: &Connection, id: &str) -> (String, String, String, String) {
    conn.query_row(
        "SELECT name, document_json, created_at, updated_at FROM projects WHERE id = ?1",
        params![id],
        |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
    )
    .unwrap()
}

fn dump(conn: &Connection) -> Vec<String> {
    let mut out = Vec::new();
    let mut s = conn
        .prepare("SELECT type || ' ' || name || ' ' || IFNULL(sql,'') FROM sqlite_master ORDER BY type, name")
        .unwrap();
    out.extend(s.query_map([], |r| r.get::<_, String>(0)).unwrap().map(Result::unwrap));
    let mut s = conn.prepare("SELECT id, name, document_json, created_at, updated_at FROM projects ORDER BY id").unwrap();
    out.extend(
        s.query_map([], |r| Ok(format!("P {}|{}|{}|{}|{}", r.get::<_, String>(0)?, r.get::<_, String>(1)?, r.get::<_, String>(2)?, r.get::<_, String>(3)?, r.get::<_, String>(4)?)))
            .unwrap()
            .map(Result::unwrap),
    );
    let mut s = conn.prepare("SELECT id, project_id, ext FROM assets ORDER BY id").unwrap();
    out.extend(
        s.query_map([], |r| Ok(format!("A {}|{}|{}", r.get::<_, String>(0)?, r.get::<_, String>(1)?, r.get::<_, String>(2)?)))
            .unwrap()
            .map(Result::unwrap),
    );
    out
}

/// A file DB in the exact pre-Phase-10 shape (projects + index + assets, WAL)
/// with real rows, migrated by `open_db`: rows, document_json and existing
/// schema are unchanged, `db_models` is added empty, and a second open is a
/// no-op (identical schema and data).
#[test]
fn migration_on_pre_phase10_file_db_is_additive_and_idempotent() {
    let dir = tmp_dir();
    let path = dir.join("web_builder.db");
    // Odd-but-valid stored JSON must survive byte-for-byte (nothing rewrites it).
    let doc_a = r#"{"version":5,"meta":{"title":"A"},"root":"r","nodes":{},"pages":[{"id":"p"}],"x":  1}"#;
    let doc_b = r#"{"version":2, "meta":{"title":"ข"}}"#;
    {
        let c = Connection::open(&path).unwrap();
        c.execute_batch(
            "PRAGMA journal_mode=WAL;
             CREATE TABLE projects (
                id TEXT PRIMARY KEY NOT NULL,
                name TEXT NOT NULL,
                document_json TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
             );
             CREATE INDEX idx_projects_updated_at ON projects(updated_at DESC);
             CREATE TABLE assets (
                id TEXT PRIMARY KEY NOT NULL,
                project_id TEXT NOT NULL,
                ext TEXT NOT NULL
             );
             CREATE INDEX idx_assets_project ON assets(project_id);",
        )
        .unwrap();
        c.execute("INSERT INTO projects VALUES ('a','Alpha',?1,'2026-01-01T00:00:00.000Z','2026-01-02T00:00:00.000Z')", params![doc_a]).unwrap();
        c.execute("INSERT INTO projects VALUES ('b','เบต้า',?1,'2026-02-01T00:00:00.000Z','2026-02-02T00:00:00.000Z')", params![doc_b]).unwrap();
        c.execute("INSERT INTO assets VALUES ('x1','a','png'), ('x2','b','webp')", []).unwrap();
    }
    let before = {
        let c = Connection::open(&path).unwrap();
        let has: Option<String> = c
            .query_row("SELECT name FROM sqlite_master WHERE name='db_models'", [], |r| r.get(0))
            .optional()
            .unwrap();
        assert!(has.is_none(), "pre-Phase-10 shape has no db_models");
        dump(&c)
    };

    let first = {
        let c = open_db(&path).unwrap();
        let after = dump(&c);
        let added: Vec<_> = after.iter().filter(|l| !before.contains(l)).collect();
        // Phase 10: db_models (+ autoindex). Phase 11 C6: library_items (+ kind index).
        assert!(
            added.iter().all(|l| l.contains("db_models") || l.contains("library_items")),
            "unexpected migration tables: {added:#?}"
        );
        assert!(added.iter().any(|l| l.contains("db_models")), "{added:#?}");
        assert!(added.iter().any(|l| l.contains("library_items")), "{added:#?}");

        assert!(before.iter().all(|l| after.contains(l)), "nothing existing changed or vanished");
        let n: i64 = c.query_row("SELECT COUNT(*) FROM db_models", [], |r| r.get(0)).unwrap();
        assert_eq!(n, 0);
        let stored: String = c.query_row("SELECT document_json FROM projects WHERE id='a'", [], |r| r.get(0)).unwrap();
        assert_eq!(stored, doc_a, "document_json untouched");
        assert_eq!(load_db_model(&c, "a").unwrap(), None);
        after
    };
    // Second open (and an explicit extra migrate) change nothing.
    let c = open_db(&path).unwrap();
    migrate(&c).unwrap();
    assert_eq!(dump(&c), first, "second migration is a no-op");
    let integrity: String = c.query_row("PRAGMA integrity_check", [], |r| r.get(0)).unwrap();
    assert_eq!(integrity, "ok");
    drop(c);
    let _ = std::fs::remove_dir_all(dir);
}

#[test]
fn save_load_round_trip_and_none_keeps_model() {
    let conn = mem();
    let p = create_project(&conn, "P".into()).unwrap();
    assert_eq!(load_db_model(&conn, &p.id).unwrap(), None);

    save_project_with_model(&conn, &p.id, None, &p.document, Some(&model())).unwrap();
    let loaded = load_db_model(&conn, &p.id).unwrap().unwrap();
    assert_eq!(loaded, model(), "canonical form equals the input here");
    assert_eq!(loaded["tables"][0]["columns"][1]["default"]["value"], "9007199254740993", "i64 stays a string");
    let (_, _, _, upd) = project_row(&conn, &p.id);
    let model_ts: String = conn.query_row("SELECT updated_at FROM db_models WHERE project_id=?1", params![p.id], |r| r.get(0)).unwrap();
    assert_eq!(upd, model_ts, "same save timestamp");

    // Unknown keys are dropped (ambiguity default 4); an invalid draft saves.
    let mut draft = json!({"version":1,"tables":[],"extra":1});
    save_project_with_model(&conn, &p.id, None, &p.document, Some(&draft)).unwrap();
    draft.as_object_mut().unwrap().remove("extra");
    assert_eq!(load_db_model(&conn, &p.id).unwrap().unwrap(), draft);

    // A plain save (no model) leaves the stored model alone.
    save_project(&conn, &p.id, Some("Q".into()), &p.document).unwrap();
    assert_eq!(load_db_model(&conn, &p.id).unwrap().unwrap(), draft);
    let rows: i64 = conn.query_row("SELECT COUNT(*) FROM db_models", [], |r| r.get(0)).unwrap();
    assert_eq!(rows, 1, "upsert, not a second row");

    // Document version rule untouched by a model save.
    assert_eq!(open_project(&conn, &p.id).unwrap().document.version, 1);
}

#[test]
fn unparseable_model_is_refused_and_writes_nothing() {
    let conn = mem();
    let p = create_project(&conn, "P".into()).unwrap();
    let before = project_row(&conn, &p.id);
    let mut doc = p.document.clone();
    doc.meta.title = "changed".into();
    for bad in [json!({"version":2,"tables":[]}), json!([1]), json!({"version":1})] {
        let err = save_project_with_model(&conn, &p.id, Some("New".into()), &doc, Some(&bad)).unwrap_err();
        assert_eq!(err, "โครงสร้างฐานข้อมูลไม่ถูกต้อง");
    }
    assert_eq!(project_row(&conn, &p.id), before);
    assert_eq!(load_db_model(&conn, &p.id).unwrap(), None);
}

/// The model insert fails INSIDE the transaction (a trigger aborts it after the
/// project UPDATE ran): the project row stays byte-identical and no model row exists.
#[test]
fn failed_model_write_rolls_back_project_row() {
    let conn = mem();
    let p = create_project(&conn, "P".into()).unwrap();
    save_project_with_model(&conn, &p.id, None, &p.document, Some(&model())).unwrap();
    let before = project_row(&conn, &p.id);
    let model_before = load_db_model(&conn, &p.id).unwrap();
    conn.execute_batch(
        "CREATE TRIGGER boom_ins BEFORE INSERT ON db_models BEGIN SELECT RAISE(ABORT, 'boom'); END;
         CREATE TRIGGER boom_upd BEFORE UPDATE ON db_models BEGIN SELECT RAISE(ABORT, 'boom'); END;",
    )
    .unwrap();
    let mut doc = p.document.clone();
    doc.meta.title = "changed".into();
    let err = save_project_with_model(&conn, &p.id, Some("Renamed".into()), &doc, Some(&json!({"version":1,"tables":[]})))
        .unwrap_err();
    assert!(err.contains("boom"), "{err}");
    assert_eq!(project_row(&conn, &p.id), before, "project row byte-identical");
    assert_eq!(load_db_model(&conn, &p.id).unwrap(), model_before);
    assert!(conn.is_autocommit(), "no transaction left open");
    // A save without a model is unaffected by the trigger.
    save_project(&conn, &p.id, Some("Renamed".into()), &doc).unwrap();
    assert_eq!(project_row(&conn, &p.id).0, "Renamed");
}

#[test]
fn missing_project_save_writes_no_model() {
    let conn = mem();
    let doc = create_project(&conn, "P".into()).unwrap().document;
    assert!(save_project_with_model(&conn, "ghost", None, &doc, Some(&model())).is_err());
    let n: i64 = conn.query_row("SELECT COUNT(*) FROM db_models", [], |r| r.get(0)).unwrap();
    assert_eq!(n, 0);
}

#[test]
fn load_reports_a_corrupt_row() {
    let conn = mem();
    conn.execute("INSERT INTO db_models VALUES ('x','{not json','t')", []).unwrap();
    assert_eq!(load_db_model(&conn, "x").unwrap_err(), "อ่านโครงสร้างไม่ได้");
}

#[test]
fn delete_removes_model_row_and_test_files() {
    let conn = mem();
    let a = create_project(&conn, "A".into()).unwrap();
    let b = create_project(&conn, "B".into()).unwrap();
    for p in [&a, &b] {
        save_project_with_model(&conn, &p.id, None, &p.document, Some(&model())).unwrap();
    }
    let dir = tmp_dir();
    let dbs = databases_dir(&dir);
    std::fs::create_dir_all(&dbs).unwrap();
    for p in [&a, &b] {
        for f in test_db_files(&dbs, &p.id) {
            std::fs::write(f, b"x").unwrap();
        }
    }
    delete_project(&conn, &a.id).unwrap();
    remove_test_db_files(&dbs, &a.id);
    assert_eq!(load_db_model(&conn, &a.id).unwrap(), None);
    assert!(load_db_model(&conn, &b.id).unwrap().is_some(), "other project kept");
    assert!(test_db_files(&dbs, &a.id).iter().all(|f| !f.exists()));
    assert!(test_db_files(&dbs, &b.id).iter().all(|f| f.exists()), "other files kept");
    // Missing files / missing folder: still fine (best effort).
    remove_test_db_files(&dir.join("none"), &b.id);
    // Unknown project: error, nothing removed, transaction rolled back.
    assert!(delete_project(&conn, "ghost").is_err());
    assert!(conn.is_autocommit());
    assert!(load_db_model(&conn, &b.id).unwrap().is_some());
    let _ = std::fs::remove_dir_all(dir);
}

#[test]
fn test_file_names_never_escape_the_folder() {
    let d = Path::new("/x/databases");
    assert_eq!(
        test_db_files(d, "1b4e28ba-2fa1-11d2-883f-0016d3cca427"),
        vec![
            d.join("1b4e28ba-2fa1-11d2-883f-0016d3cca427.sqlite"),
            d.join("1b4e28ba-2fa1-11d2-883f-0016d3cca427.sqlite-journal"),
            d.join("1b4e28ba-2fa1-11d2-883f-0016d3cca427.sqlite.tmp"),
        ]
    );
    for bad in ["", "../x", "a/b", "a.b", "x y", "/etc"] {
        assert!(test_db_files(d, bad).is_empty(), "{bad}");
    }
}
