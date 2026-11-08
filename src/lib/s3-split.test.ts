import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..", "..");

describe("S3 Split + A5 เปิดโฟลเดอร์", () => {
  test("ModeSwitch and EditorPage include split", () => {
    const store = readFileSync(join(ROOT, "src/stores/editor-store.ts"), "utf8");
    expect(store).toMatch(/EditorMode = .*\| "split"/);
    const mode = readFileSync(join(ROOT, "src/components/editor/ModeSwitch.tsx"), "utf8");
    expect(mode).toContain('value="split"');
    expect(mode).toContain("แยก");
    const page = readFileSync(join(ROOT, "src/pages/EditorPage.tsx"), "utf8");
    expect(page).toContain('mode === "split"');
    expect(page).toContain("<SplitStage");
  });

  test("SplitDivider has A3 separator contract", () => {
    const src = readFileSync(
      join(ROOT, "src/components/editor/SplitDivider.tsx"),
      "utf8",
    );
    expect(src).toContain('role="separator"');
    expect(src).toContain("aria-valuemin");
    expect(src).toContain("aria-valuemax");
    expect(src).toContain("aria-valuenow");
    expect(src).toContain("ปรับขนาดแผงแยก (Resize split)");
    expect(src).toContain("resetSplitSize");
    expect(src).toContain("onDoubleClick");
  });

  test("code-view has copy, open folder, tabs", () => {
    const src = readFileSync(join(ROOT, "src/components/editor/code-view.tsx"), "utf8");
    expect(src).toContain("คัดลอกโค้ด");
    expect(src).toContain("เปิดโฟลเดอร์");
    expect(src).toContain("ยังไม่ได้ส่งออกโปรเจกต์");
    expect(src).toContain('invoke("open_export_folder"');
    expect(src).toContain('aria-label="โค้ดโปรเจกต์ (Project code)"');
  });
});
