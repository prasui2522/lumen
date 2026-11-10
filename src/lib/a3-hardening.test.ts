/**
 * A3 hardening (bun side). Items: 1 wb:navigate source/path checks (real Chromium), 2 Vite frame sandbox,
 * 3/4 sanitizer + easing parity with Rust (fixtures/a3/parity.json), 6 tsconfig covers tests, 7 Thai search
 * keywords, 8 dark code-view contrast, 10 Vite save hint, 12 Chromium cleanup waits, 13 no Design auto-start.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { CHROME, Cdp, sleep, stopChrome } from "@/lib/cdp-kit.test";
import { cssSafe, easingCss, safeHref } from "../../export-templates/vite-react/src/lib/safe";
import { styleToReact } from "../../export-templates/vite-react/src/lib/style";
import { transitionEasingCss } from "@/lib/style-css";
import { CM_TOKEN_VARS, themedSpecs } from "@/lib/code-view-colors";
import { VITE_DIRTY_BADGE, VITE_UNSAVED_TITLE, viteSaveState } from "@/lib/vite-save-hint";
import { PALETTE_META } from "@/lib/palette-meta";
import { PALETTE_TYPES } from "@/lib/document-ops";

const ROOT = join(import.meta.dir, "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

describe("A3 items 3/4: TS sanitizers match Rust (parity golden)", () => {
  const golden = JSON.parse(read("src-tauri/src/fixtures/a3/parity.json")) as Record<string, [string, string | null][]>;
  test("golden has every family and edge rows", () => {
    expect(golden.css_safe.length).toBeGreaterThanOrEqual(30);
    expect(golden.safe_href.length).toBeGreaterThanOrEqual(20);
    expect(golden.transition_easing.length).toBeGreaterThanOrEqual(25);
  });
  test("template cssSafe == Rust css_safe", () => {
    for (const [i, o] of golden.css_safe) expect([i, cssSafe(i)]).toEqual([i, o!]);
  });
  test("template safeHref == Rust safe_href", () => {
    for (const [i, o] of golden.safe_href) expect([i, safeHref(i)]).toEqual([i, o!]);
  });
  test("template easingCss and app transitionEasingCss == Rust transition_easing", () => {
    for (const [i, o] of golden.transition_easing) {
      expect([i, easingCss(i) ?? null]).toEqual([i, o]);
      expect([i, transitionEasingCss(i) ?? null]).toEqual([i, o]);
    }
  });
  test("x outside [0,1] and |y| > 5 are rejected in both ports", () => {
    for (const f of [easingCss, transitionEasingCss]) {
      expect(f("cubic-bezier(1.01,0,1,1)")).toBeUndefined();
      expect(f("cubic-bezier(0,0,-0.01,1)")).toBeUndefined();
      expect(f("cubic-bezier(0,5.01,1,1)")).toBeUndefined();
      expect(f("cubic-bezier(0,-5,1,5)")).toBe("cubic-bezier(0,-5,1,5)");
    }
  });
  test("template styleToReact drops hostile raw CSS but keeps gradients and plain values", () => {
    const out = styleToReact({
      backgroundColor: "url(javascript:alert(1))",
      color: "red;}body{background:red",
      fontFamily: "Inter /* x */",
      borderColor: "#fff",
      backgroundGradient: { type: "linear", angle: 90, stops: [{ color: "#000000", at: 0 }, { color: "#ffffff", at: 100 }] },
    } as never) as Record<string, unknown>;
    expect(out.backgroundColor).toBeUndefined();
    expect(out.color).toBe("redbodybackground:red");
    expect(String(out.fontFamily)).not.toContain("/*");
    expect(String(out.backgroundImage ?? "")).toContain("linear-gradient(");
    const r = read("export-templates/vite-react/src/lib/render-node.tsx");
    expect(r.match(/safeHref\(/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
  });
});

describe("A3 item 1: wb:navigate only from the parent, only same-site paths", () => {
  const entry = () => {
    const m = /const PREVIEW_ENTRY: &str = r##"([\s\S]*?)"##;/.exec(read("src-tauri/src/sidecar.rs"));
    if (!m) throw new Error("PREVIEW_ENTRY not found");
    return m[1].replace('import "./main.tsx";', "");
  };
  test("template preview runtime has the same path checks", () => {
    const s = read("export-templates/vite-react/src/preview-runtime.tsx");
    expect(s).toContain("if (e.source !== window.parent) return;");
    expect(s).toContain('if (typeof p !== "string" || !p.startsWith("/") || p.startsWith("//") || p.includes("\\\\")) return;');
  });

  let server: ReturnType<typeof Bun.serve> | null = null;
  let proc: ChildProcess | null = null;
  let dir = "";
  let cdp: Cdp | null = null;
  beforeAll(async () => {
    if (!CHROME) return;
    const child = `<!doctype html><meta charset="utf-8"><body><script type="module">${entry().replace(/<\/script/g, "<\\/script")}</script>`;
    const sib = `<!doctype html><script>window.go=(p)=>parent.frames[0].postMessage({type:"wb:navigate",path:p},"*")</script>`;
    const top = `<!doctype html><iframe id="f" src="/child"></iframe><iframe id="s" src="/sib"></iframe>`;
    server = Bun.serve({
      port: 0,
      hostname: "127.0.0.1",
      fetch(req: Request) {
        const p = new URL(req.url).pathname;
        const html = p === "/" ? top : p === "/sib" ? sib : child;
        return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
      },
    });
    dir = mkdtempSync(join(tmpdir(), "a3nav-"));
    proc = spawn(CHROME, ["--no-sandbox", "--disable-gpu", "--headless", "--remote-debugging-port=0", `--user-data-dir=${join(dir, "profile")}`, "about:blank"], { stdio: ["ignore", "ignore", "pipe"] });
    const base = await new Promise<string>((res, rej) => {
      const t = setTimeout(() => rej(new Error("chrome did not start")), 20000);
      let buf = "";
      proc!.stderr!.on("data", (c) => {
        buf += String(c);
        const m = /DevTools listening on ws:\/\/([\d.]+:\d+)\//.exec(buf);
        if (m) {
          clearTimeout(t);
          res(m[1]!);
        }
      });
    });
    const list = (await (await fetch(`http://${base}/json/list`)).json()) as { type: string; webSocketDebuggerUrl: string }[];
    cdp = await Cdp.connect(list.find((x) => x.type === "page")!.webSocketDebuggerUrl);
    await cdp.send("Page.enable");
    await cdp.send("Page.navigate", { url: `http://127.0.0.1:${server.port}/` });
    const until = Date.now() + 15000;
    while (Date.now() < until) {
      const ok = await cdp
        .eval<boolean>(`(()=>{const f=document.getElementById('f'),s=document.getElementById('s');return !!(f&&s&&f.contentDocument&&f.contentDocument.readyState==='complete'&&s.contentWindow&&s.contentWindow.go)})()`)
        .catch(() => false);
      if (ok) break;
      await sleep(50);
    }
  }, 40000);
  afterAll(async () => {
    cdp?.close();
    await stopChrome(proc, dir);
    server?.stop(true);
  });
  const path = () => cdp!.eval<string>("document.getElementById('f').contentWindow.location.pathname");
  const settle = () => sleep(150);

  test.skipIf(!CHROME)("parent post navigates; sibling, self, and unsafe paths do not", async () => {
    expect(await path()).toBe("/child");
    await cdp!.eval(`document.getElementById('f').contentWindow.postMessage({type:"wb:navigate",path:"/p1"},"*")`);
    await settle();
    expect(await path()).toBe("/p1");
    await cdp!.eval(`document.getElementById('s').contentWindow.go("/from-sibling")`);
    await settle();
    expect(await path()).toBe("/p1");
    await cdp!.eval(`document.getElementById('f').contentWindow.eval('postMessage({type:"wb:navigate",path:"/self"},"*")')`);
    await settle();
    expect(await path()).toBe("/p1");
    // "//host/x" on our own host would be same-origin (pushState accepts it), so this checks the "//" guard itself.
    for (const bad of [`"//127.0.0.1:${server!.port}/dslash"`, '"//evil.example/x"', '"/a\\\\b"', '"rel"', "42", '{"x":1}']) {
      await cdp!.eval(`document.getElementById('f').contentWindow.postMessage({type:"wb:navigate",path:${bad}},"*")`);
    }
    await settle();
    expect(await path()).toBe("/p1");
    expect(await cdp!.eval<string>("document.getElementById('f').contentWindow.location.host")).toBe(`127.0.0.1:${server!.port}`);
  }, 30000);
});

describe("A3 item 2: Vite frame is sandboxed with the minimal tokens", () => {
  test("allow-scripts allow-same-origin only, and the iframe uses it", () => {
    const s = read("src/components/editor/preview/ViteFrame.tsx");
    expect(s).toContain('export const VITE_FRAME_SANDBOX = "allow-scripts allow-same-origin";');
    expect(s).toContain("sandbox={VITE_FRAME_SANDBOX}");
    for (const t of ["allow-top-navigation", "allow-popups", "allow-forms", "allow-modals"]) expect(s).not.toContain(t);
  });
});

describe("A3 item 6: tsconfig.test.json type-checks the tests (noEmit)", () => {
  test("includes src (tests) with noEmit and does not exclude *.test.ts", () => {
    const c = JSON.parse(read("tsconfig.test.json")) as { compilerOptions: Record<string, unknown>; include: string[]; exclude: string[] };
    expect(c.compilerOptions.noEmit).toBe(true);
    expect(c.include).toContain("src");
    expect(c.exclude).toEqual([]);
    expect(existsSync(join(ROOT, "test-types/bun-test.d.ts"))).toBe(true);
  });
});

describe("A3 item 7: every palette kind is findable in Thai", () => {
  test("each palette type has at least one Thai search keyword", () => {
    const missing = PALETTE_TYPES.filter((t) => !PALETTE_META[t].keywords.some((k) => /[\u0E00-\u0E7F]/.test(k)));
    expect(missing).toEqual([]);
  });
});

describe("A3 item 8: dark code-view text and selection meet WCAG AA", () => {
  const css = read("src/index.css");
  const block = (sel: string) => {
    const i = css.indexOf(`\n${sel} {`);
    return css.slice(i, css.indexOf("\n}", i));
  };
  const v = (b: string, name: string) => new RegExp(`${name}:\\s*([^;]+);`).exec(b)?.[1]?.trim() ?? "";
  const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const hexRgb = (h: string): [number, number, number] => {
    let x = h.replace("#", "");
    if (x.length === 3) x = [...x].map((c) => c + c).join("");
    return [0, 2, 4].map((i) => parseInt(x.slice(i, i + 2), 16) / 255) as [number, number, number];
  };
  // oklch(L 0 0) is a neutral grey: linear luminance = L^3.
  const lum = (c: string) => {
    const g = /^oklch\(([\d.]+) 0 0\)$/.exec(c);
    if (g) return Number(g[1]) ** 3;
    const [r, gg, b] = hexRgb(c).map(lin) as [number, number, number];
    return 0.2126 * r + 0.7152 * gg + 0.0722 * b;
  };
  const ratio = (a: string, b: string) => {
    const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p) as [number, number];
    return (x + 0.05) / (y + 0.05);
  };
  test("every token colour and the text on background, selection, blurred selection, and search match", () => {
    const dark = block(".dark");
    const fg = v(dark, "--foreground");
    const tokens = [...Object.values(CM_TOKEN_VARS).map((n) => v(dark, n)), fg];
    expect(tokens.every((t) => t !== "")).toBe(true);
    for (const bg of [v(dark, "--background"), v(dark, "--cm-selection"), v(dark, "--cm-selection-blur"), v(dark, "--cm-search-match")]) {
      for (const t of tokens) expect([t, bg, ratio(t, bg) >= 4.5]).toEqual([t, bg, true]);
    }
  });
  test("light values stay CodeMirror's defaults; selection overrides apply in .dark only", () => {
    const root = block(":root");
    for (const [hex, name] of Object.entries(CM_TOKEN_VARS)) expect(v(root, name)).toBe(hex);
    expect(css).toContain(".dark .cm-editor.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground");
    expect(css).toContain(".dark .cm-editor .cm-selectionLayer .cm-selectionBackground");
    const specs = themedSpecs([{ color: "#708" }, { color: "#123" }, { fontWeight: "bold" }]);
    expect(specs).toEqual([{ color: "var(--cm-keyword, #708)" }, { color: "#123" }, { fontWeight: "bold" }]);
    expect(read("src/components/editor/code-view.tsx")).toContain("HighlightStyle.define(themedSpecs(defaultHighlightStyle.specs))");
  });
});

describe("A3 item 10: Vite frame hint before the first save", () => {
  test("unsaved content → hint; unsaved edits → badge; saved → frame", () => {
    expect(viteSaveState({ savedEmpty: true, openEmpty: false, dirty: true })).toBe("unsaved");
    expect(viteSaveState({ savedEmpty: true, openEmpty: true, dirty: false })).toBe("saved");
    expect(viteSaveState({ savedEmpty: false, openEmpty: false, dirty: true })).toBe("dirty");
    expect(viteSaveState({ savedEmpty: false, openEmpty: false, dirty: false })).toBe("saved");
    expect(VITE_UNSAVED_TITLE).toBe("บันทึกโปรเจกต์ก่อนเพื่อดูตัวอย่างด้วย Vite");
    expect(VITE_DIRTY_BADGE).toMatch(/[\u0E00-\u0E7F]/);
    const s = read("src/components/editor/PreviewStage.tsx");
    expect(s).toContain('data-testid="vite-unsaved-hint"');
    expect(s).toContain('data-testid="vite-dirty-badge"');
  });
});

describe("A3 item 12: Chromium cleanup waits for the exit before removing the profile", () => {
  test("stopChrome resolves only after the process exited, then the folder is gone", async () => {
    const dir = mkdtempSync(join(tmpdir(), "a3stop-"));
    const p = spawn("sh", ["-c", `trap 'sleep 0.3; exit 0' TERM; while :; do sleep 0.05; done`], { stdio: "ignore" });
    await sleep(100);
    const t0 = Date.now();
    await stopChrome(p, dir);
    expect(p.exitCode !== null || p.signalCode !== null).toBe(true);
    expect(Date.now() - t0).toBeGreaterThanOrEqual(250);
    expect(existsSync(dir)).toBe(false);
  });
  test("an already-exited process does not hang", async () => {
    const p = spawn("true", [], { stdio: "ignore" });
    await new Promise((r) => p.once("exit", r));
    await stopChrome(p, null);
    expect(p.exitCode).toBe(0);
  });
});

describe("A3 item 13: Design and Preview never start the Vite sidecar on their own", () => {
  const walk = (d: string): string[] =>
    readdirSync(d).flatMap((n) => {
      const p = join(d, n);
      return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(n) && !/\.test\.tsx?$/.test(n) ? [p] : [];
    });
  test("sidecarStart is called only from the รันด้วย Vite button and the error retry", () => {
    const callers = walk(join(ROOT, "src"))
      .filter((f) => /\bsidecarStart\s*\(/.test(readFileSync(f, "utf8")))
      .map((f) => relative(ROOT, f))
      .filter((f) => f !== "src/lib/preview-sidecar.ts")
      .sort();
    expect(callers).toEqual(["src/components/editor/preview/ViteRunButton.tsx", "src/components/editor/preview/vite-status-bar.tsx"]);
    const bar = read("src/components/editor/preview/vite-status-bar.tsx");
    const call = bar.indexOf("sidecarStart(");
    expect(bar.lastIndexOf("const onRetry", call)).toBeGreaterThan(bar.lastIndexOf("useEffect", call));
    expect(read("src/components/editor/preview/ViteRunButton.tsx")).toContain("รันด้วย Vite");
  });
  test("ViteDesignCanvas has no effect that starts anything; idle stop stays 60 s", () => {
    const s = read("src/components/editor/ViteDesignCanvas.tsx");
    expect(s).not.toMatch(/sidecarStart|preview_sidecar_start|useEffect/);
    expect(read("src/lib/preview-sidecar.ts")).toContain("export const SIDECAR_IDLE_MS = 60_000;");
    expect(read("src-tauri/src/sidecar.rs")).toContain("pub const IDLE_MS: u64 = 60_000;");
  });
});
