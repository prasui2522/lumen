use super::*;
use crate::compiler::{parse_document, CompileOptions};
use std::io::Read;
use zip::ZipArchive;

fn plain() -> (CompileOptions, Vec<(String, Vec<u8>)>) {
    (
        CompileOptions {
            preview: false,
            asset_base_url: Some("assets".into()),
            ..CompileOptions::default()
        },
        Vec::new(),
    )
}

fn rich() -> PageDocument {
    let v: serde_json::Value = serde_json::from_str(include_str!("fixtures/rich_sample.json")).unwrap();
    parse_document(&v).unwrap()
}

fn temp_dir() -> PathBuf {
    let d = std::env::temp_dir().join(format!("wb-export-test-{}", uuid::Uuid::new_v4().simple()));
    std::fs::create_dir_all(&d).unwrap();
    d
}

fn read_entry(z: &mut ZipArchive<std::fs::File>, name: &str) -> String {
    let mut s = String::new();
    z.by_name(name).unwrap().read_to_string(&mut s).unwrap();
    s
}

fn zip_names(z: &mut ZipArchive<std::fs::File>) -> Vec<String> {
    let mut names: Vec<String> = (0..z.len()).map(|i| z.by_index(i).unwrap().name().to_string()).collect();
    names.sort();
    names
}

#[test]
fn export_zip_is_vite_tsx_project() {
    let dir = temp_dir();
    let (opts, files) = plain();
    let written = write_zip(&dir.join("ร้าน กาแฟ"), &rich(), &opts, &files).unwrap();
    assert_eq!(written, dir.join("ร้าน กาแฟ.zip"));
    let leftovers: Vec<_> = std::fs::read_dir(&dir).unwrap().map(|e| e.unwrap().file_name()).collect();
    assert_eq!(leftovers.len(), 1, "no temp file left: {leftovers:?}");

    let mut z = ZipArchive::new(std::fs::File::open(&written).unwrap()).unwrap();
    let names = zip_names(&mut z);
    assert!(names.contains(&"package.json".to_string()));
    assert!(names.contains(&"src/App.tsx".to_string()));
    assert!(names.contains(&"src/lib/render-node.tsx".to_string()));
    assert!(names.contains(&"src/lib/icon-paths.ts".to_string()));
    assert!(names.contains(&"src/data/site.json".to_string()));
    // B0: the shared generator's block ships as src/styles/site.css (imported once by main.tsx)
    assert!(names.contains(&"src/styles/site.css".to_string()));
    let (o2, _) = plain();
    assert_eq!(read_entry(&mut z, "src/styles/site.css"), build_site_css(&rich(), &o2).unwrap());
    // B0.1 item 1: kinds.css (static `.t-x` rules of switch / checkbox / spinner), imported before site.css
    assert!(names.contains(&"src/styles/kinds.css".to_string()));
    assert_eq!(read_entry(&mut z, "src/styles/kinds.css"), crate::export::build_kinds_css(&rich(), &o2).unwrap());
    let main = read_entry(&mut z, "src/main.tsx");
    let (ki, si) = (main.find("import \"./styles/kinds.css\";").expect("kinds import"), main.find("import \"./styles/site.css\";").expect("site import"));
    assert!(ki < si, "kinds.css before site.css");
    assert!(names.contains(&"public/assets/.keep".to_string()));
    assert!(
        !names.contains(&"THIRD-PARTY-NOTICES.txt".to_string()),
        "no icon → no notices file"
    );
    assert!(!names.iter().any(|n| n == "styles.css"), "HTML export CSS must not be primary");
    assert!(!names.iter().any(|n| n == "index.html" && !names.contains(&"src/main.tsx".to_string())));

    let pkg = read_entry(&mut z, "package.json");
    assert!(pkg.contains("\"react\""));
    assert!(pkg.contains("vite"));
    assert!(!pkg.contains("@tauri-apps"));
    assert!(!pkg.contains("sqlite"));

    let site = read_entry(&mut z, "src/data/site.json");
    assert!(site.contains("ร้านกาแฟ") || site.contains("กาแฟดี"));
    assert!(site.contains("\"pages\""));
    assert!(!site.contains("SECRET"), "visible:false nodes are scrubbed from site.json");

    let app = read_entry(&mut z, "src/App.tsx");
    assert!(app.contains("SiteRoutes"));
    let routes = read_entry(&mut z, "src/lib/site-routes.tsx");
    assert!(routes.contains("react-router-dom") && routes.contains("SitePage"));

    std::fs::remove_dir_all(&dir).unwrap();
}

#[test]
fn export_path_rules() {
    assert_eq!(zip_path(Path::new("/x/site.ZIP")), PathBuf::from("/x/site.ZIP"));
    assert_eq!(zip_path(Path::new("/x/site")), PathBuf::from("/x/site.zip"));
    assert_eq!(zip_path(Path::new("/x/site.html")), PathBuf::from("/x/site.html.zip"));
    let missing = std::env::temp_dir().join("wb-no-such-dir-3b").join("a.zip");
    let (opts, files) = plain();
    assert!(write_zip(&missing, &rich(), &opts, &files).is_err());
}

#[test]
fn export_includes_a_stored_image_under_public_assets() {
    let doc = rich();
    let mut exts = std::collections::HashMap::new();
    exts.insert("beans.jpg".into(), "jpg".into());
    let opts = CompileOptions {
        preview: false,
        asset_base_url: Some("assets".into()),
        asset_exts: exts,
        ..CompileOptions::default()
    };
    let files = vec![("assets/beans.jpg".into(), b"jpeg-bytes".to_vec())];
    let dir = temp_dir();
    let written = write_zip(&dir.join("out.zip"), &doc, &opts, &files).unwrap();
    let mut z = ZipArchive::new(std::fs::File::open(&written).unwrap()).unwrap();
    let names = zip_names(&mut z);
    assert!(names.contains(&"public/assets/beans.jpg".to_string()));
    let mut bytes = Vec::new();
    z.by_name("public/assets/beans.jpg")
        .unwrap()
        .read_to_end(&mut bytes)
        .unwrap();
    assert_eq!(bytes, b"jpeg-bytes");
    let site = read_entry(&mut z, "src/data/site.json");
    assert!(site.contains("assetFiles"));
    assert!(site.contains("beans.jpg"));
    assert_eq!(asset_file_name("beans.jpg", Some("jpg")), "beans.jpg");
    assert_eq!(asset_file_name("uuid-1", Some("png")), "uuid-1.png");
    std::fs::remove_dir_all(&dir).unwrap();
}

#[test]
fn export_two_pages_lists_both_paths_in_site_json() {
    let v = serde_json::json!({
        "version": 5,
        "meta": { "title": "สองหน้า" },
        "pages": [
            {
                "id": "home",
                "name": "หน้าแรก",
                "path": "/",
                "root": "r1",
                "nodes": {
                    "r1": {
                        "id": "r1",
                        "type": "page",
                        "props": { "type": "page", "children": ["a"] },
                        "style": {}
                    },
                    "a": {
                        "id": "a",
                        "type": "link",
                        "props": { "type": "link", "label": "ไป", "href": "/about" },
                        "style": {}
                    }
                }
            },
            {
                "id": "about",
                "name": "เกี่ยวกับ",
                "path": "/about",
                "root": "r2",
                "nodes": {
                    "r2": {
                        "id": "r2",
                        "type": "page",
                        "props": { "type": "page", "children": ["b"] },
                        "style": {}
                    },
                    "b": {
                        "id": "b",
                        "type": "heading",
                        "props": { "type": "heading", "level": 1, "content": "เกี่ยวกับ" },
                        "style": {}
                    }
                }
            }
        ]
    });
    let doc = parse_document(&v).unwrap();
    let (opts, files) = plain();
    let site = build_site_json(&doc, &opts.asset_exts).unwrap();
    assert!(site.contains("\"/about\""));
    assert!(site.contains("\"/\""));
    let dir = temp_dir();
    let written = write_zip(&dir.join("mp.zip"), &doc, &opts, &files).unwrap();
    let mut z = ZipArchive::new(std::fs::File::open(&written).unwrap()).unwrap();
    assert!(zip_names(&mut z).contains(&"src/App.tsx".to_string()));
    let site_zip = read_entry(&mut z, "src/data/site.json");
    assert!(site_zip.contains("/about"));
    std::fs::remove_dir_all(&dir).unwrap();
}

#[test]
fn a46_third_party_notices_only_when_icon_present() {
    let (opts, files) = plain();
    // No icon → no notices.
    assert!(!document_has_icon(&rich()));
    let dir = temp_dir();
    let written = write_zip(&dir.join("no-icon.zip"), &rich(), &opts, &files).unwrap();
    let mut z = ZipArchive::new(std::fs::File::open(&written).unwrap()).unwrap();
    assert!(!zip_names(&mut z).contains(&"THIRD-PARTY-NOTICES.txt".to_string()));
    std::fs::remove_dir_all(&dir).unwrap();

    let v = serde_json::json!({
        "version": 4,
        "meta": { "title": "with-icon", "lang": "th" },
        "root": "root",
        "nodes": {
            "root": {
                "id": "root",
                "type": "page",
                "props": { "type": "page", "children": ["i1"] },
                "style": {}
            },
            "i1": {
                "id": "i1",
                "type": "icon",
                "props": {
                    "type": "icon",
                    "name": "star",
                    "size": 24,
                    "strokeWidth": 2
                },
                "style": {}
            }
        }
    });
    let doc = parse_document(&v).unwrap();
    assert!(document_has_icon(&doc));
    let dir2 = temp_dir();
    let written2 = write_zip(&dir2.join("with-icon.zip"), &doc, &opts, &files).unwrap();
    let mut z2 = ZipArchive::new(std::fs::File::open(&written2).unwrap()).unwrap();
    assert!(zip_names(&mut z2).contains(&"THIRD-PARTY-NOTICES.txt".to_string()));
    let notice = read_entry(&mut z2, "THIRD-PARTY-NOTICES.txt");
    assert!(notice.contains("ISC License"));
    assert!(notice.contains("Lucide"));
    assert!(notice.contains("star"));
    assert!(notice.contains("Cole Bemis") || notice.contains("Feather") || notice.contains("MIT"));
    let render = read_entry(&mut z2, "src/lib/render-node.tsx");
    assert!(render.contains("case \"icon\""));
    std::fs::remove_dir_all(&dir2).unwrap();
}

/// F1: the exported Vite project must install and build (`bun install && bun run build`, exit 0).
/// Gate: skipped (with a message) ONLY when `bun` is not on PATH (or `$BUN`), or when `bun install`
/// fails for a network / package-cache reason (no registry and nothing cached). Any other failure fails.
/// Also builds twice: the second build must give the same CSS (Tailwind must not scan `dist/`).
#[test]
fn f1_export_installs_and_builds_with_bun() {
    use std::process::Command;
    let bun = std::env::var("BUN").unwrap_or_else(|_| "bun".into());
    if Command::new(&bun).arg("--version").output().map(|o| !o.status.success()).unwrap_or(true) {
        eprintln!("SKIP f1_export_installs_and_builds_with_bun: bun not found (set BUN or add it to PATH)");
        return;
    }
    let dir = temp_dir();
    let (o, f) = plain();
    let zip = write_zip(&dir.join("site"), &rich(), &o, &f).unwrap();
    let proj = dir.join("proj");
    ZipArchive::new(std::fs::File::open(&zip).unwrap()).unwrap().extract(&proj).unwrap();
    let pkg = std::fs::read_to_string(proj.join("package.json")).unwrap();
    assert!(pkg.contains("\"@types/node\""), "template devDependencies lack @types/node");

    let inst = Command::new(&bun).arg("install").current_dir(&proj).output().unwrap();
    if !inst.status.success() {
        let msg = format!("{}{}", String::from_utf8_lossy(&inst.stdout), String::from_utf8_lossy(&inst.stderr));
        let net = ["ConnectionRefused", "ConnectionClosed", "FailedToOpenSocket", "getaddrinfo", "ENOTFOUND",
            "EAI_AGAIN", "network", "offline", "Timeout", "UNABLE_TO_GET_ISSUER"];
        if net.iter().any(|k| msg.contains(k)) {
            eprintln!("SKIP f1_export_installs_and_builds_with_bun: bun install had no registry/cache:\n{msg}");
            let _ = std::fs::remove_dir_all(&dir);
            return;
        }
        panic!("bun install failed:\n{msg}");
    }
    let css_of = |proj: &Path| -> Vec<u8> {
        let b = Command::new(&bun).args(["run", "build"]).current_dir(proj).output().unwrap();
        assert!(
            b.status.success(),
            "bun run build failed:\n{}{}",
            String::from_utf8_lossy(&b.stdout),
            String::from_utf8_lossy(&b.stderr)
        );
        let assets = proj.join("dist/assets");
        let css: Vec<_> = std::fs::read_dir(&assets).unwrap().flatten()
            .filter(|e| e.path().extension().is_some_and(|x| x == "css")).collect();
        assert_eq!(css.len(), 1, "one CSS file in dist/assets");
        assert!(proj.join("dist/index.html").is_file());
        std::fs::read(css[0].path()).unwrap()
    };
    let first = css_of(&proj);
    let second = css_of(&proj); // dist/ and node_modules/.tmp/*.tsbuildinfo now exist
    assert_eq!(first.len(), second.len(), "CSS changed on rebuild: Tailwind scanned build output");
    assert!(first.len() < 20_000, "exported CSS grew to {} bytes (expected ~14.5 kB)", first.len());
    let _ = std::fs::remove_dir_all(&dir);
}

/// S2: the Tier 1 bundle is byte-equal to the zip's generated files, and the zip never
/// carries the Preview runtime entry (data-node-id stays out of the export).
#[test]
fn s2_preview_bundle_matches_export_and_zip_has_no_runtime() {
    let (opts, files) = plain();
    let doc = rich();
    let bundle = build_preview_bundle(&doc, &opts, HashMap::new()).unwrap();
    let list = build_export_listing(&doc, &opts, &files).unwrap();
    let text = |p: &str| list.iter().find(|e| e.path == p).unwrap().text.clone().unwrap();
    assert_eq!(bundle.site_json, text("src/data/site.json"));
    assert_eq!(bundle.site_css, text("src/styles/site.css"));
    assert_eq!(bundle.kinds_css, text("src/styles/kinds.css"));
    assert!(!bundle.site_json.contains("assetUrls"));
    for e in &list {
        assert!(!e.path.contains("preview-runtime") && !e.path.contains("preview.html"), "{}", e.path);
        if let Some(t) = &e.text {
            assert!(!t.contains("__WB_PREVIEW__ = true"), "{} sets the preview flag", e.path);
        }
    }
}

#[test]
fn dw_m3_export_listing_includes_site_json() {
    let (opts, files) = plain();
    let list = build_export_listing(&rich(), &opts, &files).unwrap();
    let paths: Vec<_> = list.iter().map(|e| e.path.as_str()).collect();
    assert!(paths.contains(&"src/data/site.json"));
    assert!(paths.contains(&"src/styles/site.css"));
    assert!(paths.contains(&"src/styles/kinds.css"));
    let site = list.iter().find(|e| e.path == "src/data/site.json").unwrap();
    assert!(!site.binary);
    assert!(site.text.as_ref().is_some_and(|t| t.contains('{')));
    assert!(list.windows(2).all(|w| w[0].path <= w[1].path), "listing must be sorted");
    let ranges = site.ranges.as_ref().expect("site.json ranges");
    assert!(!ranges.is_empty(), "every authored node should have a range");
}

#[test]
fn s3_export_folder_parent_of_zip() {
    let dir = temp_dir();
    let zip = dir.join("site.zip");
    std::fs::write(&zip, b"PK").unwrap();
    let got = export_folder_for(&zip).unwrap();
    assert_eq!(got, dir.canonicalize().unwrap());
    let _ = std::fs::remove_dir_all(&dir); // A3 item 12: no /tmp/wb-export-test-* left behind
}

#[test]
fn s3_export_folder_rejects_missing_dotdot_and_symlink_escape() {
    assert!(export_folder_for(std::path::Path::new("/no/such/export.zip")).is_err());
    let dir = temp_dir();
    let zip = dir.join("site.zip");
    std::fs::write(&zip, b"PK").unwrap();
    let sneaky = dir.join("sub");
    std::fs::create_dir(&sneaky).unwrap();
    let rel = sneaky.join("..").join("site.zip");
    assert!(export_folder_for(&rel).is_err(), "`..` in dest must fail even if it resolves");
    let outside = temp_dir();
    let outside_zip = outside.join("other.zip");
    std::fs::write(&outside_zip, b"PK").unwrap();
    let link = dir.join("escape.zip");
    std::os::unix::fs::symlink(&outside_zip, &link).unwrap();
    assert!(export_folder_for(&link).is_err(), "symlink zip must not open a foreign folder");
    let _ = std::fs::remove_dir_all(&dir);
    let _ = std::fs::remove_dir_all(&outside);
}

#[test]
fn s4_node_ranges_cover_id_objects() {
    let json = "{\n  \"nodes\": {\n    \"n1\": {\n      \"id\": \"n1\",\n      \"type\": \"page\"\n    }\n  }\n}";
    let map = node_ranges_in_json(json);
    let [a, b] = *map.get("n1").expect("n1");
    assert!(json[a..b].contains("\"id\": \"n1\""));
    assert!(json[a..b].starts_with('{'));
    assert!(json[a..b].ends_with('}'));
}

#[test]
fn s5_dark_off_leaves_index_and_css_without_toggle() {
    let (opts, files) = plain();
    let mut doc = rich();
    doc.meta.dark_mode = None;
    let list = build_export_listing(&doc, &opts, &files).unwrap();
    let html = list.iter().find(|e| e.path == "index.html").unwrap().text.clone().unwrap();
    let css = list.iter().find(|e| e.path == "src/styles/site.css").unwrap().text.clone().unwrap();
    assert!(!html.contains("wb-dark-toggle"));
    assert!(!css.contains("html.dark"));
    let site = list.iter().find(|e| e.path == "src/data/site.json").unwrap().text.clone().unwrap();
    assert!(!site.contains("darkMode"));
}

#[test]
fn r2_sync_writes_vite_tree_once_then_refreshes_site_json() {
    let dir = std::env::temp_dir().join(format!("wb-r2-{}", uuid::Uuid::new_v4().simple()));
    let doc = rich();
    let (opts, files) = plain();
    sync_project_site(&dir, &doc, &opts, &files).unwrap();
    assert!(dir.join("package.json").is_file());
    assert!(dir.join("src/pages/SitePage.tsx").is_file());
    let marker = dir.join("src/pages/SitePage.tsx");
    std::fs::write(&marker, b"kept").unwrap();
    sync_project_site(&dir, &doc, &opts, &files).unwrap();
    assert_eq!(std::fs::read(&marker).unwrap(), b"kept");
    let text = std::fs::read_to_string(dir.join("src/data/site.json")).unwrap();
    let parsed = document_from_site_json(&text).unwrap();
    assert_eq!(parsed.meta.title, doc.meta.title);
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn r5_flagged_site_css_is_not_overwritten() {
    let dir = std::env::temp_dir().join(format!("wb-r5-{}", uuid::Uuid::new_v4().simple()));
    let doc = rich();
    let (opts, files) = plain();
    sync_project_site(&dir, &doc, &opts, &files).unwrap();
    std::fs::write(dir.join("src/styles/site.css"), b"hand").unwrap();
    flag_override(&dir, SITE_CSS_REL).unwrap();
    sync_project_site(&dir, &doc, &opts, &files).unwrap();
    assert_eq!(std::fs::read(dir.join(SITE_CSS_REL)).unwrap(), b"hand");
    assert!(override_contains(&dir, SITE_CSS_REL));
    clear_override(&dir, SITE_CSS_REL).unwrap();
    sync_project_site(&dir, &doc, &opts, &files).unwrap();
    assert_ne!(std::fs::read(dir.join(SITE_CSS_REL)).unwrap(), b"hand");
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn r6_import_rejects_bad_json_and_foreign_folder() {
    let dir = std::env::temp_dir().join(format!("wb-r6-{}", uuid::Uuid::new_v4().simple()));
    std::fs::create_dir_all(dir.join("src/data")).unwrap();
    std::fs::write(dir.join("package.json"), br#"{"name":"exported-site"}"#).unwrap();
    std::fs::write(dir.join("src/data/site.json"), b"{").unwrap();
    let err = load_import_document(&dir).unwrap_err();
    assert!(err.starts_with("JSON ไม่ถูกต้อง"), "{err}");
    std::fs::write(dir.join("package.json"), br#"{"name":"other"}"#).unwrap();
    let err = load_import_document(&dir).unwrap_err();
    assert!(err.contains("ไม่ใช่โปรเจกต์"), "{err}");
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn r3_list_site_tree_skips_node_modules() {
    let dir = std::env::temp_dir().join(format!("wb-r3-{}", uuid::Uuid::new_v4().simple()));
    std::fs::create_dir_all(dir.join("src/data")).unwrap();
    std::fs::create_dir_all(dir.join("node_modules/vite")).unwrap();
    std::fs::write(dir.join("package.json"), b"{}").unwrap();
    std::fs::write(dir.join("src/data/site.json"), b"{\"ok\":true}").unwrap();
    std::fs::write(dir.join("node_modules/vite/index.js"), b"skip").unwrap();
    let list = list_site_tree(&dir).unwrap();
    let paths: Vec<_> = list.iter().map(|e| e.path.as_str()).collect();
    assert!(paths.contains(&"package.json"));
    assert!(paths.contains(&"src/data/site.json"));
    assert!(paths.iter().all(|p| !p.contains("node_modules")));
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn r1_site_json_strips_renderer_keys_and_rejects_bad_json() {
    let ok = r#"{"version":1,"meta":{"title":"T"},"root":"p","nodes":{"p":{"id":"p","type":"page","props":{"type":"page","children":[]}}},"baseDefaults":{"page":{}},"headingFontSizes":[32],"assetFiles":{"a":"a.png"}}"#;
    let doc = document_from_site_json(ok).unwrap();
    assert_eq!(doc.root, "p");
    assert_eq!(doc.version, 1);
    assert!(doc.pages.iter().any(|p| p.root == "p"));
    let bad = document_from_site_json("{").unwrap_err();
    assert!(bad.starts_with("JSON ไม่ถูกต้อง"), "{bad}");
    let hostile = r#"{"version":1,"meta":{"title":"T"},"root":"p","nodes":{"p":{"id":"p","type":"nope","props":{}}}}"#;
    let err = document_from_site_json(hostile).unwrap_err();
    assert!(err.contains("เอกสารไม่ถูกต้อง"), "{err}");
}

#[test]
fn s5_dark_auto_adds_toggle_and_tokens() {
    let (opts, files) = plain();
    let mut doc = rich();
    doc.meta.dark_mode = Some("auto".into());
    let list = build_export_listing(&doc, &opts, &files).unwrap();
    let html = list.iter().find(|e| e.path == "index.html").unwrap().text.clone().unwrap();
    let css = list.iter().find(|e| e.path == "src/styles/site.css").unwrap().text.clone().unwrap();
    assert!(html.contains("wb-dark-toggle"));
    assert!(html.contains("ระบบ"));
    assert!(css.contains("html.dark"));
    let site = list.iter().find(|e| e.path == "src/data/site.json").unwrap().text.clone().unwrap();
    assert!(site.contains("\"darkMode\": \"auto\""));
}
