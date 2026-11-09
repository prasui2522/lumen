/**
 * S6–S9: Vite sidecar protocol (PREVIEW-CODE-VIEW). Pure helpers + invoke wrappers.
 */
import { useEffect, useSyncExternalStore } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useProjectsStore } from "@/stores/projects-store";

export type SidecarPhase = "stopped" | "starting" | "running" | "error";

export type SidecarStatus = {
  state: SidecarPhase;
  port: number | null;
  pssMb: number | null;
  error: string | null;
  errorCode: string | null;
};

export const SIDECAR_IDLE_MS = 60_000;
export const SIDECAR_PSS_POLL_MS = 2_000;
export const SIDECAR_HMR_MS = 150;
/** S8: at most 4 site.json writes per second during drags. */
export const SIDECAR_HMR_MIN_GAP_MS = 250;

export const ERROR_THAI: Record<string, string> = {
  PREVIEW_OFFLINE_FIRST_INSTALL:
    "ต้องเชื่อมต่ออินเทอร์เน็ตครั้งแรกเพื่อติดตั้งเครื่องมือแสดงตัวอย่าง (ครั้งเดียว) — ระหว่างนี้แสดงตัวอย่างแบบพื้นฐาน",
  PREVIEW_DISK_FULL: "พื้นที่ดิสก์ไม่พอสำหรับเครื่องมือแสดงตัวอย่าง",
  PREVIEW_INSTALL_FAILED: "ติดตั้งเครื่องมือแสดงตัวอย่างไม่สำเร็จ",
  PREVIEW_CRASH: "ตัวอย่างหยุดทำงาน",
};

export const PHASE_LABEL: Record<SidecarPhase, string> = {
  stopped: "หยุด",
  starting: "กำลังเริ่ม",
  running: "ทำงาน",
  error: "ผิดพลาด",
};

const STOPPED: SidecarStatus = {
  state: "stopped",
  port: null,
  pssMb: null,
  error: null,
  errorCode: null,
};

export function normalizeStatus(raw: unknown): SidecarStatus {
  if (!raw || typeof raw !== "object") return STOPPED;
  const s = raw as Record<string, unknown>;
  const state = s.state;
  const phase: SidecarPhase =
    state === "starting" || state === "running" || state === "error" ? state : "stopped";
  return {
    state: phase,
    port: typeof s.port === "number" ? s.port : null,
    pssMb: typeof s.pssMb === "number" ? s.pssMb : null,
    error: typeof s.error === "string" ? s.error : null,
    errorCode: typeof s.errorCode === "string" ? s.errorCode : null,
  };
}

export function shouldPollPss(state: SidecarPhase): boolean {
  return state === "starting" || state === "running";
}

/**
 * Release Linux/macOS uses `tauri://` (a secure origin). An iframe to
 * `http://127.0.0.1` is mixed content and never loads. Bridge through the
 * `wbpreview` custom protocol in that case; keep 127.0.0.1 in `tauri dev`.
 */
function prodBridgeOrigin(): string {
  const plat = String(
    (import.meta.env as { TAURI_ENV_PLATFORM?: string; TAURI_PLATFORM?: string })
      .TAURI_ENV_PLATFORM ||
      (import.meta.env as { TAURI_PLATFORM?: string }).TAURI_PLATFORM ||
      "",
  );
  // Windows/Android custom schemes are http(s)://{name}.localhost; Linux/macOS
  // register a real scheme (`wbpreview://`). Do not copy the *app* origin —
  // `http://tauri.localhost` would yield `http://wbpreview.localhost`, which
  // never hits the protocol handler on WebKitGTK.
  if (plat === "windows" || plat === "android") return "http://wbpreview.localhost";
  return "wbpreview://localhost";
}

export function viteBridgeOrigin(appOrigin?: string): string | null {
  if (appOrigin) {
    if (appOrigin.startsWith("tauri://")) return "wbpreview://localhost";
    try {
      const u = new URL(appOrigin);
      if (u.hostname === "tauri.localhost") return `${u.protocol}//wbpreview.localhost`;
    } catch {
      /* ignore */
    }
    return null;
  }
  if (!import.meta.env.PROD) return null;
  return prodBridgeOrigin();
}

export function viteFrameUrl(port: number, path: string, appOrigin?: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  const suffix = p === "/" ? "/" : p;
  const bridge = viteBridgeOrigin(appOrigin);
  if (bridge) return `${bridge}${suffix}`;
  return `http://127.0.0.1:${port}${suffix}`;
}

/** postMessage origin of the Vite iframe (bridge or 127.0.0.1). */
export function viteFrameOrigin(url: string, port: number): string {
  try {
    return new URL(url).origin;
  } catch {
    return `http://127.0.0.1:${port}`;
  }
}

/** Debounce 150 ms after the last edit, never denser than 4 writes/s. */
export function nextHmrDelay(
  now: number,
  lastWrite: number,
  debounceMs = SIDECAR_HMR_MS,
  minGapMs = SIDECAR_HMR_MIN_GAP_MS,
): number {
  if (lastWrite <= 0) return debounceMs;
  return Math.max(debounceMs, Math.max(0, minGapMs - (now - lastWrite)));
}

export function parseStartError(e: unknown): SidecarStatus {
  const raw = typeof e === "string" ? e : e instanceof Error ? e.message : String(e);
  const m = raw.match(/^(PREVIEW_[A-Z0-9_]+)(?::([\s\S]*))?$/);
  const errorCode = m?.[1] ?? (raw.includes("PREVIEW_OFFLINE_FIRST_INSTALL")
    ? "PREVIEW_OFFLINE_FIRST_INSTALL"
    : raw.includes("PREVIEW_DISK_FULL")
      ? "PREVIEW_DISK_FULL"
      : raw.includes("PREVIEW_INSTALL_FAILED")
        ? "PREVIEW_INSTALL_FAILED"
        : null);
  const fromCode = errorCode ? ERROR_THAI[errorCode] : undefined;
  const rest = m?.[2]?.trim();
  return {
    state: "error",
    port: null,
    pssMb: null,
    error: fromCode || rest || raw,
    errorCode,
  };
}

export async function sidecarStatus(): Promise<SidecarStatus> {
  try {
    return normalizeStatus(await invoke("preview_sidecar_status"));
  } catch {
    return STOPPED;
  }
}

export async function sidecarStart(
  projectId: string,
  document: unknown,
): Promise<SidecarStatus> {
  return normalizeStatus(
    await invoke("preview_sidecar_start", { projectId, document }),
  );
}

export async function sidecarStop(): Promise<void> {
  await invoke("preview_sidecar_stop");
}

export async function sidecarNoteActivity(): Promise<void> {
  await invoke("preview_sidecar_note_activity").catch(() => {});
}

export async function sidecarSetVisible(visible: boolean): Promise<void> {
  await invoke("preview_sidecar_set_visible", { visible }).catch(() => {});
}

export async function sidecarWriteSite(
  projectId: string,
  document: unknown,
): Promise<boolean> {
  return (await invoke<boolean>("preview_sidecar_write_site", { projectId, document })) === true;
}

export async function sidecarOpenLog(): Promise<void> {
  await invoke("preview_sidecar_open_log").catch(() => {});
}

let snap: SidecarStatus = STOPPED;
const listeners = new Set<() => void>();

export function publishSidecar(s: SidecarStatus) {
  snap = s;
  listeners.forEach((l) => l());
}

export function peekSidecar(): SidecarStatus {
  return snap;
}

export function useSidecarStatus(): SidecarStatus {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => snap,
    () => STOPPED,
  );
}

let lastHmrWrite = 0;

export function markHmrWritten(at = Date.now()) {
  lastHmrWrite = at;
}

/**
 * S6 A2 + S8: visible Preview/Split keeps vite alive; document edits reset the
 * idle timer and (while running) rewrite site.json. Project close stops vite.
 */
export function useSidecarSession(mode: string, openId: string | null) {
  const previewish = mode === "preview" || mode === "split" || mode === "design";

  useEffect(() => {
    return () => {
      void sidecarStop().then(() => publishSidecar(STOPPED));
    };
  }, [openId]);

  useEffect(() => {
    const apply = () => {
      const vis = previewish && document.visibilityState === "visible";
      void sidecarSetVisible(vis);
      if (vis) void sidecarNoteActivity();
    };
    apply();
    document.addEventListener("visibilitychange", apply);
    return () => document.removeEventListener("visibilitychange", apply);
  }, [previewish]);

  useEffect(() => {
    if (!openId) return;
    let last = useProjectsStore.getState().openDocument;
    let timer = 0;
    const unsub = useProjectsStore.subscribe((s) => {
      const doc = s.openDocument;
      if (doc === last) return;
      last = doc;
      void sidecarNoteActivity();
      if (peekSidecar().state !== "running" || !doc) return;
      window.clearTimeout(timer);
      const wait = nextHmrDelay(Date.now(), lastHmrWrite);
      timer = window.setTimeout(() => {
        lastHmrWrite = Date.now();
        void sidecarWriteSite(openId, doc);
      }, wait);
    });
    return () => {
      unsub();
      window.clearTimeout(timer);
    };
  }, [openId]);
}
