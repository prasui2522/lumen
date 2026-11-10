// F-A24-1: N1 (the canvas scrollArea is tabindex=-1 and hands a click's focus to the canvas scope) must not break
// drag, inline edit, Tab order or the click-focus contract. These run the REAL DesignCanvas (bundled from
// `a241-browser-entry.tsx`) in a REAL headless Chromium driven over the DevTools protocol, with real input events
// (Input.dispatchMouseEvent / dispatchKeyEvent), because the failure only exists in Chromium's drag and focus code.
// Skipped, and reported as skipped, when no headless Chromium is installed (CHROME_HEADLESS or ~/.cache/ms-playwright).
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { stopChrome } from "@/lib/cdp-kit.test";

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

// ---- a minimal DevTools-protocol client (no new dependency) ----
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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---- the document: a card (control) and a scrollArea with a heading and enough text to overflow ----
const node = (id: string, type: string, props: object, style: object = {}) => ({ id, type, props: { type, ...props }, style });
const DOC = {
  version: 4,
  meta: { title: "n1", lang: "th" },
  root: "root",
  nodes: Object.fromEntries(
    [
      node("root", "page", { children: ["ctl", "sa", "after"] }),
      node("ctl", "card", { children: ["ct"] }, { padding: 12 }),
      node("ct", "text", { content: "ข้อความในการ์ด" }),
      node("sa", "scrollArea", { children: ["hd", "t1", "t2", "t3", "t4", "t5"], orientation: "vertical", label: "รายการ" }, { height: 90, padding: 16 }),
      node("hd", "heading", { level: 3, content: "หัวข้อในพื้นที่เลื่อน" }),
      ...["t1", "t2", "t3", "t4", "t5"].map((i) => node(i, "text", { content: "บรรทัด " + i })),
      node("after", "text", { content: "ท้ายหน้า" }),
    ].map((n) => [n.id, n]),
  ),
};

let dir = "";
let proc: ChildProcess | null = null;
let cdp: Cdp | null = null;
let bundleOk = "";

async function boot() {
  dir = mkdtempSync(join(tmpdir(), "a241-"));
  const out = await Bun.build({
    entrypoints: [join(import.meta.dir, "..", "components", "editor", "a241-browser-entry.tsx")],
    target: "browser",
    minify: false,
    define: { "process.env.NODE_ENV": '"production"' },
  });
  if (!out.success) {
    bundleOk = out.logs.map(String).join("\n");
    return;
  }
  writeFileSync(join(dir, "bundle.js"), await out.outputs[0].text());
  writeFileSync(
    join(dir, "page.html"),
    `<!doctype html><meta charset="utf-8"><style>body{margin:0;font:16px sans-serif}#root{width:640px;height:560px;display:flex}*{box-sizing:border-box}</style>` +
      `<button id="before">ก่อน</button><div id="root"></div><button id="afterbtn">หลัง</button>` +
      `<script>window.__DOC=${JSON.stringify(DOC)}</script><script src="bundle.js"></script>`,
  );
  proc = spawn(CHROME!, ["--no-sandbox", "--disable-gpu", "--headless", "--remote-debugging-port=0", `--user-data-dir=${join(dir, "profile")}`, "--window-size=900,700", "about:blank"], { stdio: ["ignore", "ignore", "pipe"] });
  const base = await new Promise<string>((res, rej) => {
    const t = setTimeout(() => rej(new Error("chrome did not start")), 20000);
    let buf = "";
    proc!.stderr!.on("data", (c) => {
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
  cdp = await Cdp.connect(page.webSocketDebuggerUrl);
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  await cdp.send("Emulation.setFocusEmulationEnabled", { enabled: true });
  await cdp.send("Input.setInterceptDrags", { enabled: true });
}

/** Load a fresh editor, with a recorder for dragstart / mousedown on the page. */
async function open() {
  await cdp!.send("Page.navigate", { url: "file://" + join(dir, "page.html") });
  for (let i = 0; i < 100; i++) {
    if (await cdp!.eval("window.__ready === true").catch(() => false)) break;
    await sleep(50);
  }
  await cdp!.eval(`(()=>{window.__ev=[];for(const t of ['mousedown','dragstart'])document.addEventListener(t,e=>{const n=e.target.closest&&e.target.closest('[data-node-id]');window.__ev.push(t+':'+(n?n.dataset.nodeId:'-'))},true);return 1})()`);
}

const rect = (id: string): Promise<{ x: number; y: number; w: number; h: number }> =>
  cdp!.eval(`(()=>{const r=document.querySelector('[data-node-id="${id}"]').getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height}})()`);
const mouse = (type: string, x: number, y: number, clickCount = 0, buttons = 0) =>
  cdp!.send("Input.dispatchMouseEvent", { type, x, y, button: type === "mouseMoved" && !buttons ? "none" : "left", buttons, clickCount });
async function click(x: number, y: number, count = 1) {
  for (let i = 1; i <= count; i++) {
    await mouse("mousePressed", x, y, i, 1);
    await mouse("mouseReleased", x, y, i, 0);
  }
}
/** Press at (x, y) and move away in small steps, like a hand dragging; returns the recorded page events. */
async function dragFrom(x: number, y: number): Promise<string[]> {
  await mouse("mouseMoved", x, y);
  await mouse("mousePressed", x, y, 1, 1);
  for (let i = 1; i <= 8; i++) await mouse("mouseMoved", x + i * 6, y + i * 4, 0, 1);
  await sleep(100);
  const ev = await cdp!.eval<string[]>("window.__ev");
  await cdp!.send("Input.dispatchDragEvent", { type: "dragCancel", x, y, data: { items: [], dragOperationsMask: 1 } }).catch(() => {});
  await mouse("mouseReleased", x + 48, y + 32, 1, 0);
  return ev;
}
const active = (): Promise<string> =>
  cdp!.eval(`(()=>{const a=document.activeElement;return !a?'null':a.dataset&&a.dataset.kbdScope?'scope:'+a.dataset.kbdScope:(a.id?'#'+a.id:'')+(a.dataset&&a.dataset.nodeType?'['+a.dataset.nodeType+(a.dataset.nodeId?':'+a.dataset.nodeId:'')+']':a.tagName)})()`);
const key = async (k: string, code: string, vk: number, shift = false) => {
  const m = shift ? 8 : 0;
  await cdp!.send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: k, code, windowsVirtualKeyCode: vk, modifiers: m });
  await cdp!.send("Input.dispatchKeyEvent", { type: "keyUp", key: k, code, windowsVirtualKeyCode: vk, modifiers: m });
};

beforeAll(async () => {
  if (CHROME) await boot();
}, 60000);
afterAll(async () => {
  cdp?.close();
  await stopChrome(proc, dir); // A3 item 12: wait for Chromium to exit before removing its profile
});

describe.skipIf(!CHROME)("F-A24-1: the canvas scrollArea in real Chromium (the real DesignCanvas)", () => {
  test("the bundle of the real canvas built and mounted", () => {
    expect(bundleOk).toBe("");
    expect(cdp).not.toBeNull();
  });

  test("(1) drag: pressing and moving on a scrollArea, or on a node inside one, fires dragstart (a card child is the control)", async () => {
    await open();
    const ct = await rect("ct");
    expect(await dragFrom(ct.x + 6, ct.y + ct.h / 2)).toContain("dragstart:ct");
    await open();
    const sa = await rect("sa");
    const t1 = await rect("t1");
    // a node inside the scrollArea
    const inside = await dragFrom(t1.x + 6, t1.y + t1.h / 2);
    expect(inside).toContain("mousedown:t1");
    expect(inside).toContain("dragstart:t1");
    // the scrollArea itself (its padding, left of the children)
    await open();
    const own = await dragFrom(sa.x + 4, sa.y + 40);
    expect(own).toContain("mousedown:sa");
    expect(own).toContain("dragstart:sa");
  });

  test("(2) a double click on a heading inside a scrollArea opens the inline editor, and it stays open", async () => {
    await open();
    const hd = await rect("hd");
    await click(hd.x + 10, hd.y + hd.h / 2, 2);
    await sleep(300); // a late hand-back of the focus would end the edit (blur)
    expect(await cdp!.eval("document.querySelectorAll('[data-editing]').length")).toBe(1);
    expect(await cdp!.eval("document.activeElement && document.activeElement.hasAttribute('data-editing')")).toBe(true);
    expect(await cdp!.eval("document.querySelector('[data-editing]').dataset.nodeId")).toBe("hd");
  });

  test("(3) Tab (and Shift+Tab) never lands on a canvas scrollArea", async () => {
    await open();
    await cdp!.eval("document.getElementById('before').focus()");
    const seen: string[] = [await active()];
    for (let i = 0; i < 5; i++) {
      await key("Tab", "Tab", 9);
      seen.push(await active());
    }
    for (let i = 0; i < 5; i++) {
      await key("Tab", "Tab", 9, true);
      seen.push(await active());
    }
    expect(seen.some((s) => s.includes("scrollArea"))).toBe(false);
    expect(seen).toContain("scope:canvas"); // the walk did pass the canvas, so the check is not vacuous
    expect(await cdp!.eval("document.querySelector('[data-node-type=scrollArea]').tabIndex")).toBe(-1);
  });

  test("(4) a click on a scrollArea, or on a node inside it, leaves focus on the canvas scope", async () => {
    await open();
    const sa = await rect("sa");
    const t1 = await rect("t1");
    await click(t1.x + 6, t1.y + t1.h / 2);
    await sleep(150);
    expect(await active()).toBe("scope:canvas");
    // Designer B9: the hand-back is on the next macrotask, not 60 ms later. Sample ~20 ms after the mouse-up
    // (the CDP round trip alone is a few ms, so 20 ms is generous for a 0 ms timer and far below 60 ms).
    await cdp!.eval("document.getElementById('before').focus()");
    await mouse("mousePressed", t1.x + 6, t1.y + t1.h / 2, 1, 1);
    await mouse("mouseReleased", t1.x + 6, t1.y + t1.h / 2, 1, 0);
    await sleep(20);
    expect(await active()).toBe("scope:canvas");
    await cdp!.eval("document.getElementById('before').focus()");
    await click(sa.x + 4, sa.y + 40);
    await sleep(150);
    expect(await active()).toBe("scope:canvas");
    expect(await cdp!.eval("document.querySelector('[data-node-id=sa]').className.includes('outline-sky')")).toBe(true); // and it is selected
    // control: the card behaves the same
    const ct = await rect("ct");
    await cdp!.eval("document.getElementById('before').focus()");
    await click(ct.x + 6, ct.y + ct.h / 2);
    await sleep(150);
    expect(await active()).toBe("scope:canvas");
  });
});

test("reports which browser the F-A24-1 tests used", () => {
  console.log(CHROME ? `a241 browser tests: ${CHROME}` : "a241 browser tests: SKIPPED (no headless Chromium found; set CHROME_HEADLESS)");
});
