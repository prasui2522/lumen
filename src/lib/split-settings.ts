/**
 * S3 (PREVIEW-CODE-VIEW A1/A3): Split orientation and divider size.
 * App settings in localStorage — never written into the document.
 */
import { useSyncExternalStore } from "react";

export type SplitDir = "lr" | "tb";
export type SplitPane = "code" | "preview";

export const SPLIT_MIN = 20;
export const SPLIT_MAX = 80;
export const SPLIT_DEFAULT = 50;
export const STORAGE_KEY = "wb.split.v1";

export type SplitSettings = {
  dir: SplitDir;
  /** First-pane % for left–right. */
  sizeLr: number;
  /** First-pane % for top–bottom. */
  sizeTb: number;
  /** Right (or bottom) pane contents. Defaults to code. */
  pane: SplitPane;
};

const DEFAULTS: SplitSettings = {
  dir: "lr",
  sizeLr: SPLIT_DEFAULT,
  sizeTb: SPLIT_DEFAULT,
  pane: "code",
};

export function clampSplitSize(n: unknown): number {
  if (typeof n !== "number" || !Number.isFinite(n)) return SPLIT_DEFAULT;
  return Math.min(SPLIT_MAX, Math.max(SPLIT_MIN, Math.round(n)));
}

function parse(raw: string | null): SplitSettings {
  if (!raw) return { ...DEFAULTS };
  try {
    const v = JSON.parse(raw) as Partial<SplitSettings>;
    return {
      dir: v.dir === "tb" ? "tb" : "lr",
      sizeLr: clampSplitSize(v.sizeLr),
      sizeTb: clampSplitSize(v.sizeTb),
      pane: v.pane === "preview" ? "preview" : "code",
    };
  } catch {
    return { ...DEFAULTS };
  }
}

function read(): SplitSettings {
  try {
    return parse(localStorage.getItem(STORAGE_KEY));
  } catch {
    return { ...DEFAULTS };
  }
}

function write(next: SplitSettings) {
  snap = next;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* private mode */
  }
  listeners.forEach((l) => l());
}

let snap: SplitSettings = { ...DEFAULTS };
const listeners = new Set<() => void>();

export function loadSplitSettings(): SplitSettings {
  snap = read();
  return snap;
}

export function getSplitSettings(): SplitSettings {
  return snap;
}

export function setSplitDir(dir: SplitDir) {
  write({ ...snap, dir });
}

export function toggleSplitDir() {
  write({ ...snap, dir: snap.dir === "lr" ? "tb" : "lr" });
}

export function setSplitSize(size: number) {
  const n = clampSplitSize(size);
  write(snap.dir === "lr" ? { ...snap, sizeLr: n } : { ...snap, sizeTb: n });
}

export function resetSplitSize() {
  setSplitSize(SPLIT_DEFAULT);
}

export function setSplitPane(pane: SplitPane) {
  write({ ...snap, pane });
}

export function currentSplitSize(s: SplitSettings = snap): number {
  return s.dir === "lr" ? s.sizeLr : s.sizeTb;
}

/** Arrow ±2%, Shift+Arrow ±10%. */
export function stepSplitSize(delta: number, current = currentSplitSize()): number {
  return clampSplitSize(current + delta);
}

if (typeof window !== "undefined") {
  snap = read();
}

const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

export function useSplitSettings(): SplitSettings {
  return useSyncExternalStore(subscribe, () => snap, () => DEFAULTS);
}
