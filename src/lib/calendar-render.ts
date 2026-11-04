/**
 * Phase 11 A5.5 — static calendar month grid (lazy `calendar-render` chunk).
 * Thai month/weekday names + grid maths match Rust `calendar_render.rs`.
 */

export type CalendarEra = "be" | "ce";
export type CalendarWeekStart = 0 | 1;

export type CalendarModel = {
  /** Year in the selected era (BE or CE). */
  year: number;
  /** 1–12 */
  month: number;
  selectedDay?: number;
  weekStart: CalendarWeekStart;
  era: CalendarEra;
};

/** Golden Thai month names (index 0 unused; 1 = มกราคม). */
export const THAI_MONTHS = [
  "",
  "มกราคม",
  "กุมภาพันธ์",
  "มีนาคม",
  "เมษายน",
  "พฤษภาคม",
  "มิถุนายน",
  "กรกฎาคม",
  "สิงหาคม",
  "กันยายน",
  "ตุลาคม",
  "พฤศจิกายน",
  "ธันวาคม",
] as const;

/** Weekday short names starting Sunday (อา). */
export const THAI_WEEKDAYS_SUN = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"] as const;

export function CalendarRenderLazyAnchor(_props: object): null {
  void renderCalendarHtml;
  return null;
}

export function isLeapYear(ceYear: number): boolean {
  return (ceYear % 4 === 0 && ceYear % 100 !== 0) || ceYear % 400 === 0;
}

export function daysInMonth(ceYear: number, month: number): number {
  const m = Math.max(1, Math.min(12, Math.round(month)));
  if (m === 2) return isLeapYear(ceYear) ? 29 : 28;
  if ([4, 6, 9, 11].includes(m)) return 30;
  return 31;
}

/** Gregorian CE year used for leap/weekday maths. */
export function toCeYear(year: number, era: CalendarEra): number {
  const y = Math.round(year);
  return era === "be" ? y - 543 : y;
}

/** Sakamoto algorithm: 0 = Sunday … 6 = Saturday (UTC-safe, no Date). */
export function weekdaySun0(ceYear: number, month: number, day: number): number {
  const t = [0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4];
  let y = ceYear;
  const m = Math.max(1, Math.min(12, month));
  const d = Math.max(1, Math.min(31, day));
  if (m < 3) y -= 1;
  return (y + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400) + t[m - 1]! + d) % 7;
}

function xmlEsc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function weekdayHeaders(weekStart: CalendarWeekStart): readonly string[] {
  if (weekStart === 1) {
    return [...THAI_WEEKDAYS_SUN.slice(1), THAI_WEEKDAYS_SUN[0]!];
  }
  return THAI_WEEKDAYS_SUN;
}

/**
 * Deterministic `<table class="t-calendar">…</table>` string.
 * Matches Rust `render_calendar_html`.
 */
export function renderCalendarHtml(model: CalendarModel): string {
  const era: CalendarEra = model.era === "ce" ? "ce" : "be";
  const weekStart: CalendarWeekStart = model.weekStart === 1 ? 1 : 0;
  const month = Math.max(1, Math.min(12, Math.round(model.month) || 1));
  const year = Math.round(model.year) || (era === "be" ? 2569 : 2026);
  const ce = toCeYear(year, era);
  const dim = daysInMonth(ce, month);
  let selected =
    model.selectedDay === undefined || model.selectedDay === null
      ? undefined
      : Math.round(model.selectedDay);
  if (selected !== undefined && (selected < 1 || selected > dim)) selected = undefined;

  const monthName = THAI_MONTHS[month] ?? "";
  const caption =
    era === "be" ? `${monthName} ${year}` : `${monthName} ค.ศ. ${year}`;

  const firstDow = weekdaySun0(ce, month, 1); // 0=Sun
  const lead = weekStart === 1 ? (firstDow + 6) % 7 : firstDow;

  const headers = weekdayHeaders(weekStart);
  const parts: string[] = [];
  parts.push(`<table class="t-calendar">`);
  parts.push(`<caption>${xmlEsc(caption)}</caption>`);
  parts.push(`<thead><tr>`);
  for (const h of headers) {
    parts.push(`<th scope="col">${h}</th>`);
  }
  parts.push(`</tr></thead><tbody>`);

  let day = 1;
  const totalCells = Math.ceil((lead + dim) / 7) * 7;
  for (let i = 0; i < totalCells; i++) {
    if (i % 7 === 0) parts.push(`<tr>`);
    if (i < lead || day > dim) {
      parts.push(`<td></td>`);
    } else {
      const cur = day;
      day += 1;
      if (selected === cur) {
        parts.push(`<td class="t-calendar__day t-calendar__day--selected" aria-current="date">${cur}</td>`);
      } else {
        parts.push(`<td class="t-calendar__day">${cur}</td>`);
      }
    }
    if (i % 7 === 6) parts.push(`</tr>`);
  }
  parts.push(`</tbody></table>`);
  return parts.join("");
}
