//! B1 (PHASE-11-SPEC §9.B / §4.2 / §4.5): `css_color` + `boxShadow` plumbing.
use super::*;
use crate::defaults::{BoxShadowLayer, StyleBreakpoints, StyleProps};

fn fx(name: &str, ext: &str) -> String {
    let path = format!("src/fixtures/style/{name}.{ext}");
    // Tests run with CWD = src-tauri (cargo), or via include-relative path.
    let from_crate = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("src/fixtures/style");
    std::fs::read_to_string(from_crate.join(format!("{name}.{ext}"))).unwrap_or_else(|e| {
        panic!("read {path}: {e}");
    })
}

fn decls_css(s: &StyleProps) -> String {
    let mut lines: Vec<String> = decls_for_test(s)
        .into_iter()
        .map(|(k, v)| format!("{k}: {v};"))
        .collect();
    lines.sort(); // goldens are single-property today; keep stable
    let mut out = lines.join("\n");
    if !out.is_empty() {
        out.push('\n');
    }
    out
}

fn style_from_json(raw: &str) -> StyleProps {
    serde_json::from_str(raw).expect("style json")
}

#[test]
fn b1_style_goldens_match_decls() {
    for name in ["basic-shadow", "multi-layer", "color-forms", "empty-shadow"] {
        let style = style_from_json(&fx(name, "json"));
        let got = decls_css(&style);
        let want = fx(name, "css");
        assert_eq!(got, want, "{name}");
    }
}

#[test]
fn b1_css_color_accepts_hex_and_keywords() {
    for (inp, out) in [
        ("#abc", "#abc"),
        ("#ABCD", "#abcd"),
        ("#aabbcc", "#aabbcc"),
        ("#AABBCCDD", "#aabbccdd"),
        (" transparent ", "transparent"),
        ("CURRENTCOLOR", "currentColor"),
        ("#fff", "#fff"),
    ] {
        assert_eq!(css_color(inp).as_deref(), Some(out), "{inp}");
    }
}

#[test]
fn b1_css_color_rejects_hostile_and_junk() {
    for inp in [
        "",
        "   ",
        "red",
        "rgb(0,0,0)",
        "url(https://evil.test/x.png)",
        "#ggg",
        "#12345",
        "#12",
        "#1234567",
        "#123456789",
        "}",
        "#ab}",
        "javascript:alert(1)",
        "expression(1)",
    ] {
        assert_eq!(css_color(inp), None, "{inp}");
    }
}

#[test]
fn b1_box_shadow_hostile_clamps_and_drops() {
    // §4.5.5: NaN, huge numbers, 100 layers, url( colour, } in colour → drop/clamp, valid CSS, no panic.
    let layers: Vec<BoxShadowLayer> = {
        let mut v = Vec::new();
        // NaN / huge
        v.push(BoxShadowLayer {
            x: Some(f64::NAN),
            y: Some(1.0e12),
            blur: Some(-50.0),
            spread: Some(999.0),
            color: Some("#112233".into()),
            inset: None,
        });
        // url( colour
        v.push(BoxShadowLayer {
            x: Some(1.0),
            y: Some(1.0),
            blur: Some(1.0),
            spread: Some(1.0),
            color: Some("url(https://evil.test/x.png)".into()),
            inset: None,
        });
        // } in colour
        v.push(BoxShadowLayer {
            x: Some(1.0),
            y: Some(1.0),
            blur: Some(1.0),
            spread: Some(1.0),
            color: Some("#ab}".into()),
            inset: None,
        });
        // 100 extra layers (cap 6 total with the first valid one → 6 emitted max)
        for i in 0..100 {
            v.push(BoxShadowLayer {
                x: Some(i as f64),
                y: Some(0.0),
                blur: Some(0.0),
                spread: Some(0.0),
                color: Some(format!("#{:02x}{:02x}{:02x}", i.min(255), 0, 0)),
                inset: None,
            });
        }
        v
    };
    let style = StyleProps {
        box_shadow: Some(layers),
        ..Default::default()
    };
    let d = decls_for_test(&style);
    assert_eq!(d.len(), 1, "exactly one box-shadow decl: {d:?}");
    assert_eq!(d[0].0, "box-shadow");
    let css = &d[0].1;
    // first layer: NaN→0, y clamped to 200, blur clamped to 0, spread clamped to 100
    assert!(css.starts_with("0px 200px 0px 100px #112233"), "got {css}");
    // no url(, no }
    assert!(!css.contains("url("), "{css}");
    assert!(!css.contains('}'), "{css}");
    // ≤ 6 layers (comma-separated)
    let n = css.split(',').count();
    assert!(n <= 6, "layers={n} css={css}");
    // valid-ish: every layer has a colour token
    for part in css.split(", ") {
        assert!(
            part.contains('#') || part.contains("transparent") || part.contains("currentColor"),
            "part={part}"
        );
    }
}

#[test]
fn b1_empty_box_shadow_is_unset_for_is_empty() {
    let empty = StyleProps {
        box_shadow: Some(vec![]),
        ..Default::default()
    };
    assert!(empty.is_empty(), "empty vec must count as unset");
    let none = StyleProps::default();
    assert!(none.is_empty());
    assert!(decls_for_test(&empty).is_empty());
}

#[test]
fn b1_breakpoint_only_box_shadow_survives_is_empty_trap() {
    // The classic trap: a BP override holding ONLY boxShadow must not be judged empty.
    let layer = BoxShadowLayer {
        x: Some(0.0),
        y: Some(4.0),
        blur: Some(8.0),
        spread: Some(0.0),
        color: Some("#00000080".into()),
        inset: None,
    };
    let only = StyleProps {
        box_shadow: Some(vec![layer]),
        ..Default::default()
    };
    assert!(!only.is_empty(), "boxShadow-only style must NOT be empty");
    let bp = StyleBreakpoints {
        phone: Some(only.clone()),
        ..Default::default()
    };
    assert!(!bp.is_empty(), "phone-only boxShadow breakpoint must survive");
    let d = decls_for_test(&only);
    assert_eq!(d, vec![("box-shadow", "0px 4px 8px 0px #00000080".into())]);
}

#[test]
fn b1_round_trip_document_keeps_box_shadow() {
    let raw = fx("round-trip-shadow", "json");
    let v: serde_json::Value = serde_json::from_str(&raw).unwrap();
    let doc = parse_document(&v).expect("parse");
    let t = doc.nodes.get("t").expect("t");
    let layers = t.style.box_shadow.as_ref().expect("base boxShadow");
    assert_eq!(layers.len(), 2);
    assert_eq!(layers[0].color.as_deref(), Some("#0369a1"));
    let phone = t
        .style_breakpoints
        .as_ref()
        .and_then(|m| m.phone.as_ref())
        .expect("phone bp");
    assert!(!phone.is_empty());
    assert_eq!(phone.box_shadow.as_ref().map(|l| l.len()), Some(1));

    // serialize → deserialize → equal (typed boxShadow fields)
    let back = serde_json::to_value(&doc).unwrap();
    let doc2 = parse_document(&back).unwrap();
    assert_eq!(
        doc2.nodes["t"].style.box_shadow,
        doc.nodes["t"].style.box_shadow
    );
    assert_eq!(
        doc2.nodes["t"]
            .style_breakpoints
            .as_ref()
            .unwrap()
            .phone
            .as_ref()
            .unwrap()
            .box_shadow,
        doc.nodes["t"]
            .style_breakpoints
            .as_ref()
            .unwrap()
            .phone
            .as_ref()
            .unwrap()
            .box_shadow
    );
}
