/**
 * DW-M2 menubar + DW-M3 code mode smoke (source + mode union).
 */
import { describe, expect, test } from "bun:test";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

const ROOT = join(import.meta.dir, "..", "..");

describe("DW-M2 EditorMenubar", () => {
  test("wires ไฟล์ / แก้ไข / มุมมอง to existing actions", () => {
    const src = readFileSync(
      join(ROOT, "src/components/editor/EditorMenubar.tsx"),
      "utf8",
    );
    expect(src).toContain("ไฟล์");
    expect(src).toContain("แก้ไข");
    expect(src).toContain("มุมมอง");
    expect(src).toContain("onSave");
    expect(src).toContain("onExport");
    expect(src).toContain("undo()");
    expect(src).toContain('goMode("code")');
  });

  test("EditorTopBar mounts EditorMenubar", () => {
    const src = readFileSync(
      join(ROOT, "src/components/editor/EditorTopBar.tsx"),
      "utf8",
    );
    expect(src).toContain("<EditorMenubar");
  });
});

describe("DW-M3 Code mode", () => {
  test("EditorMode includes code; ModeSwitch + EditorPage lazy CodeView", () => {
    const store = readFileSync(join(ROOT, "src/stores/editor-store.ts"), "utf8");
    expect(store).toMatch(/EditorMode = .*\| "code"/);

    const mode = readFileSync(
      join(ROOT, "src/components/editor/ModeSwitch.tsx"),
      "utf8",
    );
    expect(mode).toContain('value="code"');
    expect(mode).toContain("โค้ด");

    const page = readFileSync(join(ROOT, "src/pages/EditorPage.tsx"), "utf8");
    expect(page).toContain('import("@/components/editor/code-view")');
    expect(page).toContain('mode === "code"');
  });

  test("code-view uses list_export_files + read-only CodeMirror", () => {
    const src = readFileSync(
      join(ROOT, "src/components/editor/code-view.tsx"),
      "utf8",
    );
    expect(src).toContain('invoke<ExportListEntry[]>("list_export_files"');
    expect(src).toContain("EditorState.readOnly.of(true)");
    expect(src).toContain("คัดลอกโค้ด");
    expect(src).toContain("เปิดโฟลเดอร์");
    expect(src).toContain('aria-label="โค้ดโปรเจกต์ (Project code)"');
  });

  test("code-view chunk ≤ 170 kB gz when dist present", () => {
    const dist = join(ROOT, "dist", "assets");
    if (!existsSync(dist)) return;
    const file = readdirSync(dist).find(
      (f) => f.startsWith("code-view-") && f.endsWith(".js"),
    );
    if (!file) return; // build may not have run yet
    const gz = gzipSync(readFileSync(join(dist, file)), { level: 9 }).byteLength;
    expect(gz).toBeLessThanOrEqual(170 * 1024);
  });
});
