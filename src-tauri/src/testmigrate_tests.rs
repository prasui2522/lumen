//! Phase 10 step 7: compatibility table (§7 / §11 step 7): each widening
//! kept, each narrowing lost, enum shrink, NOT NULL over NULLs, unique over
//! duplicates (lowest rowid kept), FK orphans cascading, dropped table and
//! column, rename keeps data, failed build/apply keeps the old file, tokens.

use super::*;
use crate::testdb::{open, rows, OpenStatus, TestDb};
use serde_json::{json, Value};

const PID: &str = "7c1d2e3f-2222-4b4b-8c8c-abcdefabcdef";

struct Dir(std::path::PathBuf);
impl Dir {
    fn new() -> Self {
        Dir(std::env::temp_dir().join(format!("wb-migrate-{}", uuid::Uuid::new_v4())).join("databases"))
    }
    fn file(&self) -> std::path::PathBuf {
        self.0.join(format!("{PID}.sqlite"))
    }
    fn tmp(&self) -> std::path::PathBuf {
        self.0.join(format!("{PID}.sqlite.tmp"))
    }
}
impl Drop for Dir {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(self.0.parent().unwrap());
    }
}

fn c(id: &str, name: &str, ty: &str) -> Value {
    json!({ "id": id, "name": name, "type": ty, "nullable": true })
}
fn with(mut col: Value, extra: Value) -> Value {
    for (k, v) in extra.as_object().unwrap() {
        col[k] = v.clone();
    }
    col
}
fn pk_id() -> Value {
    json!({ "id": "k", "name": "id", "type": "identity", "nullable": false })
}
fn table(id: &str, name: &str, cols: Vec<Value>) -> Value {
    let mut all = vec![pk_id()];
    all[0]["id"] = json!(format!("{id}_k"));
    all.extend(cols);
    json!({ "id": id, "name": name, "primaryKey": [format!("{id}_k")], "columns": all })
}
fn model(tables: Vec<Value>) -> Value {
    json!({ "version": 1, "tables": tables })
}

/// Open `old`, run `sql` (FKs on), return the dir and the open slot.
fn setup(old: &Value, sql: &str) -> (Dir, Option<TestDb>) {
    let d = Dir::new();
    let mut slot = None;
    let r = open(&d.0, &mut slot, PID, old).unwrap();
    assert_eq!(r.status, OpenStatus::Ready, "old model valid");
    slot.as_ref().unwrap().conn.execute_batch(sql).unwrap();
    (d, slot)
}

/// Reopen with `new` (must be stale), plan, apply. Returns the plan.
fn migrate(d: &Dir, slot: &mut Option<TestDb>, new: &Value) -> PlanResult {
    let r = open(&d.0, slot, PID, new).unwrap();
    assert_eq!(r.status, OpenStatus::Stale);
    let p = plan(&d.0, slot, new).unwrap();
    assert!(d.tmp().exists(), "plan builds <id>.sqlite.tmp");
    let r = apply(&d.0, slot, &p.token).unwrap();
    assert_eq!(r.status, OpenStatus::Ready);
    assert!(!d.tmp().exists());
    p
}

fn col(slot: &Option<TestDb>, table_id: &str, col_id: &str) -> Vec<Value> {
    let r = rows(slot, table_id, 0, 100).unwrap();
    let i = r.columns.iter().position(|c| c == col_id).unwrap();
    r.rows.into_iter().map(|row| row.values[i].clone()).collect()
}
fn rowids(slot: &Option<TestDb>, table_id: &str) -> Vec<i64> {
    rows(slot, table_id, 0, 100).unwrap().rows.into_iter().map(|r| r.rowid).collect()
}
fn tp<'a>(p: &'a PlanResult, id: &str) -> &'a TablePlan {
    p.tables.iter().find(|t| t.table_id == id).unwrap()
}
fn counts(p: &PlanResult, id: &str) -> (i64, i64) {
    let t = tp(p, id);
    (t.rows_lost, t.values_lost)
}

#[test]
fn each_widening_is_kept() {
    let old = model(vec![table("t", "w", vec![
        c("i1", "i_dec", "integer"),
        c("i2", "i_text", "integer"),
        with(c("d1", "d_text", "decimal"), json!({ "precision": 12, "scale": 2 })),
        with(c("d2", "d_wide", "decimal"), json!({ "precision": 5, "scale": 2 })),
        c("b1", "b_text", "boolean"),
        c("da", "da_text", "date"),
        c("ts", "ts_text", "timestamptz"),
        c("u", "u_text", "uuid"),
        c("j", "j_text", "json"),
        with(c("e1", "e_text", "enum"), json!({ "values": ["a", "b"] })),
        with(c("e2", "e_grow", "enum"), json!({ "values": ["a", "b"] })),
        c("tx", "tx_same", "text"),
    ])]);
    let new = model(vec![table("t", "w", vec![
        with(c("i1", "i_dec", "decimal"), json!({ "precision": 12, "scale": 2 })),
        c("i2", "i_text", "text"),
        c("d1", "d_text", "text"),
        with(c("d2", "d_wide", "decimal"), json!({ "precision": 10, "scale": 4 })),
        c("b1", "b_text", "text"),
        c("da", "da_text", "text"),
        c("ts", "ts_text", "text"),
        c("u", "u_text", "text"),
        c("j", "j_text", "text"),
        c("e1", "e_text", "text"),
        with(c("e2", "e_grow", "enum"), json!({ "values": ["a", "b", "c"] })),
        c("tx", "tx_same", "text"),
    ])]);
    let (d, mut slot) = setup(&old, "
        INSERT INTO w (i_dec,i_text,d_text,d_wide,b_text,da_text,ts_text,u_text,j_text,e_text,e_grow,tx_same) VALUES
          (5, -7, '1.50', '123.45', 1, '2026-10-18', '2026-10-18T01:02:03.000Z',
           '0b9f1c2e-1111-4a4a-9a9a-123456789abc', '{\"a\":1}', 'a', 'b', 'สวัสดี'),
          (NULL, NULL, NULL, NULL, 0, NULL, NULL, NULL, NULL, NULL, NULL, NULL);");
    let p = migrate(&d, &mut slot, &new);
    assert!(p.lossless, "{:?}", p.tables);
    assert_eq!(counts(&p, "t"), (0, 0));
    let first = |id: &str| col(&slot, "t", id);
    assert_eq!(first("i1"), vec![json!("5"), Value::Null]);
    assert_eq!(first("i2"), vec![json!("-7"), Value::Null]);
    assert_eq!(first("d1")[0], json!("1.50"));
    assert_eq!(first("d2")[0], json!("123.45"));
    assert_eq!(first("b1"), vec![json!("true"), json!("false")]);
    assert_eq!(first("da")[0], json!("2026-10-18"));
    assert_eq!(first("ts")[0], json!("2026-10-18T01:02:03.000Z"));
    assert_eq!(first("u")[0], json!("0b9f1c2e-1111-4a4a-9a9a-123456789abc"));
    assert_eq!(first("j")[0], json!("{\"a\":1}"));
    assert_eq!(first("e1")[0], json!("a"));
    assert_eq!(first("e2")[0], json!("b"));
    assert_eq!(first("tx")[0], json!("สวัสดี"));
}

#[test]
fn each_narrowing_is_lost_and_counted() {
    let old = model(vec![table("t", "n", vec![
        c("a", "t_int", "text"),
        with(c("b", "dec_int", "decimal"), json!({ "precision": 12, "scale": 2 })),
        c("c", "int_dec", "integer"),
        with(c("dn", "dec_narrow", "decimal"), json!({ "precision": 10, "scale": 4 })),
        c("e", "text_date", "text"),
        c("f", "bool_int", "boolean"),
        c("g", "json_uuid", "json"),
        c("h", "date_ts", "date"),
        c("i", "int_bool", "integer"),
    ])]);
    let new = model(vec![table("t", "n", vec![
        c("a", "t_int", "integer"),
        c("b", "dec_int", "integer"),
        with(c("c", "int_dec", "decimal"), json!({ "precision": 3, "scale": 1 })),
        with(c("dn", "dec_narrow", "decimal"), json!({ "precision": 5, "scale": 2 })),
        c("e", "text_date", "date"),
        c("f", "bool_int", "integer"),
        c("g", "json_uuid", "uuid"),
        c("h", "date_ts", "timestamptz"),
        c("i", "int_bool", "boolean"),
    ])]);
    // Row 1: every value lost except the fitting int→decimal / decimal narrow.
    // Row 2: int 12345 doesn't fit decimal(3,1); 1.23456 doesn't fit (5,2).
    let (d, mut slot) = setup(&old, "
        INSERT INTO n VALUES (1, '7', '1.5', 12, '12.5', '2026-10-18', 1, '{}', '2026-10-18', 1);
        INSERT INTO n VALUES (2, 'x', NULL, 12345, '1.23456', NULL, NULL, NULL, NULL, NULL);");
    let p = migrate(&d, &mut slot, &new);
    assert!(!p.lossless);
    // Row 1: a,b,e,f,g,h,i lost = 7; row 2: a,c,dn = 3.
    assert_eq!(counts(&p, "t"), (0, 10));
    assert_eq!(col(&slot, "t", "a"), vec![Value::Null, Value::Null]);
    assert_eq!(col(&slot, "t", "c"), vec![json!("12"), Value::Null], "int→decimal kept only when it fits");
    assert_eq!(col(&slot, "t", "dn"), vec![json!("12.5"), Value::Null], "decimal narrowed: kept only when it fits");
    assert_eq!(col(&slot, "t", "e"), vec![Value::Null, Value::Null]);
    assert_eq!(col(&slot, "t", "i"), vec![Value::Null, Value::Null]);
}

#[test]
fn enum_shrink_clears_removed_values() {
    let old = model(vec![table("t", "e", vec![with(c("s", "status", "enum"), json!({ "values": ["draft", "live", "old"] }))])]);
    let new = model(vec![table("t", "e", vec![with(c("s", "status", "enum"), json!({ "values": ["live", "draft"] }))])]);
    let (d, mut slot) =
        setup(&old, "INSERT INTO e (status) VALUES ('draft'), ('old'), ('live'), (NULL), ('old');");
    let p = migrate(&d, &mut slot, &new);
    assert_eq!(counts(&p, "t"), (0, 2));
    assert_eq!(col(&slot, "t", "s"), vec![json!("draft"), Value::Null, json!("live"), Value::Null, Value::Null]);
}

#[test]
fn not_null_added_over_nulls_loses_those_rows() {
    let old = model(vec![table("t", "nn", vec![c("a", "email", "text"), c("b", "note", "text")])]);
    let new = model(vec![table("t", "nn", vec![with(c("a", "email", "text"), json!({ "nullable": false })), c("b", "note", "text")])]);
    let (d, mut slot) = setup(&old, "INSERT INTO nn (email, note) VALUES ('a@x', 'n1'), (NULL, 'n2'), ('c@x', NULL), (NULL, NULL);");
    let p = migrate(&d, &mut slot, &new);
    assert_eq!(counts(&p, "t"), (2, 0), "lost rows don't add their values");
    assert_eq!(rowids(&slot, "t"), vec![1, 3]);
    assert_eq!(col(&slot, "t", "a"), vec![json!("a@x"), json!("c@x")]);
}

#[test]
fn unique_over_duplicates_keeps_lowest_rowid() {
    let old = model(vec![table("t", "u", vec![c("a", "email", "text"), c("b", "n", "integer")])]);
    let mut new = old.clone();
    new["tables"][0]["uniques"] = json!([{ "id": "u1", "columns": ["a"] }]);
    let (d, mut slot) = setup(&old, "
        INSERT INTO u (id, email, n) VALUES (3, 'x', 1), (5, 'y', 2), (9, 'x', 3), (12, NULL, 4), (15, NULL, 5), (20, 'y', 6);");
    let p = migrate(&d, &mut slot, &new);
    assert_eq!(counts(&p, "t"), (2, 0));
    assert_eq!(rowids(&slot, "t"), vec![3, 5, 12, 15], "NULLs are not duplicates");
    assert_eq!(col(&slot, "t", "b"), vec![json!("1"), json!("2"), json!("4"), json!("5")]);
}

#[test]
fn pk_change_over_duplicates_keeps_lowest_rowid() {
    // Composite uuid PK over a column with duplicates.
    let old = model(vec![json!({ "id": "t", "name": "p", "primaryKey": ["a"], "columns": [
        { "id": "a", "name": "id", "type": "uuid", "nullable": false, "default": { "kind": "uuid" } },
        c("b", "code", "text") ] })]);
    let new = model(vec![json!({ "id": "t", "name": "p", "primaryKey": ["b"], "columns": [
        { "id": "a", "name": "id", "type": "uuid", "nullable": false, "default": { "kind": "uuid" } },
        with(c("b", "code", "text"), json!({ "nullable": false })) ] })]);
    let (d, mut slot) = setup(&old, "
        INSERT INTO p (id, code) VALUES ('00000000-0000-4000-8000-000000000001','A'),
          ('00000000-0000-4000-8000-000000000002','B'), ('00000000-0000-4000-8000-000000000003','A');");
    let p = migrate(&d, &mut slot, &new);
    assert_eq!(counts(&p, "t"), (1, 0));
    assert_eq!(col(&slot, "t", "b"), vec![json!("A"), json!("B")]);
    assert_eq!(rowids(&slot, "t"), vec![1, 2]);
}

/// a ← b ← c (b.a_id → a, c.b_id → b). Making a.name NOT NULL loses the
/// a rows with NULL names; their b children and those b rows' c children
/// go too (`foreign_key_check` repeated until stable).
#[test]
fn fk_orphans_cascade_until_stable() {
    let fk = |id: &str, col: &str, rt: &str| json!([{ "id": id, "columns": [col], "refTableId": rt, "refColumns": [format!("{rt}_k")], "onDelete": "cascade" }]);
    let mut a = table("a", "a", vec![c("an", "name", "text")]);
    let mut b = table("b", "b", vec![c("ba", "a_id", "integer"), c("bx", "x", "text")]);
    let mut cc = table("c", "c", vec![c("cb", "b_id", "integer"), c("cx", "x", "text")]);
    b["foreignKeys"] = fk("f1", "ba", "a");
    cc["foreignKeys"] = fk("f2", "cb", "b");
    let old = model(vec![a.clone(), b.clone(), cc.clone()]);
    a["columns"][1]["nullable"] = json!(false);
    // A value lost in a surviving child row: x int→… stays; make c.x integer.
    cc["columns"][2]["type"] = json!("integer");
    let new = model(vec![a, b, cc]);
    let (d, mut slot) = setup(&old, "
        INSERT INTO a (id, name) VALUES (1, 'keep'), (2, NULL);
        INSERT INTO b (id, a_id, x) VALUES (10, 1, 'k'), (11, 2, 'gone'), (12, NULL, 'free');
        INSERT INTO c (id, b_id, x) VALUES (100, 10, 'v1'), (101, 11, 'v2'), (102, 11, NULL), (103, 12, 'v3');");
    let p = migrate(&d, &mut slot, &new);
    assert_eq!(counts(&p, "a"), (1, 0));
    assert_eq!(counts(&p, "b"), (1, 0));
    // c: rows 101 and 102 lost; 'v1','v3' lost as values (text→integer); 'v2' not counted (its row went).
    assert_eq!(counts(&p, "c"), (2, 2));
    assert_eq!(rowids(&slot, "a"), vec![1]);
    assert_eq!(rowids(&slot, "b"), vec![10, 12]);
    assert_eq!(rowids(&slot, "c"), vec![100, 103]);
    let fkc: i64 = slot.as_ref().unwrap().conn.query_row("SELECT count(*) FROM pragma_foreign_key_check", [], |r| r.get(0)).unwrap();
    assert_eq!(fkc, 0);
}

#[test]
fn dropped_table_loses_its_rows_and_children_keep_theirs() {
    // Dropping the parent table also removes the FK from the model (it would
    // be invalid otherwise), so child rows and their values stay.
    let a = table("a", "parent", vec![c("an", "name", "text")]);
    let mut b = table("b", "child", vec![c("ba", "parent_id", "integer")]);
    b["foreignKeys"] = json!([{ "id": "f1", "columns": ["ba"], "refTableId": "a", "refColumns": ["a_k"], "onDelete": "no_action" }]);
    let old = model(vec![a, b.clone()]);
    b["foreignKeys"] = json!([]);
    let new = model(vec![b]);
    let (d, mut slot) = setup(&old, "
        INSERT INTO parent (name) VALUES ('p1'), ('p2'), ('p3');
        INSERT INTO child (parent_id) VALUES (1), (3);");
    let p = migrate(&d, &mut slot, &new);
    assert!(!p.lossless);
    let t = tp(&p, "a");
    assert_eq!((t.name.as_str(), t.rows_lost, t.values_lost, t.dropped), ("parent", 3, 0, true));
    assert_eq!(counts(&p, "b"), (0, 0));
    assert_eq!(col(&slot, "b", "ba"), vec![json!("1"), json!("3")]);
    let n: i64 = slot.as_ref().unwrap().conn
        .query_row("SELECT count(*) FROM sqlite_schema WHERE name = 'parent'", [], |r| r.get(0)).unwrap();
    assert_eq!(n, 0);
}

#[test]
fn dropped_empty_table_is_listed_but_lossless() {
    let old = model(vec![table("a", "keep", vec![]), table("b", "gone", vec![])]);
    let new = model(vec![table("a", "keep", vec![])]);
    let (d, mut slot) = setup(&old, "INSERT INTO keep DEFAULT VALUES;");
    let p = migrate(&d, &mut slot, &new);
    assert!(p.lossless);
    assert!(tp(&p, "b").dropped);
    assert_eq!(rowids(&slot, "a"), vec![1]);
}

#[test]
fn dropped_column_counts_values_and_new_columns_get_defaults() {
    let old = model(vec![table("t", "d", vec![c("a", "keep", "text"), c("b", "gone", "text")])]);
    let new = model(vec![table("t", "d", vec![
        c("a", "keep", "text"),
        with(c("u", "ref", "uuid"), json!({ "nullable": false, "default": { "kind": "uuid" } })),
        with(c("on", "active", "boolean"), json!({ "nullable": false, "default": { "kind": "literal", "value": true } })),
        with(c("at", "created_at", "timestamptz"), json!({ "nullable": false, "default": { "kind": "now" } })),
        with(c("q", "qty", "integer"), json!({ "default": { "kind": "literal", "value": "5" } })),
        c("n", "plain", "text"),
    ])]);
    let (d, mut slot) = setup(&old, "INSERT INTO d (keep, gone) VALUES ('k1', 'g1'), ('k2', NULL), ('k3', 'g3');");
    let p = migrate(&d, &mut slot, &new);
    assert_eq!(counts(&p, "t"), (0, 2), "two non-NULL values in the dropped column");
    let refs = col(&slot, "t", "u");
    assert!(refs.iter().all(|v| uuid::Uuid::parse_str(v.as_str().unwrap()).is_ok()));
    assert_ne!(refs[0], refs[1], "a new uuid per row");
    assert_eq!(col(&slot, "t", "on"), vec![json!(true); 3]);
    assert!(col(&slot, "t", "at").iter().all(|v| v.as_str().unwrap().ends_with('Z')));
    assert_eq!(col(&slot, "t", "q"), vec![json!("5"); 3]);
    assert_eq!(col(&slot, "t", "n"), vec![Value::Null; 3]);
}

#[test]
fn new_not_null_column_without_default_loses_every_row() {
    let old = model(vec![table("t", "r", vec![c("a", "x", "text")])]);
    let new = model(vec![table("t", "r", vec![c("a", "x", "text"), with(c("b", "must", "text"), json!({ "nullable": false }))])]);
    let (d, mut slot) = setup(&old, "INSERT INTO r (x) VALUES ('1'), ('2');");
    let p = migrate(&d, &mut slot, &new);
    assert_eq!(counts(&p, "t"), (2, 0));
    assert!(rowids(&slot, "t").is_empty());
}

#[test]
fn rename_and_reorder_keep_data_and_rowids() {
    let old = model(vec![table("t", "items", vec![c("a", "title", "text"), c("b", "qty", "integer")])]);
    let mut new = model(vec![table("t", "products", vec![c("b", "amount", "integer"), c("a", "name", "text")])]);
    new["tables"][0]["columns"][0]["name"] = json!("pid");
    let (d, mut slot) = setup(&old, "
        INSERT INTO items (id, title, qty) VALUES (2, 'x', 1), (7, 'y', 2), (40, 'z', NULL);");
    let p = migrate(&d, &mut slot, &new);
    assert!(p.lossless);
    assert_eq!(tp(&p, "t").name, "products");
    assert_eq!(rowids(&slot, "t"), vec![2, 7, 40], "rowids (and gaps) kept");
    assert_eq!(col(&slot, "t", "a"), vec![json!("x"), json!("y"), json!("z")]);
    assert_eq!(col(&slot, "t", "b"), vec![json!("1"), json!("2"), Value::Null]);
    // New inserts continue after the highest rowid.
    let id = crate::testdb::insert(&slot, "t", &serde_json::Map::new()).unwrap();
    assert_eq!(id, 41);
}

#[test]
fn identity_reads_as_integer_and_integer_to_identity_is_lost() {
    // identity → integer: the number stays (same storage).
    let old = model(vec![table("t", "i", vec![c("x", "code", "integer")])]);
    let mut new = old.clone();
    new["tables"][0]["columns"][0]["type"] = json!("integer");
    let (d, mut slot) = setup(&old, "INSERT INTO i (id, code) VALUES (4, 40), (9, NULL);");
    let p = migrate(&d, &mut slot, &new);
    assert!(p.lossless, "{:?}", p.tables);
    assert_eq!(col(&slot, "t", "t_k"), vec![json!("4"), json!("9")]);
    // integer → identity (now the PK): becomes the rowid; old values count lost.
    let mut back = new.clone();
    back["tables"][0]["columns"][0]["type"] = json!("identity");
    let p = migrate(&d, &mut slot, &back);
    assert_eq!(counts(&p, "t"), (0, 2));
    assert_eq!(col(&slot, "t", "t_k"), vec![json!("4"), json!("9")]);
}

#[test]
fn label_only_change_needs_no_migration() {
    let old = model(vec![table("t", "l", vec![c("a", "x", "text")])]);
    let mut new = old.clone();
    new["tables"][0]["label"] = json!("ร้านค้า");
    new["tables"][0]["columns"][1]["label"] = json!("ชื่อ");
    let (d, mut slot) = setup(&old, "INSERT INTO l (x) VALUES ('1');");
    let r = open(&d.0, &mut slot, PID, &new).unwrap();
    assert_eq!(r.status, OpenStatus::Ready);
    // A plan anyway would be lossless.
    let p = plan(&d.0, &mut slot, &new).unwrap();
    assert!(p.lossless);
    discard(&mut slot, &p.token);
    assert!(!d.tmp().exists());
}

#[test]
fn failed_build_partway_keeps_the_old_file() {
    let old = model(vec![table("t", "f", vec![c("a", "x", "text")])]);
    let new = model(vec![table("t", "f", vec![c("a", "x", "text"), c("b", "y", "text")])]);
    let (d, mut slot) = setup(&old, "INSERT INTO f (x) VALUES ('1'), ('2'), ('3');");
    assert_eq!(open(&d.0, &mut slot, PID, &new).unwrap().status, OpenStatus::Stale);
    let before = std::fs::read(d.file()).unwrap();
    FAIL_AFTER_ROWS.with(|f| f.set(Some(2)));
    let err = plan(&d.0, &mut slot, &new).unwrap_err();
    FAIL_AFTER_ROWS.with(|f| f.set(None));
    assert_eq!(err, MIGRATE_ERROR);
    assert!(!d.tmp().exists(), "partial tmp removed");
    assert_eq!(std::fs::read(d.file()).unwrap(), before, "old file byte-identical");
    let db = slot.as_ref().unwrap();
    assert!(db.stale && db.pending.is_none(), "still open, stale, no plan");
    assert_eq!(rowids(&slot, "t"), vec![1, 2, 3]);
    // The tmp path blocked by a directory: same.
    std::fs::create_dir_all(d.tmp()).unwrap();
    assert_eq!(plan(&d.0, &mut slot, &new).unwrap_err(), MIGRATE_ERROR);
    assert_eq!(std::fs::read(d.file()).unwrap(), before);
}

#[test]
fn failed_apply_keeps_the_old_file_open_and_stale() {
    let old = model(vec![table("t", "f", vec![c("a", "x", "text")])]);
    let new = model(vec![table("t", "f", vec![c("a", "x", "integer")])]);
    let (d, mut slot) = setup(&old, "INSERT INTO f (x) VALUES ('keep');");
    assert_eq!(open(&d.0, &mut slot, PID, &new).unwrap().status, OpenStatus::Stale);
    let before = std::fs::read(d.file()).unwrap();
    let p = plan(&d.0, &mut slot, &new).unwrap();
    FAIL_RENAME.with(|f| f.set(true));
    let err = apply(&d.0, &mut slot, &p.token).unwrap_err();
    FAIL_RENAME.with(|f| f.set(false));
    assert_eq!(err, MIGRATE_ERROR);
    assert_eq!(std::fs::read(d.file()).unwrap(), before);
    assert!(!d.tmp().exists());
    assert!(slot.as_ref().unwrap().stale);
    assert_eq!(col(&slot, "t", "a"), vec![json!("keep")]);
}

#[test]
fn tokens_discard_close_and_supersede() {
    let old = model(vec![table("t", "k", vec![c("a", "x", "text")])]);
    let new = model(vec![table("t", "k", vec![c("a", "x", "integer")])]);
    let (d, mut slot) = setup(&old, "INSERT INTO k (x) VALUES ('a');");
    assert_eq!(open(&d.0, &mut slot, PID, &new).unwrap().status, OpenStatus::Stale);
    let p1 = plan(&d.0, &mut slot, &new).unwrap();
    assert!(!p1.lossless);
    assert_eq!(counts(&p1, "t"), (0, 1));
    assert_eq!(apply(&d.0, &mut slot, "nope").unwrap_err(), PLAN_EXPIRED);
    // Discard with a wrong token: nothing; with the right one: tmp gone, still stale.
    discard(&mut slot, "nope");
    assert!(d.tmp().exists());
    discard(&mut slot, &p1.token);
    assert!(!d.tmp().exists());
    assert!(slot.as_ref().unwrap().stale);
    assert_eq!(apply(&d.0, &mut slot, &p1.token).unwrap_err(), PLAN_EXPIRED);
    // A new plan supersedes the old token.
    let p2 = plan(&d.0, &mut slot, &new).unwrap();
    let p3 = plan(&d.0, &mut slot, &new).unwrap();
    assert_ne!(p2.token, p3.token);
    assert_eq!(apply(&d.0, &mut slot, &p2.token).unwrap_err(), PLAN_EXPIRED);
    // Closing drops the plan and its tmp file.
    slot = None;
    assert!(!d.tmp().exists());
    assert_eq!(apply(&d.0, &mut slot, &p3.token).unwrap_err(), PLAN_EXPIRED);
    // Old data untouched.
    assert_eq!(open(&d.0, &mut slot, PID, &old).unwrap().status, OpenStatus::Ready);
    assert_eq!(col(&slot, "t", "a"), vec![json!("a")]);
}

#[test]
fn plan_needs_an_open_file_and_a_valid_model() {
    let d = Dir::new();
    let mut slot = None;
    let m = model(vec![table("t", "v", vec![])]);
    assert_eq!(plan(&d.0, &mut slot, &m).unwrap_err(), crate::testdb::NOT_OPEN);
    assert_eq!(apply(&d.0, &mut slot, "x").unwrap_err(), PLAN_EXPIRED);
    open(&d.0, &mut slot, PID, &m).unwrap();
    let bad = model(vec![]);
    assert!(plan(&d.0, &mut slot, &bad).is_err(), "0 tables = invalid");
    assert!(!d.tmp().exists());
}

#[test]
fn map_value_table() {
    use rusqlite::types::Value as V;
    let col = |ty: &str, extra: Value| -> DbColumn { serde_json::from_value(with(c("x", "x", ty), extra)).unwrap() };
    let none = json!({});
    let t = |s: &str| V::Text(s.into());
    let cases: Vec<(DbColumn, DbColumn, V, Option<V>)> = vec![
        (col("integer", none.clone()), col("text", none.clone()), V::Integer(3), Some(t("3"))),
        (col("boolean", none.clone()), col("text", none.clone()), V::Integer(0), Some(t("false"))),
        (col("boolean", none.clone()), col("boolean", none.clone()), V::Integer(1), Some(V::Integer(1))),
        (col("text", none.clone()), col("json", none.clone()), t("{}"), None),
        (col("uuid", none.clone()), col("text", none.clone()), t("u"), Some(t("u"))),
        (col("date", none.clone()), col("timestamptz", none.clone()), t("2026-01-01"), None),
        (col("integer", none.clone()), col("decimal", json!({ "precision": 4, "scale": 2 })), V::Integer(99), Some(t("99"))),
        (col("integer", none.clone()), col("decimal", json!({ "precision": 4, "scale": 2 })), V::Integer(100), None),
        (col("enum", json!({ "values": ["a"] })), col("enum", json!({ "values": ["b"] })), t("a"), None),
        (col("text", none.clone()), col("integer", none.clone()), V::Null, Some(V::Null)),
        (col("identity", none.clone()), col("text", none.clone()), V::Integer(7), Some(t("7"))),
        (col("integer", none.clone()), col("identity", none.clone()), V::Integer(7), None),
    ];
    for (i, (o, n, v, want)) in cases.into_iter().enumerate() {
        assert_eq!(map_value(&o, &n, &v), want, "case {i}");
    }
}

/// The STRICT CHECK for timestamptz must let a nullable column hold NULL
/// (`julianday(NULL) IS NOT NULL` is false); a migration that clears a
/// timestamptz value would otherwise lose the whole row.
#[test]
fn nullable_timestamptz_accepts_null() {
    let m = model(vec![table("t", "z", vec![c("a", "at", "timestamptz")])]);
    let (_d, slot) = setup(&m, "INSERT INTO z (at) VALUES (NULL), ('2026-10-18T00:00:00Z');");
    assert_eq!(col(&slot, "t", "a"), vec![Value::Null, json!("2026-10-18T00:00:00Z")]);
    assert!(slot.as_ref().unwrap().conn.execute("INSERT INTO z (at) VALUES ('nope')", []).is_err());
}

fn fk_to(id: &str, col: &str, rt: &str, action: &str) -> Value {
    json!({ "id": id, "columns": [col], "refTableId": rt, "refColumns": [format!("{rt}_k")], "onDelete": action })
}

/// Parent `a` loses row 2 (name made NOT NULL); `b.a_id` points at it.
fn orphan_case(action: &str, child_nullable: bool) -> (PlanResult, Vec<i64>, Vec<Value>) {
    let mut a = table("a", "a", vec![c("an", "name", "text")]);
    let mut b = table("b", "b", vec![with(c("ba", "a_id", "integer"), json!({ "nullable": child_nullable })), c("bx", "x", "text")]);
    b["foreignKeys"] = json!([fk_to("f1", "ba", "a", action)]);
    let old = model(vec![a.clone(), b.clone()]);
    a["columns"][1]["nullable"] = json!(false);
    let new = model(vec![a, b]);
    let (d, mut slot) = setup(&old, "
        INSERT INTO a (id, name) VALUES (1, 'keep'), (2, NULL);
        INSERT INTO b (id, a_id, x) VALUES (10, 1, 'k'), (11, 2, 'o1'), (12, 2, 'o2');");
    let p = migrate(&d, &mut slot, &new);
    assert_eq!(counts(&p, "a"), (1, 0));
    let ids = rowids(&slot, "b");
    let fkv = col(&slot, "b", "ba");
    (p, ids, fkv)
}

#[test]
fn set_null_on_nullable_fk_keeps_the_row_and_counts_values() {
    let (p, ids, fkv) = orphan_case("set_null", true);
    assert_eq!(counts(&p, "b"), (0, 2));
    assert!(!p.lossless);
    assert_eq!(ids, vec![10, 11, 12]);
    assert_eq!(fkv, vec![json!("1"), Value::Null, Value::Null]);
}

/// Validation already refuses set null on a NOT NULL column, so this path is
/// only reachable defensively: build directly from an unvalidated model.
#[test]
fn set_null_on_not_null_fk_loses_the_row() {
    let mut a = table("a", "a", vec![c("an", "name", "text")]);
    let mut b = table("b", "b", vec![c("ba", "a_id", "integer")]);
    b["foreignKeys"] = json!([fk_to("f1", "ba", "a", "set_null")]);
    let old = model(vec![a.clone(), b.clone()]);
    a["columns"][1]["nullable"] = json!(false);
    b["columns"][1]["nullable"] = json!(false);
    let new = model(vec![a, b]);
    let (d, slot) = setup(&old, "
        INSERT INTO a (id, name) VALUES (1, 'keep'), (2, NULL);
        INSERT INTO b (id, a_id) VALUES (10, 1), (11, 2);");
    let db = slot.as_ref().unwrap();
    let new_m: DbModel = crate::dbmodel::parse_model(&new).unwrap();
    assert!(!crate::dbmodel::validate(&new_m).is_empty(), "the model layer refuses it");
    let out = build_migration(&db.conn, &db.model, &new_m, &d.tmp()).unwrap();
    let b = out.iter().find(|t| t.table_id == "b").unwrap();
    assert_eq!((b.rows_lost, b.values_lost), (1, 0));
    let conn = rusqlite::Connection::open(d.tmp()).unwrap();
    let ids: Vec<i64> = conn.prepare("SELECT rowid FROM b ORDER BY rowid").unwrap()
        .query_map([], |r| r.get(0)).unwrap().map(Result::unwrap).collect();
    assert_eq!(ids, vec![10]);
}

#[test]
fn cascade_restrict_and_no_action_lose_the_row() {
    for action in ["cascade", "restrict", "no_action"] {
        let (p, ids, _) = orphan_case(action, true);
        assert_eq!(counts(&p, "b"), (2, 0), "{action}");
        assert_eq!(ids, vec![10], "{action}");
    }
}

/// a ← b (set null) ← c (cascade); a ← d (cascade) ← e (set null).
/// a loses row 2: b's orphans are nulled and kept, so c keeps everything;
/// d's orphans are lost, so e's rows pointing at them are nulled and kept.
#[test]
fn mixed_chain_set_null_stops_and_deletes_cascade() {
    let mut a = table("a", "a", vec![c("an", "name", "text")]);
    let mut b = table("b", "b", vec![c("ba", "a_id", "integer")]);
    let mut cc = table("c", "c", vec![c("cb", "b_id", "integer")]);
    let mut dd = table("d", "d", vec![c("da", "a_id", "integer")]);
    let mut e = table("e", "e", vec![c("ed", "d_id", "integer"), c("ex", "x", "text")]);
    b["foreignKeys"] = json!([fk_to("f1", "ba", "a", "set_null")]);
    cc["foreignKeys"] = json!([fk_to("f2", "cb", "b", "cascade")]);
    dd["foreignKeys"] = json!([fk_to("f3", "da", "a", "cascade")]);
    e["foreignKeys"] = json!([fk_to("f4", "ed", "d", "set_null")]);
    let old = model(vec![a.clone(), b.clone(), cc.clone(), dd.clone(), e.clone()]);
    a["columns"][1]["nullable"] = json!(false);
    let new = model(vec![a, b, cc, dd, e]);
    let (d, mut slot) = setup(&old, "
        INSERT INTO a (id, name) VALUES (1, 'keep'), (2, NULL);
        INSERT INTO b (id, a_id) VALUES (10, 1), (11, 2);
        INSERT INTO c (id, b_id) VALUES (100, 10), (101, 11);
        INSERT INTO d (id, a_id) VALUES (20, 1), (21, 2), (22, 2);
        INSERT INTO e (id, d_id, x) VALUES (200, 20, 'a'), (201, 21, 'b'), (202, 22, 'c'), (203, NULL, 'd');");
    let p = migrate(&d, &mut slot, &new);
    assert_eq!(counts(&p, "a"), (1, 0));
    assert_eq!(counts(&p, "b"), (0, 1));
    assert_eq!(counts(&p, "c"), (0, 0));
    assert_eq!(counts(&p, "d"), (2, 0));
    assert_eq!(counts(&p, "e"), (0, 2));
    assert_eq!(col(&slot, "b", "ba"), vec![json!("1"), Value::Null]);
    assert_eq!(rowids(&slot, "c"), vec![100, 101]);
    assert_eq!(rowids(&slot, "d"), vec![20]);
    assert_eq!(rowids(&slot, "e"), vec![200, 201, 202, 203]);
    assert_eq!(col(&slot, "e", "ed"), vec![json!("20"), Value::Null, Value::Null, Value::Null]);
    let fkc: i64 = slot.as_ref().unwrap().conn.query_row("SELECT count(*) FROM pragma_foreign_key_check", [], |r| r.get(0)).unwrap();
    assert_eq!(fkc, 0);
}

/// A row nulled by set null and then lost to another FK stops counting the
/// nulled value.
#[test]
fn row_nulled_then_lost_counts_only_the_row() {
    let mut a = table("a", "a", vec![c("an", "name", "text")]);
    let mut b = table("b", "b", vec![c("ba", "a1", "integer"), c("bb", "a2", "integer")]);
    b["foreignKeys"] = json!([fk_to("f1", "ba", "a", "set_null"), fk_to("f2", "bb", "a", "cascade")]);
    let old = model(vec![a.clone(), b.clone()]);
    a["columns"][1]["nullable"] = json!(false);
    let new = model(vec![a, b]);
    let (d, mut slot) = setup(&old, "
        INSERT INTO a (id, name) VALUES (1, 'keep'), (2, NULL);
        INSERT INTO b (id, a1, a2) VALUES (10, 2, 2), (11, 2, 1);");
    let p = migrate(&d, &mut slot, &new);
    assert_eq!(counts(&p, "b"), (1, 1));
    assert_eq!(rowids(&slot, "b"), vec![11]);
}
