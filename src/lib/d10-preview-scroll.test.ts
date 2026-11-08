/**
 * Phase 11 D10: compiled Preview HTML has no horizontal overflow at 1024 / 719.
 * Builds HTML via `cargo test d10_all_authored_page_blocks_compile` (D10_PREVIEW_OUT).
 * Skips when headless Chromium is missing.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
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
  call(method: string, params?: Record<string, unknown>): Promise<any> {
    const id = ++this.id;
    return new Promise((res, rej) => {
      this.waiting.set(id, (d) =>
        d.error ? rej(new Error(`${method}: ${d.error.message}`)) : res(d.result),
      );
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  close() {
    this.ws.close();
  }
}

describe("D10 Preview scroll 1024/719", () => {
  let chrome: ChildProcess | null = null;
  let cdp: Cdp | null = null;
  let outDir = "";
  const port = 9229;

  beforeAll(async () => {
    if (!CHROME) return;
    outDir = mkdtempSync(join(tmpdir(), "d10-preview-"));
    const r = spawnSync(
      "cargo",
      [
        "test",
        "--lib",
        "d10_all_authored_page_blocks_compile",
        "--",
        "--nocapture",
      ],
      {
        cwd: join(ROOT, "src-tauri"),
        env: { ...process.env, D10_PREVIEW_OUT: outDir },
        encoding: "utf8",
      },
    );
    if (r.status !== 0) {
      throw new Error(`cargo test failed:\n${r.stderr}\n${r.stdout}`);
    }
    if (!existsSync(join(outDir, "index.html"))) {
      throw new Error("index.html not written");
    }
    chrome = spawn(
      CHROME!,
      [
        `--remote-debugging-port=${port}`,
        "--headless=new",
        "--disable-gpu",
        "--no-sandbox",
        `file://${join(outDir, "index.html")}`,
      ],
      { stdio: "ignore" },
    );
    await Bun.sleep(800);
    const pages = (await fetch(`http://127.0.0.1:${port}/json/list`).then((x) =>
      x.json(),
    )) as { type: string; webSocketDebuggerUrl: string }[];
    const page = pages.find((p) => p.type === "page") ?? pages[0];
    if (!page?.webSocketDebuggerUrl) throw new Error("no CDP page target");
    cdp = await Cdp.connect(page.webSocketDebuggerUrl);
    await cdp.call("Page.enable");
    await cdp.call("Runtime.enable");
  }, 120_000);

  afterAll(() => {
    cdp?.close();
    chrome?.kill("SIGKILL");
    if (outDir) rmSync(outDir, { recursive: true, force: true });
  });

  async function overflowAt(width: number): Promise<{ sw: number; cw: number }> {
    await cdp!.call("Emulation.setDeviceMetricsOverride", {
      width,
      height: 900,
      deviceScaleFactor: 1,
      mobile: width < 800,
    });
    await Bun.sleep(200);
    const r = await cdp!.call("Runtime.evaluate", {
      expression:
        "({sw:document.documentElement.scrollWidth,cw:document.documentElement.clientWidth})",
      returnByValue: true,
    });
    return r.result.value as { sw: number; cw: number };
  }

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
