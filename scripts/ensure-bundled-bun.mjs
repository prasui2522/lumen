// Copy the running bun into src-tauri/resources/bin for the Vite sidecar
// (PREVIEW-CODE-VIEW-SPEC: app-bundled bun; system bun is never used in release).
// Idempotent unless --force. Invoked from tauri beforeDevCommand / beforeBuildCommand.
import { chmodSync, copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const destDir = join(root, "src-tauri", "resources", "bin");
const destName = process.platform === "win32" ? "bun.exe" : "bun";
const dest = join(destDir, destName);
const force = process.argv.includes("--force");

mkdirSync(destDir, { recursive: true });
if (existsSync(dest) && !force) {
  console.log("[bundled-bun] ok", dest);
  process.exit(0);
}

const src = process.execPath;
copyFileSync(src, dest);
try {
  chmodSync(dest, 0o755);
} catch {
  /* Windows may reject chmod; still executable as .exe */
}
console.log("[bundled-bun] copied", src, "→", dest);
