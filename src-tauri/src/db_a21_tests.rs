//! PHASE-11 A2.1 tests: serde round trip of the nine A2 kinds, silent-drop guard,
//! and the version marker (`v1 stays v1 until a new kind is placed, then 4`).
use super::*;
use crate::compiler::a21_norm as norm;
use serde_json::{json, Value};

const SEED: &str = include_str!("fixtures/a2/seed-a2.json");
const A2_NAMES: [&str; 9] = [
    "card", "alert", "badge", "separator", "skeleton", "spinner", "aspectRatio", "scrollArea", "buttonGroup",
];

fn mem() -> Connection {
    let conn = Connection::open_in_memory().unwrap();
    conn.execute_batch("PRAGMA foreign_keys=ON;").unwrap();
    migrate(&conn).unwrap();
    conn
}

fn seed_value() -> Value {
    serde_json::from_str(SEED).unwrap()
}

fn stored(conn: &Connection, id: &str) -> (String, String) {
    conn.query_row("SELECT document_json, updated_at FROM projects WHERE id = ?1", params![id], |r| Ok((r.get(0)?, r.get(1)?)))
        .unwrap()
}

#[test]
fn seed_a2_round_trips_exactly_through_the_typed_document() {
    let input = seed_value();
    let doc: PageDocument = serde_json::from_value(input.clone()).unwrap();
    let out = serde_json::to_value(&doc).unwrap();
    assert_eq!(norm(out), norm(input));
}

#[test]
fn every_props_key_of_every_kind_survives_and_unset_keys_stay_absent() {
    let full = [
        json!({"type":"card","children":["x"],"direction":"row","gap":3,"align":"end","justify":"between"}),
        json!({"type":"alert","children":[],"direction":"column","gap":0,"align":"center","justify":"center"}),
        json!({"type":"badge","label":"ป้าย"}),
        json!({"type":"separator","orientation":"vertical"}),
        json!({"type":"skeleton"}),
        json!({"type":"spinner","size":64}),
        json!({"type":"aspectRatio","children":["x"],"ratio":"21/9","direction":"row","gap":2,"align":"start","justify":"end"}),
        json!({"type":"scrollArea","children":["x"],"orientation":"both","label":"ชื่อ","direction":"column","gap":1,"align":"stretch","justify":"start"}),
        json!({"type":"buttonGroup","children":["x"],"direction":"row","gap":0,"align":"center","justify":"start"}),
    ];
    for p in &full {
        let props: NodeProps = serde_json::from_value(p.clone()).unwrap();
        assert_eq!(norm(serde_json::to_value(&props).unwrap()), norm(p.clone()), "{p}");
    }
    // Unset optional keys must not be written back (no nulls, no defaults).
    let sparse = [
        json!({"type":"card","children":[]}),
        json!({"type":"alert","children":[]}),
        json!({"type":"aspectRatio","children":[],"ratio":"1/1"}),
        json!({"type":"scrollArea","children":[],"orientation":"vertical"}),
        json!({"type":"buttonGroup","children":[]}),
    ];
    for p in &sparse {
        let props: NodeProps = serde_json::from_value(p.clone()).unwrap();
        assert_eq!(norm(serde_json::to_value(&props).unwrap()), norm(p.clone()), "{p}");
    }
}

#[test]
fn all_five_aspect_ratios_and_all_scroll_orientations_round_trip() {
    for r in ["16/9", "4/3", "1/1", "3/2", "21/9"] {
        let p = json!({"type":"aspectRatio","children":[],"ratio":r});
        let props: NodeProps = serde_json::from_value(p.clone()).unwrap();
        assert_eq!(serde_json::to_value(&props).unwrap(), p);
    }
    for o in ["vertical", "horizontal", "both"] {
        let p = json!({"type":"scrollArea","children":[],"orientation":o});
        let props: NodeProps = serde_json::from_value(p.clone()).unwrap();
        assert_eq!(serde_json::to_value(&props).unwrap(), p);
    }
}

#[test]
fn bad_a2_values_are_refused_not_dropped() {
    for bad in [
        json!({"type":"aspect_ratio","children":[],"ratio":"1/1"}),
        json!({"type":"aspectRatio","children":[],"ratio":"16/9;color:red"}),
        json!({"type":"aspectRatio","children":[],"ratio":"5/4"}),
        json!({"type":"separator","orientation":"diagonal"}),
        json!({"type":"scrollArea","children":[],"orientation":"none"}),
        json!({"type":"spinner"}),
        json!({"type":"badge"}),
        json!({"type":"card"}),
        json!({"type":"gizmo"}),
    ] {
        assert!(serde_json::from_value::<NodeProps>(bad.clone()).is_err(), "{bad}");
    }
    for bad in ["aspect_ratio", "scroll_area", "button_group", "Card"] {
        assert!(serde_json::from_value::<NodeType>(Value::String(bad.into())).is_err(), "{bad}");
    }
}

#[test]
fn save_and_open_keeps_every_new_key_and_writes_version_4() {
    let conn = mem();
    let created = create_project(&conn, "A2".into()).unwrap();
    let doc: PageDocument = serde_json::from_value(seed_value()).unwrap();
    save_project(&conn, &created.id, None, &doc).unwrap();
    let (raw, _) = stored(&conn, &created.id);
    let saved: Value = serde_json::from_str(&raw).unwrap();
    assert_eq!(saved["version"], json!(4));
    assert!(saved.get("pages").is_none(), "single page omits pages: {raw}");
    // Compare against the seed with its own (v4) version: identical node set and keys.
    assert_eq!(norm(saved.clone()), norm(seed_value()));
    for key in ["\"direction\":", "\"gap\":", "\"align\":", "\"justify\":", "\"ratio\":\"16/9\"", "\"orientation\":\"vertical\"", "\"orientation\":\"horizontal\"", "\"label\":\"รายการเลื่อน\"", "\"size\":24", "\"borderRadius\":20"] {
        assert!(raw.contains(key), "{key} missing in {raw}");
    }
    assert!(!raw.contains("aspect_ratio") && !raw.contains("scroll_area") && !raw.contains("null"));
    let opened = open_project(&conn, &created.id).unwrap();
    assert_eq!(opened.document.version, 4);
    assert_eq!(norm(serde_json::to_value(&opened.document).unwrap()), norm(seed_value()));
    // A second save of the opened document is idempotent (node-map key order is not
    // stable in the pre-existing HashMap, so compare as JSON values, not bytes).
    save_project(&conn, &created.id, None, &opened.document).unwrap();
    let again: Value = serde_json::from_str(&stored(&conn, &created.id).0).unwrap();
    assert_eq!(again, saved);
}

#[test]
fn v1_document_stays_v1_and_opening_never_writes() {
    let conn = mem();
    let created = create_project(&conn, "Old".into()).unwrap();
    assert_eq!(created.document.version, 1);
    let before = stored(&conn, &created.id);
    for _ in 0..2 {
        let o = open_project(&conn, &created.id).unwrap();
        assert_eq!(o.document.version, 1);
    }
    assert_eq!(stored(&conn, &created.id), before, "open must not rewrite the row");
    // Saving the unchanged document keeps version 1 and the same JSON.
    let o = open_project(&conn, &created.id).unwrap();
    save_project(&conn, &created.id, None, &o.document).unwrap();
    let after = stored(&conn, &created.id);
    assert_eq!(
        serde_json::from_str::<Value>(&after.0).unwrap(),
        serde_json::from_str::<Value>(&before.0).unwrap()
    );
    assert_eq!(serde_json::from_str::<Value>(&after.0).unwrap()["version"], json!(1));
}

#[test]
fn each_kind_alone_flips_v1_to_4_and_removing_it_returns_to_1() {
    let conn = mem();
    let created = create_project(&conn, "Flip".into()).unwrap();
    let base = serde_json::to_value(&created.document).unwrap();
    let root = created.document.root.clone();
    let props = [
        json!({"type":"card","children":[]}),
        json!({"type":"alert","children":[]}),
        json!({"type":"badge","label":"b"}),
        json!({"type":"separator","orientation":"horizontal"}),
        json!({"type":"skeleton"}),
        json!({"type":"spinner","size":24}),
        json!({"type":"aspectRatio","children":[],"ratio":"16/9"}),
        json!({"type":"scrollArea","children":[],"orientation":"vertical"}),
        json!({"type":"buttonGroup","children":[]}),
    ];
    for (name, p) in A2_NAMES.iter().zip(props) {
        let mut v = base.clone();
        v["nodes"][&root]["props"]["children"] = json!(["k"]);
        v["nodes"]["k"] = json!({"id":"k","type":name,"props":p,"style":{}});
        let doc: PageDocument = serde_json::from_value(v).unwrap();
        save_project(&conn, &created.id, None, &doc).unwrap();
        let on: Value = serde_json::from_str(&stored(&conn, &created.id).0).unwrap();
        assert_eq!(on["version"], json!(4), "{name}");
        // Removing it (page without the node) saves as 1 again.
        let mut back = base.clone();
        back["version"] = json!(4);
        let doc: PageDocument = serde_json::from_value(back).unwrap();
        save_project(&conn, &created.id, None, &doc).unwrap();
        let off: Value = serde_json::from_str(&stored(&conn, &created.id).0).unwrap();
        assert_eq!(off["version"], json!(1), "{name}");
    }
}

#[test]
fn two_pages_stay_version_5_and_keep_the_new_kinds() {
    let conn = mem();
    let created = create_project(&conn, "Pages".into()).unwrap();
    let mut v = seed_value();
    let nodes = v["nodes"].clone();
    v = json!({"version":5,"meta":v["meta"],"pages":[
        {"id":"home","name":"หน้าแรก","path":"/","root":"root","nodes":nodes},
        {"id":"p2","name":"สอง","path":"/two","root":"r2","nodes":{"r2":{"id":"r2","type":"page","props":{"type":"page","children":[]},"style":{}}}}
    ]});
    let doc: PageDocument = serde_json::from_value(v).unwrap();
    save_project(&conn, &created.id, None, &doc).unwrap();
    let raw = stored(&conn, &created.id).0;
    let saved: Value = serde_json::from_str(&raw).unwrap();
    assert_eq!(saved["version"], json!(5));
    assert!(raw.contains("\"ratio\":\"16/9\"") && raw.contains("\"borderRadius\":20"), "{raw}");
}

#[test]
fn an_older_phase_6b_and_field_documents_keep_their_versions() {
    let conn = mem();
    let created = create_project(&conn, "Old kinds".into()).unwrap();
    let base = serde_json::to_value(&created.document).unwrap();
    let root = created.document.root.clone();
    for (props, name, want) in [
        (json!({"type":"kbd","text":"k"}), "kbd", 4),
        (json!({"type":"input","label":"","placeholder":""}), "input", 3),
        (json!({"type":"heading","level":1,"content":"x"}), "heading", 1),
    ] {
        let mut v = base.clone();
        v["nodes"][&root]["props"]["children"] = json!(["k"]);
        v["nodes"]["k"] = json!({"id":"k","type":name,"props":props,"style":{}});
        let doc: PageDocument = serde_json::from_value(v).unwrap();
        save_project(&conn, &created.id, None, &doc).unwrap();
        let on: Value = serde_json::from_str(&stored(&conn, &created.id).0).unwrap();
        assert_eq!(on["version"], json!(want), "{name}");
    }
}
