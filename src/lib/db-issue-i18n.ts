import type { Locale } from "@/lib/locale";
import { phrase } from "@/lib/phrases";

/** Static validateModel / identifierError messages → EN. Keep Thai as the source key. */
const ISSUE_EN: Record<string, string> = {
  "ต้องมีชื่อ": "A name is required",
  "ชื่อใช้ได้เฉพาะ a-z 0-9 _ ขึ้นต้นด้วยตัวอักษร ไม่เกิน 63 ตัว":
    "Use a–z, 0–9, and _; start with a letter; max 63 characters",
  "ห้ามขึ้นต้นด้วย pg_ หรือ sqlite_": "Must not start with pg_ or sqlite_",
  "JSON ไม่มีค่าเริ่มต้น": "JSON has no default",
  "ลำดับอัตโนมัติไม่มีค่าเริ่มต้น": "Auto sequence has no default",
  "ค่าเริ่มต้นไม่ตรงกับชนิด": "Default does not match the type",
  "ต้องมีอย่างน้อย 1 ตาราง": "At least one table is required",
  "รหัสตารางซ้ำหรือว่าง": "Table id is duplicate or empty",
  "ต้องมีอย่างน้อย 1 คอลัมน์": "At least one column is required",
  "รหัสคอลัมน์ซ้ำหรือว่าง": "Column id is duplicate or empty",
  "ทศนิยม: ความแม่นยำ 1–38 และตำแหน่งทศนิยม 0 ถึงความแม่นยำ":
    "Decimal: precision 1–38 and scale 0 through precision",
  "ตัวเลือก: 1–50 ค่าไม่ซ้ำกัน แต่ละค่า 1–63 ตัวอักษร":
    "Options: 1–50 unique values, each 1–63 characters",
  "ต้องมีคีย์หลัก": "A primary key is required",
  "คีย์หลักมีคอลัมน์ซ้ำ": "Primary key has duplicate columns",
  "คีย์หลักอ้างถึงคอลัมน์ที่ไม่มีอยู่": "Primary key references a missing column",
  "คอลัมน์คีย์หลักต้องมีค่า": "Primary-key columns must be required",
  "ลำดับอัตโนมัติต้องเป็นคีย์หลักเพียงคอลัมน์เดียว":
    "Auto sequence must be the only primary-key column",
  "ไม่ซ้ำ: ต้องเลือกอย่างน้อย 1 คอลัมน์": "Unique: pick at least one column",
  "ไม่ซ้ำ: เลือกคอลัมน์ซ้ำ": "Unique: duplicate columns selected",
  "ไม่ซ้ำ: อ้างถึงคอลัมน์ที่ไม่มีอยู่": "Unique: references a missing column",
  "ไม่ซ้ำ: ซ้ำกับคีย์หลัก": "Unique: same as the primary key",
  "ไม่ซ้ำ: มีชุดคอลัมน์นี้แล้ว": "Unique: this column set already exists",
  "ความสัมพันธ์: จำนวนคอลัมน์ไม่เท่ากัน": "Relationship: column counts do not match",
  "ความสัมพันธ์: เลือกคอลัมน์ซ้ำ": "Relationship: duplicate columns selected",
  "ความสัมพันธ์: อ้างถึงคอลัมน์ที่ไม่มีอยู่": "Relationship: references a missing column",
  "ความสัมพันธ์: ไม่พบตารางปลายทาง": "Relationship: target table not found",
  "ความสัมพันธ์: ไม่พบคอลัมน์ปลายทาง": "Relationship: target columns not found",
  "ความสัมพันธ์: ชนิดคอลัมน์ไม่ตรงกัน": "Relationship: column types do not match",
  "ความสัมพันธ์: คอลัมน์ปลายทางต้องเป็นคีย์หลักหรือไม่ซ้ำ":
    "Relationship: target columns must be a primary key or unique set",
  "ความสัมพันธ์: ตั้งเป็นว่างได้เมื่อทุกคอลัมน์ไม่บังคับมีค่า":
    "Relationship: set null only when every local column is optional",
  "(ไม่พบคอลัมน์)": "(missing column)",
  "(ไม่พบตาราง)": "(missing table)",
};

/** Translate a raw validateModel / identifierError message. */
export function phraseIssue(locale: Locale, message: string): string {
  if (locale === "th") return message;
  const hit = ISSUE_EN[message];
  if (hit) return hit;
  let m: RegExpExecArray | null;
  if ((m = /^(.+) เป็นคำสงวน$/.exec(message))) return `${m[1]} is a reserved word`;
  if ((m = /^(.+) เป็นชื่อของระบบ$/.exec(message))) return `${m[1]} is a system name`;
  if ((m = /^ชื่อตารางซ้ำ: (.+)$/.exec(message))) return `Duplicate table name: ${m[1]}`;
  if ((m = /^ชื่อคอลัมน์ซ้ำ: (.+)$/.exec(message))) return `Duplicate column name: ${m[1]}`;
  if ((m = /^ตารางได้ไม่เกิน (\d+) ตาราง$/.exec(message))) return `At most ${m[1]} tables`;
  if ((m = /^คอลัมน์ได้ไม่เกิน (\d+) คอลัมน์$/.exec(message))) return `At most ${m[1]} columns`;
  return phrase(locale, message);
}

/**
 * Translate a composed `tableProblems` line such as
 * `คอลัมน์ price: ค่าเริ่มต้นไม่ตรงกับชนิด` or a bare issue message.
 */
export function phraseProblemLine(locale: Locale, text: string): string {
  if (locale === "th") return text;
  let m: RegExpExecArray | null;
  if ((m = /^ชื่อตาราง: (.+)$/.exec(text))) {
    return `${phrase(locale, "ชื่อตาราง")}: ${phraseIssue(locale, m[1]!)}`;
  }
  if ((m = /^คอลัมน์ที่ (\d+): (.+)$/.exec(text))) {
    return `Column ${m[1]}: ${phraseIssue(locale, m[2]!)}`;
  }
  if ((m = /^คอลัมน์ (.+): (.+)$/.exec(text))) {
    return `Column ${m[1]}: ${phraseIssue(locale, m[2]!)}`;
  }
  return phraseIssue(locale, text);
}
