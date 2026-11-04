//! Phase 10 step 6: test file create, open states, row CRUD, type and
//! constraint enforcement, corrupt recovery, close/cleanup, lazy sweep.

use super::*;
use serde_json::json;

fn model() -> Value {
    json!({ "version": 1, "tables": [
      { "id": "t_cat", "name": "categories", "primaryKey": ["c_cid"], "columns": [
        { "id": "c_cid", "name": "id", "type": "identity", "nullable": false },
        { "id": "c_cname", "name": "name", "type": "text", "nullable": false }
      ], "uniques": [{ "id": "u1", "columns": ["c_cname"] }] },
      { "id": "t_item", "name": "items", "primaryKey": ["c_id"], "columns": [
        { "id": "c_id", "name": "id", "type": "uuid", "nullable": false, "default": { "kind": "uuid" } },
        { "id": "c_email", "name": "email", "type": "text", "nullable": true },
        { "id": "c_qty", "name": "qty", "type": "integer", "nullable": true },
        { "id": "c_price", "name": "price", "type": "decimal", "nullable": true, "precision": 5, "scale": 2 },
        { "id": "c_on", "name": "active", "type": "boolean", "nullable": false, "default": { "kind": "literal", "value": true } },
        { "id": "c_day", "name": "day", "type": "date", "nullable": true },
        { "id": "c_at", "name": "created_at", "type": "timestamptz", "nullable": false, "default": { "kind": "now" } },
        { "id": "c_meta", "name": "meta", "type": "json", "nullable": true },
        { "id": "c_st", "name": "status", "type": "enum", "nullable": true, "values": ["draft", "live"] },
        { "id": "c_cat", "name": "category_id", "type": "integer", "nullable": true }
      ], "uniques": [{ "id": "u2", "columns": ["c_email"] }],
        "foreignKeys": [{ "id": "f1", "columns": ["c_cat"], "refTableId": "t_cat", "refColumns": ["c_cid"], "onDelete": "no_action" }] }
    ]})
}

const PID: &str = "0b9f1c2e-1111-4a4a-9a9a-123456789abc";

fn dir() -> tempdir::Dir {
    tempdir::Dir::new()
}

mod tempdir {
    pub struct Dir(pub std::path::PathBuf);
    impl Dir {
        pub fn new() -> Self {
            let p = std::env::temp_dir().join(format!("wb-testdb-{}", uuid::Uuid::new_v4()));
            Dir(p.join("databases"))
        }
    }
    impl Drop for Dir {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(self.0.parent().unwrap());
        }
    }
}

fn obj(v: Value) -> serde_json::Map<String, Value> {
    v.as_object().unwrap().clone()
}

fn opened(d: &tempdir::Dir) -> Option<TestDb> {
    let mut slot = None;
    let r = open(&d.0, &mut slot, PID, &model()).unwrap();
    assert_eq!(r.status, OpenStatus::Ready);
    slot
}

#[test]
fn open_creates_file_lazily_and_ready() {
    let d = dir();
    assert!(!d.0.exists(), "nothing before the first open");
    let mut slot = None;
    let r = open(&d.0, &mut slot, PID, &model()).unwrap();
    assert_eq!(r.status, OpenStatus::Ready);
    assert_eq!(r.tables, vec![
        TableCount { table_id: "t_cat".into(), row_count: 0 },
        TableCount { table_id: "t_item".into(), row_count: 0 },
    ]);
    assert!(d.0.join(format!("{PID}.sqlite")).exists());
    assert!(!d.0.join(format!("{PID}.sqlite.tmp")).exists(), "tmp renamed away");
    let db = slot.as_ref().unwrap();
    let fk: i64 = db.conn.query_row("PRAGMA foreign_keys", [], |r| r.get(0)).unwrap();
    let jm: String = db.conn.query_row("PRAGMA journal_mode", [], |r| r.get(0)).unwrap();
    let sync: i64 = db.conn.query_row("PRAGMA synchronous", [], |r| r.get(0)).unwrap();
    assert_eq!((fk, jm.as_str(), sync), (1, "delete", 2));
}

#[test]
fn invalid_model_opens_nothing() {
    let d = dir();
    let mut slot = None;
    let r = open(&d.0, &mut slot, PID, &json!({ "version": 1, "tables": [] })).unwrap();
    assert_eq!(r.status, OpenStatus::InvalidModel);
    assert!(slot.is_none() && !d.0.exists());
    // A non-uuid id is never turned into a path.
    assert_eq!(open(&d.0, &mut slot, "../x", &model()).unwrap_err(), OPEN_ERROR);
}

#[test]
fn reopen_keeps_rows_and_detects_stale() {
    let d = dir();
    let slot = opened(&d);
    insert(&slot, "t_cat", &obj(json!({ "c_cname": "a" }))).unwrap();
    drop(slot);
    let slot = opened(&d);
    assert_eq!(rows(&slot, "t_cat", 0, 100).unwrap().total, 1);
    drop(slot);
    let mut m = model();
    m["tables"][0]["columns"][1]["name"] = json!("title");
    let mut slot = None;
    let r = open(&d.0, &mut slot, PID, &m).unwrap();
    assert_eq!(r.status, OpenStatus::Stale);
    assert_eq!(r.tables[0].row_count, 1);
    // Stale is read-only.
    assert_eq!(rows(&slot, "t_cat", 0, 100).unwrap().rows.len(), 1);
    assert_eq!(insert(&slot, "t_cat", &obj(json!({ "c_cname": "b" }))).unwrap_err(), STALE_READONLY);
    // Reset rebuilds empty with the new model.
    let r = reset(&d.0, &mut slot, PID, &m).unwrap();
    assert_eq!(r.status, OpenStatus::Ready);
    assert_eq!(r.tables[0].row_count, 0);
}

#[test]
fn row_crud_and_wire_values() {
    let d = dir();
    let mut slot = opened(&d);
    let cat = insert(&slot, "t_cat", &obj(json!({ "c_cname": "แมว" }))).unwrap();
    assert_eq!(cat, 1, "identity = rowid");
    let r = insert(&slot, "t_item", &obj(json!({
        "c_email": "a@x", "c_qty": "9223372036854775807", "c_price": "-123.45", "c_day": "2026-02-28",
        "c_meta": "{\"a\":1}", "c_st": "live", "c_cat": "1"
    }))).unwrap();
    let page = rows(&slot, "t_item", 0, 100).unwrap();
    assert_eq!(page.total, 1);
    assert_eq!(page.columns[0], "c_id");
    let v = &page.rows[0].values;
    assert_eq!(page.rows[0].rowid, r);
    assert_eq!(v[0].as_str().unwrap().len(), 36, "uuid filled by Rust");
    assert_eq!(v[2], json!("9223372036854775807"), "i64 as string");
    assert_eq!(v[4], json!(true), "boolean default → bool");
    assert!(v[6].as_str().unwrap().ends_with('Z'), "now default");
    update(&slot, "t_item", r, "c_on", &json!(false)).unwrap();
    update(&slot, "t_item", r, "c_email", &Value::Null).unwrap();
    let v = &rows(&slot, "t_item", 0, 100).unwrap().rows[0].values;
    assert_eq!((v[1].clone(), v[4].clone()), (Value::Null, json!(false)));
    assert_eq!(delete(&mut slot, "t_item", &[r]).unwrap(), 1);
    assert_eq!(rows(&slot, "t_item", 0, 100).unwrap().total, 0);
}

#[test]
fn paging_by_rowid_capped_at_100() {
    let d = dir();
    let slot = opened(&d);
    for i in 0..150 {
        insert(&slot, "t_cat", &obj(json!({ "c_cname": format!("n{i}") }))).unwrap();
    }
    let p = rows(&slot, "t_cat", 0, 500).unwrap();
    assert_eq!((p.total, p.rows.len()), (150, 100));
    let p2 = rows(&slot, "t_cat", 100, 100).unwrap();
    assert_eq!(p2.rows.len(), 50);
    assert_eq!(p2.rows[0].rowid, 101);
}

#[test]
fn types_and_constraints_enforced() {
    let d = dir();
    let mut slot = opened(&d);
    let ins = |v: Value| insert(&slot, "t_item", &obj(v));
    for (col, val) in [
        ("c_qty", json!("1.5")),
        ("c_qty", json!("99999999999999999999")),
        ("c_price", json!("1234.5")),
        ("c_price", json!("1.234")),
        ("c_on", json!("true")),
        ("c_day", json!("2026-02-30")),
        ("c_day", json!("26-1-1")),
        ("c_at", json!("not a time")),
        ("c_meta", json!("{bad")),
        ("c_st", json!("gone")),
        ("c_id", json!("nope")),
    ] {
        let name = ["c_qty", "c_price", "c_on", "c_day", "c_at", "c_meta", "c_st", "c_id"]
            .iter()
            .zip(["qty", "price", "active", "day", "created_at", "meta", "status", "id"])
            .find(|(c, _)| **c == col)
            .unwrap()
            .1;
        assert_eq!(ins(json!({ col: val })).unwrap_err(), format!("รูปแบบไม่ถูกต้อง: {name}"), "{col}={val}");
    }
    assert_eq!(ins(json!({ "c_on": null })).unwrap_err(), "ต้องมีค่า: active");
    ins(json!({ "c_email": "dup" })).unwrap();
    assert_eq!(ins(json!({ "c_email": "dup" })).unwrap_err(), "ค่าซ้ำ: email");
    assert_eq!(ins(json!({ "c_cat": "7" })).unwrap_err(), "ไม่พบแถวที่อ้างอิง: category_id");
    // FK: parent delete refused while referenced; update to a missing parent refused.
    let cat = insert(&slot, "t_cat", &obj(json!({ "c_cname": "x" }))).unwrap();
    let item = ins(json!({ "c_cat": cat.to_string() })).unwrap();
    assert_eq!(update(&slot, "t_item", item, "c_cat", &json!("99")).unwrap_err(), "ไม่พบแถวที่อ้างอิง: category_id");
    assert_eq!(delete(&mut slot, "t_cat", &[cat]).unwrap_err(), DELETE_REFERENCED);
    assert_eq!(rows(&slot, "t_cat", 0, 10).unwrap().total, 1, "failed delete rolled back");
    assert!(update(&slot, "t_cat", cat, "c_cid", &json!("5")).unwrap_err().contains("ลำดับอัตโนมัติ"));
    delete(&mut slot, "t_item", &[item]).unwrap();
    assert_eq!(delete(&mut slot, "t_cat", &[cat]).unwrap(), 1);
}

#[test]
fn corrupt_file_reported_then_rebuilt() {
    let d = dir();
    drop(opened(&d));
    let path = d.0.join(format!("{PID}.sqlite"));
    // Truncate mid-file.
    let bytes = std::fs::read(&path).unwrap();
    std::fs::write(&path, &bytes[..bytes.len() / 2]).unwrap();
    let mut slot = None;
    assert_eq!(open(&d.0, &mut slot, PID, &model()).unwrap().status, OpenStatus::Corrupt);
    assert!(slot.is_none(), "connection stays closed");
    // Garbage header too.
    std::fs::write(&path, b"not a database at all, really not").unwrap();
    assert_eq!(open(&d.0, &mut slot, PID, &model()).unwrap().status, OpenStatus::Corrupt);
    assert_eq!(rows(&slot, "t_cat", 0, 10).unwrap_err(), NOT_OPEN);
    let r = reset(&d.0, &mut slot, PID, &model()).unwrap();
    assert_eq!(r.status, OpenStatus::Ready);
}

#[test]
fn failed_build_keeps_old_file() {
    let d = dir();
    let slot = opened(&d);
    insert(&slot, "t_cat", &obj(json!({ "c_cname": "keep" }))).unwrap();
    drop(slot);
    let path = d.0.join(format!("{PID}.sqlite"));
    let before = std::fs::read(&path).unwrap();
    // A directory where the tmp file must go makes the build fail.
    std::fs::create_dir_all(d.0.join(format!("{PID}.sqlite.tmp"))).unwrap();
    let m: DbModel = parse_model(&model()).unwrap();
    assert!(build(&path, &m).is_err());
    assert_eq!(std::fs::read(&path).unwrap(), before);
}

#[test]
fn close_releases_the_file() {
    let d = dir();
    drop(opened(&d));
    // No fd left: the file can be removed and the dir deleted (and on Linux
    // /proc/self/fd has no link to it).
    let path = d.0.join(format!("{PID}.sqlite"));
    let fds = || {
        std::fs::read_dir("/proc/self/fd")
            .map(|it| it.flatten().filter(|e| std::fs::read_link(e.path()).map(|l| l == path).unwrap_or(false)).count())
            .unwrap_or(0)
    };
    assert_eq!(fds(), 0);
    let s2 = opened(&d);
    assert_eq!(fds(), 1);
    drop(s2);
    assert_eq!(fds(), 0);
    assert!(!d.0.join(format!("{PID}.sqlite-journal")).exists());
}

#[test]
fn open_closes_previous_project() {
    let d = dir();
    let mut slot = opened(&d);
    let other = "0b9f1c2e-2222-4a4a-9a9a-123456789abc";
    open(&d.0, &mut slot, other, &model()).unwrap();
    assert_eq!(slot.as_ref().unwrap().project_id, other);
}

#[test]
fn lazy_sweep_removes_orphans_only() {
    let d = dir();
    std::fs::create_dir_all(&d.0).unwrap();
    let live = "0b9f1c2e-3333-4a4a-9a9a-123456789abc";
    for f in [format!("{PID}.sqlite"), format!("{PID}.sqlite-journal"), format!("{live}.sqlite"), "notes.txt".into()] {
        std::fs::write(d.0.join(f), b"x").unwrap();
    }
    let state = TestDbState::default();
    sweep_once(&state, &d.0, || [live.to_string()].into_iter().collect());
    let mut left: Vec<String> = std::fs::read_dir(&d.0).unwrap().map(|e| e.unwrap().file_name().into_string().unwrap()).collect();
    left.sort();
    assert_eq!(left, vec![format!("{live}.sqlite"), "notes.txt".to_string()]);
    // Once per run.
    std::fs::write(d.0.join(format!("{PID}.sqlite")), b"x").unwrap();
    sweep_once(&state, &d.0, || HashSet::new());
    assert!(d.0.join(format!("{PID}.sqlite")).exists());
}

fn meta_model(slot: &Option<TestDb>) -> Value {
    let s: String = slot.as_ref().unwrap().conn.query_row("SELECT value FROM wb_meta WHERE key = 'model'", [], |r| r.get(0)).unwrap();
    serde_json::from_str(&s).unwrap()
}

#[test]
fn label_only_change_is_not_stale_and_refreshes_wb_meta() {
    let d = dir();
    let slot = opened(&d);
    insert(&slot, "t_cat", &obj(json!({ "c_cname": "keep" }))).unwrap();
    drop(slot);
    let mut m = model();
    m["tables"][0]["label"] = json!("หมวดหมู่");
    m["tables"][1]["columns"][1]["label"] = json!("อีเมล");
    let mut slot = None;
    let r = open(&d.0, &mut slot, PID, &m).unwrap();
    assert_eq!(r.status, OpenStatus::Ready);
    assert_eq!(r.tables[0].row_count, 1, "rows survive");
    let stored = parse_model(&meta_model(&slot)).unwrap();
    assert_eq!(stored, parse_model(&m).unwrap(), "wb_meta updated quietly");
    // Writable (not stale) and the next open is a plain ready.
    insert(&slot, "t_cat", &obj(json!({ "c_cname": "more" }))).unwrap();
    drop(slot);
    let mut slot = None;
    assert_eq!(open(&d.0, &mut slot, PID, &m).unwrap().status, OpenStatus::Ready);
    // Removing a label is label-only too.
    assert_eq!(open(&d.0, &mut slot, PID, &model()).unwrap().status, OpenStatus::Ready);
}

#[test]
fn structural_changes_are_stale() {
    let edits: Vec<(&str, fn(&mut Value))> = vec![
        ("table name", |m| m["tables"][0]["name"] = json!("cats")),
        ("column name", |m| m["tables"][1]["columns"][1]["name"] = json!("mail")),
        ("type", |m| m["tables"][1]["columns"][7]["type"] = json!("text")),
        ("nullable", |m| m["tables"][1]["columns"][1]["nullable"] = json!(false)),
        ("unique", |m| m["tables"][1]["uniques"] = json!([])),
        ("default", |m| m["tables"][1]["columns"][2]["default"] = json!({ "kind": "literal", "value": "1" })),
        ("check (enum values)", |m| m["tables"][1]["columns"][8]["values"] = json!(["draft", "live", "gone"])),
        ("check (decimal scale)", |m| m["tables"][1]["columns"][3]["scale"] = json!(1)),
        ("primary key", |m| m["tables"][1]["primaryKey"] = json!(["c_id", "c_on"])),
        ("fk on delete", |m| m["tables"][1]["foreignKeys"][0]["onDelete"] = json!("cascade")),
        ("fk removed", |m| m["tables"][1]["foreignKeys"] = json!([])),
        ("column added", |m| m["tables"][0]["columns"].as_array_mut().unwrap().push(json!({ "id": "c_x", "name": "x", "type": "text", "nullable": true }))),
    ];
    for (what, edit) in edits {
        let d = dir();
        drop(opened(&d));
        let mut m = model();
        edit(&mut m);
        let pm = parse_model(&m).unwrap();
        assert_eq!(validate(&pm), vec![], "{what}: edited model must stay valid");
        let mut slot = None;
        assert_eq!(open(&d.0, &mut slot, PID, &m).unwrap().status, OpenStatus::Stale, "{what}");
        assert_eq!(parse_model(&meta_model(&slot)).unwrap(), parse_model(&model()).unwrap(), "{what}: wb_meta untouched");
    }
}

/// `db_test_update` returns the stored value: a uuid typed in uppercase or
/// wrapped in braces comes back canonical lowercase; others round-trip.
#[test]
fn update_returns_the_stored_normalized_value() {
    let d = dir();
    let slot = opened(&d);
    let r = insert(&slot, "t_item", &obj(json!({}))).unwrap();
    let canon = "0b9f1c2e-1111-4a4a-9a9a-123456789abc";
    let item = |slot: &Option<TestDb>| rows(slot, "t_item", 0, 100).unwrap().rows[0].values[0].clone();
    for typed in ["0B9F1C2E-1111-4A4A-9A9A-123456789ABC", "{0b9f1c2e-1111-4a4a-9a9a-123456789abc}", " 0b9f1c2e11114a4a9a9a123456789abc "] {
        let got = update(&slot, "t_item", r, "c_id", &json!(typed)).unwrap();
        assert_eq!(got, json!(canon), "{typed}");
        assert_eq!(item(&slot), json!(canon));
    }
    assert_eq!(update(&slot, "t_item", r, "c_on", &json!(false)).unwrap(), json!(false));
    assert_eq!(update(&slot, "t_item", r, "c_qty", &json!(" 42 ")).unwrap(), json!("42"));
    assert_eq!(update(&slot, "t_item", r, "c_email", &Value::Null).unwrap(), Value::Null);
}
