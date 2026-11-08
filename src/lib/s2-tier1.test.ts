/**
 * S2 Tier 1 Preview (PREVIEW-CODE-VIEW-SPEC §1 / §9 S2).
 * - Protocol helpers (pure).
 * - Source contracts: runtime entry sets the flag; render-node emits data-node-id only under it; frame CSP present.
 * - Parity (real headless Chromium): the prebuilt runtime fed a fixture's site.json + CSS renders the same
 *   `<main>` DOM as the built export of that fixture, after stripping `data-node-id`; the export has 0 of them.
 *   Skipped (reported) without Chromium, the template's node_modules, or a built public/preview-runtime.
 */
import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { extname, join } from "node:path";
import { frameMessage, nextFillHeight, payloadFromBundle, RUNTIME_URL } from "./preview-runtime";

const ROOT = join(import.meta.dir, "..", "..");
const TPL = join(ROOT, "export-templates", "vite-react");
const RUNTIME_DIR = join(ROOT, "public", "preview-runtime");
const FX_B0 = join(ROOT, "src-tauri", "src", "fixtures", "b0");
const FX_F2 = join(ROOT, "src-tauri", "src", "fixtures", "f2");

function findChrome(): string | null {
  const env = process.env.CHROME_HEADLESS;
  if (env && existsSync(env)) return env;
  const root = join(homedir(), ".cache", "ms-playwright");
  if (!existsSync(root)) return null;
  for (const d of readdirSync(root).filter((x) => x.startsWith("chromium_headless_shell"))) {
    const b = join(root, d, "chrome-headless-shell-linux64", "chrome-headless-shell");
    if (existsSync(b)) return b;
  }
  return null;
}
const CHROME = findChrome();
const HAS_TPL_DEPS = existsSync(join(TPL, "node_modules", ".bin", "vite"));
const HAS_RUNTIME = existsSync(join(RUNTIME_DIR, "preview.html"));

describe("S2 protocol helpers", () => {
  test("payloadFromBundle puts assetUrls on the site object only when non-empty", () => {
    const a = payloadFromBundle({ siteJson: '{"root":"r","nodes":{}}', siteCss: "a", kindsCss: "b", assetUrls: {} });
    expect(a.site.assetUrls).toBeUndefined();
    const b = payloadFromBundle({ siteJson: '{"root":"r","nodes":{}}', siteCss: "", kindsCss: "", assetUrls: { x: "asset://localhost/x" } });
    expect(b.site.assetUrls).toEqual({ x: "asset://localhost/x" });
  });

  test("frameMessage accepts only the frame's own window with a null origin and a known type", () => {
    const win = {} as Window;
    const frame = { contentWindow: win } as unknown as HTMLIFrameElement;
    expect(frameMessage({ source: win, origin: "null", data: { type: "wb:ready" } }, frame)).toEqual({ type: "wb:ready" });
    expect(frameMessage({ source: {}, origin: "null", data: { type: "wb:ready" } }, frame)).toBeNull();
    expect(frameMessage({ source: win, origin: "http://localhost:1420", data: { type: "wb:ready" } }, frame)).toBeNull();
    expect(frameMessage({ source: win, origin: "null", data: { type: "evil" } }, frame)).toBeNull();
    expect(frameMessage({ source: win, origin: "null", data: null }, frame)).toBeNull();
    expect(frameMessage({ source: win, origin: "null", data: { type: "wb:ready" } }, null)).toBeNull();
  });

  test("nextFillHeight: short page → min, tall page grows, vh page pins to base", () => {
    expect(nextFillHeight(200, 480, 700, 480, 8)).toBe(480);
    expect(nextFillHeight(650, 480, 700, 480, 8)).toBe(658);
    expect(nextFillHeight(1500, 480, 700, 480, 8)).toBe(1508);
    // frame grew to 1508, page now reports ~1508 again → vh content → base
    expect(nextFillHeight(1508, 1508, 700, 480, 8)).toBe(700);
    // frame grew, content really is taller than before → keep growing
    expect(nextFillHeight(1900, 1508, 700, 480, 8)).toBe(1908);
  });
});

describe("S2 source contracts", () => {
  test("runtime entry sets the preview flag; export entry does not", () => {
    const rt = readFileSync(join(TPL, "src", "preview-runtime.tsx"), "utf8");
    expect(rt).toContain("[PREVIEW_FLAG] = true");
    expect(rt).toContain("MemoryRouter");
    expect(rt).toContain('"wb:external"');
    expect(readFileSync(join(TPL, "src", "main.tsx"), "utf8")).not.toContain("PREVIEW_FLAG");
    expect(readFileSync(join(TPL, "src", "App.tsx"), "utf8")).not.toContain("PREVIEW_FLAG");
  });

  test("render-node emits data-node-id only under the flag", () => {
    const src = readFileSync(join(TPL, "src", "lib", "render-node.tsx"), "utf8");
    expect(src).toContain("if (inPreview()) extra[NODE_ID_ATTR] = id;");
    expect((src.match(/NODE_ID_ATTR\] = /g) ?? []).length).toBe(1);
  });

  test("preview.html carries the frame CSP; app frame is allow-scripts only", () => {
    const html = readFileSync(join(TPL, "preview.html"), "utf8");
    expect(html).toMatch(/http-equiv="Content-Security-Policy"/);
    expect(html).toContain("default-src 'none'");
    expect(html).toContain("img-src asset:");
    const frame = readFileSync(join(ROOT, "src", "components", "editor", "preview", "Tier1Frame.tsx"), "utf8");
    expect(frame).toContain('sandbox="allow-scripts"');
    expect(frame).not.toContain("allow-same-origin");
    expect(RUNTIME_URL).toBe("/preview-runtime/preview.html");
  });

  test("built runtime (when present) is a single prebuilt bundle under public/", () => {
    if (!HAS_RUNTIME) return;
    const html = readFileSync(join(RUNTIME_DIR, "preview.html"), "utf8");
    // Classic script (no module/crossorigin): the sandboxed frame has an opaque origin, so a
    // CORS-fetched ESM entry would be refused under the Tauri protocol (seen in the real app).
    expect(html).toContain('<script defer src="./assets/preview.js"></script>');
    expect(html).not.toMatch(/type="module"|crossorigin/);
    expect(html).not.toContain("/src/preview-runtime.tsx");
  });
});

/* ---------------- parity (headless Chromium) ---------------- */

const TYPES: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".json": "application/json" };

function serveDir(dir: string, index: string): ReturnType<typeof Bun.serve> {
  return Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    fetch(req) {
      const p = new URL(req.url).pathname;
      const f = p.includes(".") ? join(dir, p) : join(dir, index);
      return existsSync(f)
        ? new Response(Bun.file(f), { headers: { "content-type": TYPES[extname(f)] ?? "application/octet-stream" } })
        : new Response("", { status: 404 });
    },
  });
}

/** Probe: `<main>` outerHTML + count of data-node-id, written into a <pre> for --dump-dom. */
const PROBE = `<pre id="__r"></pre><script>setTimeout(function(){var m=document.querySelector('main');document.getElementById("__r").textContent=JSON.stringify({main:m?m.outerHTML:null,ids:document.querySelectorAll('[data-node-id]').length,title:document.title})},700)</script>`;

async function dump(url: string): Promise<{ main: string | null; ids: number; title: string }> {
  const profile = mkdtempSync(join(tmpdir(), "s2c-"));
  try {
    const p = Bun.spawn(
      [CHROME!, "--no-sandbox", "--disable-gpu", "--headless", "--dump-dom", "--window-size=1280,900", "--virtual-time-budget=4000", `--user-data-dir=${profile}`, url],
      { stdout: "pipe", stderr: "pipe" },
    );
    const out = await new Response(p.stdout).text();
    await p.exited;
    const m = /<pre id="__r"[^>]*>([\s\S]*?)<\/pre>/.exec(out);
    if (!m) throw new Error(`no probe output for ${url}`);
    return JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">"));
  } finally {
    rmSync(profile, { recursive: true, force: true });
  }
}

/** Build the export of a fixture (template + golden site.json/css) into dir/vite/dist, probe injected. */
function buildExport(dir: string, siteJson: string): string {
  const app = join(dir, "vite");
  cpSync(TPL, app, { recursive: true, filter: (s) => !/[\\/](node_modules|dist)$/.test(s) });
  symlinkSync(join(TPL, "node_modules"), join(app, "node_modules"));
  cpSync(siteJson, join(app, "src", "data", "site.json"));
  mkdirSync(join(app, "src", "styles"), { recursive: true });
  writeFileSync(join(app, "src", "styles", "site.css"), readFileSync(siteJson.replace(/\.site\.json$/, ".site.css"), "utf8"));
  const kinds = siteJson.replace(/\.site\.json$/, ".kinds.css");
  writeFileSync(join(app, "src", "styles", "kinds.css"), existsSync(kinds) ? readFileSync(kinds, "utf8") : "\n");
  const b = spawnSync(join(app, "node_modules", ".bin", "vite"), ["build", "--logLevel", "error"], { cwd: app, encoding: "utf8", timeout: 180000 });
  if (b.status !== 0) throw new Error(`vite build failed: ${b.stderr}`);
  const dist = join(app, "dist");
  writeFileSync(join(dist, "index.html"), readFileSync(join(dist, "index.html"), "utf8").replace("</body>", `${PROBE}</body>`));
  return dist;
}

/**
 * Stage the built runtime for a top-level run: the frame CSP meta is dropped (it pins the app origins, not this
 * test server), and a harness script posts the fixture to the runtime exactly like the app does (at top level
 * `window.parent === window`, which the runtime accepts as its parent).
 */
function stageRuntime(dir: string, siteJson: string): string {
  const out = join(dir, "runtime");
  cpSync(RUNTIME_DIR, out, { recursive: true });
  const site = readFileSync(siteJson, "utf8");
  const siteCss = readFileSync(siteJson.replace(/\.site\.json$/, ".site.css"), "utf8");
  const kinds = siteJson.replace(/\.site\.json$/, ".kinds.css");
  const kindsCss = existsSync(kinds) ? readFileSync(kinds, "utf8") : "\n";
  const harness = `<script>window.addEventListener('message',function(e){if(e.data&&e.data.type==='wb:ready'){window.postMessage({type:'wb:site',site:${site},siteCss:${JSON.stringify(siteCss)},kindsCss:${JSON.stringify(kindsCss)},path:'/'},'*')}})</script>`;
  let html = readFileSync(join(out, "preview.html"), "utf8");
  html = html.replace(/<meta[^>]*Content-Security-Policy[^>]*>/, "");
  html = html.replace("<head>", `<head>${harness}`).replace("</body>", `${PROBE}</body>`);
  writeFileSync(join(out, "preview.html"), html);
  return out;
}

const strip = (s: string) => s.replace(/ data-node-id="[^"]*"/g, "");

describe("S2 parity: Tier 1 runtime vs built export (headless Chromium)", () => {
  const skip = !CHROME || !HAS_TPL_DEPS || !HAS_RUNTIME;
  if (skip) {
    test("SKIP: needs headless Chromium, template node_modules and public/preview-runtime", () => {
      console.warn(`SKIP S2 parity: chrome=${!!CHROME} tplDeps=${HAS_TPL_DEPS} runtime=${HAS_RUNTIME}`);
    });
    return;
  }
  for (const [fx, name] of [
    [FX_B0, "b01-all-kinds"],
    [FX_F2, "f2-responsive"],
  ] as const) {
    test(`${name}: same <main> DOM after stripping data-node-id; export has none`, async () => {
      const dir = mkdtempSync(join(tmpdir(), "s2p-"));
      let exp: ReturnType<typeof Bun.serve> | null = null;
      let rt: ReturnType<typeof Bun.serve> | null = null;
      try {
        const siteJson = join(fx, `${name}.site.json`);
        exp = serveDir(buildExport(dir, siteJson), "index.html");
        rt = serveDir(stageRuntime(dir, siteJson), "preview.html");
        const e = await dump(`http://127.0.0.1:${exp.port}/`);
        const r = await dump(`http://127.0.0.1:${rt.port}/preview.html`);
        expect(e.main).not.toBeNull();
        expect(r.main).not.toBeNull();
        expect(e.ids).toBe(0);
        expect(r.ids).toBeGreaterThan(0);
        expect(strip(r.main!)).toBe(e.main!);
        expect(r.title).toBe(e.title);
      } finally {
        exp?.stop(true);
        rt?.stop(true);
        rmSync(dir, { recursive: true, force: true });
      }
    }, 240000);
  }
});
