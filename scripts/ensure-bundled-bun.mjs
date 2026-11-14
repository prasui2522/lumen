// Copy the running bun into src-tauri/resources/bin/bun for the Vite sidecar
// (PREVIEW-CODE-VIEW-SPEC: app-bundled bun; system bun is never used in release).
// Idempotent unless --force. Invoked from tauri beforeDevCommand / beforeBuildCommand.
import { chmodSync, copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const destDir = join(root, "src-tauri", "resources", "bin");
const dest = join(destDir, "bun");
const force = process.argv.includes("--force");

mkdirSync(destDir, { recursive: true });
if (existsSync(dest) && !force) {
  console.log("[bundled-bun] ok", dest);
  process.exit(0);
}

const src = process.execPath;
copyFileSync(src, dest);
chmodSync(dest, 0o755);
console.log("[bundled-bun] copied", src, "→", dest);
