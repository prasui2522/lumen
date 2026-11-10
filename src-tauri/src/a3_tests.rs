//! A3 hardening: zip-bomb limits, cubic-bezier bounds, Rust/TS sanitizer parity golden, export template.
use crate::commands::{unzip_bounded, ZipLimits, ZIP_ENTRY_TOO_BIG, ZIP_LIMITS, ZIP_TOO_MANY, ZIP_TOTAL_TOO_BIG};
use crate::compiler::{css_safe, parse_document, safe_href, transition_easing, CompileOptions, BEZIER_Y_MAX};
use std::io::{Cursor, Write};
use std::path::PathBuf;
use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipArchive, ZipWriter};

/// Removes its folder on drop (A3 item 12: no /tmp/wb-* left behind, even when an assert fails).
struct TmpDir(PathBuf);
impl TmpDir {
    fn new(tag: &str) -> Self {
        let d = std::env::temp_dir().join(format!("wb-a3-{tag}-{}", uuid::Uuid::new_v4().simple()));
        std::fs::create_dir_all(&d).unwrap();
        TmpDir(d)
    }
}
impl Drop for TmpDir {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

fn zip_of(entries: &[(&str, Vec<u8>)]) -> ZipArchive<Cursor<Vec<u8>>> {
    let mut zw = ZipWriter::new(Cursor::new(Vec::new()));
    let o = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);
    for (n, b) in entries {
        zw.start_file(*n, o).unwrap();
        zw.write_all(b).unwrap();
    }
    ZipArchive::new(Cursor::new(zw.finish().unwrap().into_inner())).unwrap()
}

const SMALL: ZipLimits = ZipLimits { entries: 3, entry_bytes: 1000, total_bytes: 1500 };

#[test]
fn a3_zip_limits_are_the_documented_values() {
    assert_eq!(ZIP_LIMITS.entries, 5_000);
    assert_eq!(ZIP_LIMITS.entry_bytes, 64 * 1024 * 1024);
    assert_eq!(ZIP_LIMITS.total_bytes, 256 * 1024 * 1024);
    for m in [ZIP_TOO_MANY, ZIP_ENTRY_TOO_BIG, ZIP_TOTAL_TOO_BIG] {
        assert!(m.chars().any(|c| ('\u{0E00}'..='\u{0E7F}').contains(&c)), "Thai: {m}");
    }
}

#[test]
fn a3_zip_within_limits_extracts() {
    let d = TmpDir::new("zip-ok");
    let mut z = zip_of(&[("a.txt", vec![b'a'; 1000]), ("s/b.txt", vec![b'b'; 500])]);
    unzip_bounded(&mut z, &d.0, SMALL).unwrap();
    assert_eq!(std::fs::read(d.0.join("a.txt")).unwrap().len(), 1000);
    assert_eq!(std::fs::read(d.0.join("s/b.txt")).unwrap().len(), 500);
}

#[test]
fn a3_zip_too_many_entries_is_refused_before_writing() {
    let d = TmpDir::new("zip-many");
    let mut z = zip_of(&[("1", vec![1]), ("2", vec![2]), ("3", vec![3]), ("4", vec![4])]);
    assert_eq!(unzip_bounded(&mut z, &d.0, SMALL), Err(ZIP_TOO_MANY.to_string()));
    assert_eq!(std::fs::read_dir(&d.0).unwrap().count(), 0);
    let mut ok = zip_of(&[("1", vec![1]), ("2", vec![2]), ("3", vec![3])]);
    assert!(unzip_bounded(&mut ok, &d.0, SMALL).is_ok(), "exactly at the entry cap is allowed");
}

#[test]
fn a3_zip_entry_too_big_is_refused() {
    let d = TmpDir::new("zip-entry");
    let mut z = zip_of(&[("big", vec![0; 1001])]);
    assert_eq!(unzip_bounded(&mut z, &d.0, SMALL), Err(ZIP_ENTRY_TOO_BIG.to_string()));
    assert_eq!(std::fs::read_dir(&d.0).unwrap().count(), 0, "refused from the central directory, nothing written");
}

#[test]
fn a3_zip_total_too_big_is_refused() {
    let d = TmpDir::new("zip-total");
    let mut z = zip_of(&[("a", vec![0; 1000]), ("b", vec![0; 501])]);
    assert_eq!(unzip_bounded(&mut z, &d.0, SMALL), Err(ZIP_TOTAL_TOO_BIG.to_string()));
    assert_eq!(std::fs::read_dir(&d.0).unwrap().count(), 0);
}

#[test]
fn a3_zip_bomb_compresses_small_but_is_refused() {
    // 2 MiB of zeros deflates to a few KB: the declared size is what counts.
    let d = TmpDir::new("zip-bomb");
    let lim = ZipLimits { entries: 10, entry_bytes: 1024 * 1024, total_bytes: 4 * 1024 * 1024 };
    let mut z = zip_of(&[("zeros", vec![0; 2 * 1024 * 1024])]);
    assert_eq!(unzip_bounded(&mut z, &d.0, lim), Err(ZIP_ENTRY_TOO_BIG.to_string()));
}

#[test]
fn a3_zip_lying_header_is_caught_on_the_real_bytes() {
    // Patch the declared uncompressed size (local + central headers) of a stored entry down to 10 bytes.
    let mut zw = ZipWriter::new(Cursor::new(Vec::new()));
    zw.start_file("x", SimpleFileOptions::default().compression_method(CompressionMethod::Stored)).unwrap();
    zw.write_all(&[7u8; 1200]).unwrap();
    let mut bytes = zw.finish().unwrap().into_inner();
    let real = 1200u32.to_le_bytes();
    let mut patched = 0;
    for sig in [[0x50u8, 0x4b, 3, 4], [0x50, 0x4b, 1, 2]] {
        let off = if sig[2] == 3 { 22 } else { 24 };
        let mut i = 0;
        while let Some(p) = bytes[i..].windows(4).position(|w| w == sig) {
            let at = i + p + off;
            if bytes[at..at + 4] == real {
                bytes[at..at + 4].copy_from_slice(&10u32.to_le_bytes());
                patched += 1;
            }
            i += p + 4;
        }
    }
    assert_eq!(patched, 2, "both headers patched");
    let d = TmpDir::new("zip-lie");
    let mut z = ZipArchive::new(Cursor::new(bytes)).expect("patched archive opens");
    let r = unzip_bounded(&mut z, &d.0, SMALL);
    assert!(r.is_err(), "a 1200-byte entry declared as 10 must not pass: {r:?}");
    let on_disk = std::fs::read(d.0.join("x")).map(|b| b.len()).unwrap_or(0);
    assert!(on_disk <= (SMALL.entry_bytes + 1) as usize, "copy stops at the cap + 1, wrote {on_disk}");
}

#[test]
fn a3_zip_skips_traversal_names() {
    let d = TmpDir::new("zip-trav");
    let mut z = zip_of(&[("../evil.txt", vec![1]), ("ok.txt", vec![2])]);
    unzip_bounded(&mut z, &d.0, SMALL).unwrap();
    assert!(d.0.join("ok.txt").is_file());
    assert!(!d.0.parent().unwrap().join("evil.txt").exists());
}

#[test]
fn a3_bezier_x_must_be_in_0_1_and_y_bounded() {
    assert_eq!(BEZIER_Y_MAX, 5.0);
    for ok in ["cubic-bezier(0,0,1,1)", "cubic-bezier(0.4, -2, 0.6, 3)", "cubic-bezier(.25,.1,.25,1)", "cubic-bezier(1,5,0,-5)"] {
        assert!(transition_easing(ok).is_some(), "{ok}");
    }
    for bad in [
        "cubic-bezier(1.01,0,1,1)", "cubic-bezier(0,0,-0.01,1)", "cubic-bezier(-1,0,0,1)", "cubic-bezier(0,5.01,1,1)",
        "cubic-bezier(0,0,1,-5.5)", "cubic-bezier(0,0,1)", "cubic-bezier(0,0,1,1,1)", "cubic-bezier(,0,,1)",
        "cubic-bezier(1e0,0,1,1)", "cubic-bezier(inf,0,1,1)", "cubic-bezier(0,nan,1,1)", "cubic-bezier(0x1,0,1,1)",
        "cubic-bezier(0,0,1,99999999999999999)",
    ] {
        assert_eq!(transition_easing(bad), None, "{bad}");
    }
}

fn cases() -> serde_json::Value {
    let css = [
        "", "red", " red ", "\u{FEFF}red", "\u{00A0}red\u{3000}", "re\u{7}d", "a{b}c;d<e>f", "/* x */red", "url(x)",
        "URL(x)", "image-set(x)", "expression(x)", "@import x", "javascript:x", "-moz-binding:x", "vbscript:x",
        "linear-gradient(red,blue)", "behavior : x", "behavior:x", "\"open", "'a'", "(a", "a)", "rgb(1,2,3)", "a\\62 c",
        "calc(100% - 2px)", "1px solid #fff", "u/**/rl(x)", "Ünïcode", "\u{85}red", "\u{2028}x",
    ];
    let href = [
        "", "/", "/a", "a/b", "#top", "?q=1", "http://x", "HTTPS://x", "mailto:a@b", "tel:1", "javascript:alert(1)",
        "JAVASCRIPT:alert(1)", " java\tscript:x", "data:text/html,x", "vbscript:x", "//evil.com", "ftp://x",
        "\u{FEFF}javascript:x", "java\u{0}script:x", "  /ok  ", "file:///etc/passwd",
    ];
    let easing = [
        "", "ease", "EASE", " ease-in ", "\u{FEFF}ease", "linear", "step-start", "steps(2)", "cubic-bezier(0,0,1,1)",
        "Cubic-Bezier(0.1, 0.2, 0.3, 0.4)", "cubic-bezier(,0,,1)", "cubic-bezier(1e1,0,1,1)", "cubic-bezier(inf,0,1,1)",
        "cubic-bezier(-0,0,1,1)", "cubic-bezier(0,-0,1,-0.0)", "cubic-bezier(1.5,0,1,1)", "cubic-bezier(0,6,1,1)",
        "cubic-bezier(0,-5,1,5)", "cubic-bezier(.5,.5,.5,.5)", "cubic-bezier(5.,0,1,1)", "cubic-bezier(0.,0,1.,1)",
        "cubic-bezier(+0.5,+1,0.5,1)", "cubic-bezier( 0 , 0 , 1 , 1 )", "url(x)", "ease;color:red",
    ];
    let row = |f: &dyn Fn(&str) -> serde_json::Value, xs: &[&str]| -> serde_json::Value {
        xs.iter().map(|x| serde_json::json!([x, f(x)])).collect()
    };
    serde_json::json!({
        "css_safe": row(&|s| css_safe(s).into(), &css),
        "safe_href": row(&|s| safe_href(s).into(), &href),
        "transition_easing": row(&|s| transition_easing(s).map_or(serde_json::Value::Null, Into::into), &easing),
    })
}

/// Golden shared with the TS ports (template `safe.ts`, app `style-css.ts`): `A3_BLESS=1` rewrites it.
#[test]
fn a3_sanitizer_parity_golden() {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("src/fixtures/a3/parity.json");
    let now = serde_json::to_string_pretty(&cases()).unwrap() + "\n";
    if std::env::var("A3_BLESS").as_deref() == Ok("1") {
        std::fs::write(&path, &now).unwrap();
    }
    assert_eq!(std::fs::read_to_string(&path).unwrap(), now, "parity golden out of date (A3_BLESS=1)");
}

#[test]
fn a3_export_ships_safe_ts_and_real_styles_not_the_placeholders() {
    let v: serde_json::Value = serde_json::from_str(include_str!("fixtures/rich_sample.json")).unwrap();
    let doc = parse_document(&v).unwrap();
    let opts = CompileOptions { preview: false, asset_base_url: Some("assets".into()), ..CompileOptions::default() };
    let d = TmpDir::new("export");
    crate::export::write_export_tree(&d.0, &doc, &opts, &[]).unwrap();
    let safe = std::fs::read(d.0.join("src/lib/safe.ts")).unwrap();
    assert_eq!(safe, include_bytes!("../../export-templates/vite-react/src/lib/safe.ts").to_vec());
    for f in ["src/styles/kinds.css", "src/styles/site.css"] {
        let s = std::fs::read_to_string(d.0.join(f)).unwrap();
        assert!(!s.contains("Placeholder so the bare template builds"), "{f} still the placeholder");
    }
    let style = std::fs::read_to_string(d.0.join("src/lib/style.ts")).unwrap();
    assert!(style.contains("cssSafe") && style.contains("easingCss"));
}
