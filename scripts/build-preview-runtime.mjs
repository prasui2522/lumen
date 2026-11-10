// S2: build the Tier 1 Preview runtime from export-templates/vite-react.
// A2: `dev` / `build` no longer write tracked files. They build into a temp folder and compare it with the
// committed public/preview-runtime (`--check`: stale → exit 1, used by `build`; `--check=warn`: stale →
// warning, used by `dev`). Only `bun run build:preview-runtime` (`--write`) updates public/preview-runtime.
// Installs the template's node_modules (frozen lockfile) when missing. Set WB_SKIP_PREVIEW_RUNTIME=1 to skip.
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const tpl = join(root, "export-templates", "vite-react");
const committed = join(root, "public", "preview-runtime");
const args = process.argv.slice(2);
const mode = args.includes("--write") ? "write" : args.includes("--check=warn") ? "warn" : "check";

if (process.env.WB_SKIP_PREVIEW_RUNTIME === "1") {
  console.log("[preview-runtime] skipped (WB_SKIP_PREVIEW_RUNTIME=1)");
  process.exit(0);
}

function run(cmd, cmdArgs) {
  const r = spawnSync(cmd, cmdArgs, { cwd: tpl, stdio: "inherit" });
  if (r.status !== 0) {
    console.error(`[preview-runtime] ${cmd} ${cmdArgs.join(" ")} failed`);
    process.exit(r.status ?? 1);
  }
}

function files(dir) {
  const out = [];
  const walk = (d) => {
    for (const name of readdirSync(d)) {
      const p = join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else out.push(relative(dir, p));
    }
  };
  if (existsSync(dir)) walk(dir);
  return out.sort();
}

if (!existsSync(join(tpl, "node_modules", ".bin", "vite"))) {
  console.log("[preview-runtime] installing template deps…");
  run("bun", ["install", "--frozen-lockfile"]);
}
const out = mode === "write" ? committed : mkdtempSync(join(tmpdir(), "wb-preview-runtime-"));
try {
  run("bun", ["x", "vite", "build", "-c", "vite.preview.config.ts", "--outDir", out, "--emptyOutDir", "--logLevel", "warn"]);
  const html = join(out, "preview.html");
  if (!existsSync(html)) {
    console.error("[preview-runtime] build produced no preview.html");
    process.exit(1);
  }
  // Classic script + no-cors stylesheet (see vite.preview.config.ts): drop module/crossorigin.
  let text = readFileSync(html, "utf8");
  text = text
    .replace(/<script type="module" crossorigin src="([^"]+)"><\/script>/, '<script defer src="$1"></script>')
    .replace(/<link rel="stylesheet" crossorigin href="/g, '<link rel="stylesheet" href="');
  if (/type="module"|crossorigin/.test(text)) {
    console.error("[preview-runtime] preview.html still has a module/crossorigin tag");
    process.exit(1);
  }
  writeFileSync(html, text);
  if (mode === "write") {
    console.log("[preview-runtime] ok → public/preview-runtime");
  } else {
    const a = files(out);
    const b = files(committed);
    const stale =
      a.join("\n") !== b.join("\n") ||
      a.some((f) => !readFileSync(join(out, f)).equals(readFileSync(join(committed, f))));
    if (!stale) {
      console.log("[preview-runtime] up to date (public/preview-runtime matches the template)");
    } else if (mode === "warn") {
      console.warn("[preview-runtime] public/preview-runtime is stale — run `bun run build:preview-runtime` and commit it");
    } else {
      console.error("[preview-runtime] public/preview-runtime is stale — run `bun run build:preview-runtime` and commit it");
      process.exit(1);
    }
  }
} finally {
  if (mode !== "write") rmSync(out, { recursive: true, force: true });
}
