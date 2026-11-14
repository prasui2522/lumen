/**
 * App binary updates via tauri-plugin-updater + GitHub Releases `latest.json`.
 * Templates ship inside the binary (`include_bytes!`); a new app build is a
 * new template set for fresh exports. See docs/UPDATER.md.
 *
 * Local / pre-release builds keep `OWNER/REPO` in tauri.conf.json. CI replaces
 * it with `github.repository` on tag builds (`.github/workflows/release.yml`).
 */
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { getVersion } from "@tauri-apps/api/app";

/** Must match `plugins.updater.endpoints[0]` until CI rewrites OWNER/REPO. */
export const UPDATER_ENDPOINT_TEMPLATE =
  "https://github.com/OWNER/REPO/releases/latest/download/latest.json";

/** Thai source; UI translates via `phraseIpcError` / phrases. */
export const UPDATER_ENDPOINT_NOT_CONFIGURED =
  "ยังไม่ได้ตั้งค่าที่เก็บรีลีส (OWNER/REPO) — ดู docs/UPDATER.md";

export type UpdateCheck =
  | { kind: "upToDate"; current: string }
  | { kind: "available"; current: string; update: Update }
  | { kind: "error"; message: string };

export function updaterEndpointConfigured(endpoint: string): boolean {
  return !endpoint.includes("OWNER/REPO");
}

export async function checkForAppUpdate(): Promise<UpdateCheck> {
  let current = "0.1.0";
  try {
    current = await getVersion();
  } catch {
    /* web-only / missing app API */
  }
  try {
    const update = await check();
    if (!update) return { kind: "upToDate", current };
    return { kind: "available", current, update };
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e);
    // Only when the live endpoint URL still contains the placeholder.
    if (raw.includes("OWNER/REPO")) {
      return { kind: "error", message: UPDATER_ENDPOINT_NOT_CONFIGURED };
    }
    return { kind: "error", message: raw };
  }
}

export async function installAppUpdate(update: Update): Promise<void> {
  await update.downloadAndInstall();
  await relaunch();
}
