// A1 fix (audit High 2): states / transition reduced-motion / entrance motion / glass fallback rules target the
// node's `[data-wb-page] [data-wb-id]` hook in the shared site.css, so the Vite export and the Tier 1 runtime
// (same template) behave like the static export. Goldens: src-tauri/src/fixtures/a1fix (kept by
// `cargo test a1fix`). The Chromium part drives real pointer input over CDP (hover, press) and emulates
// prefers-reduced-motion / prefers-reduced-transparency. Skipped (reported) without headless Chromium or
// without the template's node_modules.
import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { extname, join } from "node:path";
import { nodeFx } from "../../export-templates/vite-react/src/lib/style";
import { normalizeStatus } from "./preview-sidecar";

const ROOT = join(import.meta.dir, "..", "..");
const FX = join(ROOT, "src-tauri", "src", "fixtures", "a1fix");
const TPL = join(ROOT, "export-templates", "vite-react");
const doc = JSON.parse(readFileSync(join(FX, "fx-sample.json"), "utf8"));
const site = JSON.parse(readFileSync(join(FX, "fx-sample.site.json"), "utf8"));
const golden = JSON.parse(readFileSync(join(FX, "fx-families.json"), "utf8"));

describe("A1 fx hook: template nodeFx == Rust node_fx (fx-families.json)", () => {
  test("every fixture node: same hook decision and same restated families", () => {
    const ids = Object.keys(golden).sort();
    expect(ids.length).toBe(Object.keys(doc.nodes).length);
    for (const id of ids) {
      const r = nodeFx(doc.nodes[id]);
      expect({ id, hook: r.hook, families: [...r.families].sort() }).toEqual({ id, ...golden[id] });
      // the nodes the Vite build actually reads (site.json) give the same answer
      const s = nodeFx(site.pages[0].nodes[id]);
      expect({ id, hook: s.hook, families: [...s.families].sort() }).toEqual({ id, ...golden[id] });
    }
    expect(nodeFx(doc.nodes.btn).fx).toBe(true);
    expect(nodeFx(doc.nodes.txt).fx).toBe(false);
  });

  test("shared site.css uses hook selectors only (no .nN) and closes the static styles.css", () => {
    const css = readFileSync(join(FX, "fx-sample.site.css"), "utf8");
    expect(css).not.toMatch(/\.n\d/);
    expect(readFileSync(join(FX, "fx-sample.css"), "utf8").endsWith(css)).toBe(true);
    expect(css).toContain('@media (hover:hover){[data-wb-page="home"] [data-wb-id="btn"]:hover{');
    expect(css).toContain('[data-wb-page="home"] [data-wb-id="txt"]{animation:wb-in-fade 300ms ease-out 40ms backwards}');
    expect(css).toContain('@media (prefers-reduced-transparency:reduce){[data-wb-page="home"] [data-wb-id="glass"]{');
  });
});

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

/* ---------------- minimal CDP client (own throw-away /tmp profile, always removed) ---------------- */
type Cdp = { ev: (expr: string) => Promise<any>; s: (m: string, p?: object) => Promise<any> };

async function withChrome<T>(fn: (open: (url: string) => Promise<Cdp>) => Promise<T>): Promise<T> {
  const profile = mkdtempSync(join(tmpdir(), "a1fx-"));
  const proc = Bun.spawn([CHROME!, "--no-sandbox", "--disable-gpu", "--headless", "--remote-debugging-port=0",
    // headless has no pointer device → (hover:none); declare a mouse like a desktop Designer machine
    "--blink-settings=primaryHoverType=2,availableHoverTypes=2,primaryPointerType=4,availablePointerTypes=4",
    `--user-data-dir=${profile}`, "--window-size=1280,900", "about:blank"], { stdout: "ignore", stderr: "pipe" });
  let sock: WebSocket | null = null;
  try {
    const reader = proc.stderr.getReader();
    let buf = "";
    let wsUrl: string | null = null;
    const until = Date.now() + 20000;
    while (!wsUrl && Date.now() < until) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += new TextDecoder().decode(value);
      wsUrl = /DevTools listening on (ws:\/\/\S+)/.exec(buf)?.[1] ?? null;
    }
    if (!wsUrl) throw new Error(`no DevTools endpoint: ${buf}`);
    void (async () => { for (;;) { const r = await reader.read().catch(() => ({ done: true })); if (r.done) break; } })();
    sock = new WebSocket(wsUrl);
    await new Promise<void>((res, rej) => { sock!.onopen = () => res(); sock!.onerror = () => rej(new Error("ws")); });
    let seq = 0;
    const pending = new Map<number, (m: any) => void>();
    sock.onmessage = (e) => {
      const m = JSON.parse(String(e.data));
      if (m.id && pending.has(m.id)) { pending.get(m.id)!(m); pending.delete(m.id); }
    };
    const send = (method: string, params: object = {}, sessionId?: string) =>
      new Promise<any>((res, rej) => {
        const id = ++seq;
        pending.set(id, (m) => (m.error ? rej(new Error(`${method}: ${JSON.stringify(m.error)}`)) : res(m.result)));
        sock!.send(JSON.stringify({ id, method, params, sessionId }));
      });
    const open = async (url: string): Promise<Cdp> => {
      const { targetId } = await send("Target.createTarget", { url: "about:blank" });
      const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
      const s = (m: string, p: object = {}) => send(m, p, sessionId);
      const ev = async (expression: string) =>
        (await s("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true })).result.value;
      await s("Runtime.enable");
      await s("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
      await s("Page.navigate", { url });
      const t = Date.now() + 20000;
      while (Date.now() < t) {
        if (await ev(`document.readyState==='complete' && !!document.querySelector('[data-wb-id="txt"]')`).catch(() => false)) break;
        await Bun.sleep(100);
      }
      await Bun.sleep(600); // entrance animation (≤ 340 ms) done
      return { ev, s };
    };
    return await fn(open);
  } finally {
    sock?.close();
    proc.kill();
    await proc.exited;
    rmSync(profile, { recursive: true, force: true });
  }
}

const PROPS = ["background-color", "color", "box-shadow", "transform", "opacity", "filter", "transition-duration",
  "transition-property", "animation-name", "animation-duration", "backdrop-filter", "background-image"];
const IDS = ["btn", "bpbtn", "box", "txt", "glass", "gtxt", "root"];
const READ = `(()=>{const props=${JSON.stringify(PROPS)};const out={};for(const id of ${JSON.stringify(IDS)}){
 const el=document.querySelector('[data-wb-id="'+id+'"]');if(!el){out[id]=null;continue;}const c=getComputedStyle(el);
 const o={fx:el.classList.contains('fx')};for(const p of props)o[p]=c.getPropertyValue(p);out[id]=o;}return out;})()`;
const center = async (c: Cdp, id: string) =>
  c.ev(`(()=>{const r=document.querySelector('[data-wb-id="${id}"]').getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()`);
const mouse = (c: Cdp, type: string, x: number, y: number) =>
  c.s("Input.dispatchMouseEvent", { type, x, y, button: type === "mouseMoved" ? "none" : "left", clickCount: type === "mouseMoved" ? 0 : 1 });

/** Base, hover, press and reduced-motion / reduced-transparency snapshots of one render. */
async function scenario(c: Cdp) {
  const out: Record<string, any> = { hoverMedia: await c.ev(`matchMedia('(hover:hover)').matches`) };
  // diagnostics only (written to $TMPDIR/a1fx-last-result.json, not compared)
  out.dom = await c.ev(`[...document.querySelectorAll('[data-wb-id]')].map(e=>e.outerHTML.slice(0,400))`);
  await mouse(c, "mouseMoved", 1270, 890);
  await Bun.sleep(400);
  out.base = await c.ev(READ);
  for (const id of ["btn", "bpbtn", "gtxt"]) {
    const p = await center(c, id);
    await mouse(c, "mouseMoved", p.x, p.y);
    await Bun.sleep(500);
    out[`hover_${id}`] = (await c.ev(READ))[id];
  }
  const b = await center(c, "btn");
  await mouse(c, "mouseMoved", b.x, b.y);
  await mouse(c, "mousePressed", b.x, b.y);
  await Bun.sleep(500);
  out.active_btn = (await c.ev(READ)).btn;
  await mouse(c, "mouseMoved", 1270, 890); // release away from the link: no navigation
  await mouse(c, "mouseReleased", 1270, 890);
  await c.s("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  await Bun.sleep(300);
  out.reduced = await c.ev(READ);
  await mouse(c, "mouseMoved", b.x, b.y);
  await Bun.sleep(300);
  out.reduced_hover_btn = (await c.ev(READ)).btn;
  await mouse(c, "mouseMoved", 1270, 890);
  try {
    await c.s("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-transparency", value: "reduce" }] });
    out.rtSupported = await c.ev(`matchMedia('(prefers-reduced-transparency: reduce)').matches`);
    out.reducedTransparency = (await c.ev(READ)).glass;
  } catch {
    out.rtSupported = false;
  }
  await c.s("Emulation.setEmulatedMedia", { features: [] });
  return out;
}

/** Pre-existing, outside A1: a *link* button's kind look (`.t-button` default fill + text colour) is static-only;
 * the template's SmartLink has no kind defaults (button is not in PLAIN_KINDS). Those two base values are left out;
 * everything A1 owns (state, motion, reduced, glass) is compared. Vite's CSS minifier drops the implicit
 * `0%` / `100%` gradient stops (same rendering). */
function norm(k: string, v: any): any {
  const fix = (o: any, isBtn: boolean) => {
    if (!o) return o;
    const c = { ...o };
    if (isBtn) {
      delete c.color;
      if (k === "base" || k === "reduced") delete c["background-color"];
    }
    if (typeof c["background-image"] === "string") c["background-image"] = c["background-image"].replace(/ 0%,/g, ",").replace(/ 100%\)/g, ")");
    return c;
  };
  if (k === "base" || k === "reduced") return Object.fromEntries(Object.entries(v).map(([id, o]) => [id, fix(o, id === "btn")]));
  return fix(v, k.endsWith("_btn"));
}

const TYPES: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml" };

describe.skipIf(!CHROME || !HAS_TPL_DEPS)("A1 parity in real Chromium (CDP): static vs Tier 1 vs Vite export", () => {
  test("hover / press / reduced-motion / reduced-transparency computed styles match across the three renders", async () => {
    const dir = mkdtempSync(join(tmpdir(), "a1fxb-"));
    let server: ReturnType<typeof Bun.serve> | null = null;
    try {
      // Vite export: template + the zip's site.json / site.css / kinds.css
      const app = join(dir, "vite");
      cpSync(TPL, app, { recursive: true, filter: (s) => !/[\\/](node_modules|dist)$/.test(s) });
      symlinkSync(join(TPL, "node_modules"), join(app, "node_modules"));
      cpSync(join(FX, "fx-sample.site.json"), join(app, "src", "data", "site.json"));
      mkdirSync(join(app, "src", "styles"), { recursive: true });
      writeFileSync(join(app, "src", "styles", "site.css"), readFileSync(join(FX, "fx-sample.site.css"), "utf8"));
      writeFileSync(join(app, "src", "styles", "kinds.css"), readFileSync(join(FX, "fx-sample.kinds.css"), "utf8"));
      const vb = spawnSync(join(app, "node_modules", ".bin", "vite"), ["build", "--logLevel", "error"], { cwd: app, encoding: "utf8", timeout: 180000 });
      if (vb.status !== 0) throw new Error(`vite build failed: ${vb.stderr}`);
      // Tier 1: the runtime built from the same template (as scripts/build-preview-runtime.mjs does), fed over postMessage
      const t1 = join(dir, "tier1");
      const tb = spawnSync(join(app, "node_modules", ".bin", "vite"), ["build", "-c", "vite.preview.config.ts", "--outDir", t1, "--emptyOutDir", "--logLevel", "error"], { cwd: app, encoding: "utf8", timeout: 180000 });
      if (tb.status !== 0) throw new Error(`tier1 build failed: ${tb.stderr}`);
      const msg = { type: "wb:site", site, siteCss: readFileSync(join(FX, "fx-sample.site.css"), "utf8"), kindsCss: "", path: "/" };
      let t1html = readFileSync(join(t1, "preview.html"), "utf8")
        .replace(/<meta\s+http-equiv="Content-Security-Policy"[\s\S]*?\/>/, "")
        .replace(/<script type="module" crossorigin src="([^"]+)"><\/script>/, '<script defer src="$1"></script>');
      t1html = t1html.replace("<head>", `<head><script>addEventListener("message",function(e){if(e.data&&e.data.type==="wb:ready")postMessage(${JSON.stringify(msg).replace(/</g, "\\u003c")},"*")});</script>`);
      writeFileSync(join(t1, "preview.html"), t1html);
      // static export: index.html + styles.css inline
      const st = readFileSync(join(FX, "fx-sample.html"), "utf8").replace('<link rel="stylesheet" href="styles.css">', `<style>${readFileSync(join(FX, "fx-sample.css"), "utf8")}</style>`);
      writeFileSync(join(dir, "static.html"), st);
      const dist = join(app, "dist");
      server = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch(req: Request) {
        const p = new URL(req.url).pathname;
        let f: string;
        if (p === "/static.html") f = join(dir, "static.html");
        else if (p.startsWith("/tier1/")) f = join(t1, p.slice(7));
        else f = p.startsWith("/assets/") || p.includes(".") ? join(dist, p) : join(dist, "index.html");
        return existsSync(f) ? new Response(Bun.file(f), { headers: { "content-type": TYPES[extname(f)] ?? "application/octet-stream" } }) : new Response("", { status: 404 });
      } });
      const base = `http://127.0.0.1:${server.port}`;
      const res = await withChrome(async (open) => ({
        static: await scenario(await open(`${base}/static.html`)),
        tier1: await scenario(await open(`${base}/tier1/preview.html`)),
        vite: await scenario(await open(`${base}/`)),
      }));
      writeFileSync(join(tmpdir(), "a1fx-last-result.json"), JSON.stringify(res, null, 1));
      const s = res.static;
      expect(s.hoverMedia).toBe(true);
      // the static export itself does what the fixture asks
      expect(s.hover_btn["background-color"]).toBe("rgb(56, 189, 248)");
      expect(s.hover_btn.transform).toBe("matrix(1, 0, 0, 1, 0, -1)");
      expect(s.active_btn.transform).toBe("matrix(1, 0, 0, 1, 0, 5)");
      expect(s.active_btn["box-shadow"]).toContain("0px 1px 0px 0px");
      expect(s.hover_bpbtn.color).toBe("rgb(254, 240, 138)");
      expect(s.hover_gtxt["background-image"]).toContain("linear-gradient");
      expect(s.base.txt["animation-name"]).toBe("wb-in-fade");
      expect(s.base.btn["transition-duration"]).toBe("0.12s");
      expect(s.reduced.btn["transition-duration"]).toBe("0s");
      expect(s.reduced.box["transition-duration"]).toBe("0s");
      expect(s.reduced.root["transition-duration"]).toBe("0s");
      expect(s.reduced.txt["animation-name"]).toBe("none");
      expect(s.reduced_hover_btn.transform).toBe("none");
      expect(s.reduced_hover_btn["background-color"]).toBe("rgb(56, 189, 248)");
      if (s.rtSupported) expect(s.reducedTransparency["backdrop-filter"]).toBe("none");
      // Tier 1 and Vite match static, snapshot by snapshot (fx class included)
      for (const name of ["tier1", "vite"] as const) {
        const r = res[name];
        for (const k of ["base", "hover_btn", "hover_bpbtn", "hover_gtxt", "active_btn", "reduced", "reduced_hover_btn", "reducedTransparency"]) {
          expect({ who: name, k, v: norm(k, r[k]) }).toEqual({ who: name, k, v: norm(k, s[k]) });
        }
      }
    } finally {
      server?.stop(true);
      rmSync(dir, { recursive: true, force: true });
    }
  }, 300000);
});

describe("A1 sidecar (audit High 1): client side", () => {
  test("status carries the start session (concurrent callers get the same one)", () => {
    expect(normalizeStatus({ state: "starting", session: 7 }).session).toBe(7);
    expect(normalizeStatus({ state: "running", port: 47301 }).session).toBeNull();
    expect(normalizeStatus(null).session).toBeNull();
  });

  // A3 item 13 replaced this A1 check: ViteDesignCanvas no longer starts the sidecar at all (only รันด้วย Vite
  // does), so edits cannot restart it. Full coverage: a3-hardening.test.ts "A3 item 13".
  test("ViteDesignCanvas never starts the sidecar (so document edits cannot restart it)", () => {
    const src = readFileSync(join(ROOT, "src", "components", "editor", "ViteDesignCanvas.tsx"), "utf8");
    expect(src).not.toContain("sidecarStart");
  });
});
