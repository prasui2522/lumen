//! Phase 11 C6: app-wide `library_items` (user-saved presets).
//! Additive migration on `lumen.db`; project rows are untouched.

use crate::defaults::{NodeStates, NodeType, StyleProps};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::Value;

pub const LIBRARY_KIND_PRESET: &str = "preset";
pub const LIBRARY_JSON_MAX_BYTES: usize = 16 * 1024;
pub const LIBRARY_MAX_ROWS: i64 = 200;

const STATE_PAINT_KEYS: &[&str] = &[
    "backgroundColor",
    "color",
    "borderColor",
    "opacity",
    "boxShadow",
    "backgroundGradient",
    "textGradient",
    "filter",
    "backdropFilter",
    "transform",
];

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryItem {
    pub kind: String,
    pub id: String,
    pub name: String,
    pub json: String,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PresetSource {
    kind: String,
}

/// Serde shape for a style preset (built-in or user). Used only for validation.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StylePresetWire {
    format_version: u32,
    id: String,
    name: String,
    name_en: String,
    category: String,
    applies_to: Vec<NodeType>,
    style: StyleProps,
    #[serde(default)]
    states: Option<NodeStates>,
    source: PresetSource,
    #[serde(default)]
    note: Option<String>,
}

/// Additive: safe on fresh and existing DBs.
pub fn migrate_library(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS library_items (
            kind TEXT NOT NULL,
            id TEXT PRIMARY KEY NOT NULL,
            name TEXT NOT NULL,
            json TEXT NOT NULL,
            created_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_library_items_kind ON library_items(kind);",
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn now_unix_ms() -> i64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

fn reject_layout_in_states(raw: &Value) -> Result<(), String> {
    let Some(states) = raw.get("states") else {
        return Ok(());
    };
    if states.is_null() {
        return Ok(());
    }
    let obj = states
        .as_object()
        .ok_or_else(|| "preset.states must be an object".to_string())?;
    for (name, style) in obj {
        if !matches!(name.as_str(), "hover" | "active" | "focusVisible") {
            return Err(format!("preset.states.{name}: unknown state"));
        }
        let style_obj = style
            .as_object()
            .ok_or_else(|| format!("preset.states.{name} must be an object"))?;
        for key in style_obj.keys() {
            if !STATE_PAINT_KEYS.contains(&key.as_str()) {
                return Err(format!(
                    "preset.states.{name}.{key}: layout/disallowed key in states ({key})"
                ));
            }
        }
    }
    Ok(())
}

/// Validate preset JSON before store. Rejects hostile / oversized payloads.
pub fn validate_preset_json(json: &str) -> Result<(), String> {
    parse_preset_json(json).map(|_| ())
}

fn parse_preset_json(json: &str) -> Result<StylePresetWire, String> {
    if json.len() > LIBRARY_JSON_MAX_BYTES {
        return Err(format!(
            "preset json exceeds {LIBRARY_JSON_MAX_BYTES} bytes"
        ));
    }
    let raw: Value =
        serde_json::from_str(json).map_err(|e| format!("preset json: {e}"))?;
    reject_layout_in_states(&raw)?;
    let wire: StylePresetWire =
        serde_json::from_value(raw).map_err(|e| format!("preset shape: {e}"))?;
    if wire.format_version != 1 {
        return Err("preset.formatVersion must be 1".into());
    }
    if wire.id.trim().is_empty() || wire.id.len() > 64 {
        return Err("preset.id invalid".into());
    }
    if wire.name.trim().is_empty() || wire.name.len() > 80 {
        return Err("preset.name invalid".into());
    }
    if !matches!(
        wire.category.as_str(),
        "button" | "card" | "surface"
    ) {
        return Err("preset.category invalid".into());
    }
    if wire.applies_to.is_empty() {
        return Err("preset.appliesTo empty".into());
    }
    if !matches!(wire.source.kind.as_str(), "original" | "user") {
        return Err("preset.source.kind invalid".into());
    }
    Ok(wire)
}

pub fn library_list(conn: &Connection, kind: &str) -> Result<Vec<LibraryItem>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT kind, id, name, json, created_at FROM library_items
             WHERE kind = ?1
             ORDER BY created_at DESC, name ASC",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![kind], |row| {
            Ok(LibraryItem {
                kind: row.get(0)?,
                id: row.get(1)?,
                name: row.get(2)?,
                json: row.get(3)?,
                created_at: row.get(4)?,
            })
        })
        .map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r.map_err(|e| e.to_string())?);
    }
    Ok(out)
}

pub fn library_put(
    conn: &Connection,
    kind: &str,
    id: &str,
    name: &str,
    json: &str,
) -> Result<LibraryItem, String> {
    if kind != LIBRARY_KIND_PRESET {
        return Err(format!("unsupported library kind: {kind}"));
    }
    let id = id.trim();
    let name = name.trim();
    if id.is_empty() || id.len() > 64 {
        return Err("id invalid".into());
    }
    if name.is_empty() || name.len() > 80 {
        return Err("name invalid".into());
    }
    let wire = parse_preset_json(json)?;
    if wire.id != id {
        return Err("id must match preset.id".into());
    }
    // Cap rows: allow update of existing without counting against the limit.
    let existing: Option<String> = conn
        .query_row(
            "SELECT id FROM library_items WHERE id = ?1",
            params![id],
            |r| r.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    if existing.is_none() {
        let count: i64 = conn
            .query_row("SELECT count(*) FROM library_items", [], |r| r.get(0))
            .map_err(|e| e.to_string())?;
        if count >= LIBRARY_MAX_ROWS {
            return Err(format!("library full (max {LIBRARY_MAX_ROWS} rows)"));
        }
    }
    let created_at = now_unix_ms();
    conn.execute(
        "INSERT INTO library_items (kind, id, name, json, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5)
         ON CONFLICT(id) DO UPDATE SET
           kind = excluded.kind,
           name = excluded.name,
           json = excluded.json",
        params![kind, id, name, json, created_at],
    )
    .map_err(|e| e.to_string())?;
    let created_at: i64 = conn
        .query_row(
            "SELECT created_at FROM library_items WHERE id = ?1",
            params![id],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    Ok(LibraryItem {
        kind: kind.to_string(),
        id: id.to_string(),
        name: name.to_string(),
        json: json.to_string(),
        created_at,
    })
}

pub fn library_delete(conn: &Connection, id: &str) -> Result<bool, String> {
    let n = conn
        .execute("DELETE FROM library_items WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(n > 0)
}

#[cfg(test)]
#[path = "library_tests.rs"]
mod library_tests;
