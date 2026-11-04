//! Phase 10 step 1: every validation rule, valid and invalid (PHASE-10-SPEC §2).

use super::*;
use serde_json::{json, Value};

/// Valid baseline: `users` (uuid PK, email unique, created_at now) and
/// `posts` (identity PK, FK author → users.id, self-FK parent → posts.id).
fn base() -> Value {
    json!({"version":1,"tables":[
      {"id":"tu","name":"users","label":"ผู้ใช้","columns":[
        {"id":"u_id","name":"id","type":"uuid","nullable":false,"default":{"kind":"uuid"}},
        {"id":"u_email","name":"email","type":"text","nullable":false},
        {"id":"u_at","name":"created_at","type":"timestamptz","nullable":false,"default":{"kind":"now"}}
      ],"primaryKey":["u_id"],"uniques":[{"id":"uq1","columns":["u_email"]}],"foreignKeys":[]},
      {"id":"tp","name":"posts","columns":[
        {"id":"p_id","name":"id","type":"identity","nullable":false},
        {"id":"p_author","name":"author_id","type":"uuid","nullable":true},
        {"id":"p_parent","name":"parent_id","type":"integer","nullable":true},
        {"id":"p_price","name":"price","type":"decimal","nullable":true,"precision":12,"scale":2,
         "default":{"kind":"literal","value":"10.50"}},
        {"id":"p_st","name":"status","type":"enum","nullable":false,"values":["draft","live"],
         "default":{"kind":"literal","value":"draft"}},
        {"id":"p_ok","name":"ok","type":"boolean","nullable":false,"default":{"kind":"literal","value":true}},
        {"id":"p_day","name":"day","type":"date","nullable":true,"default":{"kind":"today"}},
        {"id":"p_n","name":"n","type":"integer","nullable":true,"default":{"kind":"literal","value":"-9223372036854775808"}},
        {"id":"p_meta","name":"meta","type":"json","nullable":true}
      ],"primaryKey":["p_id"],"uniques":[],"foreignKeys":[
        {"id":"fk1","columns":["p_author"],"refTableId":"tu","refColumns":["u_id"],"onDelete":"set_null"},
        {"id":"fk2","columns":["p_parent"],"refTableId":"tp","refColumns":["p_id"]}
      ]}
    ]})
}

fn issues(v: &Value) -> Vec<ModelIssue> {
    validate(&parse_model(v).expect("parses"))
}

/// Applies `f` to the baseline and asserts exactly one issue containing `needle`.
fn expect_one(f: impl FnOnce(&mut Value), field: &str, needle: &str) {
    let mut v = base();
    f(&mut v);
    let got = issues(&v);
    assert_eq!(got.len(), 1, "want 1 issue ({needle}), got {got:#?}");
    assert!(got[0].field.starts_with(field), "{got:#?}");
    assert!(got[0].message.contains(needle), "{got:#?}");
}

fn col(v: &mut Value, t: usize, c: usize) -> &mut Value {
    &mut v["tables"][t]["columns"][c]
}

#[test]
fn baseline_is_valid_and_round_trips() {
    assert_eq!(issues(&base()), vec![]);
    let m = parse_model(&base()).unwrap();
    let again = parse_model(&serde_json::to_value(&m).unwrap()).unwrap();
    assert_eq!(m, again);
    let s = serde_json::to_string(&m).unwrap();
    assert!(s.contains("\"primaryKey\"") && s.contains("\"refTableId\"") && s.contains("\"on_delete\"") == false);
    assert!(s.contains("\"onDelete\":\"no_action\""), "default onDelete stored: {s}");
}

#[test]
fn shape_errors_refuse_to_parse() {
    for bad in [
        json!({"version":2,"tables":[]}),
        json!({"tables":[]}),
        json!({"version":1,"tables":[{"id":"t","name":"t","columns":[{"id":"c","name":"c","type":"money","nullable":false}],"primaryKey":[]}]}),
        json!({"version":1,"tables":[{"id":"t","name":"t","columns":[{"id":"c","name":"c","type":"text","nullable":false,"default":{"kind":"later"}}],"primaryKey":[]}]}),
        json!({"version":1,"tables":[{"id":"t","name":"t","columns":[],"primaryKey":[],"foreignKeys":[{"id":"f","columns":[],"refTableId":"t","refColumns":[],"onDelete":"set_default"}]}]}),
        json!("nope"),
    ] {
        assert_eq!(parse_model(&bad).unwrap_err(), MODEL_PARSE_ERROR, "{bad}");
    }
    // An invalid draft still parses (it may be saved).
    assert!(parse_model(&json!({"version":1,"tables":[]})).is_ok());
}

#[test]
fn pg_reserved_is_sorted_unique_lowercase() {
    assert!(PG_RESERVED.windows(2).all(|w| w[0] < w[1]));
    assert!(PG_RESERVED.iter().all(|w| w.bytes().all(|b| b.is_ascii_lowercase() || b == b'_')));
    for w in ["select", "user", "table", "left", "verbose", "system_user", "all", "with"] {
        assert!(PG_RESERVED.binary_search(&w).is_ok(), "{w}");
    }
    for w in ["name", "id", "email", "type", "value", "comment"] {
        assert!(PG_RESERVED.binary_search(&w).is_err(), "{w}");
    }
}

#[test]
fn identifier_rules() {
    for ok in ["a", "users", "a1_b", &format!("a{}", "b".repeat(62))] {
        assert_eq!(identifier_error(ok), None, "{ok}");
    }
    assert!(identifier_error("").unwrap().contains("ต้องมีชื่อ"));
    for bad in ["1a", "_a", "A", "a-b", "ชื่อ", "a b", &format!("a{}", "b".repeat(63))] {
        assert!(identifier_error(bad).unwrap().contains("a-z"), "{bad}");
    }
    assert!(identifier_error("select").unwrap().contains("คำสงวน"));
    for s in SYSTEM_NAMES.iter().filter(|s| !s.starts_with('_')) {
        assert!(identifier_error(s).unwrap().contains("ระบบ"), "{s}");
    }
    assert!(identifier_error("_rowid_").is_some());
    assert!(identifier_error("pg_x").unwrap().contains("pg_"));
    assert!(identifier_error("sqlite_x").unwrap().contains("sqlite_"));
    assert_eq!(normalize_identifier("  First Name "), "first_name");
    assert_eq!(normalize_identifier("Email"), "email");
    assert!(identifier_error(&normalize_identifier("ชื่อ")).is_some(), "Thai stays invalid");
}

#[test]
fn table_and_column_counts() {
    let mut v = base();
    v["tables"] = json!([]);
    let got = issues(&v);
    assert!(got.len() == 1 && got[0].message.contains("อย่างน้อย 1 ตาราง"), "{got:#?}");

    let mut v = json!({"version":1,"tables":[]});
    for i in 0..51 {
        v["tables"].as_array_mut().unwrap().push(json!({"id":format!("t{i}"),"name":format!("t{i}"),
            "columns":[{"id":"c","name":"id","type":"integer","nullable":false}],"primaryKey":["c"]}));
    }
    let got = issues(&v);
    assert!(got.len() == 1 && got[0].message.contains("ไม่เกิน 50"), "{got:#?}");
    v["tables"].as_array_mut().unwrap().pop();
    assert_eq!(issues(&v), vec![], "50 tables ok");

    // No columns: the PK / unique / FK now point at missing columns too.
    let mut v = base();
    v["tables"][0]["columns"] = json!([]);
    assert!(issues(&v).iter().any(|i| i.field == "columns" && i.message.contains("อย่างน้อย 1 คอลัมน์")));
    let mut v = base();
    let cols: Vec<Value> = (0..101).map(|i| json!({"id":format!("c{i}"),"name":format!("c{i}"),"type":"text","nullable":false})).collect();
    v["tables"][0]["columns"] = Value::Array(cols.clone());
    v["tables"][0]["primaryKey"] = json!(["c0"]);
    v["tables"][0]["uniques"] = json!([{"id":"uq1","columns":["c1"]}]);
    v["tables"][1]["foreignKeys"][0]["refColumns"] = json!(["c0"]);
    v["tables"][1]["columns"][1]["type"] = json!("text");
    let got = issues(&v);
    assert!(got.len() == 1 && got[0].message.contains("ไม่เกิน 100"), "{got:#?}");
    v["tables"][0]["columns"] = Value::Array(cols[..100].to_vec());
    assert_eq!(issues(&v), vec![], "100 columns ok");
}

#[test]
fn names_and_ids_unique() {
    expect_one(|v| v["tables"][1]["name"] = json!("users"), "name", "ชื่อตารางซ้ำ");
    expect_one(|v| v["tables"][1]["name"] = json!("Posts"), "name", "a-z");
    expect_one(|v| v["tables"][1]["name"] = json!("order"), "name", "คำสงวน");
    expect_one(|v| *col(v, 0, 1).get_mut("name").unwrap() = json!("id"), "name", "ชื่อคอลัมน์ซ้ำ");
    expect_one(|v| *col(v, 0, 1).get_mut("name").unwrap() = json!("ctid"), "name", "ระบบ");
    expect_one(|v| *col(v, 0, 1).get_mut("name").unwrap() = json!("pg_mail"), "name", "pg_");
    // Same column name in two tables is fine.
    let mut v = base();
    *col(&mut v, 1, 8).get_mut("name").unwrap() = json!("email");
    assert_eq!(issues(&v), vec![]);
    // Duplicate table id (FK refs then resolve ambiguously, so more issues follow).
    let mut v = base();
    v["tables"][1]["id"] = json!("tu");
    assert!(issues(&v).iter().any(|i| i.field == "table" && i.message.contains("รหัสตาราง")));
    expect_one(|v| *col(v, 1, 8).get_mut("id").unwrap() = json!("p_n"), "column", "รหัสคอลัมน์");
}

#[test]
fn primary_key_rules() {
    let mut v = base();
    v["tables"][0]["primaryKey"] = json!([]);
    let got = issues(&v);
    assert!(got.iter().any(|i| i.field == "primaryKey" && i.message.contains("ต้องมีคีย์หลัก")), "{got:#?}");
    expect_one(|v| *col(v, 0, 0).get_mut("nullable").unwrap() = json!(true), "nullable", "คีย์หลักต้องมีค่า");
    let mut v = base();
    v["tables"][0]["primaryKey"] = json!(["u_id", "u_id"]);
    assert!(issues(&v).iter().any(|i| i.message.contains("คีย์หลักมีคอลัมน์ซ้ำ")));
    let mut v = base();
    v["tables"][0]["primaryKey"] = json!(["ghost"]);
    assert!(issues(&v).iter().any(|i| i.message.contains("ไม่มีอยู่")));
    // Composite PK is allowed.
    let mut v = base();
    v["tables"][0]["primaryKey"] = json!(["u_id", "u_at"]);
    v["tables"][1]["foreignKeys"][0]["refColumns"] = json!(["u_id"]);
    v["tables"][0]["uniques"] = json!([{"id":"uq1","columns":["u_email"]},{"id":"uq2","columns":["u_id"]}]);
    assert_eq!(issues(&v), vec![]);
}

#[test]
fn identity_rules() {
    // Identity not the sole PK column.
    let mut v = base();
    v["tables"][1]["primaryKey"] = json!(["p_id", "p_st"]);
    v["tables"][1]["foreignKeys"] = json!([]);
    let got = issues(&v);
    assert!(got.len() == 1 && got[0].message.contains("ลำดับอัตโนมัติ"), "{got:#?}");
    // Identity outside the PK.
    expect_one(|v| *col(v, 0, 1).get_mut("type").unwrap() = json!("identity"), "type", "ลำดับอัตโนมัติ");
    // Identity with a default.
    expect_one(|v| col(v, 1, 0)["default"] = json!({"kind":"literal","value":"1"}), "default", "ลำดับอัตโนมัติ");
}

#[test]
fn defaults_must_match_type() {
    let lit = |x: Value| json!({"kind":"literal","value":x});
    // (table, column, default, ok?)
    let cases: Vec<(usize, usize, Value, bool)> = vec![
        (1, 7, lit(json!("9223372036854775807")), true),
        (1, 7, lit(json!("9223372036854775808")), false),
        (1, 7, lit(json!("1.5")), false),
        (1, 3, lit(json!("9999999999.99")), true),
        (1, 3, lit(json!("-0.5")), true),
        (1, 3, lit(json!("10000000000")), false),
        (1, 3, lit(json!("1.234")), false),
        (1, 3, lit(json!("1.")), false),
        (1, 3, lit(json!("abc")), false),
        (1, 5, lit(json!(false)), true),
        (1, 5, lit(json!("true")), false),
        (1, 6, lit(json!("2024-02-29")), true),
        (1, 6, lit(json!("2023-02-29")), false),
        (1, 6, lit(json!("2024-13-01")), false),
        (1, 6, lit(json!("2024-1-01")), false),
        (0, 1, lit(json!("x".repeat(1000))), true),
        (0, 1, lit(json!("ก".repeat(1000))), true),
        (0, 1, lit(json!("x".repeat(1001))), false),
        (0, 1, lit(json!(true)), false),
        (1, 4, lit(json!("live")), true),
        (1, 4, lit(json!("gone")), false),
        (0, 2, json!({"kind":"now"}), true),
        (0, 2, json!({"kind":"today"}), false),
        (0, 2, lit(json!("2024-01-01T00:00:00Z")), false),
        (1, 6, json!({"kind":"today"}), true),
        (1, 6, json!({"kind":"now"}), false),
        (0, 0, json!({"kind":"uuid"}), true),
        (0, 0, lit(json!("00000000-0000-0000-0000-000000000000")), false),
        (0, 1, json!({"kind":"uuid"}), false),
        (1, 8, lit(json!("{}")), false),
        (1, 8, json!({"kind":"now"}), false),
    ];
    // A JSON number literal is a shape error (integers travel as strings).
    let mut v = base();
    col(&mut v, 1, 7)["default"] = lit(json!(1));
    assert!(parse_model(&v).is_err());
    for (t, c, def, ok) in cases {
        let mut v = base();
        col(&mut v, t, c)["default"] = def.clone();
        let got = issues(&v);
        if ok {
            assert_eq!(got, vec![], "{t}/{c} {def}");
        } else {
            assert!(got.len() == 1 && got[0].field == "default", "{t}/{c} {def}: {got:#?}");
        }
    }
}

#[test]
fn decimal_and_enum_settings() {
    for (p, s, ok) in [(1, 0, true), (38, 38, true), (0, 0, false), (39, 2, false), (5, 6, false)] {
        let mut v = base();
        col(&mut v, 1, 3)["precision"] = json!(p);
        col(&mut v, 1, 3)["scale"] = json!(s);
        col(&mut v, 1, 3).as_object_mut().unwrap().remove("default");
        assert_eq!(issues(&v).is_empty(), ok, "p={p} s={s}");
    }
    expect_one(|v| {
        let c = col(v, 1, 3).as_object_mut().unwrap();
        c.remove("scale");
        c.remove("default");
    }, "precision", "ทศนิยม");
    assert!(decimal_fits("007.5", 2, 1) && !decimal_fits("10.5", 2, 1) && decimal_fits("0", 1, 1));

    let mut many: Vec<String> = (0..50).map(|i| format!("v{i}")).collect();
    many[0] = "draft".into();
    let mut v = base();
    col(&mut v, 1, 4)["values"] = json!(many);
    assert_eq!(issues(&v), vec![], "50 values ok");
    for bad in [json!([]), json!(["draft", "draft"]), json!(["draft", ""]), json!(["draft", "ก".repeat(64)])] {
        let mut v = base();
        col(&mut v, 1, 4)["values"] = bad.clone();
        let got = issues(&v);
        assert!(got.iter().any(|i| i.field == "values"), "{bad}: {got:#?}");
    }
    let mut v = base();
    many.push("v50".into());
    col(&mut v, 1, 4)["values"] = json!(many);
    assert!(issues(&v).iter().any(|i| i.field == "values"));
    let mut v = base();
    col(&mut v, 1, 4)["values"] = json!(["draft", "ก".repeat(63)]);
    assert_eq!(issues(&v), vec![], "63 Thai chars ok");
    // Settings left on another type are ignored (ambiguity default 3).
    let mut v = base();
    col(&mut v, 0, 1)["precision"] = json!(99);
    col(&mut v, 0, 1)["values"] = json!([]);
    assert_eq!(issues(&v), vec![]);
}

#[test]
fn unique_rules() {
    let set = |v: &mut Value, u: Value| v["tables"][0]["uniques"] = u;
    expect_one(|v| set(v, json!([{"id":"a","columns":[]}])), "unique:a", "อย่างน้อย 1");
    expect_one(|v| set(v, json!([{"id":"a","columns":["u_email","u_email"]}])), "unique:a", "คอลัมน์ซ้ำ");
    expect_one(|v| set(v, json!([{"id":"a","columns":["ghost"]}])), "unique:a", "ไม่มีอยู่");
    expect_one(|v| set(v, json!([{"id":"a","columns":["u_email"]},{"id":"b","columns":["u_email"]}])), "unique:b", "มีชุดคอลัมน์นี้แล้ว");
    expect_one(|v| set(v, json!([{"id":"a","columns":["u_email","u_at"]},{"id":"b","columns":["u_at","u_email"]}])), "unique:b", "มีชุดคอลัมน์นี้แล้ว");
    expect_one(|v| set(v, json!([{"id":"a","columns":["u_id"]}])), "unique:a", "คีย์หลัก");
    let mut v = base();
    set(&mut v, json!([{"id":"a","columns":["u_email","u_at"]},{"id":"b","columns":["u_email"]}]));
    assert_eq!(issues(&v), vec![], "subset sets are distinct");
}

#[test]
fn foreign_key_rules() {
    fn fk(v: &mut Value) -> &mut Value {
        &mut v["tables"][1]["foreignKeys"][0]
    }
    expect_one(|v| fk(v)["refColumns"] = json!(["u_id", "u_email"]), "foreignKey:fk1", "จำนวนคอลัมน์");
    expect_one(|v| { fk(v)["columns"] = json!([]); fk(v)["refColumns"] = json!([]); }, "foreignKey:fk1", "จำนวนคอลัมน์");
    expect_one(|v| fk(v)["columns"] = json!(["ghost"]), "foreignKey:fk1", "ไม่มีอยู่");
    expect_one(|v| fk(v)["refTableId"] = json!("nope"), "foreignKey:fk1", "ไม่พบตารางปลายทาง");
    expect_one(|v| fk(v)["refColumns"] = json!(["ghost"]), "foreignKey:fk1", "ไม่พบคอลัมน์ปลายทาง");
    // uuid → text: type mismatch, and email is unique so ref rule holds.
    expect_one(|v| fk(v)["refColumns"] = json!(["u_email"]), "foreignKey:fk1", "ชนิด");
    // created_at is neither PK nor unique.
    expect_one(|v| { fk(v)["refColumns"] = json!(["u_at"]); *col(v, 1, 1).get_mut("type").unwrap() = json!("timestamptz"); }, "foreignKey:fk1", "คีย์หลักหรือไม่ซ้ำ");
    // Referencing a unique is allowed.
    let mut v = base();
    fk(&mut v)["refColumns"] = json!(["u_email"]);
    *col(&mut v, 1, 1).get_mut("type").unwrap() = json!("text");
    assert_eq!(issues(&v), vec![]);
    // set_null needs nullable FK columns.
    expect_one(|v| *col(v, 1, 1).get_mut("nullable").unwrap() = json!(false), "foreignKey:fk1", "ตั้งเป็นว่าง");
    let mut v = base();
    *col(&mut v, 1, 1).get_mut("nullable").unwrap() = json!(false);
    fk(&mut v)["onDelete"] = json!("cascade");
    assert_eq!(issues(&v), vec![], "cascade on non-null ok");
    // Self-reference integer → identity counts as equal (fk2); integer → text does not.
    expect_one(|v| *col(v, 1, 2).get_mut("type").unwrap() = json!("text"), "foreignKey:fk2", "ชนิด");
    // Duplicate local column.
    let mut v = base();
    v["tables"][0]["uniques"] = json!([{"id":"uq1","columns":["u_email"]},{"id":"uq2","columns":["u_id","u_email"]}]);
    v["tables"][1]["foreignKeys"][0] = json!({"id":"fk1","columns":["p_author","p_author"],"refTableId":"tu","refColumns":["u_id","u_email"]});
    assert!(issues(&v).iter().any(|i| i.message.contains("เลือกคอลัมน์ซ้ำ")));
}

#[test]
fn issues_carry_ids_for_focus() {
    let mut v = base();
    *col(&mut v, 0, 0).get_mut("nullable").unwrap() = json!(true);
    let got = issues(&v);
    assert_eq!(got[0].table_id.as_deref(), Some("tu"));
    assert_eq!(got[0].column_id.as_deref(), Some("u_id"));
    let wire = serde_json::to_value(&got[0]).unwrap();
    assert_eq!(wire["tableId"], "tu");
    assert_eq!(wire["columnId"], "u_id");
}

/// Shared fixture with the TS mirror (src/lib/db-validate.test.ts): Rust
/// `validate` must produce exactly the stored `issues` for every case.
/// `WB_BLESS=1 cargo test shared_validation_fixture` rewrites the expectations.
#[test]
fn shared_validation_fixture() {
    let path = concat!(env!("CARGO_MANIFEST_DIR"), "/src/fixtures/dbmodel/validation.json");
    let mut doc: Value = serde_json::from_str(&std::fs::read_to_string(path).unwrap()).unwrap();
    let bless = std::env::var("WB_BLESS").is_ok();
    for case in doc["cases"].as_array_mut().unwrap() {
        let got = serde_json::to_value(issues(&case["model"])).unwrap();
        if bless {
            case["issues"] = got;
        } else {
            assert_eq!(got, case["issues"], "case {}", case["name"]);
        }
    }
    if bless {
        let tmp = format!("{path}.p10tmp");
        std::fs::write(&tmp, serde_json::to_string_pretty(&doc).unwrap() + "\n").unwrap();
        std::fs::rename(tmp, path).unwrap();
    }
}
