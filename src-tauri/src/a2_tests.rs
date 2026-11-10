//! A2 (audit Mediums): project-id paths stay under their root; import / file listing never follow symlinks.
use crate::commands::{check_project_id, project_dir, BAD_PROJECT_ID};
use crate::export::{copy_project_tree, list_site_tree, load_import_document};
use std::os::unix::fs::symlink;
use std::path::{Path, PathBuf};

fn tmp(tag: &str) -> PathBuf {
    let d = std::env::temp_dir().join(format!("wb-a2-{tag}-{}", uuid::Uuid::new_v4().simple()));
    std::fs::create_dir_all(&d).unwrap();
    d
}

#[test]
fn a2_project_id_rejects_traversal_separators_nul_and_absolute() {
    for ok in ["5e0ba5a9-3598-4803-9b74-a7d39eeba0a6", "abc", "a_b-c.d", "A1"] {
        assert!(check_project_id(ok).is_ok(), "{ok}");
    }
    let long = "a".repeat(129);
    for bad in [
        "", ".", "..", "../x", "..\\x", "x/..", "a/b", "a\\b", "/etc", "/", "a\0b", "\0", ".hidden", "a..b",
        "..a", "a b", "ก", "%2e%2e", "~", long.as_str(), "C:\\x", "a\nb",
    ] {
        assert_eq!(check_project_id(bad), Err(BAD_PROJECT_ID.to_string()), "{bad:?}");
    }
}

#[test]
fn a2_project_dir_stays_a_direct_child_of_the_root() {
    let root = tmp("root");
    let outside = tmp("outside");
    // plain id, existing or not
    assert_eq!(project_dir(&root, "p1").unwrap(), root.join("p1"));
    std::fs::create_dir_all(root.join("p1")).unwrap();
    assert_eq!(project_dir(&root, "p1").unwrap(), root.join("p1"));
    // traversal / absolute never reach join
    for bad in ["../outside", "/etc", "a/b", "..", "a\0b"] {
        assert!(project_dir(&root, bad).is_err(), "{bad:?}");
    }
    // a project folder that is a symlink out of the root is refused after canonicalisation
    symlink(&outside, root.join("evil")).unwrap();
    assert_eq!(project_dir(&root, "evil"), Err(BAD_PROJECT_ID.to_string()));
    // a dangling symlink is refused too (canonicalize fails)
    symlink(root.join("nowhere"), root.join("dangling")).unwrap();
    assert!(project_dir(&root, "dangling").is_err());
    // a root reached through a symlink still works for real children
    let alias = std::env::temp_dir().join(format!("wb-a2-alias-{}", uuid::Uuid::new_v4().simple()));
    symlink(&root, &alias).unwrap();
    assert_eq!(project_dir(&alias, "p1").unwrap(), alias.join("p1"));
    let _ = std::fs::remove_file(&alias);
    let _ = std::fs::remove_dir_all(&root);
    let _ = std::fs::remove_dir_all(&outside);
}

fn exported_folder(dir: &Path) {
    std::fs::create_dir_all(dir.join("src/data")).unwrap();
    std::fs::write(dir.join("package.json"), br#"{"name":"exported-site"}"#).unwrap();
    std::fs::write(dir.join("src/data/site.json"), b"{}").unwrap();
    std::fs::write(dir.join("src/App.tsx"), b"export default 1;\n").unwrap();
}

#[test]
fn a2_import_copy_skips_symlinks_to_files_and_folders() {
    let src = tmp("src");
    let dest = tmp("dest");
    let secret_dir = tmp("secret");
    std::fs::write(secret_dir.join("id_rsa"), b"TOP-SECRET").unwrap();
    exported_folder(&src);
    symlink(secret_dir.join("id_rsa"), src.join("src/leak.txt")).unwrap();
    symlink(&secret_dir, src.join("src/leakdir")).unwrap();
    symlink(src.join("src/App.tsx"), src.join("src/inside-link.tsx")).unwrap();
    copy_project_tree(&src, &dest).unwrap();
    assert!(dest.join("src/App.tsx").is_file());
    assert!(dest.join("package.json").is_file());
    for gone in ["src/leak.txt", "src/leakdir", "src/leakdir/id_rsa", "src/inside-link.tsx"] {
        assert!(std::fs::symlink_metadata(dest.join(gone)).is_err(), "{gone} must not be copied");
    }
    fn walk(d: &Path, hit: &mut bool) {
        for e in std::fs::read_dir(d).unwrap().flatten() {
            let p = e.path();
            let ft = e.file_type().unwrap();
            assert!(!ft.is_symlink(), "no symlink in the copy: {}", p.display());
            if ft.is_dir() {
                walk(&p, hit);
            } else if std::fs::read(&p).unwrap().windows(10).any(|w| w == b"TOP-SECRET") {
                *hit = true;
            }
        }
    }
    let mut hit = false;
    walk(&dest, &mut hit);
    assert!(!hit, "secret bytes never land in the imported project");
    for d in [&src, &dest, &secret_dir] {
        let _ = std::fs::remove_dir_all(d);
    }
}

#[test]
fn a2_file_tree_listing_skips_symlinks() {
    let dir = tmp("list");
    let secret_dir = tmp("secret2");
    std::fs::write(secret_dir.join("passwd"), b"TOP-SECRET").unwrap();
    exported_folder(&dir);
    symlink(secret_dir.join("passwd"), dir.join("src/leak.txt")).unwrap();
    symlink(&secret_dir, dir.join("src/leakdir")).unwrap();
    let list = list_site_tree(&dir).unwrap();
    let paths: Vec<_> = list.iter().map(|e| e.path.as_str()).collect();
    assert!(paths.contains(&"src/App.tsx"));
    assert!(paths.iter().all(|p| !p.contains("leak")), "{paths:?}");
    assert!(list.iter().all(|e| !e.text.as_deref().unwrap_or("").contains("TOP-SECRET")));
    let _ = std::fs::remove_dir_all(&dir);
    let _ = std::fs::remove_dir_all(&secret_dir);
}

#[test]
fn a2_import_refuses_symlinked_marker_files() {
    let real = tmp("real");
    exported_folder(&real);
    // symlinked site.json
    let a = tmp("a");
    std::fs::create_dir_all(a.join("src/data")).unwrap();
    std::fs::write(a.join("package.json"), br#"{"name":"exported-site"}"#).unwrap();
    symlink(real.join("src/data/site.json"), a.join("src/data/site.json")).unwrap();
    assert!(load_import_document(&a).unwrap_err().contains("ไม่ใช่โปรเจกต์"));
    // symlinked src/data folder
    let b = tmp("b");
    std::fs::create_dir_all(b.join("src")).unwrap();
    std::fs::write(b.join("package.json"), br#"{"name":"exported-site"}"#).unwrap();
    symlink(real.join("src/data"), b.join("src/data")).unwrap();
    assert!(load_import_document(&b).unwrap_err().contains("ไม่ใช่โปรเจกต์"));
    // symlinked package.json
    let c = tmp("c");
    std::fs::create_dir_all(c.join("src/data")).unwrap();
    std::fs::write(c.join("src/data/site.json"), b"{}").unwrap();
    symlink(real.join("package.json"), c.join("package.json")).unwrap();
    assert!(load_import_document(&c).unwrap_err().contains("ไม่ใช่โปรเจกต์"));
    for d in [&real, &a, &b, &c] {
        let _ = std::fs::remove_dir_all(d);
    }
}
