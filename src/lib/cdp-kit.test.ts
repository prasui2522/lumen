// Shared kit for the real-Chromium behavioural tests (a241-n1-browser.test.ts, a25-*-browser.test.ts): find a headless
// Chromium, drive it over the DevTools protocol with a minimal client (no new dependency), bundle a browser entry that
// mounts the REAL editor components with `Bun.build`, and send real mouse / key input.
// A test that uses it is skipped, and says so, ONLY when no headless Chromium is installed (CHROME_HEADLESS or
// ~/.cache/ms-playwright/chromium_headless_shell-*).
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

export function findChrome(): string | null {
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
export const CHROME = findChrome();

// ---- a minimal DevTools-protocol client (no new dependency) ----
export class Cdp {
  private id = 0;
  private waiting = new Map<number, (v: any) => void>();
  private listeners = new Map<string, ((p: any) => void)[]>();
  on(method: string, f: (p: any) => void) {
    this.listeners.set(method, [...(this.listeners.get(method) ?? []), f]);
  }
  private constructor(private ws: WebSocket) {
    ws.onmessage = (m) => {
      const d = JSON.parse(String(m.data));
      if (d.id !== undefined) this.waiting.get(d.id)?.(d);
      else if (d.method) for (const f of this.listeners.get(d.method) ?? []) f(d.params);
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
  send(method: string, params: object = {}): Promise<any> {
    const id = ++this.id;
    return new Promise((res, rej) => {
      this.waiting.set(id, (d) => (d.error ? rej(new Error(`${method}: ${d.error.message}`)) : res(d.result)));
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  async eval<T = any>(expr: string): Promise<T> {
    const r = await this.send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error("page: " + JSON.stringify(r.exceptionDetails.exception?.description ?? r.exceptionDetails));
    return r.result.value as T;
  }
  close() {
    this.ws.close();
  }
}


export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type Browser = { cdp: Cdp; proc: ChildProcess; dir: string; bundleError: string; scriptId?: string };

/**
 * Bundle `entry` (an absolute path to a browser entry) and open it in a fresh headless Chromium. `body` is the page's
 * HTML between the reset style and the bundle script. Returns the connected browser; `bundleError` is "" on success.
 */
export async function bootBrowser(entry: string, body: string, css = ""): Promise<Browser> {
  const dir = mkdtempSync(join(tmpdir(), "a2b-"));
  // A child `bun build` (not `Bun.build` in the test process): several in-process builds in one `bun test` run read each other's
  // files ("Unexpected reading file ... zustand"), a Bun bug; a separate process per bundle is isolated.
  const bundle = join(dir, "bundle.js");
  const out = spawnSync("bun", ["build", entry, "--target=browser", "--define", 'process.env.NODE_ENV="development"', "--outfile", bundle], { encoding: "utf8", timeout: 120000, cwd: join(import.meta.dir, "..", "..") });
  if (out.status !== 0) return { cdp: null as unknown as Cdp, proc: null as unknown as ChildProcess, dir, bundleError: `${out.stdout}\n${out.stderr}` };
  writeFileSync(
    join(dir, "page.html"),
    `<!doctype html><meta charset="utf-8"><style>body{margin:0;font:16px sans-serif}*{box-sizing:border-box}${css}</style>${body}<script src="bundle.js"></script>`,
  );
  const proc = spawn(CHROME!, ["--no-sandbox", "--disable-gpu", "--headless", "--remote-debugging-port=0", `--user-data-dir=${join(dir, "profile")}`, "--window-size=1100,760", "about:blank"], { stdio: ["ignore", "ignore", "pipe"] });
  const base = await new Promise<string>((res, rej) => {
    const t = setTimeout(() => rej(new Error("chrome did not start")), 20000);
    let buf = "";
    proc.stderr!.on("data", (c) => {
      buf += String(c);
      const m = /DevTools listening on ws:\/\/([\d.]+:\d+)\//.exec(buf);
      if (m) {
        clearTimeout(t);
        res(m[1]);
      }
    });
  });
  const list = (await (await fetch(`http://${base}/json/list`)).json()) as any[];
  const page = list.find((x) => x.type === "page");
  const cdp = await Cdp.connect(page.webSocketDebuggerUrl);
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  await cdp.send("Emulation.setFocusEmulationEnabled", { enabled: true });
  await cdp.send("Input.setInterceptDrags", { enabled: true });
  return { cdp, proc, dir, bundleError: "" };
}

export function closeBrowser(b: Browser | null) {
  b?.cdp?.close();
  b?.proc?.kill();
  if (b?.dir) rmSync(b.dir, { recursive: true, force: true });
}

/** Load the page fresh and wait for the entry's `window.__ready`. `doc` is placed on `window.__DOC` first. */
export async function openPage(b: Browser, doc: unknown, extraScript = ""): Promise<void> {
  const { cdp } = b;
  await cdp.send("Page.navigate", { url: "about:blank" });
  if (b.scriptId) await cdp.send("Page.removeScriptToEvaluateOnNewDocument", { identifier: b.scriptId }).catch(() => {});
  b.scriptId = (await cdp.send("Page.addScriptToEvaluateOnNewDocument", { source: `window.__DOC=${JSON.stringify(doc)};${extraScript}` })).identifier;
  await cdp.send("Page.navigate", { url: "file://" + join(b.dir, "page.html") });
  for (let i = 0; i < 100; i++) {
    if (await cdp.eval("window.__ready === true").catch(() => false)) break;
    await sleep(50);
  }
}

export type Rect = { x: number; y: number; w: number; h: number };
export const rectOf = (cdp: Cdp, selector: string): Promise<Rect> =>
  cdp.eval(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height}})()`);
export const mouse = (cdp: Cdp, type: string, x: number, y: number, clickCount = 0, buttons = 0) =>
  cdp.send("Input.dispatchMouseEvent", { type, x, y, button: type === "mouseMoved" && !buttons ? "none" : "left", buttons, clickCount });
export async function click(cdp: Cdp, x: number, y: number, count = 1) {
  for (let i = 1; i <= count; i++) {
    await mouse(cdp, "mousePressed", x, y, i, 1);
    await mouse(cdp, "mouseReleased", x, y, i, 0);
  }
}
/** Press at (x, y) and move away in small steps, like a hand dragging; returns the page's recorded `window.__ev`. */
export async function dragFrom(cdp: Cdp, x: number, y: number): Promise<string[]> {
  await mouse(cdp, "mouseMoved", x, y);
  await mouse(cdp, "mousePressed", x, y, 1, 1);
  for (let i = 1; i <= 8; i++) await mouse(cdp, "mouseMoved", x + i * 6, y + i * 4, 0, 1);
  await sleep(100);
  const ev = await cdp.eval<string[]>("window.__ev");
  await cdp.send("Input.dispatchDragEvent", { type: "dragCancel", x, y, data: { items: [], dragOperationsMask: 1 } }).catch(() => {});
  await mouse(cdp, "mouseReleased", x + 48, y + 32, 1, 0);
  return ev;
}
/**
 * A real drag from (x1, y1) to (x2, y2): press, move (Chromium intercepts the drag and reports its data), then enter /
 * over / drop at the target the way the OS would. Returns the drag data (empty `items` when no drag started).
 */
export async function dragDrop(cdp: Cdp, x1: number, y1: number, x2: number, y2: number): Promise<{ items: { mimeType: string; data: string }[] } | null> {
  let data: any = null;
  cdp.on("Input.dragIntercepted", (p) => (data = p.data));
  await mouse(cdp, "mouseMoved", x1, y1);
  await mouse(cdp, "mousePressed", x1, y1, 1, 1);
  for (let i = 1; i <= 8; i++) await mouse(cdp, "mouseMoved", x1 + i * 4, y1 + i * 3, 0, 1);
  for (let i = 0; i < 40 && !data; i++) await sleep(25);
  if (!data) {
    await mouse(cdp, "mouseReleased", x1 + 32, y1 + 24, 1, 0);
    return null;
  }
  for (const type of ["dragEnter", "dragOver", "dragOver"]) {
    await cdp.send("Input.dispatchDragEvent", { type, x: x2, y: y2, data });
    await sleep(30);
  }
  await cdp.send("Input.dispatchDragEvent", { type: "drop", x: x2, y: y2, data });
  await mouse(cdp, "mouseReleased", x2, y2, 1, 0);
  await sleep(100);
  return data;
}
export const activeDesc = (cdp: Cdp): Promise<string> =>
  cdp.eval(`(()=>{const a=document.activeElement;return !a?'null':a.dataset&&a.dataset.kbdScope?'scope:'+a.dataset.kbdScope:(a.id?'#'+a.id:'')+(a.dataset&&a.dataset.nodeType?'['+a.dataset.nodeType+(a.dataset.nodeId?':'+a.dataset.nodeId:'')+']':a.tagName)})()`);
export const press = async (cdp: Cdp, k: string, code: string, vk: number, shift = false) => {
  const m = shift ? 8 : 0;
  await cdp.send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: k, code, windowsVirtualKeyCode: vk, modifiers: m });
  await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: k, code, windowsVirtualKeyCode: vk, modifiers: m });
};
/** Record mousedown / dragstart (nearest [data-node-id]) into `window.__ev`. */
export const recordEvents = (cdp: Cdp) =>
  cdp.eval(`(()=>{window.__ev=[];for(const t of ['mousedown','dragstart'])document.addEventListener(t,e=>{const n=e.target.closest&&e.target.closest('[data-node-id]');window.__ev.push(t+':'+(n?n.dataset.nodeId:'-'))},true);return 1})()`);

import { describe, expect, test } from "bun:test";
describe("cdp-kit", () => {
  test("finds a headless Chromium or reports none (the browser tests skip, and say so, ONLY then)", () => {
    expect(CHROME === null || typeof CHROME === "string").toBe(true);
    console.log(CHROME ? `cdp-kit: ${CHROME}` : "cdp-kit: NO headless Chromium found, the real-browser tests are skipped");
  });
});
