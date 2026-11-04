import { useSyncExternalStore } from "react";

/** Theme preference (UI-REFRESH §1.9). `localStorage["wb.theme"]`, never the document. */
export type ThemePref = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

const KEY = "wb.theme";

function readPref(): ThemePref {
  try {
    const v = localStorage.getItem(KEY);
    if (v === "light" || v === "dark" || v === "system") return v;
  } catch {
    /* private mode */
  }
  return "system";
}

function systemDark(): boolean {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function resolve(pref: ThemePref, osDark: boolean): ResolvedTheme {
  return pref === "dark" || (pref === "system" && osDark) ? "dark" : "light";
}

function apply(resolved: ResolvedTheme) {
  document.documentElement.classList.toggle("dark", resolved === "dark");
}

type Snap = { pref: ThemePref; resolved: ResolvedTheme };
let snap: Snap = { pref: "system", resolved: "light" };
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

let started = false;
let applying = false;

function commit(pref: ThemePref, osDark: boolean) {
  // Publish the preference BEFORE touching `.dark`. Some engines notify
  // prefers-color-scheme listeners synchronously; if pref were still "system"
  // that re-enters commit forever.
  const resolved = resolve(pref, osDark);
  snap = { pref, resolved };
  if (applying) return;
  applying = true;
  try {
    apply(resolved);
  } finally {
    applying = false;
  }
  emit();
}

/** Once, before paint. OS listener + Tauri `onThemeChanged` (source of truth on WebKitGTK). */
export function initTheme() {
  if (started || typeof document === "undefined") return;
  started = true;
  const pref = readPref();
  let osDark = systemDark();
  commit(pref, osDark);
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  mq.addEventListener("change", () => {
    if (snap.pref !== "system") return;
    osDark = mq.matches;
    commit("system", osDark);
  });
  if ("__TAURI_INTERNALS__" in window) {
    void import("@tauri-apps/api/window").then(({ getCurrentWindow }) =>
      getCurrentWindow()
        .onThemeChanged(({ payload }) => {
          if (snap.pref !== "system") return;
          if (payload === "light" || payload === "dark") commit("system", payload === "dark");
        })
        .catch(() => {}),
    );
  }
}

export function setThemePref(pref: ThemePref) {
  try {
    localStorage.setItem(KEY, pref);
  } catch {
    /* ignore */
  }
  commit(pref, systemDark());
}

export function useTheme(): Snap {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => snap,
    () => snap,
  );
}
