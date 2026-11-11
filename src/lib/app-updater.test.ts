import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "../..");

describe("app updater", () => {
  test("tauri conf has updater pubkey, GitHub latest.json endpoint, and artifacts", () => {
    const conf = JSON.parse(readFileSync(join(ROOT, "src-tauri/tauri.conf.json"), "utf8"));
    expect(conf.bundle.createUpdaterArtifacts).toBe(true);
    expect(conf.plugins.updater.pubkey).toMatch(/^dW50cnVzdGVk/);
    expect(conf.plugins.updater.endpoints[0]).toContain("releases/latest/download/latest.json");
  });

  test("About menu offers check for updates and plugins are registered", () => {
    const about = readFileSync(join(ROOT, "src/components/about-notices.tsx"), "utf8");
    expect(about).toContain("checkForAppUpdate");
    expect(about).toContain("ตรวจหาอัปเดต");
    const lib = readFileSync(join(ROOT, "src-tauri/src/lib.rs"), "utf8");
    expect(lib).toContain("tauri_plugin_updater");
    expect(lib).toContain("tauri_plugin_process");
    const caps = readFileSync(join(ROOT, "src-tauri/capabilities/default.json"), "utf8");
    expect(caps).toContain("updater:default");
    expect(caps).toContain("process:allow-restart");
  });
});
