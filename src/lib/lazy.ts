import { createElement, lazy, useState, type ComponentType } from "react";

/**
 * `React.lazy` for a named export, plus `preload()` so a chunk can be fetched
 * ahead of use (idle time) without rendering it.
 *
 * Once the module has resolved, the real component is cached and rendered
 * DIRECTLY — no React.lazy / Suspense round-trip. React.lazy suspends on the
 * first render even for a settled promise, and Suspense throttles the reveal
 * (~300 ms), which made the first dialog open feel slow even when preloaded.
 * Until then the lazy wrapper suspends as usual (the nearest Suspense shows its
 * fallback). The cache is set in our own `.then`, which runs before React's,
 * so the lazy wrapper never commits after resolution — no remount/state loss.
 */
export function lazyNamed<P extends object>(load: () => Promise<ComponentType<P>>) {
  let pending: Promise<{ default: ComponentType<P> }> | null = null;
  let resolved: ComponentType<P> | null = null;
  const preload = () =>
    (pending ??= load().then((c) => {
      resolved = c;
      return { default: c };
    }));
  const Lazy = lazy(preload);
  function LazyNamed(props: P) {
    return createElement((resolved ?? Lazy) as ComponentType<P>, props);
  }
  return Object.assign(LazyNamed, { preload });
}

/** Run `fn` when the main thread is idle (WebKitGTK lacks requestIdleCallback). Returns a cancel fn. */
export function whenIdle(fn: () => void, timeout = 1500): () => void {
  const w = window as Window & {
    requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number;
    cancelIdleCallback?: (id: number) => void;
  };
  if (w.requestIdleCallback && w.cancelIdleCallback) {
    const id = w.requestIdleCallback(fn, { timeout });
    return () => w.cancelIdleCallback?.(id);
  }
  const id = window.setTimeout(fn, 300);
  return () => window.clearTimeout(id);
}

/**
 * True from the first time `on` is true, forever after. Lazy dialogs mount on
 * first open and then stay mounted, so their close animation and focus
 * restore behave exactly as when they were eager.
 */
export function useMountedOnce(on: boolean): boolean {
  const [mounted, setMounted] = useState(on);
  if (on && !mounted) setMounted(true);
  return mounted || on;
}
