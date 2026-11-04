/**
 * Phase 11 A5.4 — chart editor draft helpers (caps + normalize + equality).
 * Shared colour/kind guards are here so the SVG `chart-render` chunk stays lazy.
 */
import type { ChartKind, ChartSeries } from "@/schema";
import {
  CHART_KINDS,
  CHART_MAX_CATEGORIES,
  CHART_MAX_SERIES,
} from "@/schema";

export const CHART_DEFAULT_COLORS = ["#2563eb", "#16a34a", "#ea580c"] as const;

export function isChartKind(v: unknown): v is ChartKind {
  return v === "bar" || v === "line" || v === "area";
}

/** Allow only #RGB / #RRGGBB / #RRGGBBAA; else fallback. */
export function sanitizeColor(raw: string, fallback: string): string {
  const t = raw.trim();
  if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(t)) return t.toLowerCase();
  return fallback;
}

export type ChartEditorModel = {
  kind: ChartKind;
  categories: string[];
  series: ChartSeries[];
  caption: string;
};

export function parseChartValue(raw: string): number | null {
  const t = raw.trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export function formatChartValue(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "";
  return String(v);
}

export function cloneChartModel(model: {
  kind: ChartKind;
  categories: readonly string[];
  series: readonly ChartSeries[];
  caption?: string;
}): ChartEditorModel {
  return {
    kind: isChartKind(model.kind) ? model.kind : "bar",
    categories: model.categories.map((c) => String(c ?? "")),
    series: model.series.map((s) => ({
      name: String(s.name ?? ""),
      values: (s.values ?? []).map((v) =>
        typeof v === "number" && Number.isFinite(v) ? v : null,
      ),
      color: String(s.color ?? ""),
    })),
    caption: model.caption ?? "",
  };
}

/** Clamp categories/series/values for write + export. Always ≥1 category and ≥1 series. */
export function normalizeChartModel(model: ChartEditorModel): {
  kind: ChartKind;
  categories: string[];
  series: ChartSeries[];
  caption?: string;
} {
  const kind: ChartKind = CHART_KINDS.includes(model.kind) ? model.kind : "bar";
  let categories = model.categories.map((c) => String(c ?? "")).slice(0, CHART_MAX_CATEGORIES);
  if (categories.length === 0) categories = [""];
  const n = categories.length;

  let seriesIn = model.series.slice(0, CHART_MAX_SERIES);
  if (seriesIn.length === 0) {
    seriesIn = [{ name: "ชุดที่ 1", values: [], color: CHART_DEFAULT_COLORS[0]! }];
  }

  const series: ChartSeries[] = seriesIn.map((s, si) => {
    const fallback = CHART_DEFAULT_COLORS[si % CHART_DEFAULT_COLORS.length]!;
    const values: (number | null)[] = [];
    for (let i = 0; i < n; i++) {
      const v = s.values[i];
      values.push(typeof v === "number" && Number.isFinite(v) ? v : null);
    }
    return {
      name: String(s.name ?? `ชุดที่ ${si + 1}`),
      values,
      color: sanitizeColor(String(s.color ?? ""), fallback),
    };
  });

  const caption = model.caption.trim() === "" ? undefined : model.caption.trim();
  return { kind, categories, series, caption };
}

export function chartModelEqual(
  a: {
    kind: ChartKind;
    categories: readonly string[];
    series: readonly ChartSeries[];
    caption?: string;
  },
  b: {
    kind: ChartKind;
    categories: readonly string[];
    series: readonly ChartSeries[];
    caption?: string;
  },
): boolean {
  if (a.kind !== b.kind) return false;
  if ((a.caption ?? undefined) !== (b.caption ?? undefined)) return false;
  if (a.categories.length !== b.categories.length) return false;
  for (let i = 0; i < a.categories.length; i++) {
    if (a.categories[i] !== b.categories[i]) return false;
  }
  if (a.series.length !== b.series.length) return false;
  for (let i = 0; i < a.series.length; i++) {
    const sa = a.series[i]!;
    const sb = b.series[i]!;
    if (sa.name !== sb.name || sa.color !== sb.color) return false;
    if (sa.values.length !== sb.values.length) return false;
    for (let j = 0; j < sa.values.length; j++) {
      if (sa.values[j] !== sb.values[j]) return false;
    }
  }
  return true;
}
