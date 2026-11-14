import { describe, expect, test } from "bun:test";
import { phraseIssue, phraseProblemLine } from "./db-issue-i18n";

describe("phraseIssue", () => {
  test("keeps Thai", () => {
    expect(phraseIssue("th", "ต้องมีคีย์หลัก")).toBe("ต้องมีคีย์หลัก");
  });
  test("translates static and patterned messages", () => {
    expect(phraseIssue("en", "ต้องมีคีย์หลัก")).toBe("A primary key is required");
    expect(phraseIssue("en", "users เป็นคำสงวน")).toBe("users is a reserved word");
    expect(phraseIssue("en", "ชื่อคอลัมน์ซ้ำ: email")).toBe("Duplicate column name: email");
    expect(phraseIssue("en", "ตารางได้ไม่เกิน 50 ตาราง")).toBe("At most 50 tables");
    expect(phraseIssue("en", "คอลัมน์ได้ไม่เกิน 100 คอลัมน์")).toBe("At most 100 columns");
  });
});

describe("phraseProblemLine", () => {
  test("translates composed column lines", () => {
    expect(phraseProblemLine("en", "คอลัมน์ price: ค่าเริ่มต้นไม่ตรงกับชนิด")).toBe(
      "Column price: Default does not match the type",
    );
    expect(phraseProblemLine("en", "ชื่อตาราง: ต้องมีชื่อ")).toBe("Table name: A name is required");
  });
});
