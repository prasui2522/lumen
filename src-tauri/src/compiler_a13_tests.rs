//! PHASE-11 A1.3 tests: css_safe contract (39 cases from the spec table,
//! hostile fixtures, integration) and the A1 fidelity goldens.
use super::*;

#[test]
fn css_safe_spec_table_39_cases() {
    let cases: [(&str, &str); 39] = [
        ("url(https://evil.test/p.png)", ""), // #1
        ("URL(https://evil.test/p.png)", ""), // #2
        ("UrL( 'x' )", ""), // #3
        ("u\\72l(https://evil.test/p.png)", ""), // #4
        ("u/**/rl(https://evil.test/p.png)", ""), // #5
        ("u;rl(https://evil.test/p.png)", ""), // #6
        ("u\trl(https://evil.test/p.png)", ""), // #7
        ("red//**", "red"), // #8
        ("@import url(x.css)", ""), // #9
        ("@import \"x.css\"", ""), // #10
        ("expression(alert(1))", ""), // #11
        ("ExPrEsSiOn(1)", ""), // #12
        ("expr/**/ession(1)", ""), // #13
        ("behavior:url(x.htc)", ""), // #14
        ("behavior : x", ""), // #15
        ("image-set(\"a.png\" 1x)", ""), // #16
        ("-webkit-image-set(\"a.png\" 1x)", ""), // #17
        ("javascript:alert(1)", ""), // #18
        ("JaVaScRiPt:alert(1)", ""), // #19
        ("-moz-binding:x", ""), // #20
        ("vbscript:x", ""), // #21
        ("linear-gradient(#fff, #000)", ""), // #22
        ("radial-gradient(#fff, #000)", ""), // #23
        ("&#117;rl(x)", "&#117rl(x)"), // #24
        ("ur l(x)", "ur l(x)"), // #25
        ("rgb(0 0 0 / 50%)", "rgb(0 0 0 / 50%)"), // #26
        ("rgba(15, 23, 42, 0.5)", "rgba(15, 23, 42, 0.5)"), // #27
        ("#0EA5E9", "#0EA5E9"), // #28
        ("transparent", "transparent"), // #29
        ("currentColor", "currentColor"), // #30
        ("calc(100% - 16px)", "calc(100% - 16px)"), // #31
        ("min(100%, 600px)", "min(100%, 600px)"), // #32
        ("clamp(1rem, 2vw, 2rem)", "clamp(1rem, 2vw, 2rem)"), // #33
        ("\"Noto Sans Thai\", ui-sans-serif, system-ui", "\"Noto Sans Thai\", ui-sans-serif, system-ui"), // #34
        ("\"Curl Sans\", sans-serif", "\"Curl Sans\", sans-serif"), // #35
        ("var(--x)", "var(--x)"), // #36
        ("  red  ", "red"), // #37
        ("red;}</style><script>", "red/stylescript"), // #38
        ("red/*x*/", "redx"), // #39
    ];
    for (i, (input, expected)) in cases.iter().enumerate() {
        assert_eq!(css_safe(input), *expected, "css_safe case #{} input {:?}", i + 1, input);
    }
}

fn doc(children: &[(&str, &str)]) -> String {
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

const BLOCKED: [&str; 7] = ["url(", "image-set(", "expression(", "@import", "javascript:", "behavior", "gradient("];

fn preview() -> CompileOptions {
    CompileOptions { preview: true, ..CompileOptions::default() }
}

fn assert_clean(css: &str, what: &str) {
    let lower = css.to_ascii_lowercase();
    for b in BLOCKED {
        assert!(!lower.contains(b), "{what}: CSS still contains {b:?}:\n{css}");
    }
}

#[test]
fn css_safe_hostile_document_compiles_clean_in_preview_and_export() {
    let hostile = [
        "url(https://evil.test/x.png)",
        "u/**/rl(https://evil.test/x.png)",
        "UrL( 'x' )",
        "u\\72l(x)",
        "image-set(\"a.png\" 1x)",
        "expression(alert(1))",
        "@import 'x.css'",
        "behavior : url(x.htc)",
        "linear-gradient(#fff,#000)",
        "javascript:alert(1)",
        "red//**",
    ];
    for h in hostile {
        let hj = h.replace('\\', "\\\\").replace('"', "\\\"");
        let node = format!(
            "\"t\":{{\"id\":\"t\",\"type\":\"text\",\"props\":{{\"type\":\"text\",\"content\":\"a\"}},\
             \"style\":{{\"backgroundColor\":\"{hj}\",\"color\":\"{hj}\",\"fontFamily\":\"{hj}\",\"lineHeight\":\"{hj}\",\"borderColor\":\"{hj}\"}},\
             \"styleBreakpoints\":{{\"tablet\":{{\"backgroundColor\":\"{hj}\"}},\"phone\":{{\"color\":\"{hj}\"}}}}}}"
        );
        let json = doc(&[("t", &node)]);
        let prev = compile_json(&json, &preview()).unwrap();
        assert_clean(style_of(&prev), &format!("preview {h:?}"));
        let v: Value = serde_json::from_str(&json).unwrap();
        let (html, css) = compile_export(&parse_document(&v).unwrap(), &CompileOptions::default()).unwrap();
        assert_clean(&css, &format!("export css {h:?}"));
        assert_clean(style_of(&html), &format!("export html {h:?}"));
    }
}

fn style_of(html: &str) -> &str {
    match (html.find("<style>"), html.find("</style>")) {
        (Some(a), Some(b)) => &html[a + 7..b],
        _ => "",
    }
}

#[test]
fn css_safe_keeps_legitimate_values_unchanged() {
    for v in ["#0f172a", "rgba(15, 23, 42, 0.5)", "var(--x)", "calc(100% - 16px)", "\"Noto Sans Thai\", system-ui", "url_like", "ur l(x)", "behaviors", "0.5"] {
        assert_eq!(css_safe(v), v);
    }
    // behavior is only denied when followed by a colon
    assert_eq!(css_safe("behavior"), "behavior");
    assert_eq!(css_safe("my-behavior x:y"), "my-behavior x:y");
    // any Unicode whitespace between `behavior` and `:` is treated as a space (stricter than CSS)
    assert_eq!(css_safe("behavior\u{a0}: x"), "");
}

#[test]
fn css_safe_never_creates_a_denied_token_from_nested_strips() {
    for v in ["u/*/**/*/rl(x)", "u/*/*x*/*/rl(x)", "ur/**/l(", "ur{l(x)", "ur}l(x)", "ur<l(x)", "ur>l(x)", "e/**/x/**/pression(1)", "@im/**/port", "java/**/script:1", "-moz-bin/**/ding:x", "b/**/ehavior:x", "gradi/*c*//**/ent(x)"] {
        let out = css_safe(v).to_ascii_lowercase();
        for b in ["url(", "expression(", "@import", "javascript:", "-moz-binding", "gradient("] {
            assert!(!out.contains(b), "{v:?} -> {out:?}");
        }
        assert!(!out.contains("/*") && !out.contains("*/"), "{v:?} -> {out:?}");
    }
}

// ---------------------------------------------------------------------------
// A1.3(b): fidelity goldens (export), rules G1–G6 and the per-row behaviours.
// ---------------------------------------------------------------------------

const ALL_KINDS_JSON: &str = include_str!("fixtures/a1/all-kinds.json");
const ALL_KINDS_HTML: &str = include_str!("fixtures/a1/all-kinds.index.html");
const ALL_KINDS_CSS: &str = include_str!("fixtures/a1/all-kinds.styles.css");

fn export_of(json: &str) -> (String, String) {
    let v: Value = serde_json::from_str(json).unwrap();
    compile_export(&parse_document(&v).unwrap(), &CompileOptions::default()).unwrap()
}

fn body_of(html: &str) -> &str {
    &html[html.find("<body>").unwrap()..]
}

/// One node on a page; returns (body inner HTML, CSS).
fn one(node_json: &str) -> (String, String) {
    let json = doc(&[("n", node_json)]);
    let (html, css) = export_of(&json);
    let b = body_of(&html);
    let inner = b
        .strip_prefix("<body><div class=\"t-page\"")
        // B0.1 item 3: the page root carries data-wb-page.
        .map(|x| x.split_once('>').map_or(x, |(attrs, rest)| if attrs.starts_with(" data-wb-page=") { rest } else { x }))
        .and_then(|x| x.strip_suffix("</div></body></html>\n"))
        .unwrap_or_else(|| panic!("unexpected body shape: {b}"))
        .to_string();
    (inner, css)
}

fn node(kind: &str, props: &str, style: &str, name: Option<&str>) -> String {
    let nm = name.map(|n| format!("\"name\":\"{n}\",")).unwrap_or_default();
    format!("\"n\":{{\"id\":\"n\",\"type\":\"{kind}\",{nm}\"props\":{{\"type\":\"{kind}\"{props}}},\"style\":{{{style}}}}}")
}

#[test]
fn a13_all_kinds_export_matches_goldens() {
    let (html, css) = export_of(ALL_KINDS_JSON);
    if std::env::var("A32_BLESS").is_ok() {
        // Phase 11 A3.2 re-bless (only the switch differs): `A32_BLESS=1 cargo test a13_all_kinds`.
        let d = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("src/fixtures/a1");
        std::fs::write(d.join("all-kinds.index.html"), &html).unwrap();
        std::fs::write(d.join("all-kinds.styles.css"), &css).unwrap();
        return;
    }
    assert_eq!(html, ALL_KINDS_HTML, "index.html golden changed");
    assert_eq!(css, ALL_KINDS_CSS, "styles.css golden changed");
}

#[test]
fn a13_all_kinds_is_deterministic_and_preview_body_equals_export_body() {
    let a = export_of(ALL_KINDS_JSON);
    let b = export_of(ALL_KINDS_JSON);
    assert_eq!(a, b, "two compiles of one document must be byte-identical (ids are counter-based)");
    let prev = compile_json(ALL_KINDS_JSON, &preview()).unwrap();
    // Preview only differs on links (inert, no href); everything else is shared.
    let norm = |s: &str| s.replace("<a class=\"t-link\" href=\"#\">", "<a class=\"t-link\" title=\"#\">");
    assert_eq!(body_of(&prev), norm(body_of(&a.0)), "Preview and export share one body");
}

#[test]
fn a13_negative_golden_grep_no_script_no_handlers_no_var_no_gradient_no_forbidden_roles() {
    let (html, css) = export_of(ALL_KINDS_JSON);
    let prev = compile_json(ALL_KINDS_JSON, &preview()).unwrap();
    for (what, text) in [("html", &html), ("css", &css), ("preview", &prev)] {
        let l = text.to_ascii_lowercase();
        for bad in ["<script", "javascript:", "url(", "var(", "gradient(", "!important", "aria-modal", "<iframe", "<object", "<embed"] {
            assert!(!l.contains(bad), "{what} contains {bad:?}");
        }
        // no inline event handler attributes
        let b = &l[l.find("<body").unwrap_or(0)..];
        for tag in b.split('<').skip(1) {
            let head = tag.split('>').next().unwrap();
            assert!(!head.split_whitespace().any(|a| a.starts_with("on") && a.contains('=')), "handler in <{head}>");
        }
    }
    for role in ["tab", "tablist", "tabpanel", "menubar", "menu", "menuitem"] {
        assert!(!html.contains(&format!("role=\"{role}\"")), "G6: role={role}");
    }
    // G5: every list-style:none list carries role=list
    assert_eq!(html.matches("<ol role=\"list\">").count() + html.matches("<ul role=\"list\">").count(), 3);
    assert_eq!(html.matches("<ol>").count() + html.matches("<ul>").count(), 0);
    // literal focus colour on every hand-built control (toggle, toggleGroup, radio, tabs, switch, otp)
    for t in ["t-switch input", "t-radio input", "t-toggle input", "t-toggleGroup input", "t-tabs>input", "t-inputOtp input"] {
        let at = css.find(&format!(".{t}:focus-visible")).unwrap_or_else(|| panic!("no focus-visible for {t}"));
        assert!(css[at..].starts_with(&css[at..at + css[at..].find('}').unwrap()]));
        assert!(css[at..at + css[at..].find('}').unwrap()].contains("outline:2px solid #0077c2"), "{t}");
    }
}

#[test]
fn a13_empty_title_or_body_omits_the_tag_g3() {
    let (h, _) = one(&node("empty", ",\"title\":\"\",\"message\":\"M\"", "", None));
    assert_eq!(h, "<div class=\"t-empty\"><p>M</p></div>");
    let (h, _) = one(&node("empty", ",\"title\":\"T\",\"message\":\"  \"", "", None));
    assert_eq!(h, "<div class=\"t-empty\"><h3>T</h3></div>");
    let (h, _) = one(&node("item", ",\"title\":\"\",\"description\":\"\"", "", None));
    assert_eq!(h, "<div class=\"t-item\"></div>");
    let (h, _) = one(&node("message", ",\"sender\":\"\",\"text\":\"hi\",\"align\":\"start\"", "", None));
    assert_eq!(h, "<div class=\"t-message\"><p>hi</p></div>");
    let (h, _) = one(&node("hoverCard", ",\"title\":\"\",\"text\":\"x\"", "", None));
    assert_eq!(h, "<div class=\"t-hoverCard\"><p>x</p></div>");
    let (h, _) = one(&node("popover", ",\"label\":\"L\",\"text\":\"\"", "", None));
    assert_eq!(h, "<details class=\"t-popover\"><summary>L</summary></details>");
    let (h, _) = one(&node("inputGroup", ",\"prefix\":\"\",\"placeholder\":\"p\",\"suffix\":\"kg\"", "", None));
    assert_eq!(h, "<div class=\"t-inputGroup\"><input type=\"text\" placeholder=\"p\"><span>kg</span></div>");
    let (h, _) = one(&node("collapsible", ",\"label\":\"L\",\"text\":\"\",\"open\":false", "", None));
    assert_eq!(h, "<details class=\"t-collapsible\"><summary>L</summary></details>");
    let (h, _) = one(&node("dropdownMenu", ",\"label\":\"M\",\"items\":[]", "", None));
    assert_eq!(h, "<details class=\"t-dropdownMenu\"><summary>M</summary></details>");
}

#[test]
fn a13_controls_without_visible_label_get_aria_label_from_the_layer_name_g4() {
    let named = |k: &str, props: &str| one(&node(k, props, "", Some("Qty <1>"))).0;
    assert!(named("select", ",\"value\":\"A\",\"options\":[\"A\"]").starts_with("<select class=\"t-select\" aria-label=\"Qty &lt;1&gt;\">"));
    assert!(named("slider", ",\"value\":5").contains(" aria-label=\"Qty &lt;1&gt;\">"));
    assert!(named("progress", ",\"value\":5").contains(" aria-label=\"Qty &lt;1&gt;\">"));
    assert!(named("radio", ",\"value\":\"A\",\"options\":[\"A\"]").starts_with("<div class=\"t-radio\" role=\"radiogroup\" aria-label=\"Qty &lt;1&gt;\">"));
    assert!(named("inputGroup", ",\"prefix\":\"\",\"placeholder\":\"\",\"suffix\":\"\"").contains("<input type=\"text\" placeholder=\"\" aria-label=\"Qty &lt;1&gt;\">"));
    assert!(named("inputOtp", ",\"length\":2,\"value\":\"\"").starts_with("<div class=\"t-inputOtp\" role=\"group\" aria-label=\"Qty &lt;1&gt;\">"));
    // empty / absent name → no attribute
    for nm in [None, Some(""), Some("  ")] {
        let h = one(&node("select", ",\"value\":\"A\",\"options\":[\"A\"]", "", nm)).0;
        assert!(h.starts_with("<select class=\"t-select\"><option"), "{h}");
        let h = one(&node("inputOtp", ",\"length\":1,\"value\":\"\"", "", nm)).0;
        assert!(h.starts_with("<div class=\"t-inputOtp\"><input"), "{h}");
    }
}

#[test]
fn a13_dialog_family_roles_and_closed_state() {
    let (h, _) = one(&node("dialog", ",\"title\":\"T\",\"message\":\"M\",\"open\":true", "", None));
    assert_eq!(h, "<div class=\"t-dialog\" role=\"dialog\" aria-label=\"T\"><h2>T</h2><p>M</p></div>");
    let (h, _) = one(&node("dialog", ",\"title\":\"\",\"message\":\"M\",\"open\":true", "", None));
    assert_eq!(h, "<div class=\"t-dialog\"><p>M</p></div>", "no role without a title");
    for k in ["dialog", "sheet", "drawer"] {
        let (h, _) = one(&node(k, ",\"title\":\"SECRET\",\"message\":\"M\",\"side\":\"right\",\"open\":false", "", None));
        assert_eq!(h, "", "{k} open:false emits nothing");
    }
    let (h, _) = one(&node("alertDialog", ",\"title\":\"T\",\"message\":\"M\",\"confirm\":\"OK\",\"cancel\":\"No\"", "", None));
    assert_eq!(h, "<div class=\"t-alertDialog\" role=\"alertdialog\" aria-label=\"T\"><h2>T</h2><p>M</p><div><button type=\"button\" class=\"ok\">OK</button><button type=\"button\" class=\"no\">No</button></div></div>");
    assert!(!h.contains("<span"), "alertDialog buttons stay buttons");
    let (h, _) = one(&node("alertDialog", ",\"title\":\"\",\"message\":\"\",\"confirm\":\"OK\",\"cancel\":\"\"", "", None));
    assert_eq!(h, "<div class=\"t-alertDialog\"><div><button type=\"button\" class=\"ok\">OK</button></div></div>");
    let (h, css) = one(&node("sheet", ",\"title\":\"T\",\"message\":\"\",\"side\":\"left\",\"open\":true", "", None));
    assert_eq!(h, "<div class=\"t-sheet\" data-side=\"left\" role=\"dialog\" aria-label=\"T\"><h2>T</h2></div>");
    assert!(css.contains(":where(.t-sheet[data-side=\"left\"]){border-right:1px solid #e2e8f0}"));
    assert!(css.contains(":where(.t-sheet[data-side=\"right\"]){border-left:1px solid #e2e8f0}"));
    assert!(css.contains(".t-sheet{display:block;margin:0px;padding:24px;"), "{css}");
    assert!(css.contains("border-radius:0px"), "{css}");
    let (h, css) = one(&node("drawer", ",\"title\":\"T\",\"message\":\"\",\"open\":true", "", None));
    assert!(h.contains("data-side=\"bottom\""), "{h}");
    assert!(css.contains(".t-drawer{display:block;margin:0px;padding:24px;"), "{css}");
    assert!(css.contains("border-radius:12px 12px 0px 0px"), "{css}");
    assert!(css.contains(":where(.t-drawer[data-side=\"bottom\"]){border-top:1px solid #e2e8f0}"), "{css}");
    let (h, _) = one(&node("sheet", ",\"title\":\"T\",\"message\":\"\",\"side\":\"top\",\"open\":true", "", None));
    assert!(h.contains("data-side=\"top\""), "{h}");
}

#[test]
fn a13_lists_breadcrumb_navigation_pagination() {
    let items = ",\"items\":[{\"label\":\"A\",\"href\":\"/x\"},{\"label\":\"B\",\"href\":\"\"},{\"label\":\"C\",\"href\":\"/y\"}]";
    let (h, _) = one(&node("breadcrumb", items, "", None));
    assert_eq!(h, "<nav class=\"t-breadcrumb\" aria-label=\"breadcrumb\"><ol role=\"list\"><li><a href=\"/x\">A</a></li><li><span>B</span></li><li><span aria-current=\"page\">C</span></li></ol></nav>");
    let (h, _) = one(&node("navigationMenu", items, "", None));
    assert_eq!(h, "<nav class=\"t-navigationMenu\" aria-label=\"navigation\"><ul role=\"list\"><li><a href=\"/x\">A</a></li><li><span>B</span></li><li><a href=\"/y\">C</a></li></ul></nav>");
    let (h, _) = one(&node("breadcrumb", ",\"items\":[]", "", None));
    assert_eq!(h, "<nav class=\"t-breadcrumb\" aria-label=\"breadcrumb\"></nav>");
    // hostile hrefs go through safe_href exactly like links
    let (h, _) = one(&node("navigationMenu", ",\"items\":[{\"label\":\"J\",\"href\":\"javascript:alert(1)\"}]", "", None));
    assert!(!h.to_ascii_lowercase().contains("javascript:"), "{h}");
    // Legacy string items still load (href "").
    let (h, css) = one(&node("pagination", ",\"active\":1,\"items\":[\"1\",\"2\"]", "", None));
    assert_eq!(h, "<nav class=\"t-pagination\" aria-label=\"pagination\"><ul role=\"list\"><li><span>1</span></li><li><span aria-current=\"page\">2</span></li></ul></nav>");
    assert!(css.contains("min-width:36px;min-height:36px"));
    assert!(css.contains(".t-pagination [aria-current=\"page\"]{border-color:#e2e8f0}"));
    let (h, _) = one(&node(
        "pagination",
        ",\"active\":0,\"items\":[{\"label\":\"1\",\"href\":\"/a\"},{\"label\":\"2\",\"href\":\"\"}]",
        "",
        None,
    ));
    assert_eq!(
        h,
        "<nav class=\"t-pagination\" aria-label=\"pagination\"><ul role=\"list\"><li><a href=\"/a\" aria-current=\"page\">1</a></li><li><span>2</span></li></ul></nav>"
    );
}

#[test]
fn a13_tabs_use_unique_counter_ids_and_no_tab_roles() {
    let tabs = |id: &str| format!("\"{id}\":{{\"id\":\"{id}\",\"type\":\"tabs\",\"props\":{{\"type\":\"tabs\",\"active\":1,\"items\":[{{\"label\":\"A\",\"text\":\"a\"}},{{\"label\":\"B\",\"text\":\"b\"}}]}},\"style\":{{}}}}");
    let (t1, t2) = (tabs("t1"), tabs("t2"));
    let (html, css) = export_of(&doc(&[("t1", &t1), ("t2", &t2)]));
    let b = body_of(&html);
    assert!(b.contains("<input type=\"radio\" name=\"t1\" id=\"tab1-0\"><label for=\"tab1-0\">A</label><input type=\"radio\" name=\"t1\" id=\"tab1-1\" checked=\"checked\"><label for=\"tab1-1\">B</label><div class=\"p6panel\" id=\"tab1-p0\">a</div><div class=\"p6panel\" id=\"tab1-p1\">b</div>"), "{b}");
    assert!(b.contains("id=\"tab2-0\"") && b.contains("id=\"tab2-p1\""), "{b}");
    for (i, n) in [(0, 1), (1, 1), (0, 2), (1, 2)] {
        assert!(css.contains(&format!("#tab{n}-{i}:checked~#tab{n}-p{i}{{display:block}}")), "{css}");
    }
    assert!(css.contains(".t-tabs>.p6panel{display:none;flex-basis:100%}"));
    assert!(!css.contains(".t-tabs input:checked~.p6panel"), "old rule is gone");
    assert!(!b.contains("role=\"tab"), "{b}");
    // an out-of-range active falls back to the first tab
    let (h, _) = one(&node("tabs", ",\"active\":9,\"items\":[{\"label\":\"A\",\"text\":\"a\"}]", "", None));
    assert!(h.contains("id=\"tab1-0\" checked=\"checked\""), "{h}");
}

#[test]
fn a13_tooltip_toggle_toggle_group_menubar_and_select() {
    let (h, css) = one(&node("tooltip", ",\"label\":\"L\",\"tip\":\"T\"", "", None));
    assert_eq!(h, "<div class=\"t-tooltip\"><span aria-describedby=\"tip1\">L</span><span role=\"tooltip\" id=\"tip1\">T</span></div>");
    assert!(!h.contains("title="));
    assert!(css.contains(".t-tooltip>[role=\"tooltip\"]{width:fit-content;padding:6px 10px 6px 10px;border-radius:6px;background-color:#0f172a;color:#ffffff;font-size:13px"), "{css}");
    let (h, _) = one(&node("tooltip", ",\"label\":\"L\",\"tip\":\"\"", "", None));
    assert_eq!(h, "<div class=\"t-tooltip\"><span>L</span></div>");
    let (h, _) = one(&node("toggle", ",\"label\":\"B\",\"pressed\":true", "", None));
    assert_eq!(h, "<label class=\"t-toggle\"><input type=\"checkbox\" checked=\"checked\"><span>B</span></label>");
    let (h, _) = one(&node("toggleGroup", ",\"active\":0,\"items\":[\"A\",\"B\"]", "", None));
    assert_eq!(h, "<div class=\"t-toggleGroup\" role=\"radiogroup\"><label><input type=\"radio\" name=\"n\" checked=\"checked\"><span>A</span></label><label><input type=\"radio\" name=\"n\"><span>B</span></label></div>");
    // Legacy `{label,text}` still loads: text becomes one inert item.
    let (h, _) = one(&node("menubar", ",\"items\":[{\"label\":\"File\",\"text\":\"x\"},{\"label\":\"Edit\",\"text\":\"\"}]", "", None));
    assert_eq!(h, "<div class=\"t-menubar\"><details><summary>File</summary><div><span>x</span></div></details><details><summary>Edit</summary></details></div>");
    // Nested menus + href (shadcn MenubarItem-as-link shape).
    let (h2, _) = one(&node(
        "menubar",
        ",\"items\":[{\"label\":\"File\",\"items\":[{\"label\":\"Home\",\"href\":\"/\"},{\"label\":\"New\",\"href\":\"\"}]}]",
        "",
        None,
    ));
    assert_eq!(
        h2,
        "<div class=\"t-menubar\"><details><summary>File</summary><div><a href=\"/\">Home</a><span>New</span></div></details></div>"
    );
    let (h, _) = one(&node("dropdownMenu", ",\"label\":\"M\",\"items\":[\"One\"]", "", None));
    assert_eq!(h, "<details class=\"t-dropdownMenu\"><summary>M</summary><div><div>One</div></div></details>");
    let (_, css) = one(&node("select", ",\"value\":\"\",\"options\":[]", "", None));
    assert!(css.contains("width:100%;border:1px solid #64748b;border-radius:8px;background-color:#ffffff;font-family:inherit;-webkit-appearance:auto;appearance:auto}"), "{css}");
    let (_, css) = one(&node("avatar", ",\"src\":{\"id\":\"\"},\"fallback\":\"A\"", "", None));
    assert!(css.contains("display:flex;") && css.contains("align-items:center;justify-content:center;object-fit:cover}"), "{css}");
    assert!(!css.contains("inline-flex"), "avatar is block-level");
    let (_, css) = one(&node("progress", ",\"value\":1", "", None));
    for needle in [
        "appearance:none", "height:8px", "border-radius:999px", "overflow:hidden", "background-color:#e2e8f0",
        "::-webkit-progress-bar{background-color:#e2e8f0", "::-webkit-progress-value{background-color:#0f172a", "::-moz-progress-bar{background-color:#0f172a",
    ] {
        assert!(css.contains(needle), "{needle}");
    }
    let (_, css) = one(&node("slider", ",\"value\":1", "", None));
    assert!(css.contains("accent-color:#0f172a"));
}

#[test]
fn a13_bubble_and_message_alignment_is_margin_left_auto_only() {
    for (k, props) in [("bubble", ",\"text\":\"hi\",\"align\":\"end\""), ("message", ",\"sender\":\"S\",\"text\":\"hi\",\"align\":\"end\"")] {
        let (_, css) = one(&node(k, props, "", None));
        assert!(css.contains(".n1{margin-left:auto}"), "{k}: {css}");
        assert!(!css.contains("text-align:right"), "{k}: {css}");
        let (_, css) = one(&node(k, &props.replace("\"end\"", "\"start\""), "", None));
        assert!(!css.contains(".n1{"), "{k}: start emits no node rule");
    }
    let (h, _) = one(&node("message", ",\"sender\":\"S\",\"text\":\"hi\",\"align\":\"start\"", "", None));
    assert_eq!(h, "<div class=\"t-message\"><strong>S</strong><p>hi</p></div>");
    assert!(!h.contains("<h3"));
}

#[test]
fn a13_explicit_style_wins_over_type_extras_g1() {
    // equals the plain default (padding 0) but differs from the dialog extra (24) → must be emitted
    let (_, css) = one(&node("dialog", ",\"title\":\"T\",\"message\":\"\",\"open\":true", "\"padding\":0", None));
    assert!(css.contains(".n1{padding:0px}"), "{css}");
    // equals the extra → nothing to emit
    let (_, css) = one(&node("dialog", ",\"title\":\"T\",\"message\":\"\",\"open\":true", "\"padding\":24", None));
    assert!(!css.contains(".n1{"), "{css}");
    // a different value is emitted, after the type rule
    let (_, css) = one(&node("avatar", ",\"src\":{\"id\":\"\"},\"fallback\":\"A\"", "\"display\":\"block\"", None));
    assert!(css.contains(".n1{display:block}"), "{css}");
    assert!(css.find(".t-avatar{").unwrap() < css.find(".n1{").unwrap());
    // bubble: explicit background replaces the look
    let (_, css) = one(&node("bubble", ",\"text\":\"x\",\"align\":\"start\"", "\"backgroundColor\":\"#fef3c7\"", None));
    assert!(css.contains(".n1{background-color:#fef3c7}"), "{css}");
    // a type WITHOUT extras is untouched by the new diff (container-free control: marker)
    let (_, css) = one(&node("marker", ",\"text\":\"x\"", "\"padding\":0", None));
    assert!(!css.contains(".n1{"), "{css}");
}

#[test]
fn a13_breakpoint_override_still_wins_over_extras() {
    let n = "\"n\":{\"id\":\"n\",\"type\":\"empty\",\"props\":{\"type\":\"empty\",\"title\":\"T\",\"message\":\"M\"},\"style\":{},\"styleBreakpoints\":{\"phone\":{\"padding\":8}}}";
    let (_, css) = one(n);
    assert!(css.contains("@media (max-width:719px){[data-wb-page=\"home\"] [data-wb-id=\"n\"]{padding:8px}}"), "{css}");
}

// ---- A1.3b: Designer fixes 1-6 ------------------------------------------

#[test]
fn a15_toggle_group_aria_label_escapes_angle_quote_and_keeps_thai() {
    let props = ",\"active\":0,\"items\":[\"A\",\"B\"]";
    // name = a<b "q" มุมมอง  (the quote is JSON-escaped in the input)
    let (h, _) = one(&node("toggleGroup", props, "", Some("a<b \\\"q\\\" มุมมอง")));
    assert!(h.contains("aria-label=\"a&lt;b &quot;q&quot; มุมมอง\""), "{h}");
    assert!(!h.contains("a<b"), "raw `<` leaked: {h}");
    // the attribute is still one attribute: exactly one `aria-label=` and the tag closes
    assert_eq!(h.matches("aria-label=").count(), 1, "{h}");
}

#[test]
fn a15_css_safe_documented_rejections_unquoted_apostrophe_and_quoted_url() {
    // an unquoted apostrophe opens a quote that never closes -> rejected, never repaired
    assert_eq!(css_safe("Mak's Sans"), "");
    // a properly quoted family name is fine
    assert_eq!(css_safe("\"Mak's Sans\", sans-serif"), "\"Mak's Sans\", sans-serif");
    // `url(` is denied even inside quotes: the check is on the text, not the CSS token
    assert_eq!(css_safe("\"url(x)\""), "");
    assert_eq!(css_safe("'url(x)'"), "");
}

#[test]
fn a13b_toggle_group_radiogroup_gets_aria_label_from_name() {
    let props = ",\"active\":0,\"items\":[\"A\",\"B\"]";
    let (h, _) = one(&node("toggleGroup", props, "", Some("View mode")));
    assert!(h.starts_with("<div class=\"t-toggleGroup\" role=\"radiogroup\" aria-label=\"View mode\">"), "{h}");
    // unnamed or blank name: no aria-label (the role stays)
    for nm in [None, Some(""), Some("   ")] {
        let (h, _) = one(&node("toggleGroup", props, "", nm));
        assert!(h.starts_with("<div class=\"t-toggleGroup\" role=\"radiogroup\">"), "{nm:?}: {h}");
        assert!(!h.contains("aria-label"), "{nm:?}: {h}");
    }
    // quotes in the name are escaped
    let (h, _) = one(&node("toggleGroup", props, "", Some("a&b")));
    assert!(h.contains("aria-label=\"a&amp;b\""), "{h}");
    // tabs have no role, so even a named tabs node gets no aria-label
    let (h, _) = one(&node("tabs", ",\"active\":0,\"items\":[{\"label\":\"A\",\"text\":\"a\"}]", "", Some("Settings")));
    assert!(!h.contains("aria-label") && !h.contains("role="), "{h}");
}

#[test]
fn a13b_bubble_message_align_end_margin_is_g1() {
    for (k, props) in [("bubble", ",\"text\":\"hi\",\"align\":\"end\""), ("message", ",\"sender\":\"S\",\"text\":\"hi\",\"align\":\"end\"")] {
        // explicit margin (10, and 0) wins: no margin-left:auto at all
        let (_, css) = one(&node(k, props, "\"margin\":10", None));
        assert!(css.contains(".n1{margin:10px}"), "{k}: {css}");
        assert!(!css.contains("margin-left:auto"), "{k}: {css}");
        let (_, css) = one(&node(k, props, "\"margin\":0", None));
        // margin 0 equals the type rule's own `margin:0px`, so no node rule is needed; the point
        // is that no margin-left:auto appears and the type rule keeps margin 0
        assert!(!css.contains("margin-left:auto"), "{k}: {css}");
        assert!(css.contains(&format!(".t-{k}{{display:block;margin:0px;")), "{k}: {css}");
        // no margin: margin-left:auto only
        let (_, css) = one(&node(k, props, "", None));
        assert!(css.contains(".n1{margin-left:auto}"), "{k}: {css}");
        // another explicit key does not drop the auto margin
        let (_, css) = one(&node(k, props, "\"backgroundColor\":\"#fef3c7\"", None));
        assert!(css.contains("margin-left:auto") && css.contains("background-color:#fef3c7"), "{k}: {css}");
    }
}

#[test]
fn a13b_sheet_and_drawer_borders_are_overridable_and_only_one_side() {
    let sheet = |side: &str, style: &str| node("sheet", &format!(",\"title\":\"T\",\"message\":\"\",\"side\":\"{side}\",\"open\":true"), style, None);
    let (_, css) = one(&sheet("right", "\"borderWidth\":4"));
    // facing side: zero specificity (so `.n1` wins); others: forced none at two classes
    assert!(css.contains(":where(.t-sheet[data-side=\"right\"]){border-left:1px solid #e2e8f0}"), "{css}");
    assert!(css.contains(".t-sheet[data-side=\"right\"]{border-top-style:none;border-right-style:none;border-bottom-style:none}"), "{css}");
    assert!(css.contains(".n1{border-width:4px}"), "{css}");
    assert!(css.find(":where(.t-sheet").unwrap() < css.find(".n1{").unwrap(), "node rule comes after the type rules");
    assert!(!css.contains(".t-sheet[data-side=\"right\"]{border-left"), "the facing side must not be set at 2 classes: {css}");
    // left sheet mirrors it
    let (_, css) = one(&sheet("left", "\"borderWidth\":4"));
    assert!(css.contains(":where(.t-sheet[data-side=\"left\"]){border-right:1px solid #e2e8f0}"), "{css}");
    assert!(css.contains(".t-sheet[data-side=\"left\"]{border-top-style:none;border-left-style:none;border-bottom-style:none}"), "{css}");
    // a custom colour (and style) reaches the node rule, which outranks the facing side
    let (_, css) = one(&sheet("right", "\"borderColor\":\"#ff0000\",\"borderStyle\":\"dashed\""));
    assert!(css.contains(".n1{border-color:#ff0000;border-style:dashed}") || (css.contains("border-color:#ff0000") && css.contains("border-style:dashed")), "{css}");
    // drawer default bottom: only border-top, same scheme as sheet
    let (_, css) = one(&node("drawer", ",\"title\":\"T\",\"message\":\"\",\"open\":true", "\"borderWidth\":4,\"borderColor\":\"#00ff00\"", None));
    assert!(css.contains(":where(.t-drawer[data-side=\"bottom\"]){border-top:1px solid #e2e8f0}"), "{css}");
    assert!(css.contains(".t-drawer[data-side=\"bottom\"]{border-right-style:none;border-bottom-style:none;border-left-style:none}"), "{css}");
    assert!(css.contains("border-width:4px") && css.contains("border-color:#00ff00"), "{css}");
    assert!(!css.contains(".t-drawer{display:block;margin:0px;padding:24px;color:#0f172a;font-size:16px;font-weight:400;border-top"), "border-top moved out of the 1-class rule: {css}");
    // no `!important`, `var(`, gradient or url( introduced
    assert!(!css.contains("!important") && !css.contains("var(") && !css.contains("url("), "{css}");
}

#[test]
fn a13b_input_otp_wraps() {
    let (_, css) = one(&node("inputOtp", ",\"length\":12,\"value\":\"\"", "", None));
    assert!(css.contains(".t-inputOtp{display:flex;"), "{css}");
    assert!(css.contains("flex-wrap:wrap"), "{css}");
}

#[test]
fn a13b_tabs_active_out_of_range_falls_back_to_first() {
    let (h, css) = one(&node("tabs", ",\"active\":9,\"items\":[{\"label\":\"A\",\"text\":\"a\"},{\"label\":\"B\",\"text\":\"b\"}]", "", None));
    assert!(h.contains("id=\"tab1-0\" checked=\"checked\""), "{h}");
    assert!(!h.contains("id=\"tab1-1\" checked"), "{h}");
    assert!(css.contains("#tab1-0:checked~#tab1-p0{display:block}"), "{css}");
}

#[test]
fn css_safe_rejects_unbalanced_quotes_and_parens() {
    for bad in [
        "\" or rgb(", "'x", "\"x", "rgb(0 0 0", "((1)", "rgb(0 0 0))", ")", "(", "calc(1px + (2px)",
        "red \"", "a'b", "\"a\" 'b", "rgb(\"x)", "\"(\" )",
    ] {
        assert_eq!(css_safe(bad), "", "{bad:?} must be rejected");
    }
    for ok in [
        "rgb(0 0 0 / 50%)", "calc(100% - (2 * 8px))", "\"Noto Sans Thai\", system-ui", "'Segoe UI', sans-serif",
        "\"a(b\"", "'a)b'", "\"it's\"", "'say \"hi\"'", "min(100%, clamp(1rem, 2vw, 2rem))", "var(--x, rgb(1 2 3))", "",
    ] {
        assert_eq!(css_safe(ok), ok, "{ok:?} must be kept");
    }
    // in a document: a hostile value drops only its own declaration; the block stays valid
    let node = "\"t\":{\"id\":\"t\",\"type\":\"text\",\"props\":{\"type\":\"text\",\"content\":\"a\"},\"style\":{\"color\":\"\\\" or rgb(\",\"backgroundColor\":\"#fef3c7\"}}";
    let (_, css) = export_of(&doc(&[("t", node)]));
    assert!(css.contains(".n1{background-color:#fef3c7}"), "{css}");
    assert!(!css.contains("rgb("), "{css}");
}

/// Reference: the old repeated-`replace` algorithm (quadratic on nested input).
fn old_comment_strip(s: &str) -> String {
    let mut t: String = s
        .chars()
        .filter(|c| !matches!(c, '{' | '}' | ';' | '<' | '>') && !c.is_control())
        .collect();
    while t.contains("/*") || t.contains("*/") {
        t = t.replace("/*", "").replace("*/", "");
    }
    t
}

#[test]
fn css_safe_comment_removal_is_linear_and_equivalent() {
    use std::time::Instant;
    let n = 200_000;
    let shapes: [(&str, String); 4] = [
        ("slashes then stars", format!("{}{}", "/".repeat(n), "*".repeat(n))),
        ("nested /*..*/ x n", format!("{}{}{}", "/*".repeat(n), "/**/", "*/".repeat(n))),
        ("literal /*/**/*/ x n", "/*/**/*/".repeat(n)),
        ("stars then slashes", format!("{}{}", "*".repeat(n), "/".repeat(n))),
    ];
    for (name, input) in shapes {
        let t0 = Instant::now();
        let out = css_safe(&input);
        let dt = t0.elapsed();
        assert!(dt.as_secs_f64() < 1.0, "{name}: {n} pairs took {dt:?}");
        assert!(!out.contains("/*") && !out.contains("*/"), "{name}");
        eprintln!("css_safe {name}: {n} pairs in {dt:?}");
    }
    // a long nested value that hides a token still gets rejected
    let hidden = format!("u{}rl(x)", "/*".repeat(n));
    assert_eq!(css_safe(&hidden), "");
    // equivalence with the old algorithm on every string up to length 9 over / * a x
    let alphabet = ['/', '*', 'a', ' '];
    let mut count = 0u32;
    for len in 0..=9u32 {
        for code in 0..4u64.pow(len) {
            let mut c = code;
            let mut s = String::new();
            for _ in 0..len {
                s.push(alphabet[(c % 4) as usize]);
                c /= 4;
            }
            let old = old_comment_strip(&s);
            // the real css_safe (this alphabet never hits the deny / balance steps, so it is the strip + trim)
            let new = css_safe(&s);
            let old = old.trim().to_string();
            assert_eq!(old, new, "differs on {s:?}");
            count += 1;
        }
    }
    eprintln!("old vs linear comment removal identical on {count} strings");
}

// NOTE (PM, FOLLOWUPS.md): the sheet / drawer border tests above and in a14_* match EXACT CSS strings.
// They prove which declarations are emitted, not that the facing-side rule still wins on specificity
// (a regression to a lower-specificity selector would keep every string and still change the page).
// A browser-level check is the only thing that catches that.

/* ---- PHASE-11 A1.4: shared look constants (src/lib/kind-looks.json) ---- */

fn looks_json() -> serde_json::Value {
    serde_json::from_str(KIND_LOOKS_JSON).expect("kind-looks.json is valid JSON")
}

#[test]
fn a14_kind_looks_json_loads_and_every_token_is_expanded() {
    let l = kind_looks();
    // 30 kinds (every Phase 6b kind with a look, plus link, spacer); container is built from defaults.rs.
    // Phase 11 A3.2: switch moved to `a3.kinds` (track + thumb), so 31 -> 30.
    assert_eq!(l.kinds.len(), 30, "kinds in kind-looks.json: {:?}", l.kinds.keys().collect::<Vec<_>>());
    assert!(!l.kinds.contains_key("container"));
    for (name, k) in &l.kinds {
        assert!(!k.css.contains("{{") && !k.css.contains("}}}"), "{name}: unexpanded token in css: {}", k.css);
        for (key, v) in &k.extras {
            assert!(!v.contains("{{"), "{name}: unexpanded token in {key}: {v}");
            assert!(!v.contains("var(") && !v.contains("!important") && !v.contains("gradient(") && !v.contains("url("), "{name}.{key}: {v}");
        }
        assert!(!k.css.contains("var(") && !k.css.contains("!important") && !k.css.contains("gradient(") && !k.css.contains("url("), "{name}");
    }
    // the palette is the only place a colour literal lives
    let j = looks_json();
    let raw = serde_json::to_string(&j["kinds"]).unwrap();
    assert!(!raw.contains('#'), "a hex literal outside the palette: {raw}");
    assert_eq!(j["palette"]["muted"], "#64748b");
    assert_eq!(expand_tokens("{{muted}} {{nope}} x", &HashMap::from([("muted".to_string(), "#64748b".to_string())])), "#64748b {{nope}} x");
}

#[test]
fn a14_every_type_rule_in_the_export_is_built_from_the_shared_file() {
    let (_, css) = export_of(ALL_KINDS_JSON);
    let mut checked = 0;
    for (name, k) in &kind_looks().kinds {
        // the descendant rules appear verbatim, in order
        assert!(css.contains(k.css.as_str()), "{name}: css rules from kind-looks.json not in the export");
        // every extras declaration appears in the `.t-x{...}` rule (or in a facing-border rule for sheet / drawer)
        // spacer has no `.t-spacer` type rule in the export (per-node class; width is forced by the canvas only)
        if k.extras.is_empty() || *name == "spacer" { continue; }
        let start = css.find(&format!(".t-{name}{{")).unwrap_or_else(|| panic!(".t-{name} rule missing"));
        let end = start + css[start..].find('}').unwrap();
        let rule = &css[start..end];
        for (key, v) in &k.extras {
            assert!(rule.contains(&format!("{key}:{v}")), "{name}: `{key}:{v}` missing from {rule}");
            checked += 1;
        }
    }
    assert!(checked > 60, "checked {checked} extras");
}

#[test]
fn a14_designer_numbers_come_from_the_shared_constants() {
    let (_, css) = export_of(ALL_KINDS_JSON);
    // avatar 40px flex-centred
    assert!(css.contains(".t-avatar{display:flex;width:40px;height:40px;"), "{css}");
    assert!(css.contains("align-items:center;justify-content:center"), "{css}");
    // bubble / message: max-width 80%, radius 16, fit-content
    for k in ["bubble", "message"] {
        let ex = &kind_looks().kinds[k].extras;
        for want in [("max-width", "80%"), ("border-radius", "16px"), ("width", "fit-content")] {
            assert!(ex.iter().any(|(a, b)| *a == want.0 && b == want.1), "{k}: {want:?} not in {ex:?}");
        }
    }
    // OTP boxes 40px, gap 8, wrapping
    assert!(kind_looks().kinds["inputOtp"].css.contains(".t-inputOtp input{width:40px;height:40px;"));
    assert!(kind_looks().kinds["inputOtp"].extras.contains(&("gap", "8px".to_string())));
    assert!(kind_looks().kinds["inputOtp"].extras.contains(&("flex-wrap", "wrap".to_string())));
    // menubar padding 4 / gap 4
    let m = &kind_looks().kinds["menubar"].extras;
    assert!(m.contains(&("padding", "4px".to_string())) && m.contains(&("gap", "4px".to_string())), "{m:?}");
    // item 12/16, panels 24 / 16
    assert!(kind_looks().kinds["item"].extras.contains(&("padding", "12px 16px 12px 16px".to_string())));
    for k in ["empty", "dialog", "alertDialog", "sheet", "drawer"] {
        assert!(kind_looks().kinds[k].extras.contains(&("padding", "24px".to_string())), "{k}");
    }
    for k in ["popover"] {
        assert!(kind_looks().kinds[k].css.contains("padding:16px"), "{k}");
    }
    assert!(kind_looks().kinds["hoverCard"].extras.contains(&("padding", "16px".to_string())));
    // muted text colour is the one palette entry everywhere it is used
    assert!(css.contains("color:#64748b"));
    assert_eq!(looks_json()["palette"]["muted"], "#64748b");
}

#[test]
fn a14_sheet_and_drawer_facing_border_is_the_shared_facing_meta() {
    let l = kind_looks();
    assert_eq!(l.facing_border, "1px solid #e2e8f0");
    assert_eq!(l.facing["sheet:right"], "left");
    assert_eq!(l.facing["sheet:left"], "right");
    assert_eq!(l.facing["drawer"], "top");
    assert_eq!(l.facing["drawer:bottom"], "top");
    let sheet = &l.kinds["sheet"].css;
    assert!(sheet.contains(&format!(":where(.t-sheet[data-side=\"right\"]){{border-left:{}}}", l.facing_border)), "{sheet}");
    assert!(sheet.contains(&format!(":where(.t-sheet[data-side=\"left\"]){{border-right:{}}}", l.facing_border)), "{sheet}");
    let drawer = &l.kinds["drawer"].css;
    assert!(drawer.contains(&format!(":where(.t-drawer[data-side=\"bottom\"]){{border-top:{}}}", l.facing_border)), "{drawer}");
    // the other three sides are forced to none in the same shared rules
    assert!(sheet.contains("border-top-style:none;border-right-style:none;border-bottom-style:none"));
    assert!(drawer.contains("border-right-style:none;border-bottom-style:none;border-left-style:none"));
}

#[test]
fn a14_dropdown_and_popover_with_an_empty_label_fall_back_to_the_layer_name() {
    let dd = |label: &str, name: Option<&str>| {
        one(&node("dropdownMenu", &format!(",\"label\":\"{label}\",\"items\":[\"A\"]"), "", name)).0
    };
    assert!(dd("", Some("Account")).contains("<summary>Account</summary>"), "{}", dd("", Some("Account")));
    assert!(dd("  ", Some(" Account ")).contains("<summary>Account</summary>"));
    // a label always wins; no name and no label stays empty (no invented text)
    assert!(dd("Menu", Some("Account")).contains("<summary>Menu</summary>"));
    assert!(dd("", None).contains("<summary></summary>"));
    assert!(dd("", Some("  ")).contains("<summary></summary>") || dd("", Some("  ")).contains("<summary>"));
    // escaped
    assert!(dd("", Some("a&b")).contains("<summary>a&amp;b</summary>"));
    let (h, _) = one(&node("popover", ",\"label\":\"\",\"text\":\"Note\"", "", Some("Info")));
    assert!(h.contains("<summary>Info</summary>"), "{h}");
    let (h, _) = one(&node("popover", ",\"label\":\"Open\",\"text\":\"Note\"", "", Some("Info")));
    assert!(h.contains("<summary>Open</summary>"), "{h}");
}

// ---- A1.4c: a malformed kind-looks file must fail a test, never fall back silently ----
//
// `kind_looks()` keeps `unwrap_or(empty)` only as a defensive default for a build that
// cannot parse its own embedded file. These tests prove that the embedded file parses
// (so the default is never what runs) and that the parser rejects every damaged shape.

fn without(path: &[&str]) -> String {
    let mut v = looks_json();
    let (last, parents) = path.split_last().unwrap();
    let mut cur = &mut v;
    for p in parents {
        cur = cur.get_mut(*p).unwrap_or_else(|| panic!("no {p}"));
    }
    cur.as_object_mut().unwrap().remove(*last).unwrap_or_else(|| panic!("no {last}"));
    v.to_string()
}

fn with(path: &[&str], val: serde_json::Value) -> String {
    let mut v = looks_json();
    let (last, parents) = path.split_last().unwrap();
    let mut cur = &mut v;
    for p in parents {
        cur = cur.get_mut(*p).unwrap_or_else(|| panic!("no {p}"));
    }
    cur.as_object_mut().unwrap().insert((*last).to_string(), val);
    v.to_string()
}

#[test]
fn a14c_embedded_kind_looks_parse_without_the_defensive_default() {
    let parsed = parse_kind_looks(KIND_LOOKS_JSON).expect("the embedded kind-looks.json must parse");
    assert_eq!(parsed.kinds.len(), 30); // A3.2: switch moved to a3.kinds
    assert_eq!(parsed.kinds.len(), kind_looks().kinds.len(), "kind_looks() is not the parsed file");
    assert!(!parsed.facing_border.is_empty());
    assert_eq!(parsed.facing.len(), 9); // sheet×4 + drawer×4 + legacy "drawer"
    // the parser must not drop a palette / facing entry silently (filter_map would)
    let j = looks_json();
    assert!(j["palette"].as_object().unwrap().values().all(|x| x.is_string()));
    assert!(j["facing"].as_object().unwrap().values().all(|x| x.is_string()));
    // every kind in the file ends up in the parsed table
    for name in j["kinds"].as_object().unwrap().keys() {
        assert!(parsed.kinds.contains_key(name.as_str()), "{name} lost by the parser");
    }
}

#[test]
fn a14c_malformed_or_incomplete_kind_looks_are_detected() {
    // not JSON / wrong top-level type
    assert!(parse_kind_looks("").is_none());
    assert!(parse_kind_looks("{").is_none());
    assert!(parse_kind_looks("[]").is_none());
    assert!(parse_kind_looks("null").is_none());
    // each required top-level key
    for k in ["palette", "kinds", "facing", "facingBorder"] {
        assert!(parse_kind_looks(&without(&[k])).is_none(), "missing {k} was accepted");
    }
    // each required key of a kind, and wrong shapes
    assert!(parse_kind_looks(&without(&["kinds", "select", "extras"])).is_none());
    assert!(parse_kind_looks(&without(&["kinds", "select", "css"])).is_none());
    assert!(parse_kind_looks(&with(&["kinds", "select", "extras"], serde_json::json!({}))).is_none());
    assert!(parse_kind_looks(&with(&["kinds", "select", "extras"], serde_json::json!([["width"]]))).is_none());
    assert!(parse_kind_looks(&with(&["kinds", "select", "extras"], serde_json::json!([["width", 100]]))).is_none());
    assert!(parse_kind_looks(&with(&["kinds", "select", "extras"], serde_json::json!(["width"]))).is_none());
    assert!(parse_kind_looks(&with(&["kinds", "select", "css"], serde_json::json!([1]))).is_none());
    assert!(parse_kind_looks(&with(&["kinds"], serde_json::json!([]))).is_none());
    assert!(parse_kind_looks(&with(&["palette"], serde_json::json!([]))).is_none());
    assert!(parse_kind_looks(&with(&["facing"], serde_json::json!("x"))).is_none());
    assert!(parse_kind_looks(&with(&["facingBorder"], serde_json::json!(3))).is_none());
    // the untouched file still parses (the helpers above do not break it by themselves)
    assert!(parse_kind_looks(&looks_json().to_string()).is_some());
}

#[test]
fn a14c_a_non_string_palette_entry_is_caught_by_the_unexpanded_token_check() {
    // The parser keeps only string palette entries; a damaged entry therefore leaves
    // its `{{token}}` visible, which `a14_kind_looks_json_loads_and_every_token_is_expanded`
    // rejects. Prove that chain on a damaged copy.
    let bad = with(&["palette", "line"], serde_json::json!(5));
    let parsed = parse_kind_looks(&bad).expect("a non-string palette entry is tolerated by the parser");
    let leaked = parsed.kinds.values().any(|k| k.css.contains("{{") || k.extras.iter().any(|(_, v)| v.contains("{{")));
    assert!(leaked, "a damaged palette entry must leave a visible {{token}} for the token test to fail on");
}
