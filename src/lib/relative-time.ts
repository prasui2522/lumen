import type { Locale } from "@/lib/locale";

/** Relative time from ISO / parseable date string. */
export function formatRelative(iso: string, locale: Locale = "th", now = Date.now()): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  const diffSec = Math.max(0, Math.floor((now - t) / 1000));
  if (locale === "en") {
    if (diffSec < 60) return "Opened just now";
    const mins = Math.floor(diffSec / 60);
    if (mins < 60) return `Opened ${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `Opened ${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `Opened ${days}d ago`;
    return `Opened ${iso.slice(0, 10)}`;
  }
  if (diffSec < 60) return "เปิดล่าสุดเมื่อสักครู่";
  const mins = Math.floor(diffSec / 60);
  if (mins < 60) return `เปิดล่าสุด ${mins} นาที`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `เปิดล่าสุด ${hours} ชม.`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `เปิดล่าสุด ${days} วัน`;
  return `เปิดล่าสุด ${iso.slice(0, 10)}`;
}

/** @deprecated Prefer `formatRelative(iso, locale)`. */
export function formatRelativeTh(iso: string, now = Date.now()): string {
  return formatRelative(iso, "th", now);
}
