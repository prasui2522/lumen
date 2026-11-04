/**
 * Phase 11 A5.3 — static chart SVG renderer (lazy `chart-render` chunk).
 *
 * TS and Rust (`chart_render.rs`) share one algorithm so golden SVG fixtures
 * match byte-for-byte. No tooltips/hover (no JS). Caps: ≤12 categories × ≤3 series.
 */

import {
  CHART_DEFAULT_COLORS,
  isChartKind,
  sanitizeColor,
} from "@/lib/chart-model";

export type ChartKind = "bar" | "line" | "area";

export type ChartSeries = {
  name: string;
  /** Missing / non-finite entries are skipped safely. */
  values: (number | null | undefined)[];
  color: string;
};

export type ChartModel = {
  kind: ChartKind;
  categories: string[];
  series: ChartSeries[];
  caption?: string;
};

export const CHART_KINDS = ["bar", "line", "area"] as const satisfies readonly ChartKind[];
export const CHART_MAX_CATEGORIES = 12;
export const CHART_MAX_SERIES = 3;
export const CHART_VB_W = 600;
export const CHART_VB_H = 300;
export { CHART_DEFAULT_COLORS, isChartKind, sanitizeColor };

const PAD_L = 48;
const PAD_R = 16;
const PAD_T = 24;
const PAD_B = 40;

/** Keep the chunk in the graph even when only the pure renderer is imported. */
export function ChartRenderLazyAnchor(_props: object): null {
  void renderChartSvg;
  return null;
}

/** Escape text for XML element content (title/desc). */
export function xmlEsc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmtVal(n: number): string {
  const r = Math.round(n * 100) / 100;
  if (Number.isInteger(r)) return String(r);
  const s = r.toFixed(2);
  return s.replace(/\.?0+$/, "");
}

function px(n: number): number {
  return Math.round(n);
}

function finiteAt(values: (number | null | undefined)[], i: number): number | null {
  const v = values[i];
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  return v;
}

type Norm = {
  kind: ChartKind;
  categories: string[];
  series: { name: string; values: (number | null)[]; color: string }[];
  caption: string;
};

function normalize(model: ChartModel): Norm {
  const kind: ChartKind = isChartKind(model.kind) ? model.kind : "bar";
  const categories = (model.categories ?? []).slice(0, CHART_MAX_CATEGORIES).map((c) => String(c ?? ""));
  const n = categories.length;
  const series = (model.series ?? []).slice(0, CHART_MAX_SERIES).map((s, si) => {
    const fallback = CHART_DEFAULT_COLORS[si % CHART_DEFAULT_COLORS.length]!;
    const values: (number | null)[] = [];
    for (let i = 0; i < n; i++) {
      values.push(finiteAt(s.values ?? [], i));
    }
    return {
      name: String(s.name ?? `Series ${si + 1}`),
      values,
      color: sanitizeColor(String(s.color ?? ""), fallback),
    };
  });
  const caption = (model.caption ?? "").trim() || "Chart";
  return { kind, categories, series, caption };
}

function maxValue(series: Norm["series"]): number {
  let m = 0;
  for (const s of series) {
    for (const v of s.values) {
      if (v !== null && v > m) m = v;
    }
  }
  return m > 0 ? m : 1;
}

function buildDesc(norm: Norm): string {
  const parts: string[] = [];
  for (const s of norm.series) {
    for (let i = 0; i < norm.categories.length; i++) {
      const v = s.values[i];
      if (v === null) continue;
      const cat = norm.categories[i] || `คอลัมน์ ${i + 1}`;
      parts.push(`${s.name} ${cat}: ${fmtVal(v)}`);
    }
  }
  return parts.length ? parts.join(". ") + "." : "ไม่มีข้อมูล";
}

function emitBaseline(out: string[], plotW: number, baseline: number): void {
  const x2 = PAD_L + plotW;
  out.push(
    `<line x1="${PAD_L}" y1="${baseline}" x2="${x2}" y2="${baseline}" stroke="#cbd5e1" stroke-width="1"/>`,
  );
}

function emitBars(out: string[], norm: Norm, plotW: number, plotH: number, maxV: number): void {
  const n = Math.max(1, norm.categories.length);
  const sCount = Math.max(1, norm.series.length);
  const groupW = plotW / n;
  const innerGap = 4;
  const usable = Math.max(1, groupW - innerGap);
  const barW = Math.max(1, Math.floor(usable / sCount));
  const baseline = PAD_T + plotH;

  for (let si = 0; si < norm.series.length; si++) {
    const s = norm.series[si]!;
    for (let ci = 0; ci < norm.categories.length; ci++) {
      const v = s.values[ci];
      if (v === null || v <= 0) continue;
      const h = (v / maxV) * plotH;
      const x = px(PAD_L + ci * groupW + innerGap / 2 + si * barW);
      const y = px(baseline - h);
      const hh = Math.max(1, px(h));
      out.push(
        `<rect x="${x}" y="${y}" width="${px(barW)}" height="${hh}" fill="${s.color}"/>`,
      );
    }
  }
}

function emitLineOrArea(
  out: string[],
  norm: Norm,
  plotW: number,
  plotH: number,
  maxV: number,
  area: boolean,
): void {
  const n = Math.max(1, norm.categories.length);
  const groupW = plotW / n;
  const baseline = PAD_T + plotH;

  for (const s of norm.series) {
    type Pt = { x: number; y: number };
    const pts: (Pt | null)[] = [];
    for (let ci = 0; ci < norm.categories.length; ci++) {
      const v = s.values[ci];
      if (v === null) {
        pts.push(null);
        continue;
      }
      const x = px(PAD_L + (ci + 0.5) * groupW);
      const y = px(baseline - (v / maxV) * plotH);
      pts.push({ x, y });
    }

    // Walk consecutive finite runs.
    let run: Pt[] = [];
    const flush = () => {
      if (run.length === 0) return;
      if (area && run.length >= 1) {
        const first = run[0]!;
        const last = run[run.length - 1]!;
        let d = `M${first.x} ${baseline}`;
        for (const p of run) d += ` L${p.x} ${p.y}`;
        d += ` L${last.x} ${baseline} Z`;
        out.push(`<path d="${d}" fill="${s.color}" fill-opacity="0.25" stroke="none"/>`);
      }
      if (run.length === 1) {
        const p = run[0]!;
        out.push(
          `<circle cx="${p.x}" cy="${p.y}" r="3" fill="${s.color}"/>`,
        );
      } else if (run.length >= 2) {
        const points = run.map((p) => `${p.x},${p.y}`).join(" ");
        out.push(
          `<polyline points="${points}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`,
        );
      }
      run = [];
    };
    for (const p of pts) {
      if (p === null) flush();
      else run.push(p);
    }
    flush();
  }
}

/**
 * Deterministic SVG string (no outer whitespace). Used by canvas, export template,
 * and golden parity tests against Rust `chart_render::render_chart_svg`.
 */
export function renderChartSvg(model: ChartModel): string {
  const norm = normalize(model);
  const plotW = CHART_VB_W - PAD_L - PAD_R;
  const plotH = CHART_VB_H - PAD_T - PAD_B;
  const maxV = maxValue(norm.series);
  const baseline = PAD_T + plotH;

  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CHART_VB_W} ${CHART_VB_H}" width="100%" role="img">`,
  );
  parts.push(`<title>${xmlEsc(norm.caption)}</title>`);
  parts.push(`<desc>${xmlEsc(buildDesc(norm))}</desc>`);
  emitBaseline(parts, plotW, baseline);

  if (norm.kind === "bar") {
    emitBars(parts, norm, plotW, plotH, maxV);
  } else {
    emitLineOrArea(parts, norm, plotW, plotH, maxV, norm.kind === "area");
  }

  parts.push(`</svg>`);
  return parts.join("");
}
