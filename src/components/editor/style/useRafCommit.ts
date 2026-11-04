import { useCallback, useEffect, useRef } from "react";

/**
 * Coalesce high-frequency writes (typing, slider drag, color picker) to one
 * commit per animation frame. `flush` commits a pending value now; `cancel`
 * drops it. Pending work is dropped on unmount (selection change discards
 * half-typed input).
 */
export function useRafCommit<T>(commit: (v: T) => void) {
  const raf = useRef(0);
  const latest = useRef<{ v: T } | null>(null);
  const commitRef = useRef(commit);
  commitRef.current = commit;

  useEffect(
    () => () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    },
    [],
  );

  const schedule = useCallback((v: T) => {
    latest.current = { v };
    if (raf.current) return;
    raf.current = requestAnimationFrame(() => {
      raf.current = 0;
      const p = latest.current;
      latest.current = null;
      if (p) commitRef.current(p.v);
    });
  }, []);

  const flush = useCallback(() => {
    if (raf.current) cancelAnimationFrame(raf.current);
    raf.current = 0;
    const p = latest.current;
    latest.current = null;
    if (p) commitRef.current(p.v);
  }, []);

  const cancel = useCallback(() => {
    if (raf.current) cancelAnimationFrame(raf.current);
    raf.current = 0;
    latest.current = null;
  }, []);

  return { schedule, flush, cancel };
}
