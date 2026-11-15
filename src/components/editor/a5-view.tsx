import { Suspense, type CSSProperties, type HTMLAttributes, type ReactNode } from "react";
import type { Node, StyleProps } from "@/schema";
import { A5_LAYOUT_DEFAULTS, getChildren } from "@/schema";
import { styleToCss } from "@/lib/style-css";
import { explicitOf } from "@/lib/kind-looks";
import { mergeOver } from "@/lib/a2-looks";
import { A5_STYLESHEET, a5ExtrasStyle, slideBasis } from "@/lib/a5-looks";
import { lazyNamed } from "@/lib/lazy";

type Handlers = Record<string, unknown>;

// Phase 11 A5.3: SVG lives in the chart-render chunk (no whenIdle preload).
const ChartGlyph = lazyNamed(() =>
  import("@/components/editor/chart-render").then((m) => m.ChartGlyph),
);
// Phase 11 A5.5: month grid lives in the calendar-render chunk (no whenIdle preload).
const CalendarGlyph = lazyNamed(() =>
  import("@/components/editor/calendar-render").then((m) => m.CalendarGlyph),
);

if (typeof document !== "undefined" && !document.querySelector("style[data-a5-looks]")) {
  const el = document.createElement("style");
  el.setAttribute("data-a5-looks", "");
  el.textContent = A5_STYLESHEET;
  document.head.appendChild(el);
}

/**
 * Canvas for the carousel (PHASE-11 A5.1). Same classes as the export
 * (`.t-carousel` + `.t-carousel__slide`) so the shared CSS draws the track.
 * Force flex-direction row on the track; wrap each drawn child in a slide div.
 */
export function CarouselView({
  node,
  handlers,
  chrome,
  style,
  over,
  renderChild,
  emptyHint,
}: {
  node: Node;
  handlers: Handlers;
  chrome?: string;
  style: StyleProps;
  over?: CSSProperties;
  renderChild: (childId: string) => ReactNode;
  /** F2 D2: canvas placeholder when the carousel has no slides (min-height like other empty kinds). */
  emptyHint?: ReactNode;
}) {
  const p = node.props;
  if (p.type !== "carousel") return null;
  const explicit = explicitOf(styleToCss(node.style), (node.style ?? {}).borderColor !== undefined);
  const css = a5ExtrasStyle("carousel", styleToCss(style), explicit);

  const defaults = A5_LAYOUT_DEFAULTS.carousel;
  const gap = p.gap ?? (defaults.gap as number);
  const slidesPerView = p.slidesPerView ?? 1;
  const n = Math.max(1, Math.min(4, Math.round(slidesPerView)));
  const basis = slideBasis(n, gap);

  const trackStyle: CSSProperties = {
    ...css,
    display: "flex",
    flexDirection: "row",
    gap: `${gap}px`,
    overflowX: "auto",
    scrollSnapType: "x mandatory",
    WebkitOverflowScrolling: "touch",
  };

  const slideStyle: CSSProperties = {
    flex: `0 0 ${basis}`,
    scrollSnapAlign: "start",
  };

  const children = getChildren(node);

  return (
    <div
      {...(handlers as HTMLAttributes<HTMLDivElement>)}
      data-node-type="carousel"
      data-cv=""
      role="region"
      aria-roledescription="carousel"
      tabIndex={-1}
      className={["t-carousel", chrome].filter(Boolean).join(" ")}
      style={mergeOver(trackStyle, over)}
    >
      {children.map((childId) => (
        <div key={childId} className="t-carousel__slide" style={slideStyle}>
          {renderChild(childId)}
        </div>
      ))}
      {children.length === 0 && emptyHint ? (
        <div className="t-carousel__empty" style={{ flex: "1 1 100%", minWidth: 0 }}>
          {emptyHint}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Canvas for the chart (PHASE-11 A5.3). Lazy SVG chunk; fixed 2:1 placeholder
 * until load so layout does not jump. Markup matches Rust/TS `renderChartSvg`.
 */
export function ChartView({
  node,
  handlers,
  chrome,
  style,
  over,
}: {
  node: Node;
  handlers: Handlers;
  chrome?: string;
  style: StyleProps;
  over?: CSSProperties;
}) {
  const p = node.props;
  if (p.type !== "chart") return null;
  const explicit = explicitOf(styleToCss(node.style), (node.style ?? {}).borderColor !== undefined);
  const css = a5ExtrasStyle("chart", styleToCss(style), explicit);
  const wrapStyle = mergeOver(
    { ...css, width: "100%", aspectRatio: "2 / 1", lineHeight: 0 },
    over,
  );
  return (
    <div
      {...(handlers as HTMLAttributes<HTMLDivElement>)}
      data-node-type="chart"
      data-cv=""
      className={["t-chart", chrome].filter(Boolean).join(" ")}
      style={wrapStyle}
    >
      <Suspense
        fallback={
          <div aria-hidden style={{ width: "100%", height: "100%" }} />
        }
      >
        <ChartGlyph
          model={{
            kind: p.kind,
            categories: p.categories,
            series: p.series,
            caption: p.caption,
          }}
        />
      </Suspense>
    </div>
  );
}

/**
 * Canvas for the calendar (PHASE-11 A5.5). Lazy HTML chunk; fixed min-height
 * placeholder until load. Markup matches Rust/TS `renderCalendarHtml`.
 */
export function CalendarView({
  node,
  handlers,
  chrome,
  style,
  over,
}: {
  node: Node;
  handlers: Handlers;
  chrome?: string;
  style: StyleProps;
  over?: CSSProperties;
}) {
  const p = node.props;
  if (p.type !== "calendar") return null;
  const explicit = explicitOf(styleToCss(node.style), (node.style ?? {}).borderColor !== undefined);
  const css = a5ExtrasStyle("calendar", styleToCss(style), explicit);
  const wrapStyle = mergeOver({ ...css, width: "100%", minHeight: "12rem" }, over);
  return (
    <div
      {...(handlers as HTMLAttributes<HTMLDivElement>)}
      data-node-type="calendar"
      data-cv=""
      className={["t-calendarwrap", chrome].filter(Boolean).join(" ")}
      style={wrapStyle}
    >
      <Suspense fallback={<div aria-hidden style={{ width: "100%", height: "12rem" }} />}>
        <CalendarGlyph
          model={{
            year: p.year,
            month: p.month,
            selectedDay: p.selectedDay,
            weekStart: p.weekStart,
            era: p.era,
          }}
        />
      </Suspense>
    </div>
  );
}
