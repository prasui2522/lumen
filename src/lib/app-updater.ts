/**
 * App binary updates via tauri-plugin-updater + GitHub Releases `latest.json`.
 * Templates ship inside the binary (`include_bytes!`); a new app build is a
 * new template set for fresh exports. See docs/UPDATER.md.
 */
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { getVersion } from "@tauri-apps/api/app";

export type UpdateCheck =
  | { kind: "upToDate"; current: string }
  | { kind: "available"; current: string; update: Update }
  | { kind: "error"; message: string };

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
    const message = e instanceof Error ? e.message : String(e);
    return { kind: "error", message };
  }
}

export async function installAppUpdate(update: Update): Promise<void> {
  await update.downloadAndInstall();
  await relaunch();
}
