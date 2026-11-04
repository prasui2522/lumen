/**
 * Phase 11 A5.3 — lazy chart-render chunk UI (glyph for canvas).
 * Pure SVG lives in `@/lib/chart-render`; this file is the React face.
 */
import type { ChartModel } from "@/lib/chart-render";
import {
  ChartRenderLazyAnchor,
  renderChartSvg,
} from "@/lib/chart-render";

export { ChartRenderLazyAnchor, renderChartSvg };
export type { ChartModel, ChartKind, ChartSeries } from "@/lib/chart-render";

/** Inline SVG for the canvas; markup matches export / Rust compiler. */
export function ChartGlyph({
  model,
  className,
}: {
  model: ChartModel;
  className?: string;
}) {
  const html = renderChartSvg(model);
  // Root is the <svg>…</svg> string — inject as a single node.
  return (
    <span
      className={["t-chart", className].filter(Boolean).join(" ")}
      style={{ display: "block", width: "100%", lineHeight: 0 }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
