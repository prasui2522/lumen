import { useSyncExternalStore } from "react";

/** UI language. Stored in `localStorage["wb.locale"]`, not in the document. */
export type Locale = "th" | "en";

const KEY = "wb.locale";

function readLocale(): Locale {
  try {
    const v = localStorage.getItem(KEY);
    if (v === "en" || v === "th") return v;
  } catch {
    /* private mode */
  }
  return "th";
}

let locale: Locale = "th";
const listeners = new Set<() => void>();

function apply(next: Locale) {
  locale = next;
  if (typeof document !== "undefined") document.documentElement.lang = next;
  listeners.forEach((l) => l());
}

export function initLocale() {
  apply(typeof localStorage === "undefined" ? "th" : readLocale());
}

export function peekLocale(): Locale {
  return locale;
}

export function setLocale(next: Locale) {
  try {
    localStorage.setItem(KEY, next);
  } catch {
    /* private mode */
  }
  if (next === locale) return;
  apply(next);
}

export function useLocale(): Locale {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => locale,
    () => "th",
  );
}
