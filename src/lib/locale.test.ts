import { describe, expect, test } from "bun:test";
import { kindLabel } from "@/lib/kind-label";
import { setLocale, peekLocale } from "@/lib/locale";
import { text } from "@/lib/messages";
import { phrase } from "@/lib/phrases";
import { displayLayerLabel } from "@/lib/layer-display";
import { formatRelative } from "@/lib/relative-time";
import { NODE_TYPE_LABEL } from "@/lib/document-ops";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "../..");

describe("locale", () => {
  test("English chrome and kind names, Thai stays the default labels, schema labels are unchanged", () => {
    const prev = peekLocale();
    try {
      setLocale("en");
      expect(text("en", "save")).toBe("Save");
      expect(text("en", "addPage")).toBe("Add page");
      expect(kindLabel("page", "en")).toBe("Page");
      expect(kindLabel("card", "en")).toBe("Card");
      expect(kindLabel("command", "en")).toBe("Command");
      expect(phrase("en", "เลเยอร์")).toBe("Layers");
      expect(phrase("en", "สไตล์")).toBe("Style");
      setLocale("th");
      expect(text("th", "save")).toBe("บันทึก");
      expect(kindLabel("button", "th")).toBe("ปุ่ม");
      expect(kindLabel("card", "th")).toBe("การ์ด");
      expect(phrase("th", "เลเยอร์")).toBe("เลเยอร์");
      expect(NODE_TYPE_LABEL.checkbox).toBe("Checkbox");
      expect(NODE_TYPE_LABEL.button).toBe("ปุ่ม");
    } finally {
      setLocale(prev);
    }
  });

  test("language toggle shows TH or EN", () => {
    const src = readFileSync(join(ROOT, "src/components/LanguageToggle.tsx"), "utf8");
    expect(src).toContain('"EN"');
    expect(src).toContain('"TH"');
    expect(src).toContain("locale === \"en\" ? \"EN\" : \"TH\"");
  });

  test("About and relative time follow the locale", () => {
    expect(phrase("en", "เกี่ยวกับ")).toBe("About");
    expect(phrase("en", "ประกาศบุคคลที่สาม")).toBe("Third-party notices");
    const iso = new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString();
    expect(formatRelative(iso, "en")).toMatch(/Opened 1d ago/);
    expect(formatRelative(iso, "th")).toMatch(/เปิดล่าสุด 1 วัน/);
  });

  test("layer labels from Thai blocks show in English without rewriting the document", () => {
    expect(displayLayerLabel("แถบหัว", "section", "en")).toBe("Header");
    expect(displayLayerLabel("ชื่อเว็บ", "heading", "en")).toBe("Site name");
    expect(displayLayerLabel("หน้าแรก", "link", "en")).toBe("Home");
    expect(displayLayerLabel("บริการ", "link", "en")).toBe("Services");
    expect(displayLayerLabel(NODE_TYPE_LABEL.container, "container", "en")).toBe("Box");
    expect(displayLayerLabel("ข้อความของฉัน", "text", "en")).toBe("ข้อความของฉัน");
    expect(displayLayerLabel("แถบหัว", "section", "th")).toBe("แถบหัว");
  });
});
