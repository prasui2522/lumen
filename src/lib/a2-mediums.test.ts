// A2 (audit Mediums), TS / build side: menubar focus ring, preview-runtime script never writes tracked files
// from dev / build, custom-protocol off by default, and the Vite Preview entry measures boxes on events (real
// headless Chromium, throw-away /tmp profile; skipped when Chromium is missing).
import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

describe("A2 item 5: menubar trigger focus-visible ring", () => {
  test("uses the shared focus-visible token (ring-3 + ring-ring, outline-hidden keeps a forced-colors outline)", () => {
    const src = read("src/components/ui/menubar.tsx");
    const trig = /function MenubarTrigger[\s\S]*?className=\{cn\(\s*"([^"]+)"/.exec(src)?.[1] ?? "";
    for (const c of ["outline-hidden", "focus-visible:ring-3", "focus-visible:ring-ring"]) {
      expect(trig.split(/\s+/)).toContain(c);
    }
    // same token pair as the other focusable primitives
    expect(read("src/components/ui/button.tsx")).toContain("focus-visible:ring-3 focus-visible:ring-ring");
  });
});

describe("A2 item 8: dev / build do not write public/preview-runtime", () => {
  test("only build:preview-runtime writes; dev warns, build fails when stale", () => {
    const pkg = JSON.parse(read("package.json")) as { scripts: Record<string, string> };
    expect(pkg.scripts.dev).toBe("bun scripts/build-preview-runtime.mjs --check=warn && vite");
    expect(pkg.scripts.build).toBe("bun scripts/build-preview-runtime.mjs --check && tsc && vite build");
    expect(pkg.scripts["build:preview-runtime"]).toBe("bun scripts/build-preview-runtime.mjs --write");
    const s = read("scripts/build-preview-runtime.mjs");
    expect(s).toContain('const out = mode === "write" ? committed : mkdtempSync(join(tmpdir(), "wb-preview-runtime-"));');
    expect(s).toContain('"--outDir", out');
  });
});

describe("A2 item 7: custom-protocol only for real builds", () => {
  test("Cargo default features are empty; the feature still exists for tauri build", () => {
    const cargo = read("src-tauri/Cargo.toml");
    expect(cargo).toMatch(/^default = \[\]$/m);
    expect(cargo).toMatch(/^custom-protocol = \["tauri\/custom-protocol"\]$/m);
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

/** The Vite Preview entry from sidecar.rs, minus the app import (the page under test stands in for it). */
function previewEntry(): string {
  const rs = read("src-tauri/src/sidecar.rs");
  const m = /const PREVIEW_ENTRY: &str = r##"([\s\S]*?)"##;/.exec(rs);
  if (!m) throw new Error("PREVIEW_ENTRY not found");
  return m[1].replace('import "./main.tsx";', "");
}

describe.skipIf(!CHROME)("A2 item 4: Preview entry measures on events, not a timer (real Chromium)", () => {
  test("idle → no posts; DOM change / size change / scroll → one post per frame with fresh boxes", async () => {
    const dir = mkdtempSync(join(tmpdir(), "a2pe-"));
    const profile = mkdtempSync(join(tmpdir(), "a2pe-prof-"));
    const page = `<!doctype html><html><head><meta charset="utf-8"><script>
      window.__posts = [];
      addEventListener("message", (e) => { if (e.data && e.data.type === "wb:boxes") window.__posts.push(e.data.boxes); });
    </script></head><body style="margin:0;height:3000px">
      <div data-node-id="a" style="width:100px;height:40px"></div>
      <div data-node-id="b" style="width:50px;height:20px"></div>
      <script type="module">${previewEntry().replace(/<\/script/g, "<\\/script")}</script></body></html>`;
    writeFileSync(join(dir, "index.html"), page);
    const proc = Bun.spawn([CHROME!, "--no-sandbox", "--disable-gpu", "--headless", "--remote-debugging-port=0",
      `--user-data-dir=${profile}`, "about:blank"], { stdout: "ignore", stderr: "pipe" });
    let ws: WebSocket | null = null;
    try {
      const reader = proc.stderr.getReader();
      let buf = "";
      let url: string | null = null;
      const until = Date.now() + 20000;
      while (!url && Date.now() < until) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += new TextDecoder().decode(value);
        url = /DevTools listening on (ws:\/\/\S+)/.exec(buf)?.[1] ?? null;
      }
      if (!url) throw new Error(buf);
      void (async () => { for (;;) { const r = await reader.read().catch(() => ({ done: true })); if (r.done) break; } })();
      ws = new WebSocket(url);
      await new Promise<void>((res, rej) => { ws!.onopen = () => res(); ws!.onerror = () => rej(new Error("ws")); });
      let seq = 0;
      const pending = new Map<number, (m: any) => void>();
      ws.onmessage = (e) => { const m = JSON.parse(String(e.data)); if (m.id) pending.get(m.id)?.(m); };
      const send = (method: string, params: object = {}, sessionId?: string) => new Promise<any>((res, rej) => {
        const id = ++seq;
        pending.set(id, (m) => (m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result)));
        ws!.send(JSON.stringify({ id, method, params, sessionId }));
      });
      const { targetId } = await send("Target.createTarget", { url: "about:blank" });
      const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
      const ev = async (expression: string) =>
        (await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }, sessionId)).result.value;
      const frames = (n: number) => ev(`new Promise(r=>{let i=0;const f=()=>++i>=${n}?r(1):requestAnimationFrame(f);requestAnimationFrame(f)})`);
      await send("Page.navigate", { url: `file://${join(dir, "index.html")}` }, sessionId);
      const t = Date.now() + 15000;
      while (Date.now() < t && !(await ev("document.readyState==='complete' && window.__posts.length>0").catch(() => false))) {
        await Bun.sleep(50);
      }
      await frames(4);
      const settled = await ev("window.__posts.length");
      expect(settled).toBeGreaterThan(0);
      // idle: no timer posts (the old entry posted every 400 ms)
      await Bun.sleep(1300);
      expect(await ev("window.__posts.length")).toBe(settled);
      // a new node appears → posted within a couple of frames, and the new node is in the boxes
      await ev(`(()=>{const d=document.createElement('div');d.setAttribute('data-node-id','c');d.style.cssText='width:30px;height:30px';document.body.appendChild(d)})()`);
      await frames(3);
      const afterAdd = await ev("window.__posts.length");
      expect(afterAdd).toBeGreaterThan(settled);
      expect(await ev("window.__posts.at(-1).map(b=>b.id).sort().join(',')")).toBe("a,b,c");
      // a node's own size change (style write) → fresh height in the last post
      await ev(`document.querySelector('[data-node-id="a"]').style.height='90px'`);
      await frames(3);
      expect(await ev(`window.__posts.at(-1).find(b=>b.id==='a').h`)).toBe(90);
      // burst of 20 changes in one task → coalesced into one post per frame (not 20)
      const before = await ev("window.__posts.length");
      await ev(`(()=>{const b=document.querySelector('[data-node-id="b"]');for(let i=0;i<20;i++)b.style.width=(60+i)+'px'})()`);
      await frames(3);
      const burst = (await ev("window.__posts.length")) - before;
      expect(burst).toBeGreaterThanOrEqual(1);
      expect(burst).toBeLessThanOrEqual(3);
      // scroll → fresh y
      await ev("window.scrollTo(0, 500)");
      await frames(3);
      expect(await ev(`window.__posts.at(-1).find(b=>b.id==='a').y`)).toBe(-500);
    } finally {
      ws?.close();
      proc.kill();
      await proc.exited;
      rmSync(dir, { recursive: true, force: true });
      rmSync(profile, { recursive: true, force: true });
    }
  }, 60000);
});
