//! PREVIEW-CODE-VIEW S6–S9: Rust-managed Vite sidecar.
//! System bun/node are never used; `bun_path` is the bundled binary (or a test double).

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs::{self, File, OpenOptions};
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use uuid::Uuid;

pub const PORT_MIN: u16 = 47300;
pub const PORT_MAX: u16 = 47399;
pub const IDLE_MS: u64 = 60_000;
pub const STOP_KILL_AFTER: Duration = Duration::from_secs(3);
#[allow(dead_code)]
pub const PSS_POLL_MS: u64 = 2_000;
pub const HEALTH_MS: u64 = 10_000;
pub const HEALTH_TIMEOUT: Duration = Duration::from_secs(2);
pub const BACKOFF_SECS: [u64; 3] = [1, 4, 15];
pub const RESTART_RESET: Duration = Duration::from_secs(300);

const EXCLUDED: &[u16] = &[1420, 1520, 1530];

const PREVIEW_ENTRY: &str = r##"globalThis.__WB_PREVIEW__ = true;
import "./main.tsx";

function post(m) {
  window.parent.postMessage(m, "*");
}
post({ type: "wb:ready" });
const ro = new ResizeObserver(() => {
  post({ type: "wb:height", height: Math.ceil(document.documentElement.scrollHeight) });
});
ro.observe(document.documentElement);
function route() {
  post({ type: "wb:route", path: location.pathname + location.search });
}
const wrap = (fn) =>
  function (...a) {
    const r = fn.apply(this, a);
    route();
    return r;
  };
history.pushState = wrap(history.pushState);
history.replaceState = wrap(history.replaceState);
window.addEventListener("popstate", route);
window.addEventListener("message", (e) => {
  if (!e.data || e.data.type !== "wb:navigate") return;
  if (typeof e.data.path === "string") history.pushState({}, "", e.data.path);
});
document.addEventListener("click", (e) => {
  const t = e.target;
  if (!(t instanceof Element)) return;
  const a = t.closest("a[href]");
  if (a) {
    const href = a.getAttribute("href") || "";
    if (href && !(href.startsWith("/") && !href.startsWith("//")) && !href.startsWith('#')) {
      e.preventDefault();
      post({ type: "wb:external", href });
      return;
    }
  }
  const n = t.closest("[data-node-id]");
  post({ type: "wb:select", id: n ? n.getAttribute("data-node-id") : null });
});
function boxes() {
  const list = [];
  document.querySelectorAll("[data-node-id]").forEach((el) => {
    const r = el.getBoundingClientRect();
    list.push({ id: el.getAttribute("data-node-id"), x: r.x, y: r.y, w: r.width, h: r.height });
  });
  post({ type: "wb:boxes", boxes: list });
}
// A2: event-driven measuring, no polling. At most one post per frame, after a scroll, a resize, a DOM /
// attribute / text change, a node's own size change, a transition / animation end, font or page load.
let boxesQueued = false;
function queueBoxes() {
  if (boxesQueued) return;
  boxesQueued = true;
  requestAnimationFrame(() => {
    boxesQueued = false;
    boxes();
  });
}
const nodeRo = new ResizeObserver(queueBoxes);
const watched = new WeakSet();
function watchNodes() {
  document.querySelectorAll("[data-node-id]").forEach((el) => {
    if (watched.has(el)) return;
    watched.add(el);
    nodeRo.observe(el);
  });
}
new MutationObserver(() => {
  watchNodes();
  queueBoxes();
}).observe(document.documentElement, { subtree: true, childList: true, attributes: true, characterData: true });
window.addEventListener("scroll", queueBoxes, true);
window.addEventListener("resize", queueBoxes);
document.addEventListener("transitionend", queueBoxes, true);
document.addEventListener("animationend", queueBoxes, true);
window.addEventListener("load", queueBoxes);
if (document.fonts) document.fonts.ready.then(queueBoxes);
watchNodes();
queueBoxes();
document.addEventListener("dblclick", (e) => {
  const t = e.target;
  if (!(t instanceof Element)) return;
  const n = t.closest("[data-node-id]");
  if (!n) return;
  e.preventDefault();
  post({ type: "wb:edit", id: n.getAttribute("data-node-id") });
});
"##;

const RUN_VITE: &str = r#"
const port = process.env.WB_VITE_PORT || "47300";
// A1: the app starts this script as a process-group leader. If the app goes away (crash, kill -9),
// our parent changes; take the whole group (bun x → vite → esbuild) down so nothing outlives the app.
const parent = process.ppid;
const proc = Bun.spawn(["bun", "--bun", "x", "vite", "--host", "127.0.0.1", "--port", port, "--strictPort"], {
  stdout: "inherit",
  stderr: "inherit",
  stdin: "ignore",
});
setInterval(() => {
  if (process.ppid !== parent) {
    try { proc.kill("SIGKILL"); } catch {}
    try { process.kill(-process.pid, "SIGKILL"); } catch {}
    process.exit(1);
  }
}, 1000);
await proc.exited;
process.exit(proc.exitCode ?? 1);
"#;

const VITE_CONFIG: &str = r#"import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  server: {
    host: "127.0.0.1",
    allowedHosts: ["127.0.0.1", "localhost"],
    strictPort: true,
    open: false,
    fs: { strict: true },
    watch: { ignored: ["**/node_modules/**"] },
    hmr: {
      protocol: "ws",
      host: "127.0.0.1",
      clientPort: Number(process.env.WB_VITE_PORT || "47300"),
    },
  },
});
"#;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum SidecarPhase {
    Stopped,
    Starting,
    Running,
    Error,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SidecarStatus {
    pub state: SidecarPhase,
    pub port: Option<u16>,
    pub pss_mb: Option<f64>,
    pub error: Option<String>,
    pub error_code: Option<String>,
    /// A1: start session id. Concurrent `preview_sidecar_start` callers during one start get the same id.
    #[serde(default)]
    pub session: u64,
}

/// A1: a start whose session was stopped or replaced while it prepared; its child (if any) is already killed.
pub const START_SUPERSEDED: &str = "PREVIEW_START_SUPERSEDED";

/// A1: result of claiming a start under the lock.
#[derive(Debug, Clone)]
pub enum StartGate {
    /// This caller owns the new session and must spawn.
    Fresh(u64),
    /// A start is already in flight (or running): the same session, no second spawn.
    Existing(SidecarStatus),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SidecarFile {
    pub pid: u32,
    pub pgid: i32,
    pub port: u16,
    pub started_at: u64,
    pub exe: String,
    pub token: String,
}

pub fn is_excluded_port(p: u16) -> bool {
    EXCLUDED.contains(&p) || (14380..=14399).contains(&p)
}

/// A2: probes are serialised in-process, so two concurrent `pick_port` calls never hold each other's probe
/// bind (that made `s6_pick_port_in_range_and_free` flaky under the parallel test runner).
pub(crate) static PICK_LOCK: Mutex<()> = Mutex::new(());

pub fn pick_port() -> Result<u16, String> {
    let _g = PICK_LOCK.lock().unwrap_or_else(|e| e.into_inner());
    pick_port_unlocked()
}

pub(crate) fn pick_port_unlocked() -> Result<u16, String> {
    let span = (PORT_MAX - PORT_MIN + 1) as u32;
    let seed = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.subsec_nanos())
        .unwrap_or(0);
    let start = PORT_MIN + ((seed % span) as u16);
    for i in 0..10u16 {
        let mut p = start + i;
        if p > PORT_MAX {
            p = PORT_MIN + (p - PORT_MAX - 1);
        }
        if is_excluded_port(p) {
            continue;
        }
        if TcpListener::bind(("127.0.0.1", p)).is_ok() {
            return Ok(p);
        }
    }
    Err("ไม่พบพอร์ตว่างสำหรับเครื่องมือแสดงตัวอย่าง".into())
}

pub fn sidecar_path(cache: &Path) -> PathBuf {
    cache.join("preview").join("sidecar.json")
}

/// A2: every process of a preview tree carries `WB_PREVIEW_TOKEN=<token>` in its environment.
pub const TOKEN_ENV: &str = "WB_PREVIEW_TOKEN";

/// A2: `/proc/<pid>/environ` holds `WB_PREVIEW_TOKEN=<token>` (only readable for our own processes).
fn environ_has_token(pid: i32, token: &str) -> bool {
    if token.is_empty() {
        return false;
    }
    let Ok(env) = fs::read(format!("/proc/{pid}/environ")) else { return false };
    let want = format!("{TOKEN_ENV}={token}");
    env.split(|b| *b == 0).any(|kv| kv == want.as_bytes())
}

/// A2: process group of `pid` from `/proc/<pid>/stat` (None when gone or a zombie).
fn proc_pgid(pid: i32) -> Option<i32> {
    let stat = fs::read_to_string(format!("/proc/{pid}/stat")).ok()?;
    let close = stat.rfind(')')?;
    let f: Vec<&str> = stat[close + 1..].split_whitespace().collect();
    if f.len() < 3 || f[0] == "Z" {
        return None;
    }
    f[2].parse().ok()
}

/// A2: a pid belongs to the recorded tree only when it is still in the recorded group AND carries the
/// recorded token (cmdline for the leader, environment for every member). A reused pid or a group of
/// someone else's never matches.
fn sweep_member_ours(pid: i32, rec: &SidecarFile) -> bool {
    if proc_pgid(pid) != Some(rec.pgid) {
        return false;
    }
    environ_has_token(pid, &rec.token)
        || read_cmdline(pid as u32).is_some_and(|c| cmdline_has_token(&c, &rec.token))
}

pub fn cmdline_has_token(cmdline: &[u8], token: &str) -> bool {
    let needle = format!("--preview-token\0{token}");
    cmdline.windows(needle.len()).any(|w| w == needle.as_bytes())
        || cmdline
            .windows(token.len() + 16)
            .any(|w| w.windows(token.len()).any(|x| x == token.as_bytes()) && w.windows(16).any(|x| x == b"--preview-token"))
}

fn read_cmdline(pid: u32) -> Option<Vec<u8>> {
    fs::read(format!("/proc/{pid}/cmdline")).ok()
}

fn pid_alive(pid: u32) -> bool {
    let Ok(s) = fs::read_to_string(format!("/proc/{pid}/status")) else {
        return false;
    };
    for line in s.lines() {
        if let Some(rest) = line.strip_prefix("State:") {
            let st = rest.trim().chars().next().unwrap_or('Z');
            return st != 'Z' && st != 'X';
        }
    }
    false
}

pub fn sweep_orphans(cache: &Path) -> Result<u32, String> {
    let path = sidecar_path(cache);
    let Ok(raw) = fs::read_to_string(&path) else {
        return Ok(0);
    };
    let rec: SidecarFile = match serde_json::from_str(&raw) {
        Ok(r) => r,
        Err(_) => {
            let _ = fs::remove_file(&path);
            return Ok(0);
        }
    };
    let _ = fs::remove_file(&path);
    // A2: the record is only a hint. We spawn the leader as its own group leader (pid == pgid) with a
    // 32-hex token (>= 8 chars accepted); anything else in the file is not ours to touch.
    if rec.pgid <= 1 || rec.pid as i32 != rec.pgid || rec.token.trim().len() < 8 {
        return Ok(0);
    }
    // Never a group of this process (pid reuse could hand our own pgid back).
    #[cfg(unix)]
    if rec.pgid == unsafe { libc::getpgrp() } {
        return Ok(0);
    }
    let ours = |pid: i32| sweep_member_ours(pid, &rec);
    let victims: Vec<i32> = group_members(rec.pgid).into_iter().map(|(p, _)| p).filter(|p| ours(*p)).collect();
    if victims.is_empty() {
        return Ok(0);
    }
    // Per pid, re-checked right before each signal — never a group-wide kill on the file's word.
    for p in &victims {
        if ours(*p) {
            unsafe {
                libc::kill(*p, libc::SIGTERM);
            }
        }
    }
    let start = Instant::now();
    while victims.iter().any(|p| ours(*p)) && start.elapsed() < Duration::from_millis(1500) {
        std::thread::sleep(Duration::from_millis(50));
    }
    for p in &victims {
        if ours(*p) {
            unsafe {
                libc::kill(*p, libc::SIGKILL);
            }
        }
    }
    Ok(victims.len() as u32)
}

#[cfg(unix)]
fn kill_group(pgid: i32, sig: i32) {
    if pgid <= 1 {
        return;
    }
    unsafe {
        libc::kill(-pgid.abs(), sig);
    }
}

#[cfg(not(unix))]
fn kill_group(_pgid: i32, _sig: i32) {}

pub fn pss_kb(pid: u32) -> u64 {
    let mut total = pss_kb_one(pid);
    if let Ok(children) = fs::read_to_string(format!("/proc/{pid}/task/{pid}/children")) {
        for part in children.split_whitespace() {
            if let Ok(c) = part.parse::<u32>() {
                total += pss_kb(c);
            }
        }
    }
    total
}

fn pss_kb_one(pid: u32) -> u64 {
    let Ok(s) = fs::read_to_string(format!("/proc/{pid}/smaps_rollup")) else {
        return 0;
    };
    for line in s.lines() {
        if let Some(rest) = line.strip_prefix("Pss:") {
            let n: u64 = rest
                .split_whitespace()
                .next()
                .and_then(|x| x.parse().ok())
                .unwrap_or(0);
            return n;
        }
    }
    0
}

fn hex_sha256(parts: &[&[u8]]) -> String {
    let mut h = Sha256::new();
    for p in parts {
        h.update(p);
    }
    h.finalize().iter().map(|b| format!("{b:02x}")).collect()
}

pub fn template_hash(bun_version: &str) -> String {
    hex_sha256(&[
        include_bytes!("../../export-templates/vite-react/package.json"),
        include_bytes!("../../export-templates/vite-react/bun.lock"),
        bun_version.as_bytes(),
    ])
}

#[derive(Clone)]
struct SpawnSpec {
    ws: PathBuf,
    deps: PathBuf,
    bun_version: String,
}

struct Inner {
    phase: SidecarPhase,
    port: Option<u16>,
    child: Option<Child>,
    pgid: i32,
    token: String,
    last_activity: Instant,
    visible: bool,
    error: Option<String>,
    error_code: Option<String>,
    restarts: u8,
    up_since: Option<Instant>,
    health_misses: u8,
    last_health: Instant,
    restart_at: Option<Instant>,
    preview_ws: Option<PathBuf>,
    /// A1: current start session (bumped only by `begin_start`).
    session: u64,
    /// A1: every process group this sidecar spawned `(pid, pgid, token)`, so stop / replace can kill
    /// one that is no longer the tracked child.
    spawned: Vec<(u32, i32, String)>,
}

impl Inner {
    fn stopped() -> Self {
        Self {
            phase: SidecarPhase::Stopped,
            port: None,
            child: None,
            pgid: 0,
            token: String::new(),
            last_activity: Instant::now(),
            visible: false,
            error: None,
            error_code: None,
            restarts: 0,
            up_since: None,
            health_misses: 0,
            last_health: Instant::now(),
            restart_at: None,
            preview_ws: None,
            session: 0,
            spawned: Vec::new(),
        }
    }
}

fn status_of(g: &Inner) -> SidecarStatus {
    let pss = g.child.as_ref().map(|c| pss_kb(c.id() as u32) as f64 / 1024.0);
    SidecarStatus {
        state: g.phase,
        port: g.port,
        pss_mb: pss,
        error: g.error.clone(),
        error_code: g.error_code.clone(),
        session: g.session,
    }
}

fn set_error_locked(g: &mut Inner, code: &str) {
    let key = code.split(':').next().unwrap_or(code);
    g.phase = SidecarPhase::Error;
    g.error_code = Some(key.to_string());
    g.error = Some(error_thai(code));
    g.restart_at = None;
}

/// A1: `(pid, sid)` of every process in group `pgid` (Linux `/proc/*/stat`).
fn group_members(pgid: i32) -> Vec<(i32, i32)> {
    let mut out = Vec::new();
    if pgid <= 1 {
        return out;
    }
    let Ok(rd) = fs::read_dir("/proc") else { return out };
    for e in rd.flatten() {
        let name = e.file_name();
        let Some(pid) = name.to_str().and_then(|n| n.parse::<i32>().ok()) else { continue };
        let Ok(stat) = fs::read_to_string(format!("/proc/{pid}/stat")) else { continue };
        let Some(close) = stat.rfind(')') else { continue };
        // after ") ": state ppid pgrp session …
        let f: Vec<&str> = stat[close + 1..].split_whitespace().collect();
        if f.len() < 4 || f[0] == "Z" {
            continue;
        }
        let pgrp = f[2].parse::<i32>().unwrap_or(0);
        let sid = f[3].parse::<i32>().unwrap_or(0);
        if pgrp == pgid {
            out.push((pid, sid));
        }
    }
    out
}

/// A1: kill every group this sidecar spawned except `keep` (0 = none). A group is ours when its leader still
/// carries our token, or when every member is in our own session (Linux never reuses a pid as a new pgid
/// while the group exists). Reaps the leaders it can.
fn kill_untracked(spawned: &mut Vec<(u32, i32, String)>, keep: i32) {
    #[cfg(unix)]
    let my_sid = unsafe { libc::getsid(0) };
    #[cfg(not(unix))]
    let my_sid = 0;
    let mut rest = Vec::new();
    for (pid, pgid, token) in spawned.drain(..) {
        if pgid == keep {
            rest.push((pid, pgid, token));
            continue;
        }
        let members = group_members(pgid);
        let leader_ours = read_cmdline(pid).is_some_and(|c| cmdline_has_token(&c, &token));
        if !members.is_empty() && (leader_ours || members.iter().all(|(_, sid)| *sid == my_sid)) {
            kill_group(pgid, libc::SIGTERM);
            let start = Instant::now();
            while !group_members(pgid).is_empty() && start.elapsed() < Duration::from_millis(1500) {
                std::thread::sleep(Duration::from_millis(50));
            }
            if !group_members(pgid).is_empty() {
                kill_group(pgid, libc::SIGKILL);
            }
        }
        #[cfg(unix)]
        unsafe {
            let mut st = 0;
            libc::waitpid(pid as i32, &mut st, libc::WNOHANG);
        }
    }
    *spawned = rest;
}

pub struct Sidecar {
    inner: Mutex<Inner>,
    spec: Mutex<Option<SpawnSpec>>,
    pub cache_dir: PathBuf,
    pub log_dir: PathBuf,
    pub bun: PathBuf,
}

impl Sidecar {
    pub fn new(cache_dir: PathBuf, log_dir: PathBuf, bun: PathBuf) -> Arc<Self> {
        let s = Arc::new(Self {
            inner: Mutex::new(Inner::stopped()),
            spec: Mutex::new(None),
            cache_dir,
            log_dir,
            bun,
        });
        let loop_s = Arc::clone(&s);
        std::thread::Builder::new()
            .name("wb-sidecar-idle".into())
            .spawn(move || sidecar_loop(loop_s))
            .ok();
        s
    }

    pub fn status(&self) -> SidecarStatus {
        let g = self.inner.lock().unwrap_or_else(|e| e.into_inner());
        status_of(&g)
    }

    /// A1 (audit High 1): claim the start under the lock, before any slow work. While a start is in flight
    /// (or running), every other caller gets that same session back and spawns nothing.
    pub fn begin_start(&self) -> StartGate {
        let mut g = self.inner.lock().unwrap_or_else(|e| e.into_inner());
        if g.phase == SidecarPhase::Running || g.phase == SidecarPhase::Starting {
            return StartGate::Existing(status_of(&g));
        }
        g.session = g.session.wrapping_add(1);
        g.phase = SidecarPhase::Starting;
        g.port = None;
        g.error = None;
        g.error_code = None;
        g.restart_at = None;
        g.health_misses = 0;
        g.last_activity = Instant::now();
        StartGate::Fresh(g.session)
    }

    /// A1: a start that failed while preparing turns into an error only if it is still the live start.
    pub fn fail_start(&self, session: u64, code: &str) {
        let mut g = self.inner.lock().unwrap_or_else(|e| e.into_inner());
        if g.session == session && g.phase == SidecarPhase::Starting {
            set_error_locked(&mut g, code);
        }
    }

    fn is_live_start(&self, session: u64) -> bool {
        let g = self.inner.lock().unwrap_or_else(|e| e.into_inner());
        g.session == session && g.phase == SidecarPhase::Starting
    }

    /// A1: spawn `cmd` (+ `--preview-token`) as a new process group and make it the tracked child — unless the
    /// session was stopped / replaced meanwhile, in which case the new group is killed at once. Any older group
    /// this sidecar spawned is killed too, so there is never more than one tree.
    fn spawn_tracked(&self, session: u64, mut cmd: Command, port: u16, exe: String) -> Result<u32, String> {
        let token = Uuid::new_v4().simple().to_string();
        cmd.arg("--preview-token").arg(&token);
        // A2: inherited by bun x → vite → esbuild, so a sweep can prove each member is ours.
        cmd.env(TOKEN_ENV, &token);
        #[cfg(unix)]
        {
            use std::os::unix::process::CommandExt;
            cmd.process_group(0);
        }
        let mut child = cmd
            .spawn()
            .map_err(|e| format!("PREVIEW_INSTALL_FAILED:{e}"))?;
        let pid = child.id();
        let pgid = pid as i32;
        let mut g = self.inner.lock().unwrap_or_else(|e| e.into_inner());
        if g.session != session || g.phase != SidecarPhase::Starting {
            drop(g);
            kill_group(pgid, libc::SIGKILL);
            let _ = child.kill();
            let _ = child.wait();
            return Err(START_SUPERSEDED.into());
        }
        if let Some(mut old) = g.child.take() {
            kill_group(g.pgid, libc::SIGKILL);
            let _ = old.kill();
            let _ = old.wait();
        }
        g.spawned.push((pid, pgid, token.clone()));
        let rec = SidecarFile {
            pid,
            pgid,
            port,
            started_at: now_secs(),
            exe,
            token: token.clone(),
        };
        let wrote = write_sidecar_file(&sidecar_path(&self.cache_dir), &rec);
        g.child = Some(child);
        g.pgid = pgid;
        g.token = token;
        g.port = Some(port);
        g.last_activity = Instant::now();
        g.up_since = Some(Instant::now());
        kill_untracked(&mut g.spawned, pgid);
        wrote.map(|_| pid)
    }

    pub fn note_activity(&self) {
        if let Ok(mut g) = self.inner.lock() {
            g.last_activity = Instant::now();
        }
    }

    pub fn set_visible(&self, visible: bool) {
        if let Ok(mut g) = self.inner.lock() {
            if g.visible && !visible {
                g.last_activity = Instant::now();
            }
            g.visible = visible;
        }
    }

    pub fn stop(&self) {
        let ws = {
            let mut g = self.inner.lock().unwrap_or_else(|e| e.into_inner());
            let ws = g.preview_ws.clone();
            self.stop_locked(&mut g);
            ws
        };
        if let Some(ws) = ws {
            crate::export::restore_index_after_preview(&ws);
        }
    }

    pub fn reset_restarts(&self) {
        if let Ok(mut g) = self.inner.lock() {
            g.restarts = 0;
            g.restart_at = None;
            g.health_misses = 0;
        }
    }

    fn stop_locked(&self, g: &mut Inner) {
        if let Some(mut child) = g.child.take() {
            kill_group(g.pgid, libc::SIGTERM);
            let start = Instant::now();
            loop {
                if child.try_wait().ok().flatten().is_some() {
                    break;
                }
                if start.elapsed() >= STOP_KILL_AFTER {
                    kill_group(g.pgid, libc::SIGKILL);
                    let _ = child.kill();
                    let _ = child.wait();
                    break;
                }
                std::thread::sleep(Duration::from_millis(50));
            }
        }
        // A1: nothing we spawned outlives a stop (a tree that lost the tracked slot, a crashed leader's group).
        kill_untracked(&mut g.spawned, 0);
        g.phase = SidecarPhase::Stopped;
        g.port = None;
        g.pgid = 0;
        g.up_since = None;
        g.restart_at = None;
        g.health_misses = 0;
        let _ = fs::remove_file(sidecar_path(&self.cache_dir));
    }

    #[cfg(test)]
    pub fn start_dummy(&self, exe: &Path, extra_args: &[&str]) -> Result<u16, String> {
        self.start_dummy_slow(exe, extra_args, 0)
            .and_then(|st| st.port.ok_or_else(|| "no port".to_string()))
    }

    /// A1 test double of `preview_sidecar_start`: gate → `prep_ms` of "slow work" → tracked spawn → running.
    #[cfg(test)]
    pub fn start_dummy_slow(&self, exe: &Path, extra_args: &[&str], prep_ms: u64) -> Result<SidecarStatus, String> {
        let session = match self.begin_start() {
            StartGate::Existing(st) => return Ok(st),
            StartGate::Fresh(n) => n,
        };
        std::thread::sleep(Duration::from_millis(prep_ms));
        let port = pick_port()?;
        let mut cmd = Command::new(exe);
        cmd.args(extra_args)
            .env_clear()
            .env("PATH", "/usr/bin:/bin")
            .env("HOME", std::env::var("HOME").unwrap_or_else(|_| "/tmp".into()))
            .env("NODE_ENV", "development")
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null());
        match self.spawn_tracked(session, cmd, port, exe.to_string_lossy().into_owned()) {
            Ok(_) => {}
            Err(e) if e == START_SUPERSEDED => return Ok(self.status()),
            Err(e) => {
                self.fail_start(session, &e);
                return Err(e);
            }
        }
        let mut g = self.inner.lock().unwrap_or_else(|e| e.into_inner());
        if g.session == session && g.phase == SidecarPhase::Starting {
            g.phase = SidecarPhase::Running;
        }
        Ok(status_of(&g))
    }

    /// A1 tests: register a group spawned outside `spawn_tracked` (stands in for a lost / untracked tree).
    #[cfg(test)]
    pub fn track_spawned_for_test(&self, pid: u32, pgid: i32, token: &str) {
        let mut g = self.inner.lock().unwrap_or_else(|e| e.into_inner());
        g.spawned.push((pid, pgid, token.to_string()));
    }

    /// A2 tests: token of the tracked tree.
    #[cfg(test)]
    pub fn status_token_for_test(&self) -> String {
        self.inner.lock().unwrap_or_else(|e| e.into_inner()).token.clone()
    }

    /// A1 tests: groups this sidecar still tracks as spawned.
    #[cfg(test)]
    pub fn spawned_groups(&self) -> Vec<i32> {
        let g = self.inner.lock().unwrap_or_else(|e| e.into_inner());
        g.spawned.iter().map(|(_, pgid, _)| *pgid).collect()
    }
}

fn now_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

fn write_sidecar_file(path: &Path, rec: &SidecarFile) -> Result<(), String> {
    if let Some(p) = path.parent() {
        fs::create_dir_all(p).map_err(|e| format!("เขียน sidecar.json ไม่สำเร็จ: {e}"))?;
    }
    let json = serde_json::to_string(rec).map_err(|e| e.to_string())?;
    fs::write(path, json).map_err(|e| format!("เขียน sidecar.json ไม่สำเร็จ: {e}"))
}

pub fn should_idle_stop(visible: bool, elapsed: Duration, idle: Duration) -> bool {
    !visible && elapsed >= idle
}

pub fn next_backoff(restarts: u8) -> Option<u64> {
    if restarts == 0 || restarts > 3 {
        return None;
    }
    Some(BACKOFF_SECS[(restarts - 1) as usize])
}

pub fn health_dead(misses: u8) -> bool {
    misses >= 2
}

pub fn should_reset_restarts(up: Duration) -> bool {
    up >= RESTART_RESET
}

fn sidecar_loop(s: Arc<Sidecar>) {
    loop {
        std::thread::sleep(Duration::from_secs(1));
        reap_if_dead(&s);
        let (spec, restore_ws) = {
            let mut g = match s.inner.lock() {
                Ok(g) => g,
                Err(_) => continue,
            };
            let mut restore_ws = None;
            // A1: a start still preparing (install, no child yet) is not idle-stopped mid-way.
            if g.phase == SidecarPhase::Running || (g.phase == SidecarPhase::Starting && g.child.is_some()) {
                if should_idle_stop(g.visible, g.last_activity.elapsed(), Duration::from_millis(IDLE_MS)) {
                    restore_ws = g.preview_ws.clone();
                    s.stop_locked(&mut g);
                }
            }
            if let Some(up) = g.up_since {
                if should_reset_restarts(up.elapsed()) {
                    g.restarts = 0;
                }
            }
            let spec = if let Some(at) = g.restart_at {
                if Instant::now() >= at {
                    g.restart_at = None;
                    s.spec.lock().unwrap_or_else(|e| e.into_inner()).clone()
                } else {
                    None
                }
            } else {
                None
            };
            (spec, restore_ws)
        };
        if let Some(ws) = restore_ws {
            crate::export::restore_index_after_preview(&ws);
        }
        if let Some(spec) = spec {
            // A1: the backoff restart claims its session like any other start.
            if let StartGate::Fresh(session) = s.begin_start() {
                if let Err(code) = start_vite(&s, session, &spec.ws, &spec.deps, &spec.bun_version) {
                    if code != START_SUPERSEDED {
                        s.fail_start(session, &code);
                    }
                }
            }
        }
        probe_health(&s);
    }
}

fn probe_health(s: &Sidecar) {
    let (port, due) = {
        let g = match s.inner.lock() {
            Ok(g) => g,
            Err(_) => return,
        };
        if g.phase != SidecarPhase::Running || !g.visible {
            return;
        }
        let Some(port) = g.port else { return };
        if g.last_health.elapsed() < Duration::from_millis(HEALTH_MS) {
            return;
        }
        (port, true)
    };
    if !due {
        return;
    }
    let ok = vite_probe(port);
    let mut g = match s.inner.lock() {
        Ok(g) => g,
        Err(_) => return,
    };
    g.last_health = Instant::now();
    if ok {
        g.health_misses = 0;
        return;
    }
    g.health_misses = g.health_misses.saturating_add(1);
    if health_dead(g.health_misses) {
        drop(g);
        fail_running(s, None);
    }
}

/// Path+query for the `wbpreview` custom protocol (S6: tauri:// cannot iframe http).
pub fn vite_bridge_path(uri: &str) -> String {
    const PREFIXES: &[&str] = &[
        "wbpreview://localhost",
        "https://wbpreview.localhost",
        "http://wbpreview.localhost",
    ];
    for p in PREFIXES {
        if let Some(rest) = uri.strip_prefix(p) {
            if rest.is_empty() {
                return "/".into();
            }
            if rest.starts_with('/') || rest.starts_with('?') {
                return rest.into();
            }
        }
    }
    "/".into()
}

/// Reverse-proxy one GET to the sidecar. Stop at Content-Length: Vite keeps the
/// socket open even when we send Connection: close.
pub fn proxy_vite(port: u16, path_query: &str) -> Result<(u16, String, Vec<u8>), String> {
    let path = if path_query.is_empty() {
        "/"
    } else if path_query.starts_with('/') || path_query.starts_with('?') {
        path_query
    } else {
        return Err("bad path".into());
    };
    if path.contains('\r') || path.contains('\n') {
        return Err("bad path".into());
    }
    let addr = std::net::SocketAddr::from(([127, 0, 0, 1], port));
    let mut stream = TcpStream::connect_timeout(&addr, Duration::from_secs(10))
        .map_err(|e| e.to_string())?;
    let _ = stream.set_read_timeout(Some(Duration::from_secs(15)));
    let _ = stream.set_write_timeout(Some(Duration::from_secs(10)));
    let req = format!(
        "GET {path} HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nAccept-Encoding: identity\r\nConnection: close\r\n\r\n"
    );
    stream.write_all(req.as_bytes()).map_err(|e| e.to_string())?;
    let buf = read_http_response(&mut stream)?;
    parse_http_payload(&buf)
}

fn read_http_response(stream: &mut TcpStream) -> Result<Vec<u8>, String> {
    let mut buf = Vec::new();
    let mut tmp = [0u8; 8192];
    loop {
        let n = stream.read(&mut tmp).map_err(|e| e.to_string())?;
        if n == 0 {
            break;
        }
        buf.extend_from_slice(&tmp[..n]);
        if let Some(sep) = buf.windows(4).position(|w| w == b"\r\n\r\n") {
            let head = std::str::from_utf8(&buf[..sep]).unwrap_or("");
            let mut clen: Option<usize> = None;
            for line in head.split("\r\n").skip(1) {
                if let Some((k, v)) = line.split_once(':') {
                    if k.eq_ignore_ascii_case("content-length") {
                        clen = v.trim().parse().ok();
                    }
                }
            }
            if let Some(len) = clen {
                if buf.len() >= sep + 4 + len {
                    buf.truncate(sep + 4 + len);
                    break;
                }
            }
        }
        if buf.len() > 8_000_000 {
            return Err("too large".into());
        }
    }
    Ok(buf)
}

fn parse_http_payload(buf: &[u8]) -> Result<(u16, String, Vec<u8>), String> {
    let sep = buf
        .windows(4)
        .position(|w| w == b"\r\n\r\n")
        .ok_or("short response")?;
    let head = std::str::from_utf8(&buf[..sep]).map_err(|_| "headers")?;
    let rest = &buf[sep + 4..];
    let mut lines = head.split("\r\n");
    let status: u16 = lines
        .next()
        .and_then(|l| l.split_whitespace().nth(1))
        .and_then(|s| s.parse().ok())
        .unwrap_or(502);
    let mut ctype = "application/octet-stream".to_string();
    let mut clen: Option<usize> = None;
    for line in lines {
        let Some((k, v)) = line.split_once(':') else { continue };
        if k.eq_ignore_ascii_case("content-type") {
            ctype = v.trim().to_string();
        }
        if k.eq_ignore_ascii_case("content-length") {
            clen = v.trim().parse().ok();
        }
    }
    let body = match clen {
        Some(n) => rest.get(..n).unwrap_or(rest).to_vec(),
        None => rest.to_vec(),
    };
    Ok((status, ctype, body))
}

/// GET /@vite/client — 2 s timeout. Used by S9 health checks.
pub fn vite_probe(port: u16) -> bool {
    let addr = std::net::SocketAddr::from(([127, 0, 0, 1], port));
    let Ok(mut stream) = TcpStream::connect_timeout(&addr, HEALTH_TIMEOUT) else {
        return false;
    };
    let _ = stream.set_read_timeout(Some(HEALTH_TIMEOUT));
    let _ = stream.set_write_timeout(Some(HEALTH_TIMEOUT));
    let req = format!("GET /@vite/client HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nConnection: close\r\n\r\n");
    if stream.write_all(req.as_bytes()).is_err() {
        return false;
    }
    let mut buf = [0u8; 24];
    let n = stream.read(&mut buf).unwrap_or(0);
    let head = &buf[..n];
    head.starts_with(b"HTTP/1.1 2")
        || head.starts_with(b"HTTP/1.0 2")
        || head.starts_with(b"HTTP/1.1 3")
        || head.starts_with(b"HTTP/1.0 3")
}

pub fn bun_path_from_env() -> Option<PathBuf> {
    std::env::var_os("WB_BUN_PATH").map(PathBuf::from)
}

pub fn resolve_bun(resource_dir: Option<&Path>) -> PathBuf {
    if let Some(p) = bun_path_from_env() {
        if p.is_file() {
            return p;
        }
    }
    if let Some(dir) = resource_dir {
        let p = dir.join("bin").join("bun");
        if p.is_file() {
            return p;
        }
    }
    PathBuf::new()
}

/// Prepare workspace + optional shared deps (S7) + spawn bun (S6).
pub fn start_vite(
    s: &Sidecar,
    session: u64,
    ws: &Path,
    deps: &Path,
    bun_version: &str,
) -> Result<u16, String> {
    if s.bun.as_os_str().is_empty() || !s.bun.is_file() {
        return Err("ไม่พบ bun ที่แพ็กมากับแอป".into());
    }
    let hash = template_hash(bun_version);
    ensure_deps(&s.bun, deps, &hash)?;
    if !s.is_live_start(session) {
        return Err(START_SUPERSEDED.into());
    }
    link_node_modules(ws, &deps.join(&hash).join("node_modules"))?;
    if let Ok(mut spec) = s.spec.lock() {
        *spec = Some(SpawnSpec {
            ws: ws.to_path_buf(),
            deps: deps.to_path_buf(),
            bun_version: bun_version.to_string(),
        });
    }
    write_preview_only_files(ws)?;

    let port = pick_port()?;
    let log = open_log(&s.log_dir)?;
    let mut cmd = Command::new(&s.bun);
    cmd.arg("run-vite.ts")
        .current_dir(ws)
        .env_clear()
        .env("PATH", bun_path_env(&s.bun))
        .env("HOME", std::env::var("HOME").unwrap_or_else(|_| "/tmp".into()))
        .env("NODE_ENV", "development")
        .env("WB_VITE_PORT", port.to_string())
        .stdin(Stdio::null())
        .stdout(Stdio::from(log.try_clone().map_err(|e| e.to_string())?))
        .stderr(Stdio::from(log));
    {
        let mut g = s.inner.lock().unwrap_or_else(|e| e.into_inner());
        if g.session != session || g.phase != SidecarPhase::Starting {
            return Err(START_SUPERSEDED.into());
        }
        g.port = Some(port);
        g.preview_ws = Some(ws.to_path_buf());
    }
    s.spawn_tracked(session, cmd, port, s.bun.to_string_lossy().into_owned())?;
    let deadline = Instant::now() + Duration::from_secs(15);
    let mut ready = false;
    while Instant::now() < deadline {
        if !s.is_live_start(session) {
            return Err(START_SUPERSEDED.into());
        }
        if vite_probe_quick(port) {
            ready = true;
            break;
        }
        std::thread::sleep(Duration::from_millis(50));
    }
    let mut g = s.inner.lock().unwrap_or_else(|e| e.into_inner());
    if g.session != session || g.phase != SidecarPhase::Starting {
        return Err(START_SUPERSEDED.into());
    }
    if ready {
        g.phase = SidecarPhase::Running;
        g.last_activity = Instant::now();
        Ok(port)
    } else {
        set_error_locked(&mut g, "PREVIEW_INSTALL_FAILED");
        Err("PREVIEW_INSTALL_FAILED:เครื่องมือแสดงตัวอย่างไม่ตอบ".into())
    }
}

fn vite_probe_quick(port: u16) -> bool {
    let addr = std::net::SocketAddr::from(([127, 0, 0, 1], port));
    let Ok(mut stream) = TcpStream::connect_timeout(&addr, Duration::from_millis(150)) else {
        return false;
    };
    let _ = stream.set_read_timeout(Some(Duration::from_millis(400)));
    let _ = stream.set_write_timeout(Some(Duration::from_millis(400)));
    let req = format!(
        "GET /@vite/client HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nConnection: close\r\n\r\n"
    );
    if stream.write_all(req.as_bytes()).is_err() {
        return false;
    }
    let mut buf = [0u8; 24];
    let n = stream.read(&mut buf).unwrap_or(0);
    let head = &buf[..n];
    head.starts_with(b"HTTP/1.1 2") || head.starts_with(b"HTTP/1.0 2")
}

fn bun_path_env(bun: &Path) -> String {
    let dir = bun.parent().map(|p| p.display().to_string()).unwrap_or_default();
    format!("{dir}:/usr/bin:/bin")
}

fn open_log(log_dir: &Path) -> Result<File, String> {
    fs::create_dir_all(log_dir).map_err(|e| e.to_string())?;
    let path = log_dir.join("preview-sidecar.log");
    rotate_log(&path);
    OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .map_err(|e| format!("เปิดบันทึก sidecar ไม่สำเร็จ: {e}"))
}

fn rotate_log(path: &Path) {
    let Ok(meta) = fs::metadata(path) else { return };
    if meta.len() < 1024 * 1024 {
        return;
    }
    let one = path.with_extension("log.1");
    let two = path.with_extension("log.2");
    let _ = fs::rename(&one, &two);
    let _ = fs::rename(path, &one);
}

pub(crate) fn log_event(log_dir: &Path, line: &str) {
    if let Ok(mut f) = open_log(log_dir) {
        let _ = writeln!(f, "{line}");
    }
}

pub(crate) fn write_preview_only_files(ws: &Path) -> Result<(), String> {
    crate::export::write_rel(ws, "src/preview-entry.tsx", PREVIEW_ENTRY.as_bytes())?;
    crate::export::write_rel(ws, "run-vite.ts", RUN_VITE.as_bytes())?;
    crate::export::write_rel(ws, "vite.config.ts", VITE_CONFIG.as_bytes())?;
    crate::export::write_rel(
        ws,
        "bun.lock",
        include_bytes!("../../export-templates/vite-react/bun.lock"),
    )?;
    let html_path = ws.join("index.html");
    if let Ok(html) = fs::read_to_string(&html_path) {
        let mut patched = html.replace("/src/main.tsx", "/src/preview-entry.tsx");
        if !patched.contains("Content-Security-Policy") {
            patched = patched.replace(
                "<head>",
                "<head>\n    <meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' ws: wss:; font-src 'self' data:\">",
            );
        }
        fs::write(&html_path, patched).map_err(|e| e.to_string())?;
    }
    Ok(())
}

pub(crate) fn lockfile_stamp() -> String {
    hex_sha256(&[include_bytes!("../../export-templates/vite-react/bun.lock")])
}

pub(crate) fn ensure_deps(bun: &Path, deps_root: &Path, hash: &str) -> Result<(), String> {
    let dest = deps_root.join(hash);
    let stamp = dest.join(".ok");
    let lock_bytes = include_bytes!("../../export-templates/vite-react/bun.lock");
    let want = lockfile_stamp();
    let stamp_ok = |dest: &Path, stamp: &Path, want: &str| {
        dest.join("node_modules").is_dir()
            && fs::read_to_string(stamp).ok().is_some_and(|g| g.trim() == want)
    };
    if stamp_ok(&dest, &stamp, &want) {
        return Ok(());
    }
    if dest.exists() {
        let _ = fs::remove_dir_all(&dest);
    }
    fs::create_dir_all(deps_root).map_err(|e| disk_or(e))?;
    let lock_path = deps_root.join(format!("{hash}.lock"));
    let _guard = exclusive_lock(&lock_path)?;
    if stamp_ok(&dest, &stamp, &want) {
        return Ok(());
    }
    if dest.exists() {
        let _ = fs::remove_dir_all(&dest);
    }
    let tmp = deps_root.join(format!("{hash}.tmp"));
    let _ = fs::remove_dir_all(&tmp);
    fs::create_dir_all(&tmp).map_err(|e| disk_or(e))?;
    fs::write(tmp.join("package.json"), include_bytes!("../../export-templates/vite-react/package.json"))
        .map_err(|e| disk_or(e))?;
    fs::write(tmp.join("bun.lock"), lock_bytes).map_err(|e| disk_or(e))?;
    let out = Command::new(bun)
        .args(["install", "--frozen-lockfile"])
        .current_dir(&tmp)
        .output()
        .map_err(|e| install_err(&e.to_string()))?;
    if !out.status.success() {
        let msg = String::from_utf8_lossy(&out.stderr);
        let _ = fs::remove_dir_all(&tmp);
        return Err(install_err(&msg));
    }
    fs::rename(&tmp, &dest).map_err(|e| {
        let _ = fs::remove_dir_all(&tmp);
        disk_or(e)
    })?;
    fs::write(&stamp, want).map_err(|e| disk_or(e))?;
    prune_old_hashes(deps_root, hash);
    Ok(())
}

struct LockGuard(PathBuf);
impl Drop for LockGuard {
    fn drop(&mut self) {
        let _ = fs::remove_file(&self.0);
    }
}

fn exclusive_lock(path: &Path) -> Result<LockGuard, String> {
    for _ in 0..60 {
        match OpenOptions::new().write(true).create_new(true).open(path) {
            Ok(_) => return Ok(LockGuard(path.to_path_buf())),
            Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => {
                std::thread::sleep(Duration::from_secs(1));
            }
            Err(_) => return Err("ติดตั้งเครื่องมือแสดงตัวอย่างไม่สำเร็จ".into()),
        }
    }
    Err("ติดตั้งเครื่องมือแสดงตัวอย่างไม่สำเร็จ".into())
}

pub(crate) fn prune_old_hashes(deps_root: &Path, keep: &str) {
    let Ok(rd) = fs::read_dir(deps_root) else { return };
    let mut others: Vec<(std::time::SystemTime, PathBuf)> = Vec::new();
    for e in rd.flatten() {
        let p = e.path();
        if !p.is_dir() {
            continue;
        }
        let name = p.file_name().and_then(|n| n.to_str()).unwrap_or("");
        if name.ends_with(".tmp") {
            let _ = fs::remove_dir_all(&p);
            continue;
        }
        if name == keep {
            continue;
        }
        let t = e.metadata().and_then(|m| m.modified()).unwrap_or(UNIX_EPOCH);
        others.push((t, p));
    }
    others.sort_by(|a, b| b.0.cmp(&a.0));
    for (_, p) in others.into_iter().skip(1) {
        let _ = fs::remove_dir_all(&p);
    }
}

fn link_node_modules(ws: &Path, target: &Path) -> Result<(), String> {
    let link = ws.join("node_modules");
    if link.exists() {
        let _ = fs::remove_file(&link);
        let _ = fs::remove_dir_all(&link);
    }
    #[cfg(unix)]
    {
        std::os::unix::fs::symlink(target, &link).map_err(|e| format!("ลิงก์ node_modules ไม่สำเร็จ: {e}"))?;
    }
    Ok(())
}

fn disk_or(e: std::io::Error) -> String {
    if e.raw_os_error() == Some(libc::ENOSPC) {
        "PREVIEW_DISK_FULL".into()
    } else {
        format!("PREVIEW_INSTALL_FAILED:{e}")
    }
}

fn install_err(msg: &str) -> String {
    let low = msg.to_ascii_lowercase();
    if low.contains("network") || low.contains("offline") || low.contains("enotfound") || low.contains("failed to connect") {
        "PREVIEW_OFFLINE_FIRST_INSTALL".into()
    } else if low.contains("no space") || low.contains("enospc") {
        "PREVIEW_DISK_FULL".into()
    } else {
        format!("PREVIEW_INSTALL_FAILED:{msg}")
    }
}

pub fn error_thai(code: &str) -> String {
    if code == "PREVIEW_OFFLINE_FIRST_INSTALL" {
        "ต้องเชื่อมต่ออินเทอร์เน็ตครั้งแรกเพื่อติดตั้งเครื่องมือแสดงตัวอย่าง (ครั้งเดียว) — ระหว่างนี้แสดงตัวอย่างแบบพื้นฐาน".into()
    } else if code == "PREVIEW_DISK_FULL" {
        "พื้นที่ดิสก์ไม่พอสำหรับเครื่องมือแสดงตัวอย่าง".into()
    } else if code.starts_with("PREVIEW_INSTALL_FAILED") {
        "ติดตั้งเครื่องมือแสดงตัวอย่างไม่สำเร็จ".into()
    } else {
        code.to_string()
    }
}

pub fn hmr_mark(s: &Sidecar) {
    s.note_activity();
}

fn fail_running(s: &Sidecar, status: Option<i32>) {
    let mut g = s.inner.lock().unwrap_or_else(|e| e.into_inner());
    if let Some(mut child) = g.child.take() {
        // A1: the leader alone dying leaves vite / esbuild in its group — take the group down.
        kill_group(g.pgid, libc::SIGKILL);
        let _ = child.kill();
        let _ = child.wait();
    }
    g.pgid = 0;
    kill_untracked(&mut g.spawned, 0);
    if let Some(up) = g.up_since {
        if should_reset_restarts(up.elapsed()) {
            g.restarts = 0;
        }
    }
    g.phase = SidecarPhase::Error;
    g.error_code = Some("PREVIEW_CRASH".into());
    g.error = Some("ตัวอย่างหยุดทำงาน".into());
    g.health_misses = 0;
    g.up_since = None;
    g.restarts = g.restarts.saturating_add(1);
    let n = g.restarts;
    let port = g.port;
    g.restart_at = next_backoff(n).map(|secs| Instant::now() + Duration::from_secs(secs));
    let _ = fs::remove_file(sidecar_path(&s.cache_dir));
    drop(g);
    let st = status.map(|c| c.to_string()).unwrap_or_else(|| "-".into());
    let port_s = port.map(|p| p.to_string()).unwrap_or_else(|| "-".into());
    log_event(
        &s.log_dir,
        &format!("PREVIEW_CRASH exit={st} port={port_s} restarts={n}"),
    );
}

/// Waiter used by S9: if the child dies, flip to error and schedule backoff restart.
pub fn reap_if_dead(s: &Sidecar) {
    let dead = {
        let mut g = match s.inner.lock() {
            Ok(g) => g,
            Err(_) => return,
        };
        match g.child.as_mut() {
            Some(child) => child.try_wait().ok().flatten().map(|st| st.code()),
            None => None,
        }
    };
    if dead.is_some() {
        fail_running(s, dead.flatten());
    }
}

#[cfg(test)]
#[path = "sidecar_tests.rs"]
mod tests;
