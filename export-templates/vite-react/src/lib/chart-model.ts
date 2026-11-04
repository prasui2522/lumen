/**
 * Phase 11 A5.3 — chart colour/kind guards for the exported Vite site.
 * (Editor-only draft helpers live in the app's chart-model; this copy is minimal.)
 */

export type ChartKind = "bar" | "line" | "area";

export const CHART_DEFAULT_COLORS = ["#2563eb", "#16a34a", "#ea580c"] as const;

export function isChartKind(v: unknown): v is ChartKind {
  return v === "bar" || v === "line" || v === "area";
}

export function sanitizeColor(raw: string, fallback: string): string {
  const t = raw.trim();
  if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(t)) return t.toLowerCase();
  return fallback;
}
