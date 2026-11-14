import { peekLocale } from "@/lib/locale";
import { phrase } from "@/lib/phrases";

/** Live-region announce that follows the current UI locale. */
export function announceLocale(th: string, en: string): string {
  return peekLocale() === "en" ? en : th;
}

export function announceInsertedBlock(name: string): string {
  return announceLocale(`แทรกบล็อก ${name} แล้ว`, `Inserted block ${name}`);
}

export function announceAddedTable(name: string): string {
  return announceLocale(`เพิ่มตาราง ${name} แล้ว`, `Added table ${name}`);
}

export function announceRenamed(name: string): string {
  return announceLocale(`เปลี่ยนชื่อเป็น ${name} แล้ว`, `Renamed to ${name}`);
}

export function announceMoved(name: string, index: number, total: number): string {
  return announceLocale(
    `เลื่อน ${name} ไปลำดับ ${index} จาก ${total}`,
    `Moved ${name} to ${index} of ${total}`,
  );
}

export function announceRemovedTable(name: string, fks: number): string {
  if (fks > 0) {
    return announceLocale(
      `ลบตาราง ${name} และความสัมพันธ์ ${fks} รายการที่อ้างถึงตารางนี้แล้ว`,
      `Deleted table ${name} and ${fks} relationships that pointed to it`,
    );
  }
  return announceLocale(`ลบตาราง ${name} แล้ว`, `Deleted table ${name}`);
}

export function announceAddedColumn(name: string): string {
  return announceLocale(`เพิ่มคอลัมน์ ${name} แล้ว`, `Added column ${name}`);
}

export function announceRemovedColumn(
  name: string,
  uniques: number,
  foreignKeys: number,
): string {
  if (uniques > 0 && foreignKeys > 0) {
    return announceLocale(
      `ลบคอลัมน์ ${name} พร้อมชุดไม่ซ้ำ ${uniques} ชุดและความสัมพันธ์ ${foreignKeys} รายการที่ใช้คอลัมน์นี้แล้ว`,
      `Deleted column ${name} with ${uniques} unique sets and ${foreignKeys} relationships that used it`,
    );
  }
  if (uniques > 0) {
    return announceLocale(
      `ลบคอลัมน์ ${name} และชุดไม่ซ้ำ ${uniques} ชุดที่ใช้คอลัมน์นี้แล้ว`,
      `Deleted column ${name} and ${uniques} unique sets that used it`,
    );
  }
  if (foreignKeys > 0) {
    return announceLocale(
      `ลบคอลัมน์ ${name} และความสัมพันธ์ ${foreignKeys} รายการที่ใช้คอลัมน์นี้แล้ว`,
      `Deleted column ${name} and ${foreignKeys} relationships that used it`,
    );
  }
  return announceLocale(`ลบคอลัมน์ ${name} แล้ว`, `Deleted column ${name}`);
}

/** Page-perf warning bodies — Thai source kept; EN at display. */
export function displayPerfWarning(message: string): string {
  const locale = peekLocale();
  if (locale === "th") return message;
  let m: RegExpExecArray | null;
  if ((m = /^หน้านี้ใช้เอฟเฟกต์เบลอ (\d+) จุด อาจทำให้เครื่องช้าลง แนะนำไม่เกิน (\d+) จุด$/.exec(message))) {
    return `This page uses ${m[1]} blur effects and may run slowly. Keep under ${m[2]} if you can.`;
  }
  if (message === "เงาในหน้านี้ใหญ่และซ้อนกันมาก อาจทำให้เครื่องช้าลง") {
    return "Shadows on this page are large and stacked, which may slow things down";
  }
  if ((m = /^หน้านี้มีองค์ประกอบที่เคลื่อนไหว (\d+) จุด แนะนำไม่เกิน (\d+) จุด$/.exec(message))) {
    return `This page has ${m[1]} animated elements. Keep under ${m[2]} if you can.`;
  }
  if (message === "เงาหนัก") return "Heavy shadows";
  if ((m = /^เบลอ (\d+)\/(\d+)$/.exec(message))) return `Blur ${m[1]}/${m[2]}`;
  if ((m = /^เคลื่อนไหว (\d+)\/(\d+)$/.exec(message))) return `Motion ${m[1]}/${m[2]}`;
  return phrase(locale, message);
}
