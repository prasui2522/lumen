import { describe, expect, test } from "bun:test";
import { setLocale } from "./locale";
import {
  announceAddedTable,
  announceInsertedBlock,
  announceRemovedColumn,
  displayPerfWarning,
} from "./announce-i18n";

describe("announce-i18n", () => {
  test("switches announce copy with locale", () => {
    setLocale("th");
    expect(announceAddedTable("users")).toBe("เพิ่มตาราง users แล้ว");
    setLocale("en");
    expect(announceAddedTable("users")).toBe("Added table users");
    expect(announceInsertedBlock("Hero")).toBe("Inserted block Hero");
    expect(announceRemovedColumn("email", 1, 2)).toContain("unique sets");
  });

  test("displayPerfWarning patterns", () => {
    setLocale("en");
    expect(displayPerfWarning("เงาในหน้านี้ใหญ่และซ้อนกันมาก อาจทำให้เครื่องช้าลง")).toContain("Shadows");
    expect(
      displayPerfWarning("หน้านี้ใช้เอฟเฟกต์เบลอ 5 จุด อาจทำให้เครื่องช้าลง แนะนำไม่เกิน 3 จุด"),
    ).toContain("5 blur");
    setLocale("th");
  });
});
