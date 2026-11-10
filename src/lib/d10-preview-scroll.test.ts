/**
 * Phase 11 D10: compiled Preview HTML has no horizontal overflow at 1024 / 719.
 * A2: reads the golden `src-tauri/src/fixtures/d10/preview-blocks.html` (kept in sync by
 * `cargo test d10_all_authored_page_blocks_compile`, re-bless with D10_BLESS=1) — no cargo in the hook.
 * Chromium runs on a free DevTools port with a throw-away /tmp profile. Skips when headless Chromium is missing.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { copyFileSync, existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

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
const ROOT = join(import.meta.dir, "..", "..");
const GOLDEN = join(ROOT, "src-tauri", "src", "fixtures", "d10", "preview-blocks.html");

class Cdp {
  private id = 0;
  private waiting = new Map<number, (v: any) => void>();
  private constructor(private ws: WebSocket) {
    ws.onmessage = (m) => {
      const d = JSON.parse(String(m.data));
      if (d.id !== undefined) this.waiting.get(d.id)?.(d);
    };
  }
  static async connect(url: string): Promise<Cdp> {
    const ws = new WebSocket(url);
    await new Promise<void>((res, rej) => {
      ws.onopen = () => res();
      ws.onerror = () => rej(new Error("cdp connect failed"));
    });
    return new Cdp(ws);
  }
  call(method: string, params?: Record<string, unknown>, sessionId?: string): Promise<any> {
    const id = ++this.id;
    return new Promise((res, rej) => {
      this.waiting.set(id, (d) =>
        d.error ? rej(new Error(`${method}: ${d.error.message}`)) : res(d.result),
      );
      this.ws.send(JSON.stringify({ id, method, params, sessionId }));
    });
  }
  close() {
    this.ws.close();
  }
}

describe("D10 Preview scroll 1024/719", () => {
  let chrome: ReturnType<typeof Bun.spawn> | null = null;
  let cdp: Cdp | null = null;
  let session = "";
  let outDir = "";
  let profile = "";

  beforeAll(async () => {
    if (!CHROME) return;
    outDir = mkdtempSync(join(tmpdir(), "d10-preview-"));
    profile = mkdtempSync(join(tmpdir(), "d10-chrome-"));
    copyFileSync(GOLDEN, join(outDir, "index.html"));
    chrome = Bun.spawn(
      [CHROME!, "--remote-debugging-port=0", "--headless", "--disable-gpu", "--no-sandbox",
        `--user-data-dir=${profile}`, "about:blank"],
      { stdout: "ignore", stderr: "pipe" },
    );
    const reader = (chrome.stderr as ReadableStream<Uint8Array>).getReader();
    let buf = "";
    let ws: string | null = null;
    const until = Date.now() + 20_000;
    while (!ws && Date.now() < until) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += new TextDecoder().decode(value);
      ws = /DevTools listening on (ws:\/\/\S+)/.exec(buf)?.[1] ?? null;
    }
    if (!ws) throw new Error(`no DevTools endpoint: ${buf}`);
    void (async () => { for (;;) { const r = await reader.read().catch(() => ({ done: true })); if (r.done) break; } })();
    cdp = await Cdp.connect(ws);
    const { targetId } = await cdp.call("Target.createTarget", { url: "about:blank" });
    ({ sessionId: session } = await cdp.call("Target.attachToTarget", { targetId, flatten: true }));
    await cdp.call("Page.enable", {}, session);
    await cdp.call("Runtime.enable", {}, session);
    await cdp.call("Page.navigate", { url: `file://${join(outDir, "index.html")}` }, session);
    const t = Date.now() + 15_000;
    while (Date.now() < t) {
      const r = await cdp.call("Runtime.evaluate", { expression: "document.readyState", returnByValue: true }, session);
      if (r.result.value === "complete") break;
      await Bun.sleep(50);
    }
  }, 30_000);

  afterAll(async () => {
    cdp?.close();
    chrome?.kill("SIGKILL");
    await chrome?.exited;
    if (outDir) rmSync(outDir, { recursive: true, force: true });
    if (profile) rmSync(profile, { recursive: true, force: true });
  });

  async function overflowAt(width: number): Promise<{ sw: number; cw: number }> {
    await cdp!.call("Emulation.setDeviceMetricsOverride", {
      width,
      height: 900,
      deviceScaleFactor: 1,
      mobile: width < 800,
    }, session);
    // two frames for layout after the viewport change (no fixed real-time wait)
    await cdp!.call("Runtime.evaluate", {
      expression: "new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>r(1))))",
      awaitPromise: true,
    }, session);
    const r = await cdp!.call("Runtime.evaluate", {
      expression:
        "({sw:document.documentElement.scrollWidth,cw:document.documentElement.clientWidth})",
      returnByValue: true,
    }, session);
    return r.result.value as { sw: number; cw: number };
  }

  test("golden preview HTML exists (cargo keeps it in sync)", () => {
    expect(existsSync(GOLDEN)).toBe(true);
  });

  test("no horizontal overflow at 1024 and 719", async () => {
    if (!CHROME) {
      console.warn("skip: no headless Chromium");
      return;
    }
    for (const w of [1024, 719]) {
      const { sw, cw } = await overflowAt(w);
      expect(sw, `scrollWidth@${w}`).toBeLessThanOrEqual(cw + 1);
    }
  });
});
