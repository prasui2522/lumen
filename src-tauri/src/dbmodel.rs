//! Phase 10 database designer model (docs/PHASE-10-SPEC.md §2).
//!
//! The model is plain JSON in the app DB table `db_models` (one row per
//! project); `document_json` and the document version rule are untouched.
//! This module holds the typed model, identifier rules, `PG_RESERVED`, and
//! validation. Rust is authoritative; the TS mirror (step 3) must agree.
//!
//! A model may be SAVED while invalid (a draft never loses work); only the
//! `.sql` export and applying it to the test file require `validate` to pass.

// Validation and the DDL generators are wired to commands in later steps.
#![allow(dead_code)]

use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};

/// Error for a model JSON that does not have the model shape (save path).
pub const MODEL_PARSE_ERROR: &str = "โครงสร้างฐานข้อมูลไม่ถูกต้อง";

pub const MAX_TABLES: usize = 50;
pub const MAX_COLUMNS: usize = 100;
pub const MAX_ENUM_VALUES: usize = 50;
pub const MAX_ENUM_VALUE_CHARS: usize = 63;
pub const MAX_TEXT_DEFAULT_CHARS: usize = 1000;
pub const MAX_IDENT_LEN: usize = 63;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct DbModel {
    /// Always 1 in v1 (checked by `parse_model`).
    pub version: u32,
    pub tables: Vec<DbTable>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DbTable {
    pub id: String,
    pub name: String,
    /// Thai display name; exported as `comment on table`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
    /// Order = display / DDL order.
    pub columns: Vec<DbColumn>,
    /// Column ids.
    pub primary_key: Vec<String>,
    #[serde(default)]
    pub uniques: Vec<DbUnique>,
    #[serde(default)]
    pub foreign_keys: Vec<DbForeignKey>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum DbType {
    Text,
    Integer,
    Decimal,
    Boolean,
    Date,
    Timestamptz,
    Uuid,
    Json,
    Enum,
    Identity,
    /// Asset id string (image pipeline). SQL export as text.
    Asset,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum DbColumnSecret {
    Argon2id,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum LiteralValue {
    Bool(bool),
    /// Integers travel as strings (i64 exceeds JS safe integers).
    Text(String),
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum DbDefault {
    Literal { value: LiteralValue },
    Now,
    Today,
    Uuid,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DbColumn {
    pub id: String,
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
    #[serde(rename = "type")]
    pub col_type: DbType,
    pub nullable: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub default: Option<DbDefault>,
    /// Decimal only: 1–38 (new column: 12).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub precision: Option<u32>,
    /// Decimal only: 0–precision (new column: 2).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub scale: Option<u32>,
    /// Enum only: 1–50 distinct values, each 1–63 chars.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub values: Option<Vec<String>>,
    /// Password column: runtime hashes; never store plaintext.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub secret: Option<DbColumnSecret>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct DbUnique {
    pub id: String,
    pub columns: Vec<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum OnDelete {
    #[default]
    NoAction,
    Cascade,
    SetNull,
    Restrict,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DbForeignKey {
    pub id: String,
    pub columns: Vec<String>,
    pub ref_table_id: String,
    pub ref_columns: Vec<String>,
    #[serde(default)]
    pub on_delete: OnDelete,
}

/// Parse a model JSON value (save path). Shape only: an invalid draft parses.
/// Unknown keys are ignored and not stored; a version other than 1 is refused.
pub fn parse_model(value: &serde_json::Value) -> Result<DbModel, String> {
    let model: DbModel =
        serde_json::from_value(value.clone()).map_err(|_| MODEL_PARSE_ERROR.to_string())?;
    if model.version != 1 {
        return Err(MODEL_PARSE_ERROR.into());
    }
    Ok(model)
}

/* ---------------- Identifiers ---------------- */

/// PostgreSQL 17 Appendix C keywords whose PostgreSQL column says "reserved",
/// including "reserved (can be function or type)": neither can be an unquoted
/// table or column name. Sorted; mirrored in TS (step 3).
pub const PG_RESERVED: &[&str] = &[
    "all", "analyse", "analyze", "and", "any", "array", "as", "asc", "asymmetric",
    "authorization", "binary", "both", "case", "cast", "check", "collate", "collation",
    "column", "concurrently", "constraint", "create", "cross", "current_catalog",
    "current_date", "current_role", "current_schema", "current_time", "current_timestamp",
    "current_user", "default", "deferrable", "desc", "distinct", "do", "else", "end",
    "except", "false", "fetch", "for", "foreign", "freeze", "from", "full", "grant",
    "group", "having", "ilike", "in", "initially", "inner", "intersect", "into", "is",
    "isnull", "join", "lateral", "leading", "left", "like", "limit", "localtime",
    "localtimestamp", "natural", "not", "notnull", "null", "offset", "on", "only", "or",
    "order", "outer", "overlaps", "placing", "primary", "references", "returning",
    "right", "select", "session_user", "similar", "some", "symmetric", "system_user",
    "table", "tablesample", "then", "to", "trailing", "true", "union", "unique", "user",
    "using", "variadic", "verbose", "when", "where", "window", "with",
];

/// SQLite / PostgreSQL system column names that can never be user names.
pub const SYSTEM_NAMES: &[&str] =
    &["rowid", "oid", "_rowid_", "tableoid", "xmin", "xmax", "cmin", "cmax", "ctid"];

/// UI input → stored name: trimmed, ASCII-lowercased, spaces → `_`. The result
/// still goes through `identifier_error` (Thai belongs in `label`).
pub fn normalize_identifier(raw: &str) -> String {
    raw.trim()
        .chars()
        .map(|c| if c.is_whitespace() { '_' } else { c.to_ascii_lowercase() })
        .collect()
}

/// Why a stored name is not a valid identifier, or `None`.
/// `^[a-z][a-z0-9_]{0,62}$`, not reserved, not a system name, no `pg_` / `sqlite_` prefix.
pub fn identifier_error(name: &str) -> Option<String> {
    let bytes = name.as_bytes();
    let shape_ok = !bytes.is_empty()
        && bytes.len() <= MAX_IDENT_LEN
        && bytes[0].is_ascii_lowercase()
        && bytes
            .iter()
            .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || *b == b'_');
    if !shape_ok {
        return Some(if name.is_empty() {
            "ต้องมีชื่อ".into()
        } else {
            "ชื่อใช้ได้เฉพาะ a-z 0-9 _ ขึ้นต้นด้วยตัวอักษร ไม่เกิน 63 ตัว".into()
        });
    }
    if PG_RESERVED.binary_search(&name).is_ok() {
        return Some(format!("{name} เป็นคำสงวน"));
    }
    if SYSTEM_NAMES.contains(&name) {
        return Some(format!("{name} เป็นชื่อของระบบ"));
    }
    if name.starts_with("pg_") || name.starts_with("sqlite_") {
        return Some("ห้ามขึ้นต้นด้วย pg_ หรือ sqlite_".into());
    }
    None
}

/* ---------------- Validation ---------------- */

/// One validation problem. `table_id` / `column_id` let the UI move focus to
/// the field (`ปัญหา (n)` list); `field` names the control.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelIssue {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub table_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub column_id: Option<String>,
    /// `model`, `table`, `name`, `columns`, `primaryKey`, `type`, `nullable`,
    /// `default`, `precision`, `values`, `unique:<id>`, `foreignKey:<id>`.
    pub field: String,
    pub message: String,
}

fn issue(table: Option<&DbTable>, column: Option<&DbColumn>, field: &str, message: impl Into<String>) -> ModelIssue {
    ModelIssue {
        table_id: table.map(|t| t.id.clone()),
        column_id: column.map(|c| c.id.clone()),
        field: field.into(),
        message: message.into(),
    }
}

fn is_valid_date(s: &str) -> bool {
    let b = s.as_bytes();
    if b.len() != 10 || b[4] != b'-' || b[7] != b'-' {
        return false;
    }
    let digits = |r: std::ops::Range<usize>| b[r.clone()].iter().all(u8::is_ascii_digit).then(|| s[r].parse::<u32>().ok()).flatten();
    let (Some(y), Some(m), Some(d)) = (digits(0..4), digits(5..7), digits(8..10)) else {
        return false;
    };
    if !(1..=12).contains(&m) || d == 0 {
        return false;
    }
    let leap = (y % 4 == 0 && y % 100 != 0) || y % 400 == 0;
    let max = match m {
        2 if leap => 29,
        2 => 28,
        4 | 6 | 9 | 11 => 30,
        _ => 31,
    };
    d <= max
}

/// `-?digits(.digits)?` with at most `precision - scale` integer digits
/// (leading zeros ignored) and at most `scale` fraction digits.
pub fn decimal_fits(s: &str, precision: u32, scale: u32) -> bool {
    let body = s.strip_prefix('-').unwrap_or(s);
    let (int, frac) = match body.split_once('.') {
        Some((i, f)) => (i, Some(f)),
        None => (body, None),
    };
    if int.is_empty() || !int.bytes().all(|b| b.is_ascii_digit()) {
        return false;
    }
    if let Some(f) = frac {
        if f.is_empty() || !f.bytes().all(|b| b.is_ascii_digit()) || f.len() > scale as usize {
            return false;
        }
    }
    let int_digits = int.trim_start_matches('0').len();
    int_digits <= precision.saturating_sub(scale) as usize
}

/// FK / PK pairing: identity and integer are the same storage type.
fn same_key_type(a: DbType, b: DbType) -> bool {
    let norm = |t| if t == DbType::Identity { DbType::Integer } else { t };
    norm(a) == norm(b)
}

fn as_set(ids: &[String]) -> Vec<&str> {
    let mut v: Vec<&str> = ids.iter().map(String::as_str).collect();
    v.sort_unstable();
    v
}

fn validate_default(t: &DbTable, c: &DbColumn, out: &mut Vec<ModelIssue>) {
    let Some(def) = &c.default else { return };
    let bad = |msg: &str| issue(Some(t), Some(c), "default", msg);
    match (c.col_type, def) {
        (DbType::Json, _) => out.push(bad("JSON ไม่มีค่าเริ่มต้น")),
        (DbType::Identity, _) => out.push(bad("ลำดับอัตโนมัติไม่มีค่าเริ่มต้น")),
        (DbType::Timestamptz, DbDefault::Now)
        | (DbType::Date, DbDefault::Today)
        | (DbType::Uuid, DbDefault::Uuid) => {}
        (_, DbDefault::Now | DbDefault::Today | DbDefault::Uuid) => {
            out.push(bad("ค่าเริ่มต้นไม่ตรงกับชนิด"))
        }
        (ty, DbDefault::Literal { value }) => {
            let ok = match (ty, value) {
                (DbType::Boolean, LiteralValue::Bool(_)) => true,
                (DbType::Integer, LiteralValue::Text(s)) => s.parse::<i64>().is_ok(),
                (DbType::Decimal, LiteralValue::Text(s)) => match (c.precision, c.scale) {
                    (Some(p), Some(sc)) => decimal_fits(s, p, sc),
                    _ => false,
                },
                (DbType::Date, LiteralValue::Text(s)) => is_valid_date(s),
                (DbType::Text | DbType::Asset, LiteralValue::Text(s)) => {
                    s.chars().count() <= MAX_TEXT_DEFAULT_CHARS
                }
                (DbType::Enum, LiteralValue::Text(s)) => {
                    c.values.as_ref().is_some_and(|v| v.contains(s))
                }
                // timestamptz / uuid take only `now` / `uuid`; other pairs mismatch.
                _ => false,
            };
            if !ok {
                out.push(bad("ค่าเริ่มต้นไม่ตรงกับชนิด"));
            }
        }
    }
}

/// Every problem in the model (empty = valid for export / test file).
/// Order: model, then tables in model order, each table's own checks first.
pub fn validate(model: &DbModel) -> Vec<ModelIssue> {
    let mut out = Vec::new();
    if model.tables.is_empty() {
        out.push(issue(None, None, "model", "ต้องมีอย่างน้อย 1 ตาราง"));
    }
    if model.tables.len() > MAX_TABLES {
        out.push(issue(None, None, "model", format!("ตารางได้ไม่เกิน {MAX_TABLES} ตาราง")));
    }
    let mut table_ids = HashSet::new();
    let mut table_names = HashSet::new();
    let by_id: HashMap<&str, &DbTable> = model.tables.iter().map(|t| (t.id.as_str(), t)).collect();

    for t in &model.tables {
        if t.id.is_empty() || !table_ids.insert(t.id.as_str()) {
            out.push(issue(Some(t), None, "table", "รหัสตารางซ้ำหรือว่าง"));
        }
        if let Some(e) = identifier_error(&t.name) {
            out.push(issue(Some(t), None, "name", e));
        } else if !table_names.insert(t.name.as_str()) {
            out.push(issue(Some(t), None, "name", format!("ชื่อตารางซ้ำ: {}", t.name)));
        }
        if t.columns.is_empty() {
            out.push(issue(Some(t), None, "columns", "ต้องมีอย่างน้อย 1 คอลัมน์"));
        }
        if t.columns.len() > MAX_COLUMNS {
            out.push(issue(Some(t), None, "columns", format!("คอลัมน์ได้ไม่เกิน {MAX_COLUMNS} คอลัมน์")));
        }

        let cols: HashMap<&str, &DbColumn> = t.columns.iter().map(|c| (c.id.as_str(), c)).collect();
        let mut col_ids = HashSet::new();
        let mut col_names = HashSet::new();
        for c in &t.columns {
            if c.id.is_empty() || !col_ids.insert(c.id.as_str()) {
                out.push(issue(Some(t), Some(c), "column", "รหัสคอลัมน์ซ้ำหรือว่าง"));
            }
            if let Some(e) = identifier_error(&c.name) {
                out.push(issue(Some(t), Some(c), "name", e));
            } else if !col_names.insert(c.name.as_str()) {
                out.push(issue(Some(t), Some(c), "name", format!("ชื่อคอลัมน์ซ้ำ: {}", c.name)));
            }
            if c.col_type == DbType::Decimal {
                match (c.precision, c.scale) {
                    (Some(p), Some(s)) if (1..=38).contains(&p) && s <= p => {}
                    _ => out.push(issue(Some(t), Some(c), "precision", "ทศนิยม: ความแม่นยำ 1–38 และตำแหน่งทศนิยม 0 ถึงความแม่นยำ")),
                }
            }
            if c.col_type == DbType::Enum {
                let vals = c.values.as_deref().unwrap_or(&[]);
                let distinct: HashSet<&String> = vals.iter().collect();
                let len_ok = vals.iter().all(|v| (1..=MAX_ENUM_VALUE_CHARS).contains(&v.chars().count()));
                if vals.is_empty() || vals.len() > MAX_ENUM_VALUES || distinct.len() != vals.len() || !len_ok {
                    out.push(issue(Some(t), Some(c), "values", "ตัวเลือก: 1–50 ค่าไม่ซ้ำกัน แต่ละค่า 1–63 ตัวอักษร"));
                }
            }
            validate_default(t, c, &mut out);
        }

        // Primary key.
        let pk = &t.primary_key;
        if pk.is_empty() {
            out.push(issue(Some(t), None, "primaryKey", "ต้องมีคีย์หลัก"));
        }
        if as_set(pk).windows(2).any(|w| w[0] == w[1]) {
            out.push(issue(Some(t), None, "primaryKey", "คีย์หลักมีคอลัมน์ซ้ำ"));
        }
        for id in pk {
            match cols.get(id.as_str()) {
                None => out.push(issue(Some(t), None, "primaryKey", "คีย์หลักอ้างถึงคอลัมน์ที่ไม่มีอยู่")),
                Some(c) if c.nullable => {
                    out.push(issue(Some(t), Some(c), "nullable", "คอลัมน์คีย์หลักต้องมีค่า"))
                }
                _ => {}
            }
        }
        for c in t.columns.iter().filter(|c| c.col_type == DbType::Identity) {
            if !(pk.len() == 1 && pk[0] == c.id) {
                out.push(issue(Some(t), Some(c), "type", "ลำดับอัตโนมัติต้องเป็นคีย์หลักเพียงคอลัมน์เดียว"));
            }
        }

        // Uniques.
        let pk_set = as_set(pk);
        let mut seen_sets: Vec<Vec<&str>> = Vec::new();
        for u in &t.uniques {
            let field = format!("unique:{}", u.id);
            let set = as_set(&u.columns);
            if u.columns.is_empty() {
                out.push(issue(Some(t), None, &field, "ไม่ซ้ำ: ต้องเลือกอย่างน้อย 1 คอลัมน์"));
                continue;
            }
            if set.windows(2).any(|w| w[0] == w[1]) {
                out.push(issue(Some(t), None, &field, "ไม่ซ้ำ: เลือกคอลัมน์ซ้ำ"));
            }
            if u.columns.iter().any(|id| !cols.contains_key(id.as_str())) {
                out.push(issue(Some(t), None, &field, "ไม่ซ้ำ: อ้างถึงคอลัมน์ที่ไม่มีอยู่"));
            }
            if !pk_set.is_empty() && set == pk_set {
                out.push(issue(Some(t), None, &field, "ไม่ซ้ำ: ซ้ำกับคีย์หลัก"));
            } else if seen_sets.contains(&set) {
                out.push(issue(Some(t), None, &field, "ไม่ซ้ำ: มีชุดคอลัมน์นี้แล้ว"));
            }
            seen_sets.push(set);
        }

        // Foreign keys.
        for fk in &t.foreign_keys {
            let field = format!("foreignKey:{}", fk.id);
            let mut push = |m: &str| out.push(issue(Some(t), None, &field, m));
            if fk.columns.is_empty() || fk.columns.len() != fk.ref_columns.len() {
                push("ความสัมพันธ์: จำนวนคอลัมน์ไม่เท่ากัน");
                continue;
            }
            if as_set(&fk.columns).windows(2).any(|w| w[0] == w[1]) {
                push("ความสัมพันธ์: เลือกคอลัมน์ซ้ำ");
            }
            let local: Vec<Option<&&DbColumn>> = fk.columns.iter().map(|id| cols.get(id.as_str())).collect();
            if local.iter().any(Option::is_none) {
                push("ความสัมพันธ์: อ้างถึงคอลัมน์ที่ไม่มีอยู่");
                continue;
            }
            let Some(rt) = by_id.get(fk.ref_table_id.as_str()) else {
                push("ความสัมพันธ์: ไม่พบตารางปลายทาง");
                continue;
            };
            let rcols: HashMap<&str, &DbColumn> = rt.columns.iter().map(|c| (c.id.as_str(), c)).collect();
            let remote: Vec<Option<&&DbColumn>> = fk.ref_columns.iter().map(|id| rcols.get(id.as_str())).collect();
            if remote.iter().any(Option::is_none) {
                push("ความสัมพันธ์: ไม่พบคอลัมน์ปลายทาง");
                continue;
            }
            let types_ok = local
                .iter()
                .zip(&remote)
                .all(|(l, r)| same_key_type(l.unwrap().col_type, r.unwrap().col_type));
            if !types_ok {
                push("ความสัมพันธ์: ชนิดคอลัมน์ไม่ตรงกัน");
            }
            let ref_set = as_set(&fk.ref_columns);
            let keyed = (!rt.primary_key.is_empty() && ref_set == as_set(&rt.primary_key))
                || rt.uniques.iter().any(|u| !u.columns.is_empty() && as_set(&u.columns) == ref_set);
            if !keyed {
                push("ความสัมพันธ์: คอลัมน์ปลายทางต้องเป็นคีย์หลักหรือไม่ซ้ำ");
            }
            if fk.on_delete == OnDelete::SetNull && local.iter().any(|c| !c.unwrap().nullable) {
                push("ความสัมพันธ์: ตั้งเป็นว่างได้เมื่อทุกคอลัมน์ไม่บังคับมีค่า");
            }
        }
    }
    out
}

#[cfg(test)]
#[path = "dbmodel_tests.rs"]
mod tests;
