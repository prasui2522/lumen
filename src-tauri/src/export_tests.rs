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
    assert!(app.contains("react-router-dom") || app.contains("SitePage"));

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
