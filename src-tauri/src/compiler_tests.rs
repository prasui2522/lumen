use super::*;
use crate::defaults::{NodeProps, PageDocument};

/// Shaped like what the TS canvas saves (sparse style, camelCase props).
const SAMPLE: &str = r##"{
  "version": 1,
  "meta": { "title": "ร้าน <A&B>", "lang": "th", "description": "desc \"q\"" },
  "root": "page",
  "nodes": {
    "page": { "id": "page", "type": "page", "name": "Page",
      "props": { "type": "page", "children": ["sec"] }, "style": {} },
    "sec": { "id": "sec", "type": "section", "name": "ส่วนแนะนำ",
      "props": { "type": "section", "children": ["box"] },
      "style": { "padding": { "t": 32, "r": 24, "b": 32, "l": 24 } } },
    "box": { "id": "box", "type": "container",
      "props": { "type": "container", "children": ["h", "t", "b", "l", "img", "sp", "hid"],
                 "direction": "row", "gap": 12, "align": "center" },
      "style": { "backgroundColor": "#f8fafc", "borderRadius": 8 } },
    "h": { "id": "h", "type": "heading",
      "props": { "type": "heading", "level": 1, "content": "ยินดีต้อนรับ" }, "style": {} },
    "t": { "id": "t", "type": "text",
      "props": { "type": "text", "content": "สวัสดี" },
      "style": { "lineHeight": 1.8, "fontWeight": 500, "margin": 0 } },
    "b": { "id": "b", "type": "button",
      "props": { "type": "button", "label": "เริ่มต้น", "action": "none" }, "style": {} },
    "l": { "id": "l", "type": "link",
      "props": { "type": "link", "label": "เว็บ", "href": "https://example.com", "openInNewTab": true },
      "style": {} },
    "img": { "id": "img", "type": "image",
      "props": { "type": "image", "src": { "id": "" }, "objectFit": "contain" }, "style": {} },
    "sp": { "id": "sp", "type": "spacer", "props": { "type": "spacer", "size": 24 }, "style": {} },
    "hid": { "id": "hid", "type": "text", "visible": false,
      "props": { "type": "text", "content": "HIDDEN" }, "style": {} }
  }
}"##;

fn export() -> CompileOptions {
    CompileOptions::default()
}

fn body(html: &str) -> &str {
    let i = html.find("<body>").unwrap();
    &html[i..]
}

fn style_block(html: &str) -> &str {
    let a = html.find("<style>").unwrap() + 7;
    let b = html.find("</style>").unwrap();
    &html[a..b]
}

/// Minimal doc builder: page > nodes (JSON snippets for children of page).
fn doc_with(children: &[(&str, &str)]) -> String {
    let ids: Vec<String> = children.iter().map(|(id, _)| format!("\"{id}\"")).collect();
    let mut nodes = format!(
        "\"p\":{{\"id\":\"p\",\"type\":\"page\",\"props\":{{\"type\":\"page\",\"children\":[{}]}},\"style\":{{}}}}",
        ids.join(",")
    );
    for (_, n) in children {
        nodes.push(',');
        nodes.push_str(n);
    }
    format!("{{\"version\":1,\"meta\":{{\"title\":\"T\"}},\"root\":\"p\",\"nodes\":{{{nodes}}}}}")
}

#[test]
fn sample_roundtrip_parses_ts_shape() {
    let v: Value = serde_json::from_str(SAMPLE).unwrap();
    let doc = parse_document(&v).unwrap();
    assert_eq!(doc.root, "page");
    assert_eq!(doc.nodes.len(), 10);
    match &doc.nodes["box"].props {
        NodeProps::Container { children, gap, .. } => {
            assert_eq!(children.len(), 7);
            assert_eq!(*gap, Some(12));
        }
        other => panic!("{other:?}"),
    }
    // camelCase fields inside variants parse into the typed props.
    assert!(matches!(doc.nodes["l"].props, NodeProps::Link { open_in_new_tab: Some(true), .. }));
    assert!(matches!(
        doc.nodes["img"].props,
        NodeProps::Image { object_fit: Some(ObjectFit::Contain), .. }
    ));
    // typed serialise → parse again is stable
    let again: PageDocument = serde_json::from_str(&serde_json::to_string(&doc).unwrap()).unwrap();
    assert_eq!(again.nodes.len(), doc.nodes.len());
    let html = compile_value(&v, &export()).unwrap();
    assert!(html.starts_with("<!doctype html>"));
    assert!(html.contains("<html lang=\"th\">"));
    assert!(!html.contains("HIDDEN"), "invisible node must be skipped");
}

#[test]
fn escaping_text_attrs_css_and_href() {
    let json = doc_with(&[
        ("h", r#""h":{"id":"h","type":"heading","props":{"type":"heading","level":2,"content":"<script>alert(\"x\")</script> & 'q'"},"style":{"color":"red;}</style><script>x()</script>"}}"#),
        ("i", r#""i":{"id":"i","type":"image","props":{"type":"image","src":{"id":"","alt":"\"><img src=x onerror=alert(1)>"}},"style":{}}"#),
        ("l", r#""l":{"id":"l","type":"link","props":{"type":"link","label":"a&b","href":"https://x.y/?a=1&b=\"2\""},"style":{}}"#),
        ("j", r#""j":{"id":"j","type":"link","props":{"type":"link","label":"js","href":" JaVa\tScRiPt:alert(1)"},"style":{}}"#),
    ]);
    let html = compile_json(&json, &export()).unwrap();
    assert!(!html.contains("<script"), "no raw script tag: {html}");
    assert!(!html.contains("<img src=x"), "attr injection");
    assert!(html.contains("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;q&#39;"));
    assert!(html.contains("aria-label=\"&quot;&gt;&lt;img src=x onerror=alert(1)&gt;\""));
    assert!(html.contains("href=\"https://x.y/?a=1&amp;b=&quot;2&quot;\""));
    assert!(html.contains(">a&amp;b</a>"));
    assert!(html.contains("href=\"#\">js</a>"), "javascript: href neutralised");
    // CSS value cannot close the rule or the style element.
    let css = style_block(&html);
    assert!(!css.contains("</style"));
    assert!(css.contains("color:red/stylescriptx()/script"));
    assert_eq!(html.matches("</style>").count(), 1);
}

#[test]
fn defaults_are_merged_not_repeated() {
    let v: Value = serde_json::from_str(SAMPLE).unwrap();
    let html = compile_value(&v, &export()).unwrap();
    let css = style_block(&html);
    // Type rule carries defaults once.
    assert!(css.contains(".t-section{display:block;width:100%;padding:32px 24px 32px 24px;background-color:transparent}"));
    // Section padding equal to the default → no per-node class.
    assert!(body(&html).contains("<section class=\"t-section\">"));
    // Heading level default size via level class, no per-node rule.
    assert!(css.contains(".t-h1{font-size:40px}"));
    assert!(body(&html).contains("<h1 class=\"t-heading t-h1\">"));
    // Text overrides only: margin 0 (differs from default), weight, unitless line-height.
    assert!(css.contains("margin:0px;font-weight:500;line-height:1.8"));
    assert!(!css.contains("line-height:1.8px"));
    // Container: only non-default layout emitted per node.
    assert!(css.contains(".t-container{display:flex;width:100%;flex-direction:column;gap:0px;align-items:stretch;justify-content:flex-start}"));
    assert_eq!(css.matches("display:flex;").count(), 2, "container + image placeholder only");
    assert!(css.contains(".n1{background-color:#f8fafc;border-radius:8px;flex-direction:row;gap:12px;align-items:center}"));
    // Container with style.display overridden still renders as flex (node-view forces it).
    let json = doc_with(&[("c", r#""c":{"id":"c","type":"container","props":{"type":"container","children":[]},"style":{"display":"block"}}"#)]);
    let h2 = compile_json(&json, &export()).unwrap();
    assert!(style_block(&h2).contains(".n1{display:flex}"));

    // Heading override equal to level default → nothing; different → emitted.
    let json = doc_with(&[
        ("a", r#""a":{"id":"a","type":"heading","props":{"type":"heading","level":1,"content":"A"},"style":{"fontSize":40}}"#),
        ("b", r#""b":{"id":"b","type":"heading","props":{"type":"heading","level":2,"content":"B"},"style":{"fontSize":40}}"#),
    ]);
    let html = compile_json(&json, &export()).unwrap();
    assert!(html.contains("<h1 class=\"t-heading t-h1\">A</h1>"));
    assert!(html.contains("<h2 class=\"t-heading t-h2 n1\">B</h2>"));
    assert!(style_block(&html).contains(".n1{font-size:40px}"));
    assert!(style_block(&html).contains(".t-h2{font-size:32px}"));
    // Unused types produce no rules.
    assert!(!style_block(&html).contains(".t-button"));
}

#[test]
fn nesting_order_page_section_container_leaves() {
    let v: Value = serde_json::from_str(SAMPLE).unwrap();
    let html = compile_value(&v, &export()).unwrap();
    let b = body(&html);
    let pos = |s: &str| b.find(s).unwrap_or_else(|| panic!("missing {s} in {b}"));
    let page = pos("<div class=\"t-page\" data-wb-page=\"home\">");
    let sec = pos("<section class=\"t-section\">");
    let boxd = pos("<div class=\"t-container n");
    let h = pos("<h1 ");
    let t = pos("<p class=\"t-text");
    let btn = pos("<span class=\"t-button\">เริ่มต้น</span>");
    let link = pos("<a class=\"t-link\"");
    let img = pos("class=\"t-image ph\"");
    let sp = pos("class=\"t-spacer n");
    assert!(page < sec && sec < boxd && boxd < h && h < t && t < btn && btn < link && link < img && img < sp);
    assert!(b.ends_with("</div></div></section></div></body></html>\n"));
}

#[test]
fn links_open_in_new_tab_and_preview_inert() {
    let v: Value = serde_json::from_str(SAMPLE).unwrap();
    let html = compile_value(&v, &export()).unwrap();
    assert!(html.contains("<a class=\"t-link\" href=\"https://example.com\" target=\"_blank\" rel=\"noopener noreferrer\">เว็บ</a>"));

    let json = doc_with(&[("l", r##""l":{"id":"l","type":"link","props":{"type":"link","label":"x","href":"#top"},"style":{}}"##)]);
    let html = compile_json(&json, &export()).unwrap();
    assert!(html.contains("href=\"#top\">x</a>"));
    assert!(!html.contains("target="));

    let prev = CompileOptions { preview: true, ..Default::default() };
    let html = compile_value(&v, &prev).unwrap();
    assert!(!html.contains(" href="), "preview links are inert");
    assert!(html.contains("title=\"https://example.com\""));
    assert!(html.contains("Content-Security-Policy"));
}

#[test]
fn image_placeholder_and_resolved_asset() {
    let v: Value = serde_json::from_str(SAMPLE).unwrap();
    let html = compile_value(&v, &export()).unwrap();
    assert!(html.contains("<div class=\"t-image ph\" role=\"img\" aria-label=\"รูปภาพ\">รูปภาพ</div>"));
    assert!(!html.contains("<img"));
    assert!(style_block(&html).contains(".t-image.ph{"));

    // Non-empty id with an asset base → real <img>, object-fit from typed props.
    let json = doc_with(&[("i", r#""i":{"id":"i","type":"image","props":{"type":"image","src":{"id":"cat-1.png","alt":"แมว"},"objectFit":"contain"},"style":{}}"#)]);
    let opts = CompileOptions { asset_base_url: Some("assets/".into()), ..Default::default() };
    let html = compile_json(&json, &opts).unwrap();
    assert!(html.contains("<img class=\"t-image n1\" src=\"assets/cat-1.png\" alt=\"แมว\">"));
    assert!(style_block(&html).contains(".n1{object-fit:contain}"));
    // Same doc without a pipeline → placeholder with alt text.
    let html = compile_json(&json, &export()).unwrap();
    assert!(html.contains("aria-label=\"แมว\">แมว</div>"));
}

#[test]
fn malformed_docs_error_or_terminate() {
    assert!(compile_json("{}", &export()).is_err());
    let bad_root = r#"{"version":1,"meta":{"title":"T"},"root":"x","nodes":{}}"#;
    assert!(compile_json(bad_root, &export()).unwrap_err().contains("root"));
    // Cycle: section contains itself → must terminate.
    let cyc = doc_with(&[("s", r#""s":{"id":"s","type":"section","props":{"type":"section","children":["s","missing"]},"style":{}}"#)]);
    let html = compile_json(&cyc, &export()).unwrap();
    assert_eq!(html.matches("<section").count(), 1);
}

#[test]
fn unset_border_color_is_current_color() {
    let json = r##"{"version":1,"meta":{"title":"b","lang":"th"},"root":"p","nodes":{
      "p":{"id":"p","type":"page","props":{"type":"page","children":["b"]},"style":{}},
      "b":{"id":"b","type":"text","props":{"type":"text","content":"x"},
           "style":{"borderStyle":"solid","borderWidth":2}}}}"##;
    let html = compile_json(json, &CompileOptions::default()).expect("compiles");
    assert!(html.contains("border:0 solid currentColor"), "{html}");
    assert!(!html.contains("border-color"), "no explicit colour when unset: {html}");
    assert!(html.contains("border-width:2px"));
    assert!(html.contains("border-style:solid"));
}

/// JSON numbers: TS writes `16`, serde writes an f64 field back as `16.0`.
/// Both are the same JS number, so compare numerically (everything else exact).
fn norm(v: &Value) -> Value {
    match v {
        Value::Number(n) => serde_json::json!(n.as_f64().unwrap()),
        Value::Array(a) => Value::Array(a.iter().map(norm).collect()),
        Value::Object(o) => Value::Object(o.iter().map(|(k, v)| (k.clone(), norm(v))).collect()),
        other => other.clone(),
    }
}

fn rich_value() -> Value {
    serde_json::from_str(include_str!("fixtures/rich_sample.json")).unwrap()
}

/// serialize(parse(json)) == json for documents covering every node type,
/// every camelCase prop/style field, both CssSize/FontWeight/BoxSpacing forms.
#[test]
fn typed_roundtrip_is_lossless() {
    for (name, v) in [("rich", rich_value()), ("sample", serde_json::from_str(SAMPLE).unwrap())] {
        let doc = parse_document(&v).unwrap();
        let back = serde_json::to_value(&doc).unwrap();
        assert_eq!(norm(&back), norm(&v), "{name}: round-trip changed the document");
    }
    // The rich sample really covers every StyleProps key (schema.ts order).
    let v = rich_value();
    let mut style_keys = std::collections::BTreeSet::new();
    for n in v["nodes"].as_object().unwrap().values() {
        style_keys.extend(n["style"].as_object().unwrap().keys().cloned());
    }
    for k in [
        "display", "width", "height", "minHeight", "maxWidth", "margin", "padding",
        "backgroundColor", "color", "fontFamily", "fontSize", "fontWeight", "lineHeight",
        "textAlign", "borderRadius", "borderWidth", "borderColor", "borderStyle", "opacity",
        "overflow",
    ] {
        assert!(style_keys.contains(k), "rich sample lacks style key {k}");
    }
}

#[test]
fn open_in_new_tab_and_object_fit_are_typed() {
    let doc = parse_document(&rich_value()).unwrap();
    assert!(matches!(doc.nodes["more"].props, NodeProps::Link { open_in_new_tab: Some(true), .. }));
    assert!(matches!(doc.nodes["same"].props, NodeProps::Link { open_in_new_tab: Some(false), .. }));
    assert!(matches!(doc.nodes["pic"].props, NodeProps::Image { object_fit: Some(ObjectFit::Contain), .. }));
    assert!(matches!(doc.nodes["nopic"].props, NodeProps::Image { object_fit: Some(ObjectFit::Fill), .. }));
    let back = serde_json::to_value(&doc).unwrap();
    assert_eq!(back["nodes"]["more"]["props"]["openInNewTab"], true);
    assert_eq!(back["nodes"]["pic"]["props"]["objectFit"], "contain");
    let s = back.to_string();
    assert!(!s.contains("open_in_new_tab") && !s.contains("object_fit"), "{s}");
    // Absent optional keys stay absent (sparse).
    assert!(back["nodes"]["gap"]["props"].get("objectFit").is_none());
    assert!(back["nodes"]["inner"]["props"].get("direction").is_none());
    assert!(back["nodes"]["inner"]["style"].as_object().unwrap().is_empty());
}

/// Styling exercised end to end: exact per-node CSS + HTML for a rich page.
#[test]
fn rich_sample_css_and_html() {
    let doc = parse_document(&rich_value()).unwrap();
    let opts = CompileOptions { preview: false, asset_base_url: Some("assets".into()), ..Default::default() };
    let (html, css) = compile_export(&doc, &opts).unwrap();

    // Heading levels used → one rule each, only those levels.
    assert!(css.contains(".t-h1{font-size:40px}.t-h3{font-size:28px}.t-h6{font-size:18px}"));
    assert!(!css.contains(".t-h2{"));
    // Page overrides only.
    assert!(css.contains(".n1{background-color:#f8fafc;font-family:Georgia, serif}"));
    // Styled section: background/padding/border/radius/size/overflow, nothing default.
    assert!(css.contains(
        ".n2{min-height:50vh;max-width:960px;padding:48px 24px 48px 24px;background-color:#0f172a;\
color:#ffffff;border-radius:16px;border-width:2px;border-color:#0ea5e9;border-style:solid;overflow:hidden}"
    ));
    assert!(css.contains(".n3{color:#ffffff;text-align:center}"));
    assert!(css.contains(".n4{font-size:12px}"), "h6 fontSize override beats level default");
    // Partial sides fill with 0, keyword weight, unitless line-height, opacity.
    assert!(css.contains(".n5{margin:0px 0px 16px 0px;font-weight:bold;line-height:1.8;opacity:0.9}"));
    // Container: display:block forced back to flex (canvas parity), width 100% = default → omitted.
    assert!(css.contains(
        ".n6{display:flex;height:80px;flex-direction:row;gap:16px;align-items:center;justify-content:space-between}"
    ));
    assert!(css.contains(".n7{padding:12px;background-color:#e11d48}"));
    assert!(css.contains(".n8{font-size:18px}"));
    assert!(css.contains(".n9{width:240px;border-radius:8px;object-fit:contain}"));
    assert!(css.contains(".n10{height:40px}"));
    assert!(!css.contains(".n11"), "unstyled nodes get no per-node class");

    let body = &html[html.find("<body>").unwrap()..];
    assert_eq!(
        body,
        "<body><div class=\"t-page n1\" data-wb-page=\"home\"><section class=\"t-section n2\">\
<h1 class=\"t-heading t-h1 n3\">กาแฟดี</h1><h3 class=\"t-heading t-h3\">คั่วสด</h3>\
<h6 class=\"t-heading t-h6 n4\">เล็ก</h6><p class=\"t-text n5\">เปิดทุกวัน</p>\
<div class=\"t-container n6\"><a class=\"t-button n7\" href=\"https://shop.example/order\">สั่งเลย</a>\
<a class=\"t-link n8\" href=\"https://example.com/menu\" target=\"_blank\" rel=\"noopener noreferrer\">เมนู</a>\
<div class=\"t-container\"><img class=\"t-image n9\" src=\"assets/beans.jpg\" alt=\"เมล็ดกาแฟ\">\
<div class=\"t-image ph\" role=\"img\" aria-label=\"รูปภาพ\">รูปภาพ</div>\
<div class=\"t-spacer n10\" aria-hidden=\"true\"></div><a class=\"t-link\" href=\"/map\">ที่ตั้ง</a>\
</div></div></section></div></body></html>\n"
    );
    assert!(html.contains("<meta name=\"description\" content=\"หน้าแรก\">"));

    // Same doc in Preview: inline CSS, CSP, inert links, button as span, no <img>.
    let pv = compile(&doc, &CompileOptions { preview: true, asset_base_url: None, ..Default::default() }).unwrap();
    assert!(pv.contains("<style>") && pv.contains("Content-Security-Policy"));
    assert!(!pv.contains("href=") && !pv.contains("target="));
    assert!(pv.contains("<span class=\"t-button n7\">สั่งเลย</span>"));
    assert!(!pv.contains("<img"));
}

#[test]
fn page_path_href_is_rewritten_on_export() {
    let json = doc_with(&[(
        "l",
        r#""l":{"id":"l","type":"link","props":{"type":"link","label":"Go","href":"/signup"},"style":{}}"#,
    )]);
    let mut paths = std::collections::HashMap::new();
    paths.insert("/signup".into(), "signup.html".into());
    paths.insert("/signup/".into(), "signup.html".into());
    let html = compile_json(
        &json,
        &CompileOptions {
            preview: false,
            page_paths: paths,
            ..Default::default()
        },
    )
    .unwrap();
    assert!(html.contains("href=\"signup.html\""), "{html}");
    assert!(!html.contains("href=\"/signup\""), "{html}");
    // Preview still omits href.
    let pv = compile_json(
        &json,
        &CompileOptions {
            preview: true,
            page_paths: {
                let mut p = std::collections::HashMap::new();
                p.insert("/signup".into(), "signup.html".into());
                p
            },
            ..Default::default()
        },
    )
    .unwrap();
    assert!(!pv.contains(" href="), "{pv}");
}

#[test]
fn preview_button_has_press_feedback_export_does_not() {
    let json = doc_with(&[(
        "b",
        r#""b":{"id":"b","type":"button","props":{"type":"button","label":"Go"},"style":{}}"#,
    )]);
    let export_html = compile_json(&json, &export()).unwrap();
    let doc = parse_document(&serde_json::from_str::<Value>(&json).unwrap()).unwrap();
    let (_html, export_css) = compile_export(
        &doc,
        &CompileOptions {
            preview: false,
            asset_base_url: Some("assets".into()),
            ..Default::default()
        },
    )
    .unwrap();
    assert!(!export_css.contains("cursor:pointer"), "{export_css}");
    assert!(!export_css.contains(".t-button:active"), "{export_css}");
    assert!(!export_html.contains("cursor:pointer"));
    assert!(!export_html.contains(".t-button:active"));
    assert!(!export_css.contains("prefers-reduced-motion"), "{export_css}");
    assert!(!export_html.contains("prefers-reduced-motion"));

    let preview = compile_json(
        &json,
        &CompileOptions {
            preview: true,
            ..Default::default()
        },
    )
    .unwrap();
    let css = style_block(&preview);
    assert!(css.contains(".t-button{cursor:pointer}"), "{css}");
    // B8.3: legacy press is scoped away from `.fx` (user states).
    assert!(css.contains(".t-button:not(.fx):active{transform:translateY(1px)}"), "{css}");
    assert!(
        css.contains("@media (prefers-reduced-motion:reduce){.t-button:not(.fx):active{transform:none}}"),
        "{css}"
    );
    let b = body(&preview);
    assert!(b.contains("<span class=\"t-button\">Go</span>"), "{b}");
}

#[test]
fn width_queries_follow_base_and_skip_empty_and_fold() {
    let plain = doc_with(&[(
        "t",
        r#""t":{"id":"t","type":"text","props":{"type":"text","content":"a"},"style":{"fontSize":18}}"#,
    )]);
    let plain_css = style_block(&compile_json(&plain, &export()).unwrap()).to_string();
    assert!(!plain_css.contains("@media"), "a document with no overrides has no query");

    let empty_bp = doc_with(&[(
        "t",
        r#""t":{"id":"t","type":"text","props":{"type":"text","content":"a"},"style":{"fontSize":18},"styleBreakpoints":{"tablet":{},"phone":{}}}"#,
    )]);
    let empty_html = compile_json(&empty_bp, &export()).unwrap();
    let empty_css = style_block(&empty_html);
    assert_eq!(empty_css, plain_css, "an empty override emits nothing");

    let json = doc_with(&[(
        "t",
        r##""t":{"id":"t","type":"text","props":{"type":"text","content":"a"},"style":{"fontSize":18},"styleBreakpoints":{"tablet":{"color":"#111"},"phone":{"fontSize":14},"foldOpen":{"fontSize":12}}}"##,
    )]);
    let html = compile_json(&json, &export()).unwrap();
    let css = style_block(&html).to_string();
    let base = css.split("@media").next().unwrap();
    assert!(base.contains(".n1{font-size:18px}"), "base rule has no query: {base}");
    assert!(!base.contains("@media"), "base rules are not inside a query");
    let tpos = css.find("@media (max-width:1024px)").expect("tablet query");
    let ppos = css.find("@media (max-width:719px)").expect("phone query");
    let fpos = css.find("@media (horizontal-viewport-segments: 2)").expect("fold query");
    assert!(tpos < ppos && ppos < fpos, "tablet, then phone, then fold-open");
    let tablet = &css[tpos..ppos];
    let phone = &css[ppos..fpos];
    let fold = &css[fpos..];
    assert!(tablet.contains("[data-wb-page=\"home\"] [data-wb-id=\"t\"]{color:#111}"));
    assert!(!tablet.contains("font-size:14px"), "phone keys are not in the tablet query");
    assert!(!tablet.contains("font-size:12px"), "fold keys are not in the tablet query");
    assert!(phone.contains("[data-wb-page=\"home\"] [data-wb-id=\"t\"]{font-size:14px}"));
    assert!(!phone.contains("color:#111"), "tablet keys are not copied into phone");
    assert!(!phone.contains("font-size:12px"), "fold keys are not copied into phone");
    assert!(fold.contains("[data-wb-page=\"home\"] [data-wb-id=\"t\"]{font-size:12px}"));
    assert!(!fold.contains("color:#111") && !fold.contains("font-size:14px"));
    assert!(!fold.contains("max-width"), "fold-open is not a width query");
    assert!(!css.contains("750"), "no 750px stand-in that would also restyle tablets");
    assert_eq!(css.matches("@media").count(), 3);
    assert!(body(&html).contains("class=\"t-text n1\""));
}

#[test]
fn phone_only_override_is_inside_its_query() {
    let json = doc_with(&[(
        "t",
        r#""t":{"id":"t","type":"text","props":{"type":"text","content":"a"},"style":{},"styleBreakpoints":{"phone":{"fontSize":14}}}"#,
    )]);
    let html = compile_json(&json, &export()).unwrap();
    let css = style_block(&html);
    assert!(
        !css.split("@media").next().unwrap().contains(".n1{"),
        "no base rule when the base style matches the type"
    );
    assert!(css.contains("@media (max-width:719px){[data-wb-page=\"home\"] [data-wb-id=\"t\"]{font-size:14px}}"));
    assert!(!css.contains("1024px"), "no empty tablet query");
    assert!(body(&html).contains("class=\"t-text n1\""));
}

#[test]
fn fold_open_is_only_the_segments_query() {
    let json = doc_with(&[(
        "t",
        r#""t":{"id":"t","type":"text","props":{"type":"text","content":"a"},"style":{},"styleBreakpoints":{"foldOpen":{"fontSize":12}}}"#,
    )]);
    let html = compile_json(&json, &export()).unwrap();
    let css = style_block(&html);
    assert!(css.contains("@media (horizontal-viewport-segments: 2){[data-wb-page=\"home\"] [data-wb-id=\"t\"]{font-size:12px}}"));
    assert!(!css.contains("@media (max-width"), "a fold-only override adds no width query");
    assert!(body(&html).contains("class=\"t-text n1\""));

    let empty = doc_with(&[(
        "t",
        r#""t":{"id":"t","type":"text","props":{"type":"text","content":"a"},"style":{},"styleBreakpoints":{"foldOpen":{}}}"#,
    )]);
    let empty_html = compile_json(&empty, &export()).unwrap();
    assert!(!style_block(&empty_html).contains("@media"), "an empty fold override emits nothing");
    assert!(!body(&empty_html).contains("n1"), "an empty fold override adds no class");

    let (_, export_css) = compile_export(
        &parse_document(&serde_json::from_str(&json).unwrap()).unwrap(),
        &export(),
    )
    .unwrap();
    assert!(export_css.contains("@media (horizontal-viewport-segments: 2){[data-wb-page=\"home\"] [data-wb-id=\"t\"]{font-size:12px}}"));
}

#[test]
fn image_extension_comes_from_the_asset_row_not_the_node() {
    let json = doc_with(&[(
        "i",
        r#""i":{"id":"i","type":"image","props":{"type":"image","src":{"id":"abc"},"objectFit":"contain"},"style":{}}"#,
    )]);
    let mut exts = std::collections::HashMap::new();
    exts.insert("abc".into(), "jpg".into());
    let opts = CompileOptions {
        asset_base_url: Some("assets".into()),
        asset_exts: exts,
        ..Default::default()
    };
    let html = compile_json(&json, &opts).unwrap();
    assert!(html.contains("<img class=\"t-image n1\" src=\"assets/abc.jpg\" alt=\"\">"));

    let json = doc_with(&[(
        "i",
        r#""i":{"id":"i","type":"image","props":{"type":"image","src":{"id":"cat-1.png","alt":"แมว"},"objectFit":"contain"},"style":{}}"#,
    )]);
    let mut exts = std::collections::HashMap::new();
    exts.insert("cat-1.png".into(), "png".into());
    let opts = CompileOptions {
        asset_base_url: Some("assets".into()),
        asset_exts: exts,
        ..Default::default()
    };
    let html = compile_json(&json, &opts).unwrap();
    assert!(html.contains("src=\"assets/cat-1.png\""));
    assert!(!html.contains("cat-1.png.png"));

    let mut urls = std::collections::HashMap::new();
    urls.insert("abc".into(), "asset://localhost/%2Fdata%2Fabc.jpg".into());
    let opts = CompileOptions {
        preview: true,
        asset_base_url: Some("asset://localhost".into()),
        asset_urls: urls,
        ..Default::default()
    };
    let json = doc_with(&[(
        "i",
        r#""i":{"id":"i","type":"image","props":{"type":"image","src":{"id":"abc"},"objectFit":"contain"},"style":{}}"#,
    )]);
    let html = compile_json(&json, &opts).unwrap();
    assert!(html.contains("src=\"asset://localhost/%2Fdata%2Fabc.jpg\""));
    assert!(html.contains("img-src data: asset: http://asset.localhost https://asset.localhost"));
    assert!(!html.contains("img-src https:"));
    assert!(!html.contains("img-src *"));
}

#[test]
fn input_and_switch_are_real_controls() {
    let json = doc_with(&[
        ("a", r#""a":{"id":"a","type":"input","props":{"type":"input","label":"ชื่อ","placeholder":"พิมพ์ที่นี่"},"style":{}}"#),
        ("b", r#""b":{"id":"b","type":"input","props":{"type":"input","label":"","placeholder":"a<b"},"style":{}}"#),
        ("c", r#""c":{"id":"c","type":"switch","props":{"type":"switch","label":"เปิดใช้","checked":true},"style":{}}"#),
        ("d", r#""d":{"id":"d","type":"switch","props":{"type":"switch","label":"ปิด","checked":false},"style":{}}"#),
    ]);
    let html = compile_json(&json, &export()).unwrap();
    let b = body(&html);
    assert!(b.contains("<label>ชื่อ<input class=\"t-input\" type=\"text\" placeholder=\"พิมพ์ที่นี่\"></label>"), "{b}");
    assert!(b.contains("<input class=\"t-input\" type=\"text\" placeholder=\"a&lt;b\">"), "{b}");
    assert!(!b.contains("<label><input class=\"t-input\""), "empty label must not wrap");
    // Phase 11 A3.2: track + thumb markup (spec §9 A3 switch restyle)
    assert!(b.contains("<label class=\"t-switch\"><input type=\"checkbox\" class=\"sw\" checked=\"checked\"><span class=\"sw-track\"><span class=\"sw-thumb\"></span></span><span>เปิดใช้</span></label>"), "{b}");
    assert!(b.contains("<label class=\"t-switch\"><input type=\"checkbox\" class=\"sw\"><span class=\"sw-track\"><span class=\"sw-thumb\"></span></span><span>ปิด</span></label>"), "{b}");
    assert!(!html.contains("<script"));
    assert!(!html.contains("type=\"password\"") && !html.contains("type=\"email\"") && !html.contains("type=\"number\""));
    let css = style_block(&html);
    assert_eq!(css.matches(".t-switch{").count(), 1, "{css}");
    assert!(css.contains("align-items:center"));
    assert!(css.contains("gap:8px"));
    // A3.2: the only transitions are the switch's, and reduced motion turns them off
    assert!(!css.contains("animation"));
    assert!(css.contains("@media (prefers-reduced-motion:reduce){.t-switch .sw-track,.t-switch .sw-thumb{transition:none}}"), "{css}");
}

#[test]
fn phase6b_exports_static_html() {
    let json = doc_with(&[
        ("ta", r#""ta":{"id":"ta","type":"textarea","props":{"type":"textarea","label":"Note","placeholder":"Type here"},"style":{}}"#),
        ("pr", r#""pr":{"id":"pr","type":"progress","props":{"type":"progress","value":40},"style":{}}"#),
        ("tg", r#""tg":{"id":"tg","type":"toggle","props":{"type":"toggle","label":"Toggle","pressed":true},"style":{}}"#),
        ("dg", r#""dg":{"id":"dg","type":"dialog","props":{"type":"dialog","title":"SecretTitle","message":"Hidden","open":false},"style":{}}"#),
        ("ac", r#""ac":{"id":"ac","type":"accordion","props":{"type":"accordion","open":0,"items":[{"label":"One","text":"Content"},{"label":"Two","text":"More"}]},"style":{}}"#),
        ("sl", r#""sl":{"id":"sl","type":"select","props":{"type":"select","value":"One","options":["One","Two"]},"style":{}}"#),
    ]);
    let html = compile_json(&json, &export()).unwrap();
    let b = body(&html);
    assert!(b.contains("<label>Note<textarea class=\"t-textarea\" placeholder=\"Type here\"></textarea></label>"), "{b}");
    assert!(b.contains("<progress class=\"t-progress\" value=\"40\" max=\"100\"></progress>"), "{b}");
    // A1.3 row 17: a native checkbox in a label (no dead aria-pressed button).
    assert!(b.contains("<label class=\"t-toggle\"><input type=\"checkbox\" checked=\"checked\"><span>Toggle</span></label>"), "{b}");
    assert!(!b.contains("aria-pressed"), "{b}");
    assert!(!b.contains("SecretTitle"), "{b}");
    assert!(b.contains("<details open=\"open\"><summary>One</summary><div>Content</div></details>"), "{b}");
    assert!(b.contains("<details><summary>Two</summary><div>More</div></details>"), "{b}");
    assert!(b.contains("<select class=\"t-select\">"), "{b}");
    assert!(b.contains("<option selected=\"selected\" value=\"One\">One</option>"), "{b}");
    assert!(!html.contains("<script"));
    let css = style_block(&html);
    assert_eq!(css.matches(".t-progress{").count(), 1, "{css}");
    assert!(css.contains(".t-tabs input:checked~.p6panel{display:block}") == false);
    assert!(!css.contains("transition") && !css.contains("animation"));
}

// ---- Phase 9 Part A: button link export (PHASE-9-SPEC §4) ----

fn button_doc(props: &str) -> String {
    doc_with(&[(
        "b",
        &format!(r#""b":{{"id":"b","type":"button","props":{{"type":"button","label":"Go"{props}}},"style":{{}}}}"#),
    )])
}

fn page_paths() -> std::collections::HashMap<String, String> {
    let mut p = std::collections::HashMap::new();
    p.insert("/".into(), "index.html".into());
    p.insert("/login".into(), "login.html".into());
    p.insert("/login/".into(), "login.html".into());
    p
}

fn export_with_pages(json: &str) -> (String, String) {
    let doc = parse_document(&serde_json::from_str::<Value>(json).unwrap()).unwrap();
    compile_export(
        &doc,
        &CompileOptions {
            preview: false,
            asset_base_url: Some("assets".into()),
            page_paths: page_paths(),
            ..Default::default()
        },
    )
    .unwrap()
}

#[test]
fn linked_button_exports_anchor_with_rewritten_href() {
    let cases = [
        (r#","action":"link","href":"/login""#, r#"<a class="t-button" href="login.html">Go</a>"#),
        (r#","action":"link","href":"/login/""#, r#"<a class="t-button" href="login.html">Go</a>"#),
        (r#","action":"link","href":"/login?x=1#top""#, r#"<a class="t-button" href="login.html?x=1#top">Go</a>"#),
        (r#","action":"link","href":"/""#, r#"<a class="t-button" href="index.html">Go</a>"#),
        // No action field + non-blank href is a link too (existing compiler rule).
        (r#","href":"/login""#, r#"<a class="t-button" href="login.html">Go</a>"#),
        // Missing page / external / other relative: exported as written, same tab.
        (r#","action":"link","href":"/pricing""#, r#"<a class="t-button" href="/pricing">Go</a>"#),
        (r#","action":"link","href":"https://example.com/a""#, r#"<a class="t-button" href="https://example.com/a">Go</a>"#),
        (r#","action":"link","href":"mailto:a@b.co""#, r#"<a class="t-button" href="mailto:a@b.co">Go</a>"#),
        (r#","action":"link","href":"tel:+6621234567""#, r#"<a class="t-button" href="tel:+6621234567">Go</a>"#),
        (r##","action":"link","href":"#top""##, r##"<a class="t-button" href="#top">Go</a>"##),
        (r#","action":"link","href":"?q=1""#, r#"<a class="t-button" href="?q=1">Go</a>"#),
        (r#","action":"link","href":"./x""#, r#"<a class="t-button" href="./x">Go</a>"#),
    ];
    for (props, want) in cases {
        let (html, _css) = export_with_pages(&button_doc(props));
        let b = body(&html);
        assert!(b.contains(want), "{props}: {b}");
        assert!(!b.contains("target="), "{props}: {b}");
        assert!(!b.contains("<span class=\"t-button"), "{props}: {b}");
    }
    // Hand-edited blocked scheme is still neutralised by safe_href.
    let (html, _) = export_with_pages(&button_doc(r#","action":"link","href":"javascript:alert(1)""#));
    assert!(!html.contains("javascript:"), "{html}");
    assert!(body(&html).contains(r##"<a class="t-button" href="#">Go</a>"##), "{html}");
    // Preview never gets a real href on a button (spec §6 is Part B).
    let pv = compile_json(
        &button_doc(r#","action":"link","href":"/login""#),
        &CompileOptions {
            preview: true,
            page_paths: page_paths(),
            ..Default::default()
        },
    )
    .unwrap();
    let b = body(&pv);
    assert!(b.contains("<span class=\"t-button\">Go</span>"), "{b}");
    assert!(!b.contains(" href="), "{b}");
}

#[test]
fn unlinked_button_export_is_byte_identical() {
    // Golden captured from the compiler before Phase 9 (compiler.rs unchanged).
    let base = button_doc("");
    let (html, css) = export_with_pages(&base);
    assert_eq!(
        body(&html),
        "<body><div class=\"t-page\" data-wb-page=\"home\"><span class=\"t-button\">Go</span></div></body></html>\n"
    );
    assert_eq!(
        css,
        "*,::before,::after{box-sizing:border-box;margin:0;padding:0;border:0 solid currentColor}html{line-height:1.5;-webkit-text-size-adjust:100%}html,body{height:100%}body{margin:0}h1,h2,h3,h4,h5,h6{font-size:inherit;font-weight:inherit}a{color:inherit;text-decoration:inherit}img{display:block;max-width:100%}.t-page{display:block;width:100%;min-height:100%;margin:0px;padding:0px;background-color:#ffffff;color:#0f172a;font-family:ui-sans-serif, system-ui, -apple-system, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, sans-serif;font-size:16px;line-height:1.5}.t-button{display:inline-block;margin:0px;padding:10px 16px 10px 16px;background-color:#0ea5e9;color:#ffffff;font-size:16px;font-weight:600;line-height:1.25;text-align:center;border-radius:8px;border-width:0px;border-style:none}\n"
    );
    let plain = compile_json(&base, &export()).unwrap();
    for props in [
        r#","action":"none""#,
        r#","action":"none","href":"/login""#,
        r#","action":"none","href":"https://example.com""#,
        r#","action":"link","href":"""#,
        r#","action":"link","href":"   ""#,
        r#","href":"""#,
    ] {
        let json = button_doc(props);
        assert_eq!(export_with_pages(&json), (html.clone(), css.clone()), "{props}");
        assert_eq!(compile_json(&json, &export()).unwrap(), plain, "{props}");
    }
}

#[test]
fn fragment_and_query_only_hrefs_export_as_written() {
    // INTENTIONAL (PM-approved, Phase 9): an empty path is never a page, so
    // `#…` / `?…` export as written and a blocked scheme exports `#`. Before
    // Phase 9 these became `index.html#top` / `index.html?q=1` / `index.html#`.
    let json = doc_with(&[
        ("a", r##""a":{"id":"a","type":"link","props":{"type":"link","label":"A","href":"#top"},"style":{}}"##),
        ("b", r#""b":{"id":"b","type":"link","props":{"type":"link","label":"B","href":"?q=1"},"style":{}}"#),
        ("c", r#""c":{"id":"c","type":"link","props":{"type":"link","label":"C","href":"javascript:alert(1)"},"style":{}}"#),
        ("d", r##""d":{"id":"d","type":"button","props":{"type":"button","label":"D","action":"link","href":"#top"},"style":{}}"##),
        ("e", r##""e":{"id":"e","type":"navigationMenu","props":{"type":"navigationMenu","items":[{"label":"Top","href":"#top"},{"label":"Q","href":"?q"}]},"style":{}}"##),
    ]);
    let (html, _css) = export_with_pages(&json);
    assert_eq!(
        body(&html),
        "<body><div class=\"t-page\" data-wb-page=\"home\"><a class=\"t-link\" href=\"#top\">A</a><a class=\"t-link\" href=\"?q=1\">B</a><a class=\"t-link\" href=\"#\">C</a><a class=\"t-button\" href=\"#top\">D</a><nav class=\"t-navigationMenu\" aria-label=\"navigation\"><ul role=\"list\"><li><a href=\"#top\">Top</a></li><li><a href=\"?q\">Q</a></li></ul></nav></div></body></html>\n",
    );
}

/// Preview options the way compile_preview gets them from documentForPreview:
/// file forms in `page_paths`, markers for every page except the open one (`/`).
fn preview_with_markers() -> CompileOptions {
    let mut paths = page_paths();
    for f in ["index.html", "login.html"] {
        paths.insert(f.into(), f.into());
        paths.insert(format!("./{f}"), f.into());
    }
    let mut markers = std::collections::HashMap::new();
    markers.insert("login.html".to_string(), "about:blank#wb-page=%2Flogin".to_string());
    CompileOptions {
        preview: true,
        page_paths: paths,
        page_markers: markers,
        ..Default::default()
    }
}

fn link_doc() -> String {
    doc_with(&[
        ("b1", r#""b1":{"id":"b1","type":"button","props":{"type":"button","label":"B1","action":"link","href":"/login"},"style":{}}"#),
        ("b2", r#""b2":{"id":"b2","type":"button","props":{"type":"button","label":"B2","action":"link","href":" /login/?x#y "},"style":{}}"#),
        ("b3", r#""b3":{"id":"b3","type":"button","props":{"type":"button","label":"B3","action":"link","href":"/"},"style":{}}"#),
        ("b4", r#""b4":{"id":"b4","type":"button","props":{"type":"button","label":"B4","action":"link","href":"https://example.com"},"style":{}}"#),
        ("b5", r#""b5":{"id":"b5","type":"button","props":{"type":"button","label":"B5","action":"link","href":"/pricing"},"style":{}}"#),
        ("b6", r#""b6":{"id":"b6","type":"button","props":{"type":"button","label":"B6","action":"none","href":"/login"},"style":{}}"#),
        ("l1", r#""l1":{"id":"l1","type":"link","props":{"type":"link","label":"L1","href":"login.html","openInNewTab":true},"style":{}}"#),
        ("l2", r#""l2":{"id":"l2","type":"link","props":{"type":"link","label":"L2","href":"mailto:a@b.co"},"style":{}}"#),
        ("l3", r#""l3":{"id":"l3","type":"link","props":{"type":"link","label":"L3","href":"tel:+66"},"style":{}}"#),
        ("l4", r#""l4":{"id":"l4","type":"link","props":{"type":"link","label":"L4","href":"./index.html"},"style":{}}"#),
        ("l5", r#""l5":{"id":"l5","type":"link","props":{"type":"link","label":"L5","href":"/login.html"},"style":{}}"#),
        ("bc", r#""bc":{"id":"bc","type":"breadcrumb","props":{"type":"breadcrumb","items":[{"label":"หน้าแรก","href":"/"},{"label":"Login","href":"./login.html"},{"label":"Ext","href":"https://x.y"},{"label":"Here","href":""}]},"style":{}}"#),
        ("nm", r#""nm":{"id":"nm","type":"navigationMenu","props":{"type":"navigationMenu","items":[{"label":"เข้าสู่ระบบ","href":"/login"},{"label":"Home","href":"index.html"},{"label":"Mail","href":"mailto:x@y.z"},{"label":"Docs","href":"/docs"},{"label":"JS","href":"javascript:x"}]},"style":{}}"#),
    ])
}

#[test]
fn preview_page_links_get_inert_marker_and_nothing_else_has_href() {
    let pv = compile_json(&link_doc(), &preview_with_markers()).unwrap();
    let b = body(&pv);
    assert_eq!(
        b,
        "<body><div class=\"t-page\" data-wb-page=\"home\"><a class=\"t-button\" href=\"about:blank#wb-page=%2Flogin\">B1</a><a class=\"t-button\" href=\"about:blank#wb-page=%2Flogin\">B2</a><span class=\"t-button\">B3</span><span class=\"t-button\">B4</span><span class=\"t-button\">B5</span><span class=\"t-button\">B6</span><a class=\"t-link\" href=\"about:blank#wb-page=%2Flogin\" title=\"login.html\">L1</a><a class=\"t-link\" title=\"mailto:a@b.co\">L2</a><a class=\"t-link\" title=\"tel:+66\">L3</a><a class=\"t-link\" title=\"./index.html\">L4</a><a class=\"t-link\" title=\"/login.html\">L5</a><nav class=\"t-breadcrumb\" aria-label=\"breadcrumb\"><ol role=\"list\"><li><span>หน\u{e49}าแรก</span></li><li><a href=\"about:blank#wb-page=%2Flogin\">Login</a></li><li><span>Ext</span></li><li><span aria-current=\"page\">Here</span></li></ol></nav><nav class=\"t-navigationMenu\" aria-label=\"navigation\"><ul role=\"list\"><li><a href=\"about:blank#wb-page=%2Flogin\">เข\u{e49}าส\u{e39}\u{e48}ระบบ</a></li><li><span>Home</span></li><li><span>Mail</span></li><li><span>Docs</span></li><li><span>JS</span></li></ul></nav></div></body></html>\n",
    );
    // Only marker hrefs, never a target, never a real URL.
    assert_eq!(b.matches(" href=\"about:blank#wb-page=%2Flogin\"").count(), b.matches(" href=").count(), "{b}");
    assert!(!b.contains("target="), "{b}");
    // Sandbox CSP meta unchanged.
    assert!(pv.contains("default-src 'none'"), "{pv}");
}

#[test]
fn preview_marker_values_must_be_markers() {
    let mut opts = preview_with_markers();
    opts.page_markers.insert("login.html".into(), "https://evil.example/".into());
    let b = compile_json(&link_doc(), &opts).unwrap();
    assert!(!body(&b).contains(" href="), "{b}");
}

#[test]
fn preview_without_markers_has_no_hrefs() {
    // Single-page project / current page only: no markers at all.
    let mut opts = preview_with_markers();
    opts.page_markers.clear();
    let b = compile_json(&link_doc(), &opts).unwrap();
    assert!(!body(&b).contains(" href="), "{b}");
}

#[test]
fn export_ignores_preview_markers() {
    let json = link_doc();
    let plain = export_with_pages(&json);
    let doc = parse_document(&serde_json::from_str::<Value>(&json).unwrap()).unwrap();
    let mut markers = std::collections::HashMap::new();
    markers.insert("login.html".to_string(), "about:blank#wb-page=%2Flogin".to_string());
    let with = compile_export(
        &doc,
        &CompileOptions {
            preview: false,
            asset_base_url: Some("assets".into()),
            page_paths: page_paths(),
            page_markers: markers,
            ..Default::default()
        },
    )
    .unwrap();
    assert_eq!(with, plain);
    assert!(!plain.0.contains("#wb-page"), "{}", plain.0); // B0.1: `data-wb-page` (page scope) is not a marker
}
