//! Phase 10 step 5: DDL generators (PHASE-10-SPEC §3, §9).
//!
//! Both outputs come from a *valid* model only (`dbmodel::validate` empty):
//! - `pg_sql`: the PostgreSQL 17 `.sql` export (tables, then FKs, indexes,
//!   comments, RLS).
//! - `sqlite_sql`: the STRICT SQLite DDL for the test file (used by step 6),
//!   FKs inline.
//!
//! Deterministic: no timestamps, no HashMap iteration; tables by name, columns
//! in model order. One index per FK column set unless the set (in order)
//! leads the PK or a unique set. Constraint/index names follow PostgreSQL style and are
//! shared by both generators; one schema-wide namespace, names over 63 bytes
//! (or colliding) become a 54-byte prefix + `_` + 8-hex FNV-1a hash.

use crate::dbmodel::{
    validate, DbColumn, DbDefault, DbModel, DbTable, DbType, LiteralValue, OnDelete, PG_RESERVED,
};
use std::collections::HashSet;

const MAX_NAME: usize = 63;

/// PostgreSQL 17 "non-reserved (cannot be function or type)" keywords
/// (`pg_get_keywords()` catcode `C`). Valid as names, but PG's own
/// `quote_ident` quotes them, so we do too. Reserved words never reach here
/// (validation refuses them) but are still quoted for safety.
const PG_COL_NAME_KEYWORDS: &[&str] = &[
    "between", "bigint", "bit", "boolean", "char", "character", "coalesce", "dec", "decimal",
    "exists", "extract", "float", "greatest", "grouping", "inout", "int", "integer", "interval",
    "json", "json_array", "json_arrayagg", "json_exists", "json_object", "json_objectagg",
    "json_query", "json_scalar", "json_serialize", "json_table", "json_value", "least",
    "merge_action", "national", "nchar", "none", "normalize", "nullif", "numeric", "out",
    "overlay", "position", "precision", "real", "row", "setof", "smallint", "substring", "time",
    "timestamp", "treat", "trim", "values", "varchar", "xmlattributes", "xmlconcat",
    "xmlelement", "xmlexists", "xmlforest", "xmlnamespaces", "xmlparse", "xmlpi", "xmlroot",
    "xmlserialize", "xmltable",
];

/// PostgreSQL identifier, quoted only when needed (same rule as `quote_ident`).
pub fn pg_ident(name: &str) -> String {
    let plain = name.chars().next().is_some_and(|c| c.is_ascii_lowercase() || c == '_')
        && name.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '_');
    let keyword = PG_RESERVED.binary_search(&name).is_ok() || PG_COL_NAME_KEYWORDS.contains(&name);
    if plain && !keyword {
        name.to_string()
    } else {
        format!("\"{}\"", name.replace('"', "\"\""))
    }
}

/// SQLite identifiers are always quoted (internal file; no keyword table needed).
pub(crate) fn sq_ident(name: &str) -> String {
    format!("\"{}\"", name.replace('"', "\"\""))
}

fn str_lit(s: &str) -> String {
    format!("'{}'", s.replace('\'', "''"))
}

fn fnv1a32(s: &str) -> u32 {
    let mut h: u32 = 0x811c_9dc5;
    for b in s.bytes() {
        h ^= u32::from(b);
        h = h.wrapping_mul(0x0100_0193);
    }
    h
}

/// Constraint / index names: one namespace (PG index names are schema-wide).
#[derive(Default)]
struct Names {
    used: HashSet<String>,
}

impl Names {
    fn take(&mut self, full: String) -> String {
        if full.len() <= MAX_NAME && self.used.insert(full.clone()) {
            return full;
        }
        // Names are ASCII (validated identifiers), so byte slicing is safe.
        let mut n = 0u32;
        loop {
            let seed = if n == 0 { full.clone() } else { format!("{full}#{n}") };
            let cand = format!("{}_{:08x}", &full[..full.len().min(MAX_NAME - 9)], fnv1a32(&seed));
            if self.used.insert(cand.clone()) {
                return cand;
            }
            n += 1;
        }
    }
}

struct FkPlan<'a> {
    name: String,
    cols: Vec<&'a DbColumn>,
    ref_table: &'a DbTable,
    ref_cols: Vec<&'a DbColumn>,
    on_delete: OnDelete,
}

struct TablePlan<'a> {
    t: &'a DbTable,
    /// `<t>_pkey` (unused by SQLite when the PK is a sole identity column).
    pkey: String,
    pk_cols: Vec<&'a DbColumn>,
    uniques: Vec<(String, Vec<&'a DbColumn>)>,
    /// Per column (model order): its CHECK constraint name, if the type has one.
    checks: Vec<Option<String>>,
    fks: Vec<FkPlan<'a>>,
    indexes: Vec<(String, Vec<&'a DbColumn>)>,
}

fn col<'a>(t: &'a DbTable, id: &str) -> &'a DbColumn {
    t.columns.iter().find(|c| c.id == id).expect("validated model")
}

fn joined(t: &DbTable, cols: &[&DbColumn], suffix: &str) -> String {
    let mut s = t.name.clone();
    for c in cols {
        s.push('_');
        s.push_str(&c.name);
    }
    s.push('_');
    s.push_str(suffix);
    s
}

fn plan(model: &DbModel) -> Vec<TablePlan<'_>> {
    let mut tables: Vec<&DbTable> = model.tables.iter().collect();
    tables.sort_by(|a, b| a.name.cmp(&b.name));
    let mut names = Names::default();
    let mut out: Vec<TablePlan> = tables
        .iter()
        .map(|t| {
            let pk_cols: Vec<&DbColumn> = t.primary_key.iter().map(|id| col(t, id)).collect();
            let pkey = names.take(format!("{}_pkey", t.name));
            let uniques = t
                .uniques
                .iter()
                .map(|u| {
                    let cols: Vec<&DbColumn> = u.columns.iter().map(|id| col(t, id)).collect();
                    (names.take(joined(t, &cols, "key")), cols)
                })
                .collect();
            let checks = t
                .columns
                .iter()
                .map(|c| has_check(c).then(|| names.take(joined(t, &[c], "check"))))
                .collect();
            TablePlan { t, pkey, pk_cols, uniques, checks, fks: Vec::new(), indexes: Vec::new() }
        })
        .collect();
    // FKs and their indexes after every table (names stay deterministic).
    for p in out.iter_mut() {
        let t = p.t;
        let mut seen: Vec<Vec<&str>> = Vec::new();
        for fk in &t.foreign_keys {
            let cols: Vec<&DbColumn> = fk.columns.iter().map(|id| col(t, id)).collect();
            let rt = model.tables.iter().find(|x| x.id == fk.ref_table_id).expect("validated model");
            let ref_cols = fk.ref_columns.iter().map(|id| col(rt, id)).collect();
            let name = names.take(joined(t, &cols, "fkey"));
            p.fks.push(FkPlan { name, cols, ref_table: rt, ref_cols, on_delete: fk.on_delete });
        }
        // An FK whose columns, in order, lead the PK or a unique set is already
        // served by that constraint's index: no extra index.
        let leads = |key: &[&str], set: &[String]| set.len() >= key.len() && key.iter().zip(set).all(|(k, s)| *k == s);
        for fk in &p.fks {
            let key: Vec<&str> = fk.cols.iter().map(|c| c.id.as_str()).collect();
            let covered = leads(&key, &t.primary_key) || t.uniques.iter().any(|u| leads(&key, &u.columns));
            if covered || seen.contains(&key) {
                continue;
            }
            seen.push(key);
            p.indexes.push((names.take(joined(t, &fk.cols, "idx")), fk.cols.clone()));
        }
    }
    out
}

fn has_check(c: &DbColumn) -> bool {
    // PG: only enum. SQLite: every type except text/integer/identity (see `sq_check`).
    // One name is reserved per column that needs a check on either side.
    !matches!(c.col_type, DbType::Text | DbType::Integer | DbType::Identity | DbType::Asset)
}

fn on_delete_sql(o: OnDelete) -> &'static str {
    match o {
        OnDelete::NoAction => "no action",
        OnDelete::Cascade => "cascade",
        OnDelete::SetNull => "set null",
        OnDelete::Restrict => "restrict",
    }
}

fn enum_list(c: &DbColumn) -> String {
    c.values.as_deref().unwrap_or_default().iter().map(|v| str_lit(v)).collect::<Vec<_>>().join(", ")
}

fn list(cols: &[&DbColumn], q: fn(&str) -> String) -> String {
    cols.iter().map(|c| q(&c.name)).collect::<Vec<_>>().join(", ")
}

/* ---------------- PostgreSQL 17 ---------------- */

fn pg_type(c: &DbColumn) -> String {
    match c.col_type {
        DbType::Text | DbType::Enum | DbType::Asset => "text".into(),
        DbType::Integer => "bigint".into(),
        DbType::Decimal => format!("numeric({},{})", c.precision.unwrap_or(12), c.scale.unwrap_or(2)),
        DbType::Boolean => "boolean".into(),
        DbType::Date => "date".into(),
        DbType::Timestamptz => "timestamptz".into(),
        DbType::Uuid => "uuid".into(),
        DbType::Json => "jsonb".into(),
        DbType::Identity => "bigint generated by default as identity".into(),
    }
}

fn pg_default(c: &DbColumn) -> Option<String> {
    Some(match c.default.as_ref()? {
        DbDefault::Now => "now()".into(),
        DbDefault::Today => "current_date".into(),
        DbDefault::Uuid => "gen_random_uuid()".into(),
        DbDefault::Literal { value: LiteralValue::Bool(b) } => b.to_string(),
        DbDefault::Literal { value: LiteralValue::Text(s) } => match c.col_type {
            DbType::Integer | DbType::Decimal => s.clone(),
            _ => str_lit(s),
        },
    })
}

const PG_HEADER: &str = "-- Lumen schema export
-- PostgreSQL 17 / Supabase. Row level security is enabled on every table.
-- No policies are generated: the anon and authenticated roles can read or
-- write nothing until you add policies (see docs/SUPABASE.md).
-- Prefer Supabase Auth for login; treat app users tables as profiles, not
-- password stores.
";

pub fn pg_sql(model: &DbModel) -> String {
    let plans = plan(model);
    let q = |n: &str| pg_ident(n);
    let tq = |n: &str| format!("public.{}", pg_ident(n));
    let mut s = String::from(PG_HEADER);
    for p in &plans {
        let t = p.t;
        let mut lines: Vec<String> = Vec::new();
        for c in &t.columns {
            let mut l = format!("  {} {}", q(&c.name), pg_type(c));
            if let Some(d) = pg_default(c) {
                l.push_str(" default ");
                l.push_str(&d);
            }
            if !c.nullable {
                l.push_str(" not null");
            }
            lines.push(l);
        }
        lines.push(format!("  constraint {} primary key ({})", q(&p.pkey), list(&p.pk_cols, pg_ident)));
        for (name, cols) in &p.uniques {
            lines.push(format!("  constraint {} unique ({})", q(name), list(cols, pg_ident)));
        }
        for (c, name) in t.columns.iter().zip(&p.checks) {
            if let (DbType::Enum, Some(name)) = (c.col_type, name) {
                lines.push(format!("  constraint {} check ({} in ({}))", q(name), q(&c.name), enum_list(c)));
            }
        }
        s.push_str(&format!("\ncreate table {} (\n{}\n);\n", tq(&t.name), lines.join(",\n")));
        for c in &t.columns {
            if c.col_type == DbType::Asset {
                s.push_str(&format!(
                    "comment on column {}.{} is 'lumen asset id (not BYTEA)';\n",
                    tq(&t.name),
                    q(&c.name)
                ));
            }
        }
    }
    let fks: Vec<String> = plans
        .iter()
        .flat_map(|p| {
            p.fks.iter().map(move |fk| {
                format!(
                    "alter table {} add constraint {} foreign key ({}) references {} ({}) on delete {};\n",
                    tq(&p.t.name),
                    q(&fk.name),
                    list(&fk.cols, pg_ident),
                    tq(&fk.ref_table.name),
                    list(&fk.ref_cols, pg_ident),
                    on_delete_sql(fk.on_delete)
                )
            })
        })
        .collect();
    if !fks.is_empty() {
        s.push('\n');
        s.push_str(&fks.concat());
    }
    let idx: Vec<String> = plans
        .iter()
        .flat_map(|p| {
            p.indexes
                .iter()
                .map(move |(name, cols)| format!("create index {} on {} ({});\n", q(name), tq(&p.t.name), list(cols, pg_ident)))
        })
        .collect();
    if !idx.is_empty() {
        s.push('\n');
        s.push_str(&idx.concat());
    }
    let mut comments = String::new();
    for p in &plans {
        if let Some(l) = p.t.label.as_deref().filter(|l| !l.is_empty()) {
            comments.push_str(&format!("comment on table {} is {};\n", tq(&p.t.name), str_lit(l)));
        }
        for c in &p.t.columns {
            if let Some(l) = c.label.as_deref().filter(|l| !l.is_empty()) {
                comments.push_str(&format!("comment on column {}.{} is {};\n", tq(&p.t.name), q(&c.name), str_lit(l)));
            }
        }
    }
    if !comments.is_empty() {
        s.push('\n');
        s.push_str(&comments);
    }
    s.push('\n');
    for p in &plans {
        s.push_str(&format!("alter table {} enable row level security;\n", tq(&p.t.name)));
    }
    s
}

/* ---------------- SQLite (STRICT) ---------------- */

fn sq_type(c: &DbColumn) -> &'static str {
    match c.col_type {
        DbType::Integer | DbType::Boolean | DbType::Identity => "INTEGER",
        _ => "TEXT",
    }
}

fn sq_check(c: &DbColumn) -> Option<String> {
    let n = sq_ident(&c.name);
    Some(match c.col_type {
        DbType::Text | DbType::Integer | DbType::Identity | DbType::Asset => return None,
        DbType::Decimal => format!("({n} GLOB '[0-9]*' OR {n} GLOB '-[0-9]*') AND {n} NOT GLOB '*[^0-9.-]*'"),
        DbType::Boolean => format!("{n} IN (0, 1)"),
        DbType::Date => format!("date({n}) = {n}"),
        // `julianday(NULL) IS NOT NULL` is false, not NULL: allow NULL explicitly.
        DbType::Timestamptz => format!("{n} IS NULL OR julianday({n}) IS NOT NULL"),
        DbType::Uuid => format!("length({n}) = 36"),
        DbType::Json => format!("json_valid({n})"),
        DbType::Enum => format!("{n} IN ({})", enum_list(c)),
    })
}

fn sq_default(c: &DbColumn) -> Option<String> {
    Some(match c.default.as_ref()? {
        DbDefault::Now => "(strftime('%Y-%m-%dT%H:%M:%fZ','now'))".into(),
        DbDefault::Today => "(date('now'))".into(),
        // Filled by Rust (`Uuid::new_v4()`) on insert.
        DbDefault::Uuid => return None,
        DbDefault::Literal { value: LiteralValue::Bool(b) } => (if *b { "1" } else { "0" }).into(),
        DbDefault::Literal { value: LiteralValue::Text(s) } => match c.col_type {
            DbType::Integer => s.clone(),
            _ => str_lit(s),
        },
    })
}

pub fn sqlite_sql(model: &DbModel) -> String {
    let plans = plan(model);
    let mut s = String::from("-- Lumen test schema (SQLite STRICT)\n");
    for p in &plans {
        let t = p.t;
        let rowid_pk = p.pk_cols.len() == 1 && p.pk_cols[0].col_type == DbType::Identity;
        let mut lines: Vec<String> = Vec::new();
        for (c, check) in t.columns.iter().zip(&p.checks) {
            let mut l = format!("  {} {}", sq_ident(&c.name), sq_type(c));
            if rowid_pk && c.col_type == DbType::Identity {
                l.push_str(" PRIMARY KEY");
            } else if !c.nullable {
                l.push_str(" NOT NULL");
            }
            if let Some(d) = sq_default(c) {
                l.push_str(" DEFAULT ");
                l.push_str(&d);
            }
            if let (Some(name), Some(expr)) = (check, sq_check(c)) {
                l.push_str(&format!(" CONSTRAINT {} CHECK ({expr})", sq_ident(name)));
            }
            lines.push(l);
        }
        if !rowid_pk {
            lines.push(format!("  CONSTRAINT {} PRIMARY KEY ({})", sq_ident(&p.pkey), list(&p.pk_cols, sq_ident)));
        }
        for (name, cols) in &p.uniques {
            lines.push(format!("  CONSTRAINT {} UNIQUE ({})", sq_ident(name), list(cols, sq_ident)));
        }
        for fk in &p.fks {
            lines.push(format!(
                "  CONSTRAINT {} FOREIGN KEY ({}) REFERENCES {} ({}) ON DELETE {}",
                sq_ident(&fk.name),
                list(&fk.cols, sq_ident),
                sq_ident(&fk.ref_table.name),
                list(&fk.ref_cols, sq_ident),
                on_delete_sql(fk.on_delete).to_uppercase()
            ));
        }
        s.push_str(&format!("\nCREATE TABLE {} (\n{}\n) STRICT;\n", sq_ident(&t.name), lines.join(",\n")));
        for (name, cols) in &p.indexes {
            s.push_str(&format!("CREATE INDEX {} ON {} ({});\n", sq_ident(name), sq_ident(&t.name), list(cols, sq_ident)));
        }
    }
    s
}

/// Export entry: refuses an invalid model with its first error (Thai).
pub fn export_pg(model: &DbModel) -> Result<String, String> {
    if let Some(first) = validate(model).into_iter().next() {
        return Err(first.message);
    }
    Ok(pg_sql(model))
}

#[cfg(test)]
#[path = "sqlexport_tests.rs"]
mod tests;
