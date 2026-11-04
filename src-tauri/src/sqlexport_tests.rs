//! Phase 10 step 5: `.sql` goldens (`fixtures/dbmodel/export_*.json` →
//! `.pg.sql` + `.sqlite.sql`). `WB_BLESS=1 cargo test sql_goldens` rewrites them.

use super::*;
use crate::dbmodel::parse_model;
use std::path::PathBuf;

fn fixtures() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("src/fixtures/dbmodel")
}

fn cases() -> Vec<(String, DbModel)> {
    let mut out: Vec<(String, DbModel)> = std::fs::read_dir(fixtures())
        .unwrap()
        .filter_map(|e| {
            let name = e.unwrap().file_name().into_string().unwrap();
            let case = name.strip_prefix("export_")?.strip_suffix(".json")?.to_string();
            let v: serde_json::Value = serde_json::from_str(&std::fs::read_to_string(fixtures().join(&name)).unwrap()).unwrap();
            Some((format!("export_{case}"), parse_model(&v).expect("fixture parses")))
        })
        .collect();
    out.sort_by(|a, b| a.0.cmp(&b.0));
    out
}

#[test]
fn sql_goldens() {
    let bless = std::env::var("WB_BLESS").is_ok();
    let cs = cases();
    assert_eq!(cs.len(), 7, "every golden case present");
    for (case, m) in cs {
        assert_eq!(validate(&m), vec![], "{case}: fixture must be valid");
        for (ext, a, b) in [("pg.sql", pg_sql(&m), pg_sql(&m)), ("sqlite.sql", sqlite_sql(&m), sqlite_sql(&m))] {
            assert_eq!(a, b, "{case}.{ext}: byte-identical across runs");
            let path = fixtures().join(format!("{case}.{ext}"));
            if bless {
                std::fs::write(&path, &a).unwrap();
            } else {
                assert_eq!(std::fs::read_to_string(&path).unwrap_or_default(), a, "{case}.{ext} differs from golden");
            }
        }
    }
}

/// Every SQLite golden loads into a real (bundled 3.46) SQLite with FKs on,
/// and the CHECKs/defaults behave on a sample row.
#[test]
fn sqlite_goldens_load() {
    for (case, m) in cases() {
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys=ON;").unwrap();
        conn.execute_batch(&sqlite_sql(&m)).unwrap_or_else(|e| panic!("{case}: {e}"));
        let n: i64 = conn
            .query_row("SELECT count(*) FROM sqlite_schema WHERE type='table'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(n as usize, m.tables.len(), "{case}");
    }
    let m = cases().into_iter().find(|c| c.0 == "export_all_types").unwrap().1;
    let conn = rusqlite::Connection::open_in_memory().unwrap();
    conn.execute_batch(&sqlite_sql(&m)).unwrap();
    conn.execute(
        "INSERT INTO items (id, title, status) VALUES ('00000000-0000-4000-8000-000000000000', 'x', 'live')",
        [],
    )
    .unwrap();
    let (active, at, price): (i64, String, String) = conn
        .query_row("SELECT active, created_at, price FROM items", [], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))
        .unwrap();
    assert_eq!((active, price.as_str()), (1, "-10.50"));
    assert!(at.ends_with('Z'), "{at}");
    for bad in [
        "UPDATE items SET status = 'nope'",
        "UPDATE items SET active = 2",
        "UPDATE items SET born = '2026-02-30'",
        "UPDATE items SET price = '1e5'",
        "UPDATE items SET meta = '{'",
        "UPDATE items SET token = 'short'",
    ] {
        assert!(conn.execute(bad, []).is_err(), "{bad} must fail its CHECK");
    }
}

#[test]
fn identifiers_quoted_only_when_needed() {
    assert_eq!(pg_ident("users"), "users");
    assert_eq!(pg_ident("values"), "\"values\"");
    assert_eq!(pg_ident("position"), "\"position\"");
    assert_eq!(pg_ident("select"), "\"select\"");
    assert_eq!(pg_ident("name"), "name"); // unreserved keyword
}

#[test]
fn long_names_truncate_with_hash() {
    let m = cases().into_iter().find(|c| c.0 == "export_long_names").unwrap().1;
    let sql = pg_sql(&m);
    for line in sql.lines().filter(|l| l.contains("constraint ") || l.starts_with("create index ")) {
        let name = line.split_whitespace().skip_while(|w| *w != "constraint" && *w != "index").nth(1).unwrap();
        assert!(name.len() <= 63, "{name}");
    }
    // `a_b` and (`a`, `b`) both want `<t>_a_b_key`; every name stays distinct.
    let names: Vec<&str> = sql
        .lines()
        .filter_map(|l| l.split_whitespace().skip_while(|w| *w != "constraint" && *w != "index").nth(1))
        .collect();
    let mut sorted = names.clone();
    sorted.sort();
    sorted.dedup();
    assert_eq!(sorted.len(), names.len(), "{names:?}");
    assert_eq!(sql.matches(" unique (").count(), 3);
    assert!(names.iter().all(|n| n.len() == 63), "63-byte table name: every name is hashed");
}

#[test]
fn export_refuses_invalid_with_first_error() {
    let empty = DbModel { version: 1, tables: vec![] };
    assert_eq!(export_pg(&empty).unwrap_err(), "ต้องมีอย่างน้อย 1 ตาราง");
}

/// Ruling 6: FK index skipped when the FK columns lead the PK or a unique set.
#[test]
fn fk_index_skipped_when_leading_a_key() {
    let m = cases().into_iter().find(|c| c.0 == "export_fk_index").unwrap().1;
    let sql = pg_sql(&m);
    assert!(!sql.contains("memberships_user_id_idx"), "user_id leads the PK: skipped");
    assert!(!sql.contains("memberships_role_idx"), "role leads a unique: skipped");
    assert!(sql.contains("create index memberships_team_id_idx"), "team_id is 2nd in the PK: kept");
    assert!(sql.contains("create index memberships_invited_by_idx"), "invited_by is 2nd in a unique: kept");
}
