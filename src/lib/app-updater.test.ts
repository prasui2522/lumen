import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "../..");

import {
  UPDATER_ENDPOINT_NOT_CONFIGURED,
  UPDATER_ENDPOINT_TEMPLATE,
  updaterEndpointConfigured,
} from "./app-updater";

describe("app updater", () => {
  test("tauri conf has updater pubkey, GitHub latest.json endpoint, and artifacts", () => {
    const conf = JSON.parse(readFileSync(join(ROOT, "src-tauri/tauri.conf.json"), "utf8"));
    expect(conf.bundle.createUpdaterArtifacts).toBe(true);
    expect(conf.plugins.updater.pubkey).toMatch(/^dW50cnVzdGVk/);
    expect(conf.plugins.updater.endpoints[0]).toBe(UPDATER_ENDPOINT_TEMPLATE);
  });

  test("placeholder endpoint is detected until CI rewrites OWNER/REPO", () => {
    expect(updaterEndpointConfigured(UPDATER_ENDPOINT_TEMPLATE)).toBe(false);
    expect(
      updaterEndpointConfigured(
        "https://github.com/acme/web-builder/releases/latest/download/latest.json",
      ),
    ).toBe(true);
    expect(UPDATER_ENDPOINT_NOT_CONFIGURED).toMatch(/OWNER\/REPO/);
    const wf = readFileSync(join(ROOT, ".github/workflows/release.yml"), "utf8");
    expect(wf).toContain("OWNER/REPO");
    expect(wf).toContain("make-latest-json.mjs");
    expect(wf).toContain("Vite Studio");
    expect(wf).toContain("macos-latest");
    expect(wf).toMatch(/platform:\s*macos-latest/);
    expect(wf).not.toMatch(/platform:\s*macos-14\b/);
    expect(existsSync(join(ROOT, "scripts/make-latest-json.mjs"))).toBe(true);
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
