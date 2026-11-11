import { describe, expect, test } from "bun:test";
import { displayRangeLabel, phraseIpcError } from "./ipc-error-i18n";

describe("phraseIpcError", () => {
  test("keeps Thai", () => {
    expect(phraseIpcError("th", "ดิสก์เต็ม")).toBe("ดิสก์เต็ม");
  });
  test("translates known IPC and patterned lines", () => {
    expect(phraseIpcError("en", "ดิสก์เต็ม")).toBe("Disk full");
    expect(phraseIpcError("en", "เปิดข้อมูลทดสอบไม่ได้: ดิสก์เต็ม")).toBe(
      "Could not open test data: Disk full",
    );
    expect(phraseIpcError("en", "แถว 3, email: ค่าซ้ำ")).toBe("Row 3, email: Duplicate value");
    expect(phraseIpcError("en", "ตาราง users จะถูกลบ (ลบ 12 แถว)")).toBe(
      "Table users will be deleted (12 rows removed)",
    );
  });
});

describe("displayRangeLabel", () => {
  test("EN page range", () => {
    expect(displayRangeLabel("en", 10, 5, 40)).toBe("Rows 11–15 of 40");
    expect(displayRangeLabel("th", 10, 5, 40)).toBe("แถว 11–15 จาก 40");
  });
});
