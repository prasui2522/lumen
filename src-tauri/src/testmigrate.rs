//! Phase 10 step 7: schema change → test rows (PHASE-10-SPEC §7).
//!
//! `db_test_plan` builds `<id>.sqlite.tmp` from the new model and copies the
//! open file's rows into it, matched by table id and column id (rowid kept,
//! rowid order), counting what is lost. The old file is only read.
//! `db_test_apply` renames the tmp file over the old one; `db_test_discard`
//! (or closing the file, or a new plan) deletes it. A failed build leaves the
//! old file untouched.

use crate::dbmodel::{decimal_fits, parse_model, validate, DbColumn, DbDefault, DbModel, DbTable, DbType};
use crate::sqlexport::{sq_ident, sqlite_sql};
use crate::testdb::{journal_path, open, test_db_path, tmp_path, OpenResult, TestDb, NOT_OPEN, OPEN_ERROR};
use rusqlite::types::Value as SqlValue;
use rusqlite::{params_from_iter, Connection, ErrorCode};
use serde::Serialize;
use serde_json::Value;
use std::collections::HashMap;
use std::path::{Path, PathBuf};

pub const PLAN_EXPIRED: &str = "แผนหมดอายุ";
pub const MIGRATE_ERROR: &str = "อัปเดตข้อมูลทดสอบไม่ได้";

/// A built, not yet applied plan. Dropping it (discard, close, a new plan,
/// a new open) deletes the tmp file; `apply` disarms it first.
pub struct PendingPlan {
    pub token: String,
    model: Value,
    tmp: PathBuf,
    armed: bool,
}

impl Drop for PendingPlan {
    fn drop(&mut self) {
        if self.armed {
            let _ = std::fs::remove_file(&self.tmp);
            let _ = std::fs::remove_file(journal_path(&self.tmp));
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TablePlan {
    pub table_id: String,
    pub name: String,
    pub rows_lost: i64,
    pub values_lost: i64,
    pub dropped: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct PlanResult {
    pub token: String,
    pub lossless: bool,
    pub tables: Vec<TablePlan>,
}

#[cfg(test)]
thread_local! {
    /// Test hook: fail the copy after this many rows were read.
    pub static FAIL_AFTER_ROWS: std::cell::Cell<Option<usize>> = const { std::cell::Cell::new(None) };
    /// Test hook: fail the rename in `apply`.
    pub static FAIL_RENAME: std::cell::Cell<bool> = const { std::cell::Cell::new(false) };
}

/// §7 value rule. `None` = not kept (becomes NULL; counted as a lost value
/// when the old value was not NULL). Identity is read as integer (same
/// storage), so `identity → integer/decimal/text` keeps the number.
pub fn map_value(old: &DbColumn, new: &DbColumn, v: &SqlValue) -> Option<SqlValue> {
    use DbType::*;
    if *v == SqlValue::Null {
        return Some(SqlValue::Null);
    }
    let from = if old.col_type == Identity { Integer } else { old.col_type };
    let text = || match v {
        SqlValue::Text(s) => Some(s.clone()),
        SqlValue::Integer(i) => Some(i.to_string()),
        _ => None,
    };
    match (from, new.col_type) {
        (Enum, Enum) => match v {
            SqlValue::Text(s) if new.values.as_deref().unwrap_or_default().contains(s) => Some(v.clone()),
            _ => None,
        },
        (Integer | Decimal, Decimal) => {
            let s = text()?;
            decimal_fits(&s, new.precision.unwrap_or(12), new.scale.unwrap_or(2)).then_some(SqlValue::Text(s))
        }
        (Boolean, Text) => match v {
            SqlValue::Integer(i) => Some(SqlValue::Text(if *i != 0 { "true" } else { "false" }.into())),
            _ => None,
        },
        (Integer | Decimal | Date | Timestamptz | Uuid | Json | Enum | Asset, Text) => text().map(SqlValue::Text),
        (Text | Asset, Asset) => text().map(SqlValue::Text),
        // Identity is the rowid; it is never copied as a value.
        (a, b) if a == b && b != Identity => Some(v.clone()),
        _ => None,
    }
}

fn is_constraint(e: &rusqlite::Error) -> bool {
    matches!(e, rusqlite::Error::SqliteFailure(f, _) if f.code == ErrorCode::ConstraintViolation)
}

fn s(e: rusqlite::Error) -> String {
    e.to_string()
}

/// Copy one table's rows (old file → tmp), filling `tp`. Rows that break
/// NOT NULL / PK / UNIQUE / CHECK are lost; rowid order makes the lowest
/// rowid win a duplicate. `losses` keeps each kept row's lost-value count,
/// so a row removed later by the FK pass stops counting its values.
fn copy_table(
    src: &Connection,
    dst: &Connection,
    ot: &DbTable,
    t: &DbTable,
    tp: &mut TablePlan,
    losses: &mut HashMap<i64, i64>,
    read: &mut usize,
) -> Result<(), String> {
    let mut names = vec!["rowid".to_string()];
    // Some(i) = old column i mapped into this column; None = new uuid column.
    let mut srcs: Vec<(Option<usize>, &DbColumn)> = Vec::new();
    for c in t.columns.iter().filter(|c| c.col_type != DbType::Identity) {
        match ot.columns.iter().position(|o| o.id == c.id) {
            Some(i) => srcs.push((Some(i), c)),
            None if matches!(c.default, Some(DbDefault::Uuid)) => srcs.push((None, c)),
            None => continue, // new column: its SQLite default, else NULL
        }
        names.push(sq_ident(&c.name));
    }
    // A column turned into identity takes the rowid; its old value is lost.
    let ident_from = t
        .columns
        .iter()
        .find(|c| c.col_type == DbType::Identity)
        .and_then(|c| ot.columns.iter().position(|o| o.id == c.id && o.col_type != DbType::Identity));
    let dropped: Vec<usize> = (0..ot.columns.len()).filter(|&i| !t.columns.iter().any(|c| c.id == ot.columns[i].id)).collect();

    let cols = ot.columns.iter().map(|c| sq_ident(&c.name)).collect::<Vec<_>>().join(", ");
    let mut st = src.prepare(&format!("SELECT rowid, {cols} FROM {} ORDER BY rowid", sq_ident(&ot.name))).map_err(s)?;
    let ph = (1..=names.len()).map(|i| format!("?{i}")).collect::<Vec<_>>().join(", ");
    let mut ins = dst
        .prepare(&format!("INSERT INTO {} ({}) VALUES ({ph})", sq_ident(&t.name), names.join(", ")))
        .map_err(s)?;
    let mut rows = st.query([]).map_err(s)?;
    while let Some(r) = rows.next().map_err(s)? {
        *read += 1;
        #[cfg(test)]
        if FAIL_AFTER_ROWS.with(|f| f.get()).is_some_and(|n| *read > n) {
            return Err("test: copy failed".into());
        }
        let rid: i64 = r.get(0).map_err(s)?;
        let old: Vec<SqlValue> = (0..ot.columns.len()).map(|i| r.get(i + 1)).collect::<Result<_, _>>().map_err(s)?;
        let mut lost = 0i64;
        let mut params = vec![SqlValue::Integer(rid)];
        for (i, c) in &srcs {
            params.push(match i {
                Some(i) => map_value(&ot.columns[*i], c, &old[*i]).unwrap_or_else(|| {
                    lost += 1;
                    SqlValue::Null
                }),
                None => SqlValue::Text(uuid::Uuid::new_v4().to_string()),
            });
        }
        if ident_from.is_some_and(|i| old[i] != SqlValue::Null) {
            lost += 1;
        }
        lost += dropped.iter().filter(|&&i| old[i] != SqlValue::Null).count() as i64;
        match ins.execute(params_from_iter(params.iter())) {
            Ok(_) => {
                if lost > 0 {
                    tp.values_lost += lost;
                    losses.insert(rid, lost);
                }
            }
            Err(e) if is_constraint(&e) => tp.rows_lost += 1,
            Err(e) => return Err(e.to_string()),
        }
    }
    Ok(())
}

/// Child columns and whether the delete action is SET NULL, for FK `id` of
/// table `tn` as SQLite numbers it (`foreign_key_check`'s fkid).
fn fk_info(conn: &Connection, tn: &str, id: i64) -> rusqlite::Result<(Vec<String>, bool)> {
    let mut st = conn.prepare("SELECT \"from\", on_delete FROM pragma_foreign_key_list(?1) WHERE id = ?2 ORDER BY seq")?;
    let rows = st.query_map((tn, id), |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))?.collect::<Result<Vec<_>, _>>()?;
    let set_null = rows.first().is_some_and(|(_, a)| a.eq_ignore_ascii_case("SET NULL"));
    Ok((rows.into_iter().map(|(c, _)| c).collect(), set_null))
}

/// Build the migrated file at `tmp` (fsynced, closed). On error the tmp file
/// is removed; the source file is only read.
pub fn build_migration(src: &Connection, old: &DbModel, new: &DbModel, tmp: &Path) -> Result<Vec<TablePlan>, String> {
    let _ = std::fs::remove_file(tmp);
    let _ = std::fs::remove_file(journal_path(tmp));
    let res = (|| -> Result<Vec<TablePlan>, String> {
        let mut conn = Connection::open(tmp).map_err(s)?;
        // FKs off while copying (any table order); checked below.
        conn.execute_batch("PRAGMA foreign_keys=OFF; PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL;").map_err(s)?;
        let tx = conn.transaction().map_err(s)?;
        tx.execute_batch(&format!("CREATE TABLE wb_meta (key TEXT PRIMARY KEY, value TEXT) STRICT;\n{}", sqlite_sql(new)))
            .map_err(s)?;
        let mut out: Vec<TablePlan> = Vec::new();
        let mut by_name: HashMap<String, (usize, HashMap<i64, i64>)> = HashMap::new();
        let mut read = 0usize;
        for t in &new.tables {
            let mut tp = TablePlan { table_id: t.id.clone(), name: t.name.clone(), rows_lost: 0, values_lost: 0, dropped: false };
            let mut losses = HashMap::new();
            if let Some(ot) = old.tables.iter().find(|o| o.id == t.id) {
                copy_table(src, &tx, ot, t, &mut tp, &mut losses, &mut read)?;
            }
            out.push(tp);
            by_name.insert(t.name.clone(), (out.len() - 1, losses));
        }
        // FK rule, repeated until stable: a violating row is lost, except
        // that an FK whose delete action is set null and whose columns are all
        // nullable in the new model gets those columns set to NULL (each
        // non-NULL value cleared counts as lost) and the row stays. A set-null
        // fix makes no new orphans; a deleted row can orphan its children,
        // which the next round catches.
        loop {
            let mut bad: Vec<(String, i64, i64)> = {
                let mut st = tx.prepare("PRAGMA foreign_key_check").map_err(s)?;
                let it = st
                    .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, Option<i64>>(1)?, r.get::<_, i64>(3)?)))
                    .map_err(s)?;
                it.filter_map(|x| match x {
                    Ok((t, Some(id), fk)) => Some(Ok((t, id, fk))),
                    Ok(_) => None,
                    Err(e) => Some(Err(e)),
                })
                .collect::<Result<_, _>>()
                .map_err(s)?
            };
            bad.sort();
            bad.dedup();
            if bad.is_empty() {
                break;
            }
            for (tn, rid, fkid) in bad {
                let (cols, set_null) = fk_info(&tx, &tn, fkid).map_err(s)?;
                let nullable = new.tables.iter().find(|t| t.name == tn).is_some_and(|t| {
                    cols.iter().all(|n| t.columns.iter().any(|c| &c.name == n && c.nullable))
                });
                let Some((idx, losses)) = by_name.get_mut(&tn) else { continue };
                if set_null && nullable && !cols.is_empty() {
                    let q: Vec<String> = cols.iter().map(|n| sq_ident(n)).collect();
                    let filled = q.iter().map(|n| format!("({n} IS NOT NULL)")).collect::<Vec<_>>().join(" + ");
                    let found: Option<i64> = tx
                        .query_row(&format!("SELECT {filled} FROM {} WHERE rowid = ?1", sq_ident(&tn)), [rid], |r| r.get(0))
                        .ok();
                    // None: the row already went this round (another FK).
                    if let Some(n) = found {
                        let set = q.iter().map(|n| format!("{n} = NULL")).collect::<Vec<_>>().join(", ");
                        tx.execute(&format!("UPDATE {} SET {set} WHERE rowid = ?1", sq_ident(&tn)), [rid]).map_err(s)?;
                        out[*idx].values_lost += n;
                        *losses.entry(rid).or_insert(0) += n;
                    }
                } else {
                    let n = tx.execute(&format!("DELETE FROM {} WHERE rowid = ?1", sq_ident(&tn)), [rid]).map_err(s)?;
                    if n > 0 {
                        out[*idx].rows_lost += 1;
                        out[*idx].values_lost -= losses.remove(&rid).unwrap_or(0);
                    }
                }
            }
        }
        // A dropped table loses all of its rows.
        for ot in old.tables.iter().filter(|o| !new.tables.iter().any(|t| t.id == o.id)) {
            let n: i64 = src.query_row(&format!("SELECT count(*) FROM {}", sq_ident(&ot.name)), [], |r| r.get(0)).map_err(s)?;
            out.push(TablePlan { table_id: ot.id.clone(), name: ot.name.clone(), rows_lost: n, values_lost: 0, dropped: true });
        }
        let meta = serde_json::to_string(new).map_err(|e| e.to_string())?;
        tx.execute("INSERT INTO wb_meta (key, value) VALUES ('model', ?1)", [&meta]).map_err(s)?;
        tx.commit().map_err(s)?;
        conn.close().map_err(|(_, e)| e.to_string())?;
        std::fs::File::open(tmp).and_then(|f| f.sync_all()).map_err(|e| e.to_string())?;
        Ok(out)
    })();
    if res.is_err() {
        let _ = std::fs::remove_file(tmp);
        let _ = std::fs::remove_file(journal_path(tmp));
    }
    res
}

/// `db_test_plan`: needs the open file (its applied model is the source).
/// Replaces any earlier plan. Invalid model → its first error.
pub fn plan(dir: &Path, slot: &mut Option<TestDb>, model: &Value) -> Result<PlanResult, String> {
    let new = parse_model(model)?;
    if let Some(first) = validate(&new).into_iter().next() {
        return Err(first.message);
    }
    let db = slot.as_mut().ok_or_else(|| NOT_OPEN.to_string())?;
    db.pending = None;
    let path = test_db_path(dir, &db.project_id).ok_or_else(|| OPEN_ERROR.to_string())?;
    let tmp = tmp_path(&path);
    let tables = build_migration(&db.conn, &db.model, &new, &tmp).map_err(|e| {
        eprintln!("db_test_plan: {e}");
        MIGRATE_ERROR.to_string()
    })?;
    let token = uuid::Uuid::new_v4().to_string();
    let lossless = tables.iter().all(|t| t.rows_lost == 0 && t.values_lost == 0);
    db.pending = Some(PendingPlan { token: token.clone(), model: model.clone(), tmp, armed: true });
    Ok(PlanResult { token, lossless, tables })
}

/// `db_test_apply`: close the old file, rename the tmp file over it, reopen
/// (`ready`). A token that is not the current plan → `แผนหมดอายุ`. If the
/// rename fails the old file is reopened (still `stale`) and an error returned.
pub fn apply(dir: &Path, slot: &mut Option<TestDb>, token: &str) -> Result<OpenResult, String> {
    let db = slot.as_mut().ok_or_else(|| PLAN_EXPIRED.to_string())?;
    if db.pending.as_ref().map(|p| p.token.as_str()) != Some(token) {
        return Err(PLAN_EXPIRED.into());
    }
    let mut p = db.pending.take().expect("checked above");
    let project_id = db.project_id.clone();
    let model = p.model.clone();
    let path = test_db_path(dir, &project_id).ok_or_else(|| OPEN_ERROR.to_string())?;
    *slot = None; // drop the old connection before replacing its file
    #[cfg(test)]
    let fail = FAIL_RENAME.with(|f| f.get());
    #[cfg(not(test))]
    let fail = false;
    let _ = std::fs::remove_file(journal_path(&path));
    if fail || std::fs::rename(&p.tmp, &path).is_err() {
        drop(p);
        let _ = open(dir, slot, &project_id, &model);
        return Err(MIGRATE_ERROR.into());
    }
    p.armed = false;
    if let Some(d) = path.parent() {
        let _ = std::fs::File::open(d).and_then(|d| d.sync_all());
    }
    open(dir, slot, &project_id, &model)
}

/// `db_test_discard`: drop the plan (and its tmp file). The file stays stale.
pub fn discard(slot: &mut Option<TestDb>, token: &str) {
    if let Some(db) = slot.as_mut() {
        if db.pending.as_ref().is_some_and(|p| p.token == token) {
            db.pending = None;
        }
    }
}

#[cfg(test)]
#[path = "testmigrate_tests.rs"]
mod tests;
