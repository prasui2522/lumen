import type { Locale } from "@/lib/locale";
import { peekLocale } from "@/lib/locale";
import { phrase } from "@/lib/phrases";

/** Known full Thai IPC / Rust / client error strings → EN. Keep Thai as the source. */
const IPC_EN: Record<string, string> = {
  "เปิดข้อมูลทดสอบไม่ได้": "Could not open test data",
  "อัปเดตข้อมูลทดสอบไม่ได้": "Could not update test data",
  "ยังไม่ได้เปิดข้อมูลทดสอบ": "Test data is not open",
  "แผนหมดอายุ": "Plan expired",
  "อ่านโครงสร้างไม่ได้": "Could not read the schema",
  "โครงสร้างฐานข้อมูลไม่ถูกต้อง": "Database schema is invalid",
  "เอกสารในฐานข้อมูลไม่ถูกต้อง": "Document in the database is invalid",
  "เอกสารไม่ถูกต้อง": "Document is invalid",
  "JSON ไม่ถูกต้อง": "Invalid JSON",
  "JSON ไม่ถูกต้อง: ต้องเป็นอ็อบเจกต์": "Invalid JSON: must be an object",
  "รหัสโปรเจกต์ไม่ถูกต้อง": "Invalid project id",
  "ไม่ได้เลือกตำแหน่งบันทึก": "No save location was chosen",
  "ยังไม่มีโฟลเดอร์โปรเจกต์": "No project folder yet",
  "ยังไม่มีโฟลเดอร์โปรเจกต์ — บันทึกก่อน": "No project folder yet — save first",
  "ยังไม่ได้ส่งออกโปรเจกต์": "Project has not been exported yet",
  "โฟลเดอร์นี้ไม่ใช่โปรเจกต์ที่ส่งออกจากแอป": "This folder is not a project exported from the app",
  "ไม่พบ src/data/site.json": "src/data/site.json not found",
  "ตำแหน่งบันทึกไม่ถูกต้อง": "Invalid save location",
  "ชื่อไฟล์ไม่ถูกต้อง": "Invalid file name",
  "ไม่พบโฟลเดอร์ปลายทาง": "Destination folder not found",
  "บันทึกไฟล์ไม่สำเร็จ": "Could not save the file",
  "บันทึกไฟล์ไม่ได้": "Could not save the file",
  "สร้างไฟล์ zip ไม่สำเร็จ": "Could not create the zip file",
  "เปิดไฟล์ zip ไม่สำเร็จ": "Could not open the zip file",
  "ไฟล์ zip ใช้ไม่ได้": "Zip file is unusable",
  "คัดลอกโปรเจกต์ไม่สำเร็จ": "Could not copy the project",
  "อ่านโฟลเดอร์โปรเจกต์ไม่สำเร็จ": "Could not read the project folder",
  "อ่านไฟล์โปรเจกต์ไม่สำเร็จ": "Could not read the project file",
  "เปิดโฟลเดอร์โปรเจกต์ไม่สำเร็จ": "Could not open the project folder",
  "เปิดโฟลเดอร์ไม่สำเร็จ": "Could not open the folder",
  "ชื่อไฟล์ในโปรเจกต์ไม่ถูกต้อง": "Invalid file name in the project",
  "ชื่อไฟล์รูปในรายการส่งออกไม่ถูกต้อง": "Invalid image file name in the export list",
  "ชื่อไฟล์รูปใน zip ไม่ถูกต้อง": "Invalid image file name in the zip",
  "ชื่อไฟล์ในโฟลเดอร์ตัวอย่างไม่ถูกต้อง": "Invalid file name in the sample folder",
  "ชื่อไฟล์รูปในโฟลเดอร์ตัวอย่างไม่ถูกต้อง": "Invalid image file name in the sample folder",
  "ชื่อไฟล์รูปในโฟลเดอร์โปรเจกต์ไม่ถูกต้อง": "Invalid image file name in the project folder",
  "สร้างโฟลเดอร์ตัวอย่างไม่สำเร็จ": "Could not create the sample folder",
  "เขียนไฟล์ตัวอย่างไม่สำเร็จ": "Could not write the sample file",
  "เขียน site.json ไม่สำเร็จ": "Could not write site.json",
  "ย่อรูปไม่สำเร็จ": "Could not resize the image",
  "บันทึกรูปไม่สำเร็จ": "Could not save the image",
  "อ่านไฟล์รูปไม่สำเร็จ": "Could not read the image file",
  "รหัสรูปไม่ถูกต้อง": "Invalid image id",
  "นำเข้ารูปไม่สำเร็จ": "Could not import the image",
  "รูปหลังย่อแล้วยังใหญ่เกิน 8MB": "Image is still over 8 MB after resizing",
  "เปิดบันทึกไม่สำเร็จ": "Could not open the log",
  "เปิดบันทึก sidecar ไม่สำเร็จ": "Could not open the sidecar log",
  "เขียน sidecar.json ไม่สำเร็จ": "Could not write sidecar.json",
  "ไม่พบ bun ที่แพ็กมากับแอป": "Bundled bun was not found",
  "ไม่พบพอร์ตว่างสำหรับเครื่องมือแสดงตัวอย่าง": "No free port for the preview tool",
  "ลิงก์ node_modules ไม่สำเร็จ": "Could not link node_modules",
  "ยังไม่มีบันทึกเครื่องมือแสดงตัวอย่าง": "No preview tool log yet",
  "ติดตั้งเครื่องมือแสดงตัวอย่างไม่สำเร็จ": "Could not install the preview tool",
  "พื้นที่ดิสก์ไม่พอสำหรับเครื่องมือแสดงตัวอย่าง": "Not enough disk space for the preview tool",
  "ต้องเชื่อมต่ออินเทอร์เน็ตครั้งแรกเพื่อติดตั้งเครื่องมือแสดงตัวอย่าง (ครั้งเดียว) — ระหว่างนี้แสดงตัวอย่างแบบพื้นฐาน":
    "Internet is required the first time to install the preview tool (once) — basic preview is used until then",
  "ตัวอย่างหยุดทำงาน": "Preview stopped",
  "สร้างตัวอย่างไม่ได้": "Could not create the preview",
  "PREVIEW_INSTALL_FAILED:เครื่องมือแสดงตัวอย่างไม่ตอบ": "PREVIEW_INSTALL_FAILED: preview tool did not respond",
  "ไม่พบแถว": "Row not found",
  "ไม่พบตาราง": "Table not found",
  "ไม่พบคอลัมน์": "Column not found",
  "ค่าซ้ำ": "Duplicate value",
  "ต้องมีค่า": "Required",
  "รูปแบบไม่ถูกต้อง": "Invalid format",
  "ไม่มีข้อมูล": "No data",
  "ลบไม่ได้ มีแถวอื่นอ้างอิงอยู่": "Cannot delete — other rows reference it",
  "แก้ไม่ได้ มีแถวอื่นอ้างอิงอยู่": "Cannot edit — other rows reference it",
  "โครงสร้างเปลี่ยนแล้ว อัปเดตข้อมูลทดสอบก่อนแก้ไข": "Schema changed — update test data before editing",
  "ไฟล์นี้อาจถูกใช้อยู่ ดิสก์เต็ม หรือแอปเขียนโฟลเดอร์ข้อมูลไม่ได้ แก้แล้วกด ลองอีกครั้ง":
    "The file may be in use, the disk may be full, or the app cannot write the data folder. Fix that, then press Try again",
  "ไฟล์อาจถูกใช้อยู่ ดิสก์เต็ม หรือแอปเขียนโฟลเดอร์ข้อมูลไม่ได้ แก้แล้วกด ลองอีกครั้ง":
    "The file may be in use, the disk may be full, or the app cannot write the data folder. Fix that, then press Try again",
  "ใช้เงาได้สูงสุด 6 ชั้น": "At most 6 shadow layers",
  "ใช้ได้อย่างใดอย่างหนึ่ง: ไล่สีพื้นหลังหรือไล่สีตัวอักษร":
    "Use only one: background gradient or text gradient",
  "ตารางเต็มแล้ว": "The table is full",
  "ไม่มีสไตล์ที่จะบันทึก": "Nothing to save as a style",
  "ลบพรีเซ็ตแล้ว": "Preset deleted",
  "บันทึกพรีเซ็ตแล้ว": "Preset saved",
  "ดิสก์เต็ม": "Disk full",
  "permission denied": "permission denied",
};

const PREFIX_EN: Record<string, string> = {
  "เปิดข้อมูลทดสอบไม่ได้": "Could not open test data",
  "อัปเดตข้อมูลทดสอบไม่ได้": "Could not update test data",
  "JSON ไม่ถูกต้อง": "Invalid JSON",
  "เขียน site.json ไม่สำเร็จ": "Could not write site.json",
  "สร้างไฟล์ zip ไม่สำเร็จ": "Could not create the zip file",
  "บันทึกไฟล์ไม่สำเร็จ": "Could not save the file",
  "คัดลอกโปรเจกต์ไม่สำเร็จ": "Could not copy the project",
  "อ่านไฟล์โปรเจกต์ไม่สำเร็จ": "Could not read the project file",
  "อ่านโฟลเดอร์โปรเจกต์ไม่สำเร็จ": "Could not read the project folder",
  "สร้างโฟลเดอร์ตัวอย่างไม่สำเร็จ": "Could not create the sample folder",
  "เขียนไฟล์ตัวอย่างไม่สำเร็จ": "Could not write the sample file",
  "เขียน sidecar.json ไม่สำเร็จ": "Could not write sidecar.json",
  "เปิดบันทึก sidecar ไม่สำเร็จ": "Could not open the sidecar log",
  "ลิงก์ node_modules ไม่สำเร็จ": "Could not link node_modules",
  "ต้องมีค่า": "Required",
  "ค่าซ้ำ": "Duplicate value",
  "แก้ไม่ได้ เป็นลำดับอัตโนมัติ": "Cannot edit — auto sequence",
  "ไม่พบแถวที่อ้างอิง": "Referenced row not found",
  "PREVIEW_INSTALL_FAILED": "PREVIEW_INSTALL_FAILED",
};

/** Translate a Rust/IPC/client error string for display. */
export function phraseIpcError(locale: Locale, message: string): string {
  const m = message.trim();
  if (!m || locale === "th") return message;
  const exact = IPC_EN[m];
  if (exact) return exact;

  let hit: RegExpExecArray | null;
  if ((hit = /^แถว (\d+), (.+)$/.exec(m))) {
    return `Row ${hit[1]}, ${phraseIpcError(locale, hit[2]!)}`;
  }
  if ((hit = /^แถว (\d+)–(\d+) จาก (\d+)$/.exec(m))) {
    return `Rows ${hit[1]}–${hit[2]} of ${hit[3]}`;
  }
  if (m === "แถว 0 จาก 0") return "Rows 0 of 0";
  if ((hit = /^ตาราง (.+) จะถูกลบ \(ลบ (.+) แถว\)$/.exec(m))) {
    return `Table ${hit[1]} will be deleted (${hit[2]} rows removed)`;
  }
  if ((hit = /^ตาราง (.+) จะถูกลบ$/.exec(m))) {
    return `Table ${hit[1]} will be deleted`;
  }
  if ((hit = /^(.+): ลบ (.+) แถว, ล้าง (.+) ค่า$/.exec(m))) {
    return `${hit[1]}: remove ${hit[2]} rows, clear ${hit[3]} values`;
  }
  if ((hit = /^(.+): ลบ (.+) แถว$/.exec(m))) {
    return `${hit[1]}: remove ${hit[2]} rows`;
  }
  if ((hit = /^(.+): ล้าง (.+) ค่า$/.exec(m))) {
    return `${hit[1]}: clear ${hit[2]} values`;
  }
  if ((hit = /^ใช้จุดสีได้สูงสุด (\d+) จุด$/.exec(m))) {
    return `At most ${hit[1]} color stops`;
  }
  if ((hit = /^(.+): (.+)$/.exec(m))) {
    const left = hit[1]!;
    const right = hit[2]!;
    const pref = PREFIX_EN[left] ?? IPC_EN[left];
    if (pref) return `${pref}: ${phraseIpcError(locale, right)}`;
    // Grid `errorLine` flips Rust `ค่าซ้ำ: email` → `email: ค่าซ้ำ`.
    const flipped = IPC_EN[right] ?? PREFIX_EN[right];
    if (flipped) return `${left}: ${flipped}`;
  }
  return phrase(locale, m);
}

/** Toast / announce helper that follows the current UI locale. */
export function toastIpcError(message: string): string {
  return phraseIpcError(peekLocale(), message);
}

/** Display form of `openErrorText` for the current locale. */
export function displayOpenErrorText(locale: Locale, thaiBody: string): string {
  return phraseIpcError(locale, thaiBody);
}

/** Display form of `rangeLabel` for the current locale. */
export function displayRangeLabel(locale: Locale, offset: number, count: number, total: number): string {
  if (locale === "th") {
    if (total === 0) return "แถว 0 จาก 0";
    return `แถว ${offset + 1}–${offset + count} จาก ${total}`;
  }
  if (total === 0) return "Rows 0 of 0";
  return `Rows ${offset + 1}–${offset + count} of ${total}`;
}
