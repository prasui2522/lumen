// S2: build the Tier 1 Preview runtime from export-templates/vite-react into public/preview-runtime.
// Installs the template's node_modules (frozen lockfile) when missing. Set WB_SKIP_PREVIEW_RUNTIME=1 to skip.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const tpl = join(root, "export-templates", "vite-react");
const out = join(root, "public", "preview-runtime", "preview.html");

if (process.env.WB_SKIP_PREVIEW_RUNTIME === "1") {
  console.log("[preview-runtime] skipped (WB_SKIP_PREVIEW_RUNTIME=1)");
  process.exit(0);
}

function run(cmd, args) {
  const r = spawnSync(cmd, args, { cwd: tpl, stdio: "inherit" });
  if (r.status !== 0) {
    console.error(`[preview-runtime] ${cmd} ${args.join(" ")} failed`);
    process.exit(r.status ?? 1);
  }
}

if (!existsSync(join(tpl, "node_modules", ".bin", "vite"))) {
  console.log("[preview-runtime] installing template deps…");
  run("bun", ["install", "--frozen-lockfile"]);
}
run("bun", ["x", "vite", "build", "-c", "vite.preview.config.ts", "--logLevel", "warn"]);
if (!existsSync(out)) {
  console.error("[preview-runtime] build produced no preview.html");
  process.exit(1);
}
// Classic script + no-cors stylesheet (see vite.preview.config.ts): drop module/crossorigin.
let html = readFileSync(out, "utf8");
html = html
  .replace(/<script type="module" crossorigin src="([^"]+)"><\/script>/, '<script defer src="$1"></script>')
  .replace(/<link rel="stylesheet" crossorigin href="/g, '<link rel="stylesheet" href="');
if (/type="module"|crossorigin/.test(html)) {
  console.error("[preview-runtime] preview.html still has a module/crossorigin tag");
  process.exit(1);
}
writeFileSync(out, html);
console.log("[preview-runtime] ok → public/preview-runtime");
