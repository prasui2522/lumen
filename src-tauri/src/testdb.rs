//! Phase 10 step 6: the per-project SQLite test file (PHASE-10-SPEC §4, §6).
//!
//! `app_data_dir/databases/<project-id>.sqlite`, built from the SQLite STRICT
//! DDL (`sqlexport::sqlite_sql`). Opened ONLY by `db_test_open` (the
//! ข้อมูลทดสอบ tab), never at startup; `db_test_close` drops the connection
//! (leaving the mode or the project) so its pages are freed.
//!
//! Crash safety: a (re)build writes `<id>.sqlite.tmp`, fsyncs it, then renames
//! it over the old file; writes use `journal_mode=DELETE` + `synchronous=FULL`
//! and a transaction each. A file that fails `quick_check` (or has no
//! `wb_meta`) is reported `corrupt` and left closed until `db_test_reset`.

use crate::dbmodel::{decimal_fits, parse_model, validate, DbColumn, DbModel, DbTable, DbType, DbDefault};
use crate::sqlexport::{sq_ident, sqlite_sql};
use rusqlite::types::{Value as SqlValue, ValueRef};
use rusqlite::{params_from_iter, Connection, ErrorCode, OpenFlags};
use serde::Serialize;
use serde_json::Value;
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;

pub const OPEN_ERROR: &str = "เปิดข้อมูลทดสอบไม่ได้";
pub const NOT_OPEN: &str = "ยังไม่ได้เปิดข้อมูลทดสอบ";
pub const STALE_READONLY: &str = "โครงสร้างเปลี่ยนแล้ว อัปเดตข้อมูลทดสอบก่อนแก้ไข";
pub const DELETE_REFERENCED: &str = "ลบไม่ได้ มีแถวอื่นอ้างอิงอยู่";
pub const MAX_PAGE: u32 = 100;

pub struct TestDb {
    pub project_id: String,
    pub conn: Connection,
    /// The model the file was built from (`wb_meta.model`).
    pub model: DbModel,
    /// `wb_meta.model` ≠ the editor's model: read-only until rebuilt.
    pub stale: bool,
    /// A built, unapplied `db_test_plan` (step 7); dropped with the file.
    pub pending: Option<crate::testmigrate::PendingPlan>,
}

#[derive(Default)]
pub struct TestDbState {
    pub inner: Mutex<Option<TestDb>>,
    /// The lazy sweep of orphan files runs on the first open per app run.
    pub swept: AtomicBool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum OpenStatus {
    Ready,
    Stale,
    InvalidModel,
    Corrupt,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TableCount {
    pub table_id: String,
    pub row_count: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct OpenResult {
    pub status: OpenStatus,
    pub tables: Vec<TableCount>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Row {
    pub rowid: i64,
    pub values: Vec<Value>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Rows {
    /// Column ids, in model order (matches `values`).
    pub columns: Vec<String>,
    pub rows: Vec<Row>,
    pub total: i64,
}

pub fn test_db_path(dir: &Path, project_id: &str) -> Option<PathBuf> {
    crate::db::test_db_files(dir, project_id).into_iter().next()
}

pub(crate) fn tmp_path(p: &Path) -> PathBuf {
    let mut s = p.as_os_str().to_owned();
    s.push(".tmp");
    PathBuf::from(s)
}

pub(crate) fn journal_path(p: &Path) -> PathBuf {
    let mut s = p.as_os_str().to_owned();
    s.push("-journal");
    PathBuf::from(s)
}

fn pragmas(conn: &Connection) -> rusqlite::Result<()> {
    conn.execute_batch("PRAGMA foreign_keys=ON; PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL;")
}

fn quick_check_ok(conn: &Connection) -> bool {
    conn.query_row("PRAGMA quick_check", [], |r| r.get::<_, String>(0)).map(|s| s == "ok").unwrap_or(false)
}

/// Build the file for `model` at `<path>.tmp`, fsync, rename over `path`.
/// A failed build leaves the old file untouched.
fn build(path: &Path, model: &DbModel) -> Result<(), String> {
    let tmp = tmp_path(path);
    let _ = std::fs::remove_file(&tmp);
    let _ = std::fs::remove_file(journal_path(&tmp));
    let res = (|| -> Result<(), String> {
        let conn = Connection::open(&tmp).map_err(|e| e.to_string())?;
        pragmas(&conn).map_err(|e| e.to_string())?;
        let meta = serde_json::to_string(model).map_err(|e| e.to_string())?;
        conn.execute_batch(&format!(
            "BEGIN;\nCREATE TABLE wb_meta (key TEXT PRIMARY KEY, value TEXT) STRICT;\n{}\nCOMMIT;",
            sqlite_sql(model)
        ))
        .map_err(|e| e.to_string())?;
        conn.execute("INSERT INTO wb_meta (key, value) VALUES ('model', ?1)", [&meta]).map_err(|e| e.to_string())?;
        conn.close().map_err(|(_, e)| e.to_string())?;
        std::fs::File::open(&tmp).and_then(|f| f.sync_all()).map_err(|e| e.to_string())?;
        // An old hot journal must not be replayed onto the new file.
        let _ = std::fs::remove_file(journal_path(path));
        std::fs::rename(&tmp, path).map_err(|e| e.to_string())?;
        if let Some(dir) = path.parent() {
            let _ = std::fs::File::open(dir).and_then(|d| d.sync_all());
        }
        Ok(())
    })();
    if res.is_err() {
        let _ = std::fs::remove_file(&tmp);
    }
    res
}

fn counts(conn: &Connection, model: &DbModel) -> Vec<TableCount> {
    model
        .tables
        .iter()
        .map(|t| TableCount {
            table_id: t.id.clone(),
            row_count: conn
                .query_row(&format!("SELECT count(*) FROM {}", sq_ident(&t.name)), [], |r| r.get(0))
                .unwrap_or(0),
        })
        .collect()
}

/// Open an existing file: `Err(())` = corrupt (connection dropped).
fn open_existing(path: &Path) -> Result<(Connection, DbModel), ()> {
    let conn = Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_WRITE | OpenFlags::SQLITE_OPEN_NO_MUTEX)
        .map_err(|_| ())?;
    pragmas(&conn).map_err(|_| ())?;
    if !quick_check_ok(&conn) {
        return Err(());
    }
    let meta: String = conn
        .query_row("SELECT value FROM wb_meta WHERE key = 'model'", [], |r| r.get(0))
        .map_err(|_| ())?;
    let v: Value = serde_json::from_str(&meta).map_err(|_| ())?;
    let model = parse_model(&v).map_err(|_| ())?;
    Ok((conn, model))
}

fn valid_model(model: &Value) -> Option<DbModel> {
    let m = parse_model(model).ok()?;
    validate(&m).is_empty().then_some(m)
}

/// `db_test_open`. Closes whatever was open first (the caller passes the slot).
/// Creates the file from `model` when there is none.
pub fn open(dir: &Path, slot: &mut Option<TestDb>, project_id: &str, model: &Value) -> Result<OpenResult, String> {
    *slot = None;
    let path = test_db_path(dir, project_id).ok_or_else(|| OPEN_ERROR.to_string())?;
    let Some(model) = valid_model(model) else {
        return Ok(OpenResult { status: OpenStatus::InvalidModel, tables: vec![] });
    };
    std::fs::create_dir_all(dir).map_err(|_| OPEN_ERROR.to_string())?;
    if !path.exists() {
        build(&path, &model).map_err(|_| OPEN_ERROR.to_string())?;
    }
    match open_existing(&path) {
        Err(()) => Ok(OpenResult { status: OpenStatus::Corrupt, tables: vec![] }),
        Ok((conn, applied)) => {
            // Labels (ชื่อที่แสดง / PG comments) do not touch the SQLite file:
            // a label-only difference is not stale; the stored model is
            // refreshed quietly so the next open compares against it.
            let stale = structure(&applied) != structure(&model);
            let applied = if !stale && applied != model {
                if let Ok(meta) = serde_json::to_string(&model) {
                    let _ = conn.execute("UPDATE wb_meta SET value = ?1 WHERE key = 'model'", [&meta]);
                }
                model
            } else {
                applied
            };
            let tables = counts(&conn, &applied);
            *slot = Some(TestDb { project_id: project_id.to_string(), conn, model: applied, stale, pending: None });
            Ok(OpenResult { status: if stale { OpenStatus::Stale } else { OpenStatus::Ready }, tables })
        }
    }
}

/// The model without labels (table and column display names, exported as
/// PG comments). Names, types, nullability, defaults, decimal/enum settings,
/// keys, uniques, FKs and order all stay, so any of those changes is stale.
pub fn structure(m: &DbModel) -> DbModel {
    let mut s = m.clone();
    for t in &mut s.tables {
        t.label = None;
        for c in &mut t.columns {
            c.label = None;
        }
    }
    s
}

/// `db_test_reset` (also `สร้างใหม่` for a corrupt file): rebuild empty.
pub fn reset(dir: &Path, slot: &mut Option<TestDb>, project_id: &str, model: &Value) -> Result<OpenResult, String> {
    *slot = None;
    let path = test_db_path(dir, project_id).ok_or_else(|| OPEN_ERROR.to_string())?;
    let m = parse_model(model)?;
    if let Some(first) = validate(&m).into_iter().next() {
        return Err(first.message);
    }
    std::fs::create_dir_all(dir).map_err(|_| OPEN_ERROR.to_string())?;
    build(&path, &m).map_err(|_| OPEN_ERROR.to_string())?;
    open(dir, slot, project_id, model)
}

/// Lazy sweep: remove test files whose project no longer exists.
pub fn sweep(dir: &Path, live: &HashSet<String>) -> usize {
    let Ok(entries) = std::fs::read_dir(dir) else { return 0 };
    let mut removed = 0;
    for e in entries.flatten() {
        let name = e.file_name().to_string_lossy().to_string();
        let Some(id) = ["sqlite", "sqlite-journal", "sqlite.tmp", "sqlite.tmp-journal"]
            .iter()
            .find_map(|ext| name.strip_suffix(&format!(".{ext}")))
        else {
            continue;
        };
        if crate::db::test_db_files(dir, id).is_empty() || live.contains(id) {
            continue;
        }
        if std::fs::remove_file(e.path()).is_ok() {
            removed += 1;
        }
    }
    removed
}

pub fn sweep_once(state: &TestDbState, dir: &Path, live: impl FnOnce() -> HashSet<String>) {
    if !state.swept.swap(true, Ordering::SeqCst) {
        sweep(dir, &live());
    }
}

/* ---------------- rows ---------------- */

fn db_of(slot: &Option<TestDb>) -> Result<&TestDb, String> {
    slot.as_ref().ok_or_else(|| NOT_OPEN.to_string())
}

fn writable(slot: &Option<TestDb>) -> Result<&TestDb, String> {
    let db = db_of(slot)?;
    if db.stale {
        return Err(STALE_READONLY.into());
    }
    Ok(db)
}

fn table<'a>(m: &'a DbModel, table_id: &str) -> Result<&'a DbTable, String> {
    m.tables.iter().find(|t| t.id == table_id).ok_or_else(|| "ไม่พบตาราง".to_string())
}

fn wire(c: &DbColumn, v: ValueRef<'_>) -> Value {
    match v {
        ValueRef::Null => Value::Null,
        ValueRef::Integer(i) if c.col_type == DbType::Boolean => Value::Bool(i != 0),
        ValueRef::Integer(i) => Value::String(i.to_string()),
        ValueRef::Real(f) => Value::String(f.to_string()),
        ValueRef::Text(t) => Value::String(String::from_utf8_lossy(t).into_owned()),
        ValueRef::Blob(_) => Value::Null,
    }
}

pub fn rows(slot: &Option<TestDb>, table_id: &str, offset: i64, limit: u32) -> Result<Rows, String> {
    let db = db_of(slot)?;
    let t = table(&db.model, table_id)?;
    let tn = sq_ident(&t.name);
    let total: i64 = db.conn.query_row(&format!("SELECT count(*) FROM {tn}"), [], |r| r.get(0)).map_err(|e| e.to_string())?;
    let cols = t.columns.iter().map(|c| sq_ident(&c.name)).collect::<Vec<_>>().join(", ");
    let mut st = db
        .conn
        .prepare(&format!("SELECT rowid, {cols} FROM {tn} ORDER BY rowid LIMIT ?1 OFFSET ?2"))
        .map_err(|e| e.to_string())?;
    let rows = st
        .query_map((limit.min(MAX_PAGE) as i64, offset.max(0)), |r| {
            let mut values = Vec::with_capacity(t.columns.len());
            for (i, c) in t.columns.iter().enumerate() {
                values.push(wire(c, r.get_ref(i + 1)?));
            }
            Ok(Row { rowid: r.get(0)?, values })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(Rows { columns: t.columns.iter().map(|c| c.id.clone()).collect(), rows, total })
}

fn bad(c: &DbColumn) -> String {
    format!("รูปแบบไม่ถูกต้อง: {}", c.name)
}

fn sql_true(conn: &Connection, expr: &str, s: &str) -> bool {
    conn.query_row(&format!("SELECT coalesce({expr}, 0)"), [s], |r| r.get::<_, i64>(0)).map(|v| v == 1).unwrap_or(false)
}

/// Wire value → SQLite value for column `c` (None = NULL). Formats are checked
/// here, with SQLite's own functions where the STRICT CHECK uses them.
fn to_sql(conn: &Connection, c: &DbColumn, v: &Value) -> Result<Option<SqlValue>, String> {
    if v.is_null() {
        return Ok(None);
    }
    let s = || v.as_str().ok_or_else(|| bad(c));
    Ok(Some(match c.col_type {
        DbType::Boolean => SqlValue::Integer(v.as_bool().ok_or_else(|| bad(c))? as i64),
        DbType::Integer | DbType::Identity => {
            SqlValue::Integer(s()?.trim().parse::<i64>().map_err(|_| bad(c))?)
        }
        DbType::Decimal => {
            let x = s()?.trim();
            if !decimal_fits(x, c.precision.unwrap_or(12), c.scale.unwrap_or(2)) {
                return Err(bad(c));
            }
            SqlValue::Text(x.to_string())
        }
        DbType::Date => {
            let x = s()?.trim();
            if x.len() != 10 || !sql_true(conn, "date(?1) = ?1", x) {
                return Err(bad(c));
            }
            SqlValue::Text(x.to_string())
        }
        DbType::Timestamptz => {
            let x = s()?.trim();
            if x.is_empty() || !sql_true(conn, "julianday(?1) IS NOT NULL", x) {
                return Err(bad(c));
            }
            SqlValue::Text(x.to_string())
        }
        DbType::Uuid => {
            let u = uuid::Uuid::parse_str(s()?.trim()).map_err(|_| bad(c))?;
            SqlValue::Text(u.hyphenated().to_string())
        }
        DbType::Json => {
            let x = s()?;
            if !sql_true(conn, "json_valid(?1)", x) {
                return Err(bad(c));
            }
            SqlValue::Text(x.to_string())
        }
        DbType::Enum => {
            let x = s()?;
            if !c.values.as_deref().unwrap_or_default().iter().any(|e| e == x) {
                return Err(bad(c));
            }
            SqlValue::Text(x.to_string())
        }
        DbType::Text | DbType::Asset => SqlValue::Text(s()?.to_string()),
    }))
}

/// First FK of `t` whose (non-null) local values have no parent row.
fn missing_parent(db: &TestDb, t: &DbTable, val: &dyn Fn(&str) -> Option<SqlValue>) -> Option<String> {
    for fk in &t.foreign_keys {
        let Ok(rt) = table(&db.model, &fk.ref_table_id) else { continue };
        let vals: Vec<SqlValue> = fk.columns.iter().filter_map(|id| val(id)).collect();
        if vals.len() != fk.columns.len() {
            continue; // a NULL part: MATCH SIMPLE passes
        }
        let cond = fk
            .ref_columns
            .iter()
            .enumerate()
            .map(|(i, id)| {
                let n = rt.columns.iter().find(|c| &c.id == id).map(|c| sq_ident(&c.name)).unwrap_or_default();
                format!("{n} = ?{}", i + 1)
            })
            .collect::<Vec<_>>()
            .join(" AND ");
        let found = db
            .conn
            .query_row(&format!("SELECT 1 FROM {} WHERE {cond} LIMIT 1", sq_ident(&rt.name)), params_from_iter(vals.iter()), |_| Ok(()))
            .is_ok();
        if !found {
            let names: Vec<&str> = fk
                .columns
                .iter()
                .filter_map(|id| t.columns.iter().find(|c| &c.id == id).map(|c| c.name.as_str()))
                .collect();
            return Some(names.join(", "));
        }
    }
    None
}

/// SQLite constraint error → Thai (`ต้องมีค่า: <col>`, `ค่าซ้ำ: <col>`, …).
fn constraint_error(e: rusqlite::Error, fk: impl FnOnce() -> String) -> String {
    if let rusqlite::Error::SqliteFailure(f, msg) = &e {
        if f.code == ErrorCode::ConstraintViolation {
            let msg = msg.clone().unwrap_or_default();
            let after = msg.split_once(": ").map(|x| x.1).unwrap_or("");
            let cols = after
                .split(", ")
                .map(|p| p.rsplit_once('.').map(|x| x.1).unwrap_or(p))
                .collect::<Vec<_>>()
                .join(", ");
            return match f.extended_code {
                rusqlite::ffi::SQLITE_CONSTRAINT_NOTNULL => format!("ต้องมีค่า: {cols}"),
                rusqlite::ffi::SQLITE_CONSTRAINT_UNIQUE | rusqlite::ffi::SQLITE_CONSTRAINT_PRIMARYKEY => {
                    format!("ค่าซ้ำ: {cols}")
                }
                rusqlite::ffi::SQLITE_CONSTRAINT_FOREIGNKEY => fk(),
                _ => format!("รูปแบบไม่ถูกต้อง: {after}"),
            };
        }
    }
    e.to_string()
}

/// `db_test_insert`: `values` maps column id → wire value. A missing key uses
/// the column default (uuid default: a new v4 here; identity: next rowid).
pub fn insert(slot: &Option<TestDb>, table_id: &str, values: &serde_json::Map<String, Value>) -> Result<i64, String> {
    let db = writable(slot)?;
    let t = table(&db.model, table_id)?;
    let mut names = Vec::new();
    let mut vals: Vec<Option<SqlValue>> = Vec::new();
    let mut by_id: std::collections::HashMap<&str, Option<SqlValue>> = Default::default();
    for c in &t.columns {
        let v = match values.get(&c.id) {
            Some(v) if c.col_type != DbType::Identity => to_sql(&db.conn, c, v)?,
            _ if matches!(c.default, Some(DbDefault::Uuid)) => Some(SqlValue::Text(uuid::Uuid::new_v4().to_string())),
            _ => continue, // identity or SQLite default
        };
        names.push(sq_ident(&c.name));
        by_id.insert(&c.id, v.clone());
        vals.push(v);
    }
    let sql = if names.is_empty() {
        format!("INSERT INTO {} DEFAULT VALUES", sq_ident(&t.name))
    } else {
        let ph = (1..=names.len()).map(|i| format!("?{i}")).collect::<Vec<_>>().join(", ");
        format!("INSERT INTO {} ({}) VALUES ({ph})", sq_ident(&t.name), names.join(", "))
    };
    db.conn.execute(&sql, params_from_iter(vals.iter())).map_err(|e| {
        constraint_error(e, || {
            let got = |id: &str| by_id.get(id).cloned().flatten();
            format!("ไม่พบแถวที่อ้างอิง: {}", missing_parent(db, t, &got).unwrap_or_else(|| first_fk_col(t)))
        })
    })?;
    Ok(db.conn.last_insert_rowid())
}

fn first_fk_col(t: &DbTable) -> String {
    t.foreign_keys
        .first()
        .and_then(|fk| fk.columns.first())
        .and_then(|id| t.columns.iter().find(|c| &c.id == id))
        .map(|c| c.name.clone())
        .unwrap_or_default()
}

/// `db_test_update`: one cell. Identity cells are read-only. Returns the
/// stored value (normalized, e.g. a uuid in canonical lowercase) on the wire.
pub fn update(slot: &Option<TestDb>, table_id: &str, rowid: i64, column_id: &str, value: &Value) -> Result<Value, String> {
    let db = writable(slot)?;
    let t = table(&db.model, table_id)?;
    let c = t.columns.iter().find(|c| c.id == column_id).ok_or_else(|| "ไม่พบคอลัมน์".to_string())?;
    if c.col_type == DbType::Identity {
        return Err(format!("แก้ไม่ได้: {} เป็นลำดับอัตโนมัติ", c.name));
    }
    let v = to_sql(&db.conn, c, value)?;
    let n = db
        .conn
        .execute(&format!("UPDATE {} SET {} = ?1 WHERE rowid = ?2", sq_ident(&t.name), sq_ident(&c.name)), (&v, rowid))
        .map_err(|e| {
            constraint_error(e, || {
                // Own FK broken → missing parent; otherwise children point at the old key.
                let cur = |id: &str| -> Option<SqlValue> {
                    if id == column_id {
                        return v.clone();
                    }
                    let cc = t.columns.iter().find(|x| x.id == id)?;
                    db.conn
                        .query_row(
                            &format!("SELECT {} FROM {} WHERE rowid = ?1", sq_ident(&cc.name), sq_ident(&t.name)),
                            [rowid],
                            |r| r.get::<_, SqlValue>(0),
                        )
                        .ok()
                        .filter(|x| *x != SqlValue::Null)
                };
                match missing_parent(db, t, &cur) {
                    Some(cols) => format!("ไม่พบแถวที่อ้างอิง: {cols}"),
                    None => format!("แก้ไม่ได้ มีแถวอื่นอ้างอิงอยู่: {}", c.name),
                }
            })
        })?;
    if n == 0 {
        return Err("ไม่พบแถว".into());
    }
    db.conn
        .query_row(
            &format!("SELECT {} FROM {} WHERE rowid = ?1", sq_ident(&c.name), sq_ident(&t.name)),
            [rowid],
            |r| Ok(wire(c, r.get_ref(0)?)),
        )
        .map_err(|e| e.to_string())
}

/// `db_test_delete`: all or nothing.
pub fn delete(slot: &mut Option<TestDb>, table_id: &str, rowids: &[i64]) -> Result<usize, String> {
    let db = slot.as_mut().ok_or_else(|| NOT_OPEN.to_string())?;
    if db.stale {
        return Err(STALE_READONLY.into());
    }
    let t = table(&db.model, table_id)?.name.clone();
    let tx = db.conn.transaction().map_err(|e| e.to_string())?;
    let mut n = 0;
    {
        let mut st = tx.prepare(&format!("DELETE FROM {} WHERE rowid = ?1", sq_ident(&t))).map_err(|e| e.to_string())?;
        for id in rowids {
            n += st.execute([id]).map_err(|e| constraint_error(e, || DELETE_REFERENCED.to_string()))?;
        }
    }
    tx.commit().map_err(|e| constraint_error(e, || DELETE_REFERENCED.to_string()))?;
    Ok(n)
}

#[cfg(test)]
#[path = "testdb_tests.rs"]
mod tests;
