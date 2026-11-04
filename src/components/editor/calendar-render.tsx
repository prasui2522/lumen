/**
 * Phase 11 A5.5 — lazy calendar-render chunk UI (glyph for canvas).
 */
import type { CalendarModel } from "@/lib/calendar-render";
import {
  CalendarRenderLazyAnchor,
  renderCalendarHtml,
} from "@/lib/calendar-render";

export { CalendarRenderLazyAnchor, renderCalendarHtml };
export type { CalendarModel, CalendarEra, CalendarWeekStart } from "@/lib/calendar-render";

export function CalendarGlyph({
  model,
  className,
}: {
  model: CalendarModel;
  className?: string;
}) {
  const html = renderCalendarHtml(model);
  return (
    <span
      className={["t-calendarwrap", className].filter(Boolean).join(" ")}
      style={{ display: "block", width: "100%" }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
