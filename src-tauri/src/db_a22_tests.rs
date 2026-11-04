//! PHASE-11 A2.2 tests: the Rust side of the container kinds. `Node::children()` must
//! list the children of card / alert / aspectRatio / scrollArea / buttonGroup (and of
//! nothing else new), nested documents round-trip through save / open, and the
//! effective layout defaults match the spec table.
use super::*;
use crate::compiler::a21_norm as norm;
use crate::defaults::{a2_layout_defaults, Align, Direction, Justify, NodeType};
use serde_json::{json, Value};

const NEST: &str = include_str!("fixtures/a2/seed-a2-nest.json");
const SEED: &str = include_str!("fixtures/a2/seed-a2.json");

fn mem() -> Connection {
    let conn = Connection::open_in_memory().unwrap();
    conn.execute_batch("PRAGMA foreign_keys=ON;").unwrap();
    migrate(&conn).unwrap();
    conn
}

fn nest() -> PageDocument {
    serde_json::from_str(NEST).unwrap()
}

#[test]
fn children_lists_the_five_a2_containers_and_no_a2_leaf() {
    let doc = nest();
    let kids = |id: &str| doc.nodes[id].children().to_vec();
    assert_eq!(kids("card1"), ["alert1", "txt1"]);
    assert_eq!(kids("alert1"), ["ratio1"]);
    assert_eq!(kids("ratio1"), ["scroll1"]);
    assert_eq!(kids("scroll1"), ["btns"]);
    assert_eq!(kids("btns"), ["b1", "b2"]);
    // Existing containers are unchanged; leaves hold nothing.
    assert_eq!(kids("root"), ["sec", "grp", "dangle-card"]);
    assert_eq!(kids("sec"), ["card1"]);
    for leaf in ["badge1", "txt1", "hd", "b1"] {
        assert!(doc.nodes[leaf].children().is_empty(), "{leaf}");
    }
    // The shared seed: every kind in one place.
    let seed: PageDocument = serde_json::from_str(SEED).unwrap();
    for (id, n) in [("card1", 2), ("alert1", 1), ("ratio1", 1), ("scroll1", 1), ("bg1", 3)] {
        assert_eq!(seed.nodes[id].children().len(), n, "{id}");
    }
    for leaf in ["badge1", "sep-h", "sep-v", "skel1", "spin1"] {
        assert!(seed.nodes[leaf].children().is_empty(), "{leaf}");
    }
}

#[test]
fn nested_document_round_trips_through_save_and_open_at_version_4() {
    let conn = mem();
    let created = create_project(&conn, "Nest".into()).unwrap();
    let doc = nest();
    save_project(&conn, &created.id, None, &doc).unwrap();
    let raw: String = conn
        .query_row("SELECT document_json FROM projects WHERE id = ?1", params![created.id], |r| r.get(0))
        .unwrap();
    let saved: Value = serde_json::from_str(&raw).unwrap();
    assert_eq!(saved["version"], json!(4));
    let mut input: Value = serde_json::from_str(NEST).unwrap();
    input["version"] = json!(4);
    // Same nodes, same children order, and the dangling id "ghost" is kept as is
    // (nothing normalises children ids on save or open; the renderers skip it).
    assert_eq!(norm(saved.clone()), norm(input));
    assert_eq!(saved["nodes"]["dangle-card"]["props"]["children"], json!(["ghost"]));
    let opened = open_project(&conn, &created.id).unwrap();
    assert_eq!(opened.document.nodes["card1"].children(), ["alert1", "txt1"]);
    assert_eq!(opened.document.nodes["btns"].children(), ["b1", "b2"]);
}

#[test]
fn a2_layout_defaults_match_the_spec_table() {
    assert!(matches!(a2_layout_defaults(NodeType::Card), Some((Direction::Column, 16, Align::Stretch, Justify::Start))));
    assert!(matches!(a2_layout_defaults(NodeType::Alert), Some((Direction::Column, 8, Align::Stretch, Justify::Start))));
    assert!(matches!(a2_layout_defaults(NodeType::AspectRatio), Some((Direction::Column, 0, Align::Stretch, Justify::Start))));
    assert!(matches!(a2_layout_defaults(NodeType::ScrollArea), Some((Direction::Column, 0, Align::Stretch, Justify::Start))));
    assert!(matches!(a2_layout_defaults(NodeType::ButtonGroup), Some((Direction::Row, 0, Align::Stretch, Justify::Start))));
    for t in [NodeType::Badge, NodeType::Separator, NodeType::Skeleton, NodeType::Spinner, NodeType::Container, NodeType::Section, NodeType::Page, NodeType::Heading] {
        assert!(a2_layout_defaults(t).is_none());
    }
}

#[test]
fn edited_layout_props_survive_and_default_equal_values_are_not_invented() {
    // What the TS side writes after an edit: a non-default value is stored, and an
    // unset one stays absent (no nulls, no defaults written back).
    let v: Value = json!({
        "version": 4, "meta": {"title": "L"}, "root": "r",
        "nodes": {
            "r": {"id":"r","type":"page","props":{"type":"page","children":["c","g"]},"style":{}},
            "c": {"id":"c","type":"card","props":{"type":"card","children":[],"gap":24,"direction":"row"},"style":{}},
            "g": {"id":"g","type":"buttonGroup","props":{"type":"buttonGroup","children":[]},"style":{}}
        }
    });
    let doc: PageDocument = serde_json::from_value(v.clone()).unwrap();
    let out = serde_json::to_value(&doc).unwrap();
    assert_eq!(norm(out.clone()), norm(v));
    assert!(out["nodes"]["g"]["props"].get("direction").is_none());
    assert!(out["nodes"]["g"]["props"].get("gap").is_none());
}
