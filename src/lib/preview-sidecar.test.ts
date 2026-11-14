import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ERROR_THAI,
  PHASE_LABEL,
  nextHmrDelay,
  normalizeStatus,
  parseStartError,
  shouldPollPss,
  viteFrameOrigin,
  viteFrameUrl,
} from "./preview-sidecar";

const ROOT = join(import.meta.dir, "..", "..");

describe("S6 sidecar helpers", () => {
  test("status labels and poll rule", () => {
    expect(PHASE_LABEL.stopped).toBe("หยุด");
    expect(PHASE_LABEL.starting).toBe("กำลังเริ่ม");
    expect(PHASE_LABEL.running).toBe("ทำงาน");
    expect(PHASE_LABEL.error).toBe("ผิดพลาด");
    expect(shouldPollPss("stopped")).toBe(false);
    expect(shouldPollPss("error")).toBe(false);
    expect(shouldPollPss("starting")).toBe(true);
    expect(shouldPollPss("running")).toBe(true);
  });

  test("normalizeStatus and vite URL", () => {
    expect(normalizeStatus(null).state).toBe("stopped");
    expect(normalizeStatus({ state: "running", port: 47301 }).port).toBe(47301);
    expect(viteFrameUrl(47301, "/about")).toBe("http://127.0.0.1:47301/about");
    expect(viteFrameUrl(47301, "/")).toBe("http://127.0.0.1:47301/");
    expect(viteFrameUrl(47301, "/", "tauri://localhost")).toBe("wbpreview://localhost/");
    expect(viteFrameUrl(47301, "/about", "https://tauri.localhost")).toBe(
      "https://wbpreview.localhost/about",
    );
    expect(viteFrameOrigin("http://127.0.0.1:47301/about", 47301)).toBe("http://127.0.0.1:47301");
    expect(viteFrameOrigin("wbpreview://localhost/", 47301)).toBe("wbpreview://localhost");
    expect(viteFrameOrigin("https://wbpreview.localhost/about", 47301)).toBe(
      "https://wbpreview.localhost",
    );
  });

  test("UI strings live in lazy status bar + DeviceToolbar", () => {
    const bar = readFileSync(
      join(ROOT, "src/components/editor/preview/vite-status-bar.tsx"),
      "utf8",
    );
    expect(bar).toContain("หยุด");
    expect(bar).toContain("aria-live");
    expect(bar).toContain("SIDECAR_PSS_POLL_MS");
    const tb = readFileSync(
      join(ROOT, "src/components/editor/preview/DeviceToolbar.tsx"),
      "utf8",
    );
    expect(tb).toContain("ViteRunButton");
    expect(tb).toContain("แสดงได้สูงสุด 3 อุปกรณ์พร้อมกัน");
    const btn = readFileSync(
      join(ROOT, "src/components/editor/preview/ViteRunButton.tsx"),
      "utf8",
    );
    expect(btn).toContain("รันด้วย Vite");
    expect(btn).toContain("หยุด");
    expect(btn).toContain("sidecarStop");
  });

  test("S8 HMR delay is 150 ms debounce and at most 4 writes/s", () => {
    expect(nextHmrDelay(1000, 0)).toBe(150);
    expect(nextHmrDelay(1000, 850)).toBe(150);
    expect(nextHmrDelay(1000, 950)).toBe(200);
  });

  test("S7/S9 start errors map to Thai codes", () => {
    expect(parseStartError("PREVIEW_OFFLINE_FIRST_INSTALL").errorCode).toBe(
      "PREVIEW_OFFLINE_FIRST_INSTALL",
    );
    expect(parseStartError("PREVIEW_OFFLINE_FIRST_INSTALL").error).toBe(
      ERROR_THAI.PREVIEW_OFFLINE_FIRST_INSTALL,
    );
    expect(parseStartError("PREVIEW_INSTALL_FAILED:boom").error).toBe(
      ERROR_THAI.PREVIEW_INSTALL_FAILED,
    );
    expect(parseStartError("PREVIEW_CRASH").error).toBe("ตัวอย่างหยุดทำงาน");
  });

  test("S10 PreviewStage does not call compile_preview; command stays for snapshots", () => {
    const stage = readFileSync(
      join(ROOT, "src/components/editor/PreviewStage.tsx"),
      "utf8",
    );
    expect(stage).not.toContain('invoke<string>("compile_preview"');
    expect(stage).not.toContain('invoke("compile_preview"');
    expect(stage).toContain("preview_bundle");
    const commands = readFileSync(
      join(ROOT, "src-tauri/src/commands.rs"),
      "utf8",
    );
    expect(commands).toContain("pub async fn compile_preview");
    expect(commands).toContain("snapshot tests");
  });

  test("status bar is lazy from EditorPage", () => {
    const page = readFileSync(join(ROOT, "src/pages/EditorPage.tsx"), "utf8");
    expect(page).toContain("vite-status-bar");
    expect(page).toContain("lazyNamed");
    expect(page).toContain("useSidecarSession");
  });
});
