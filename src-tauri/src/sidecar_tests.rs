use super::*;
use std::io::{Read, Write};
use std::net::TcpListener;
use std::process::{Command, Stdio};
use std::time::Duration;

#[test]
fn s6_excluded_ports_never_in_preview_range() {
    for p in PORT_MIN..=PORT_MAX {
        assert!(!is_excluded_port(p), "{p}");
    }
    assert!(is_excluded_port(1420));
    assert!(is_excluded_port(1520));
    assert!(is_excluded_port(1530));
    assert!(is_excluded_port(14380));
    assert!(is_excluded_port(14399));
    assert!(!is_excluded_port(14400));
}

#[test]
fn s6_pick_port_in_range_and_free() {
    assert!((PORT_MIN..=PORT_MAX).contains(&pick_port().unwrap()));
    // A2: hold the probe lock so no parallel test's probe bind sits on the port between pick and bind.
    // The range overlaps the kernel's ephemeral ports, so an unrelated connect() may still take a port in
    // the instant after the probe; a handful of picks must include a free one (each pick is checked).
    let _g = PICK_LOCK.lock().unwrap_or_else(|e| e.into_inner());
    let free = (0..5).any(|_| {
        let p = pick_port_unlocked().unwrap();
        assert!((PORT_MIN..=PORT_MAX).contains(&p));
        assert!(!is_excluded_port(p));
        TcpListener::bind(("127.0.0.1", p)).is_ok()
    });
    assert!(free);
}

#[test]
fn s6_cmdline_token_match() {
    let tok = "abc123token";
    let hit = format!("bun\0run-vite.ts\0--preview-token\0{tok}\0");
    assert!(cmdline_has_token(hit.as_bytes(), tok));
    let miss = b"bun\0x\0vite\0--host\0127.0.0.1\0";
    assert!(!cmdline_has_token(miss, tok));
}

#[test]
fn s6_idle_rule() {
    assert!(!should_idle_stop(true, Duration::from_secs(120), Duration::from_secs(60)));
    assert!(!should_idle_stop(false, Duration::from_secs(59), Duration::from_secs(60)));
    assert!(should_idle_stop(false, Duration::from_secs(60), Duration::from_secs(60)));
}

#[test]
fn s6_orphan_sweep_kills_matching_token_only() {
    let cache = std::env::temp_dir().join(format!("wb-sc-{}", Uuid::new_v4().simple()));
    fs::create_dir_all(cache.join("preview")).unwrap();
    let token = "sweep-token-xyz";
    let mut cmd = Command::new("/bin/sh");
    cmd.args(["-c", "while :; do sleep 1; done", "--preview-token", token])
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        cmd.process_group(0);
    }
    let mut child = cmd.spawn().unwrap();
    let pid = child.id();
    let rec = SidecarFile {
        pid,
        pgid: pid as i32,
        port: 47301,
        started_at: 0,
        exe: "/bin/sh".into(),
        token: token.into(),
    };
    write_sidecar_file(&sidecar_path(&cache), &rec).unwrap();
    let n = sweep_orphans(&cache).unwrap();
    assert_eq!(n, 1);
    for _ in 0..20 {
        if !pid_alive(pid) {
            break;
        }
        std::thread::sleep(Duration::from_millis(50));
    }
    assert!(!pid_alive(pid), "matching orphan must die");
    let _ = child.try_wait();
    // A live pid whose cmdline lacks the token must not be killed.
    let mut other = Command::new("/bin/sleep")
        .arg("5")
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .unwrap();
    let opid = other.id();
    let rec2 = SidecarFile {
        pid: opid,
        pgid: opid as i32,
        port: 47302,
        started_at: 0,
        exe: "/bin/sleep".into(),
        token: token.into(),
    };
    write_sidecar_file(&sidecar_path(&cache), &rec2).unwrap();
    let n2 = sweep_orphans(&cache).unwrap();
    assert_eq!(n2, 0, "cmdline without token must not be killed");
    assert!(pid_alive(opid));
    let _ = other.kill();
    let _ = other.wait();
    let _ = fs::remove_dir_all(&cache);
}

#[test]
fn s6_dummy_start_stop_clears_pid_file() {
    let cache = std::env::temp_dir().join(format!("wb-sc2-{}", Uuid::new_v4().simple()));
    let logs = cache.join("logs");
    fs::create_dir_all(&cache).unwrap();
    let s = Sidecar::new(cache.clone(), logs, PathBuf::new());
    let port = s
        .start_dummy(Path::new("/bin/sh"), &["-c", "while :; do sleep 1; done"])
        .unwrap();
    assert!((PORT_MIN..=PORT_MAX).contains(&port));
    assert!(sidecar_path(&cache).is_file());
    let st = s.status();
    assert_eq!(st.state, SidecarPhase::Running);
    s.stop();
    let st2 = s.status();
    assert_eq!(st2.state, SidecarPhase::Stopped);
    assert!(!sidecar_path(&cache).is_file());
    let _ = fs::remove_dir_all(&cache);
}

#[test]
fn s7_install_error_codes() {
    assert_eq!(
        error_thai("PREVIEW_OFFLINE_FIRST_INSTALL"),
        "ต้องเชื่อมต่ออินเทอร์เน็ตครั้งแรกเพื่อติดตั้งเครื่องมือแสดงตัวอย่าง (ครั้งเดียว) — ระหว่างนี้แสดงตัวอย่างแบบพื้นฐาน"
    );
    assert_eq!(error_thai("PREVIEW_DISK_FULL"), "พื้นที่ดิสก์ไม่พอสำหรับเครื่องมือแสดงตัวอย่าง");
    assert_eq!(
        error_thai("PREVIEW_INSTALL_FAILED:boom"),
        "ติดตั้งเครื่องมือแสดงตัวอย่างไม่สำเร็จ"
    );
}

#[test]
fn s8_atomic_site_json_skips_unchanged() {
    let dir = std::env::temp_dir().join(format!("wb-hmr-{}", Uuid::new_v4().simple()));
    fs::create_dir_all(dir.join("src/data")).unwrap();
    let json = "{\"ok\":1}";
    assert!(crate::export::write_site_json_atomic(&dir, json).unwrap());
    assert!(!crate::export::write_site_json_atomic(&dir, json).unwrap());
    assert!(crate::export::write_site_json_atomic(&dir, "{\"ok\":2}").unwrap());
    let _ = fs::remove_dir_all(&dir);
}

#[test]
fn s7_stamp_skips_install() {
    let deps = std::env::temp_dir().join(format!("wb-deps-{}", Uuid::new_v4().simple()));
    let hash = "abc123hash";
    let dest = deps.join(hash);
    fs::create_dir_all(dest.join("node_modules")).unwrap();
    fs::write(dest.join(".ok"), lockfile_stamp()).unwrap();
    ensure_deps(Path::new("/bin/false"), &deps, hash).unwrap();
    assert!(dest.join("node_modules").is_dir());
    let _ = fs::remove_dir_all(&deps);
}

#[test]
fn s7_prune_keeps_current_and_one_older() {
    let deps = std::env::temp_dir().join(format!("wb-prune-{}", Uuid::new_v4().simple()));
    fs::create_dir_all(deps.join("keep")).unwrap();
    fs::create_dir_all(deps.join("old-a")).unwrap();
    fs::create_dir_all(deps.join("old-b")).unwrap();
    fs::create_dir_all(deps.join("gone.tmp")).unwrap();
    std::thread::sleep(Duration::from_millis(20));
    fs::write(deps.join("old-a").join("x"), b"1").unwrap();
    prune_old_hashes(&deps, "keep");
    assert!(deps.join("keep").is_dir());
    assert!(!deps.join("gone.tmp").exists());
    let others = fs::read_dir(&deps)
        .unwrap()
        .flatten()
        .filter(|e| e.path().is_dir() && e.file_name() != "keep")
        .count();
    assert!(others <= 1, "keep current + at most 1 older hash");
    let _ = fs::remove_dir_all(&deps);
}

#[test]
fn s8_preview_entry_not_in_export_tree_shape() {
    let dir = std::env::temp_dir().join(format!("wb-pe-{}", Uuid::new_v4().simple()));
    fs::create_dir_all(&dir).unwrap();
    fs::write(
        dir.join("index.html"),
        "<html><head></head><body><script type=\"module\" src=\"/src/main.tsx\"></script></body></html>",
    )
    .unwrap();
    write_preview_only_files(&dir).unwrap();
    let html = fs::read_to_string(dir.join("index.html")).unwrap();
    assert!(html.contains("/src/preview-entry.tsx"));
    assert!(!html.contains("/src/main.tsx"));
    assert!(html.contains("Content-Security-Policy"));
    let entry = fs::read_to_string(dir.join("src/preview-entry.tsx")).unwrap();
    assert!(entry.contains("__WB_PREVIEW__"));
    assert!(entry.contains("wb:select"));
    let _ = fs::remove_dir_all(&dir);
}

#[test]
fn s9_backoff_and_health_dead() {
    assert_eq!(next_backoff(0), None);
    assert_eq!(next_backoff(1), Some(1));
    assert_eq!(next_backoff(2), Some(4));
    assert_eq!(next_backoff(3), Some(15));
    assert_eq!(next_backoff(4), None);
    assert!(!health_dead(0));
    assert!(!health_dead(1));
    assert!(health_dead(2));
    assert!(should_reset_restarts(Duration::from_secs(300)));
    assert!(!should_reset_restarts(Duration::from_secs(299)));
}

#[test]
fn s6_vite_bridge_path_and_proxy() {
    assert_eq!(vite_bridge_path("wbpreview://localhost/"), "/");
    assert_eq!(
        vite_bridge_path("wbpreview://localhost/src/preview-entry.tsx?t=1"),
        "/src/preview-entry.tsx?t=1"
    );
    assert_eq!(
        vite_bridge_path("https://wbpreview.localhost/@vite/client"),
        "/@vite/client"
    );
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let port = listener.local_addr().unwrap().port();
    std::thread::spawn(move || {
        if let Ok((mut s, _)) = listener.accept() {
            let mut buf = [0u8; 256];
            let _ = s.read(&mut buf);
            let body = b"ok-bridge";
            let _ = s.write_all(
                format!(
                    "HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\nContent-Length: {}\r\n\r\n",
                    body.len()
                )
                .as_bytes(),
            );
            let _ = s.write_all(body);
            // Keep the socket open: Vite does this even after Connection: close.
            std::thread::sleep(Duration::from_millis(400));
        }
    });
    let (st, ct, body) = proxy_vite(port, "/hello").unwrap();
    assert_eq!(st, 200);
    assert!(ct.contains("text/plain"));
    assert_eq!(body, b"ok-bridge");
}

#[test]
fn s9_vite_probe_ok_and_miss() {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let port = listener.local_addr().unwrap().port();
    std::thread::spawn(move || {
        if let Ok((mut s, _)) = listener.accept() {
            let mut buf = [0u8; 256];
            let _ = s.read(&mut buf);
            let _ = s.write_all(b"HTTP/1.1 200 OK\r\nContent-Length: 0\r\n\r\n");
        }
    });
    assert!(vite_probe(port));
    assert!(!vite_probe(1));
}

#[test]
fn s9_log_has_crash_code_not_document() {
    let dir = std::env::temp_dir().join(format!("wb-log-{}", Uuid::new_v4().simple()));
    fs::create_dir_all(&dir).unwrap();
    log_event(&dir, "PREVIEW_CRASH exit=1 port=47301 restarts=1");
    let raw = fs::read_to_string(dir.join("preview-sidecar.log")).unwrap();
    assert!(raw.contains("PREVIEW_CRASH"));
    assert!(raw.contains("port=47301"));
    assert!(!raw.contains("site.json"));
    assert!(!raw.contains("nodes"));
    let _ = fs::remove_dir_all(&dir);
}

// ---- A1 (audit High 1): one start session, one process tree, nothing left after stop ----

/// Live processes (not zombies) whose cmdline contains `marker`.
fn a1_count(marker: &str) -> usize {
    let mut n = 0;
    for e in fs::read_dir("/proc").unwrap().flatten() {
        let Some(pid) = e.file_name().to_str().and_then(|x| x.parse::<u32>().ok()) else { continue };
        if !pid_alive(pid) {
            continue;
        }
        if let Ok(c) = fs::read(format!("/proc/{pid}/cmdline")) {
            if c.windows(marker.len()).any(|w| w == marker.as_bytes()) {
                n += 1;
            }
        }
    }
    n
}

fn a1_wait_count(marker: &str, want: usize) -> usize {
    let start = std::time::Instant::now();
    loop {
        let n = a1_count(marker);
        if n == want || start.elapsed() > std::time::Duration::from_secs(5) {
            return n;
        }
        std::thread::sleep(std::time::Duration::from_millis(50));
    }
}

fn a1_sidecar() -> (Arc<Sidecar>, PathBuf) {
    let cache = std::env::temp_dir().join(format!("wb-a1-{}", Uuid::new_v4().simple()));
    fs::create_dir_all(&cache).unwrap();
    (Sidecar::new(cache.clone(), cache.join("logs"), PathBuf::new()), cache)
}

#[test]
fn a1_concurrent_starts_share_one_session_and_one_tree() {
    let (s, cache) = a1_sidecar();
    let marker = format!("a1mark{}", Uuid::new_v4().simple());
    let script = format!("while :; do sleep 1; done; : {marker}");
    let mut hs = Vec::new();
    for _ in 0..3 {
        let s2 = Arc::clone(&s);
        let sc = script.clone();
        hs.push(std::thread::spawn(move || {
            s2.start_dummy_slow(Path::new("/bin/sh"), &["-c", &sc], 300).unwrap()
        }));
    }
    let sts: Vec<SidecarStatus> = hs.into_iter().map(|h| h.join().unwrap()).collect();
    let first = sts[0].session;
    assert!(first > 0, "{sts:?}");
    assert!(sts.iter().all(|st| st.session == first), "same session for every caller: {sts:?}");
    assert_eq!(a1_wait_count(&marker, 1), 1, "exactly one process tree");
    assert_eq!(s.spawned_groups().len(), 1);
    assert_eq!(s.status().state, SidecarPhase::Running);
    s.stop();
    assert_eq!(a1_wait_count(&marker, 0), 0, "stop leaves no child");
    assert!(s.spawned_groups().is_empty());
    let _ = fs::remove_dir_all(&cache);
}

#[test]
fn a1_stop_while_preparing_spawns_nothing() {
    let (s, cache) = a1_sidecar();
    let marker = format!("a1mark{}", Uuid::new_v4().simple());
    let script = format!("while :; do sleep 1; done; : {marker}");
    let s2 = Arc::clone(&s);
    let h = std::thread::spawn(move || s2.start_dummy_slow(Path::new("/bin/sh"), &["-c", &script], 400).unwrap());
    std::thread::sleep(std::time::Duration::from_millis(100));
    assert_eq!(s.status().state, SidecarPhase::Starting, "Starting is claimed before the slow work");
    s.stop();
    let st = h.join().unwrap();
    assert_eq!(st.state, SidecarPhase::Stopped);
    std::thread::sleep(std::time::Duration::from_millis(200));
    assert_eq!(a1_count(&marker), 0);
    assert!(s.spawned_groups().is_empty());
    let _ = fs::remove_dir_all(&cache);
}

#[test]
fn a1_stop_kills_untracked_group_and_orphaned_members() {
    let (s, cache) = a1_sidecar();
    // Tracked tree whose leader dies but leaves a member in its group (the crash case).
    let marker = format!("a1mark{}", Uuid::new_v4().simple());
    let inner = format!("while :; do sleep 1; done; : {marker}");
    let outer = format!("sh -c '{inner}' & wait");
    s.start_dummy(Path::new("/bin/sh"), &["-c", &outer]).unwrap();
    assert_eq!(a1_wait_count(&marker, 2), 2);
    // An untracked group of ours (lost the tracked slot).
    let tok = Uuid::new_v4().simple().to_string();
    let mut cmd = Command::new("/bin/sh");
    cmd.args(["-c", &inner, "--preview-token", &tok]);
    {
        use std::os::unix::process::CommandExt;
        cmd.process_group(0);
    }
    let mut lost = cmd.spawn().unwrap();
    s.track_spawned_for_test(lost.id(), lost.id() as i32, &tok);
    assert_eq!(a1_wait_count(&marker, 3), 3);
    s.stop();
    let _ = lost.try_wait();
    assert_eq!(a1_wait_count(&marker, 0), 0, "stop kills tracked group members and untracked groups");
    let _ = lost.wait();
    let _ = fs::remove_dir_all(&cache);
}

#[test]
fn a1_run_vite_has_parent_watchdog_and_group_kill() {
    assert!(RUN_VITE.contains("process.ppid !== parent"));
    assert!(RUN_VITE.contains("process.kill(-process.pid, \"SIGKILL\")"));
}

// ---------------- A2 ----------------

/// A2 tests: on any exit (including a failed assert) kill our own leftovers, found by the test's unique marker.
struct Reap(String);
impl Drop for Reap {
    fn drop(&mut self) {
        for p in a2_pids(&self.0) {
            unsafe {
                libc::kill(p as i32, libc::SIGKILL);
            }
        }
    }
}

fn a2_pids(marker: &str) -> Vec<u32> {
    let mut out = Vec::new();
    for e in fs::read_dir("/proc").unwrap().flatten() {
        let Some(pid) = e.file_name().to_str().and_then(|x| x.parse::<u32>().ok()) else { continue };
        if !pid_alive(pid) {
            continue;
        }
        if let Ok(c) = fs::read(format!("/proc/{pid}/cmdline")) {
            if c.windows(marker.len()).any(|w| w == marker.as_bytes()) {
                out.push(pid);
            }
        }
    }
    out
}

/// A2 item 9 (Designer Low b): leader AND child ignore SIGTERM → stop escalates to SIGKILL; 0 left.
#[test]
fn a2_stop_escalates_to_kill_when_tree_ignores_term() {
    let (s, cache) = a1_sidecar();
    let marker = format!("a2ign{}", Uuid::new_v4().simple());
    let _reap = Reap(marker.clone());
    let child = format!("(while :; do sleep 1; done; : {marker}c) &");
    let script = format!("trap '' TERM; {child} while :; do sleep 1; done; : {marker}");
    s.start_dummy(Path::new("/bin/sh"), &["-c", &script]).unwrap();
    assert_eq!(a1_wait_count(&marker, 2), 2, "leader + TERM-ignoring child");
    let groups = s.spawned_groups();
    assert_eq!(groups.len(), 1);
    let t0 = Instant::now();
    s.stop();
    let took = t0.elapsed();
    assert_eq!(a1_wait_count(&marker, 0), 0, "SIGKILL escalation leaves no process");
    assert!(group_members(groups[0]).is_empty(), "group empty");
    assert!(took >= STOP_KILL_AFTER, "TERM was ignored, so stop waited for the KILL deadline ({took:?})");
    // The group-wide KILL at the deadline ends the tree at once; without it the leader alone is killed and the
    // member waits for kill_untracked's own TERM→1.5 s→KILL, which this bound rejects.
    assert!(took < STOP_KILL_AFTER + Duration::from_millis(1200), "then the whole group is killed promptly ({took:?})");
    let _ = fs::remove_dir_all(&cache);
}

/// A2 item 9: the leader exits on SIGTERM but leaves a TERM-ignoring member in its group → KILL; 0 left.
#[test]
fn a2_stop_kills_term_ignoring_member_after_leader_exits() {
    let (s, cache) = a1_sidecar();
    let marker = format!("a2mem{}", Uuid::new_v4().simple());
    let _reap = Reap(marker.clone());
    let script = format!(
        "(trap '' TERM; while :; do sleep 1; done; : {marker}c) & trap 'exit 0' TERM; while :; do sleep 1; done; : {marker}"
    );
    s.start_dummy(Path::new("/bin/sh"), &["-c", &script]).unwrap();
    assert_eq!(a1_wait_count(&marker, 2), 2);
    let pgid = s.spawned_groups()[0];
    s.stop();
    assert_eq!(a1_wait_count(&marker, 0), 0, "member that ignored TERM was killed");
    assert!(group_members(pgid).is_empty());
    let _ = fs::remove_dir_all(&cache);
}

/// A2 item 6: every process of a spawned tree carries the token in its environment.
#[test]
fn a2_spawned_tree_carries_token_env() {
    let (s, cache) = a1_sidecar();
    let marker = format!("a2env{}", Uuid::new_v4().simple());
    let _reap = Reap(marker.clone());
    let script = format!("(while :; do sleep 1; done; : {marker}c) & while :; do sleep 1; done; : {marker}");
    s.start_dummy(Path::new("/bin/sh"), &["-c", &script]).unwrap();
    assert_eq!(a1_wait_count(&marker, 2), 2);
    let tok = s.status_token_for_test();
    for pid in a2_pids(&marker) {
        assert!(environ_has_token(pid as i32, &tok), "pid {pid} has {TOKEN_ENV}");
    }
    s.stop();
    assert_eq!(a1_wait_count(&marker, 0), 0);
    let _ = fs::remove_dir_all(&cache);
}

/// A2 item 6: the sweep kills only members that are in the recorded group AND carry the token; a member of
/// the same group without the token, a record whose pid is not its group leader, and a record whose group
/// does not match the live process are all left alone.
#[test]
fn a2_sweep_verifies_group_and_token_per_member() {
    let cache = std::env::temp_dir().join(format!("wb-a2s-{}", Uuid::new_v4().simple()));
    fs::create_dir_all(cache.join("preview")).unwrap();
    let tok = Uuid::new_v4().simple().to_string();
    let marker = format!("a2sw{}", Uuid::new_v4().simple());
    let _reap = Reap(marker.clone());
    // Leader exits at once, leaving two members in its group: one with the token env, one exec'd without it
    // (/proc/<pid>/environ is the exec-time environment, so both are fresh execs with their own cmdline).
    let script = format!(
        "(exec /bin/sh -c 'while :; do sleep 1; done; : {marker}yes') & (exec env -u {TOKEN_ENV} /bin/sh -c 'while :; do sleep 1; done; : {marker}no') & exit 0"
    );
    let mut cmd = Command::new("/bin/sh");
    cmd.args(["-c", &script]).env(TOKEN_ENV, &tok).stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null());
    {
        use std::os::unix::process::CommandExt;
        cmd.process_group(0);
    }
    let mut leader = cmd.spawn().unwrap();
    let lpid = leader.id();
    let _ = leader.wait();
    assert_eq!(a1_wait_count(&format!("{marker}yes"), 1), 1);
    assert_eq!(a1_wait_count(&format!("{marker}no"), 1), 1);
    let yes = a2_pids(&format!("{marker}yes"))[0];
    let no = a2_pids(&format!("{marker}no"))[0];
    assert_eq!(proc_pgid(no as i32), Some(lpid as i32));
    let rec = |pid: u32, pgid: i32| SidecarFile { pid, pgid, port: 47303, started_at: 0, exe: "/bin/sh".into(), token: tok.clone() };
    // pid != pgid (not a group leader record) → untouched
    write_sidecar_file(&sidecar_path(&cache), &rec(yes, lpid as i32)).unwrap();
    assert_eq!(sweep_orphans(&cache).unwrap(), 0);
    // record names a group the live pid is not in → untouched
    write_sidecar_file(&sidecar_path(&cache), &rec(yes, yes as i32)).unwrap();
    assert_eq!(sweep_orphans(&cache).unwrap(), 0);
    assert!(pid_alive(yes) && pid_alive(no));
    // wrong token → untouched
    let mut bad = rec(lpid, lpid as i32);
    bad.token = Uuid::new_v4().simple().to_string();
    write_sidecar_file(&sidecar_path(&cache), &bad).unwrap();
    assert_eq!(sweep_orphans(&cache).unwrap(), 0);
    assert!(pid_alive(yes) && pid_alive(no));
    // the real record: only the member carrying the token dies
    write_sidecar_file(&sidecar_path(&cache), &rec(lpid, lpid as i32)).unwrap();
    // the token member (and its current `sleep 1`, which inherits the env) — never the other one
    assert!(sweep_orphans(&cache).unwrap() >= 1);
    assert_eq!(a1_wait_count(&format!("{marker}yes"), 0), 0, "token member killed");
    assert_eq!(a1_count(&format!("{marker}no")), 1, "member without the token is not ours");
    assert!(!sidecar_path(&cache).exists());
    // cleanup: our own test process, pid checked by marker
    for p in a2_pids(&format!("{marker}no")) {
        unsafe {
            libc::kill(p as i32, libc::SIGKILL);
        }
    }
    assert_eq!(a1_wait_count(&format!("{marker}no"), 0), 0);
    let _ = fs::remove_dir_all(&cache);
}

/// A2 item 4: the Preview entry measures boxes on events, not on a timer.
#[test]
fn a2_preview_entry_has_no_polling() {
    assert!(!PREVIEW_ENTRY.contains("setInterval"));
    assert!(PREVIEW_ENTRY.contains("new MutationObserver("));
    assert!(PREVIEW_ENTRY.contains("new ResizeObserver(queueBoxes)"));
    assert!(PREVIEW_ENTRY.contains("requestAnimationFrame("));
}
