/**
 * S3 A5: last export destination per project (zip path). Used by เปิดโฟลเดอร์.
 * App settings only — not document bytes.
 */
import { useSyncExternalStore } from "react";

const KEY = "wb.export.dest.v1";

type MapV1 = Record<string, string>;

let map: MapV1 = {};
const listeners = new Set<() => void>();

function parse(raw: string | null): MapV1 {
  if (!raw) return {};
  try {
    const v = JSON.parse(raw) as unknown;
    if (!v || typeof v !== "object" || Array.isArray(v)) return {};
    const out: MapV1 = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if (typeof val === "string" && val) out[k] = val;
    }
    return out;
  } catch {
    return {};
  }
}

function read(): MapV1 {
  try {
    return parse(localStorage.getItem(KEY));
  } catch {
    return {};
  }
}

function emit() {
  listeners.forEach((l) => l());
}

if (typeof window !== "undefined") map = read();

export function lastExportDest(projectId: string | null | undefined): string | null {
  if (!projectId) return null;
  return map[projectId] ?? null;
}

export function setLastExportDest(projectId: string, destPath: string) {
  if (!projectId || !destPath) return;
  map = { ...map, [projectId]: destPath };
  try {
    localStorage.setItem(KEY, JSON.stringify(map));
  } catch {
    /* private mode */
  }
  emit();
}

export function useLastExportDest(projectId: string | null | undefined): string | null {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => lastExportDest(projectId),
    () => null,
  );
}
