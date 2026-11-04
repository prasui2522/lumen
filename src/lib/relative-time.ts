/** Thai-ish relative time from ISO / parseable date string. */
export function formatRelativeTh(iso: string, now = Date.now()): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  const diffSec = Math.max(0, Math.floor((now - t) / 1000));
  if (diffSec < 60) return "เปิดล่าสุดเมื่อสักครู่";
  const mins = Math.floor(diffSec / 60);
  if (mins < 60) return `เปิดล่าสุด ${mins} นาที`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `เปิดล่าสุด ${hours} ชม.`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `เปิดล่าสุด ${days} วัน`;
  return `เปิดล่าสุด ${iso.slice(0, 10)}`;
}
