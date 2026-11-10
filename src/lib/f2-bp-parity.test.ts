// F2 D8 (= PREVIEW-CODE-VIEW-SPEC S1): the Vite export applies styleBreakpoints like the static export.
// The responsive fixture (src-tauri/src/fixtures/f2, goldens kept in sync by `cargo test f2_tests`) is rendered
// both ways in REAL headless Chromium at 375 / 768 / 1280 and the computed styles of every property the node
// sets (base + active breakpoints) are compared. Skipped (reported) without headless Chromium or without the
// template's installed node_modules (export-templates/vite-react/node_modules).
import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { extname, join } from "node:path";

const ROOT = join(import.meta.dir, "..", "..");
const FX = join(ROOT, "src-tauri", "src", "fixtures", "f2");
const TPL = join(ROOT, "export-templates", "vite-react");
const doc = JSON.parse(readFileSync(join(FX, "f2-responsive.json"), "utf8"));

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
// F2.1 e: profiles that existed before this file ran (left by older runs) are not ours to judge here
const BEFORE_F2C = new Set(readdirSync(tmpdir()).filter((d) => d.startsWith("f2c-")));
const HAS_TPL_DEPS = existsSync(join(TPL, "node_modules", ".bin", "vite"));

// leaf text → node id; "box" is probed as the parent of t2's element
const MARKS: Record<string, string> = { หัวเรื่องปรับขนาด: "h", ข้อความจัดแนว: "t", ข้อความในกล่อง: "t2", ปุ่มตอบสนอง: "bt" };
const CSS_PROP: Record<string, string> = {
  fontSize: "font-size", color: "color", padding: "padding", textAlign: "text-align", backgroundColor: "background-color",
  width: "width", margin: "margin", borderRadius: "border-radius", opacity: "opacity",
};
const PROBE = `const marks=${JSON.stringify(MARKS)};const out={};
for(const el of document.querySelectorAll('body *')){const id=marks[(el.childElementCount===0?el.textContent:'').trim()];if(!id)continue;
 const rd=(e)=>{const c=getComputedStyle(e);const p=e.parentElement;const pc=getComputedStyle(p);
  const inner=p.clientWidth-parseFloat(pc.paddingLeft)-parseFloat(pc.paddingRight);
  return {"font-size":c.fontSize,color:c.color,padding:c.padding,"text-align":c.textAlign,"background-color":c.backgroundColor,
   width:Math.round(100*e.getBoundingClientRect().width/inner)+'%',margin:c.margin,"border-radius":c.borderRadius,opacity:c.opacity};};
 out[id]=rd(el);if(id==='t2')out.box=rd(el.parentElement);}
out.__media=[];for(const sh of document.styleSheets)for(const r of sh.cssRules)if(r.conditionText&&/width|segments/.test(r.conditionText))out.__media.push(r.conditionText);
return out;`;

function effective(id: string, w: number): string[] {
  const n = doc.nodes[id];
  const keys = new Set(Object.keys(n.style ?? {}));
  if (w <= 1024) Object.keys(n.styleBreakpoints?.tablet ?? {}).forEach((k) => keys.add(k));
  if (w <= 719) Object.keys(n.styleBreakpoints?.phone ?? {}).forEach((k) => keys.add(k));
  return [...keys].filter((k) => CSS_PROP[k]).map((k) => CSS_PROP[k]);
}

/** Headless Chromium run with its own throw-away profile (F2.1 e: the /tmp/f2c-* profile is always removed). */
// `_probe` is documentation only: `inject` already wrote that probe into the page being dumped.
async function dump(url: string, w: number, _probe = PROBE): Promise<any> {
  const profile = mkdtempSync(join(tmpdir(), "f2c-"));
  try {
    const p = Bun.spawn([CHROME!, "--no-sandbox", "--disable-gpu", "--headless", "--dump-dom", `--window-size=${w},900`, "--virtual-time-budget=3000",
      `--user-data-dir=${profile}`, url], { stdout: "pipe", stderr: "pipe" });
    const out = await new Response(p.stdout).text();
    await p.exited;
    const m = /<pre id="__r"[^>]*>([\s\S]*?)<\/pre>/.exec(out); // B0.1: an open Radix dialog adds aria-hidden to it
    if (!m) throw new Error(`no probe output at ${w} for ${url}`);
    return JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">"));
  } finally {
    rmSync(profile, { recursive: true, force: true });
  }
}
const inject = (html: string, probe = PROBE) =>
  html.replace("</body>", `<pre id="__r"></pre><script>setTimeout(function(){document.getElementById("__r").textContent=JSON.stringify((function(){${probe}})())},300)</script></body>`);

const TYPES: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml" };
/** Build the Vite template with `siteJson` in `dir/vite` (template node_modules symlinked) and serve its dist. */
/**
 * B0: like the export zip, the build gets the Rust generator's `src/styles/site.css` (golden `<name>.site.css`,
 * kept by `cargo test f2_tests`); `extraCss` (P2 canary) is appended to it.
 */
function buildAndServeVite(dir: string, siteJson: string, probe: string, extraCss = ""): ReturnType<typeof Bun.serve> {
  const app = join(dir, "vite");
  cpSync(TPL, app, { recursive: true, filter: (s) => !/[\\/](node_modules|dist)$/.test(s) });
  symlinkSync(join(TPL, "node_modules"), join(app, "node_modules"));
  cpSync(siteJson, join(app, "src", "data", "site.json"));
  mkdirSync(join(app, "src", "styles"), { recursive: true });
  writeFileSync(join(app, "src", "styles", "site.css"), readFileSync(siteJson.replace(/\.site\.json$/, ".site.css"), "utf8") + extraCss);
  // B0.1 item 1: the zip's kinds.css (golden `<name>.kinds.css` when the fixture has one, else empty like a kind-free site).
  const kinds = siteJson.replace(/\.site\.json$/, ".kinds.css");
  writeFileSync(join(app, "src", "styles", "kinds.css"), existsSync(kinds) ? readFileSync(kinds, "utf8") : "\n");
  const b = spawnSync(join(app, "node_modules", ".bin", "vite"), ["build", "--logLevel", "error"], { cwd: app, encoding: "utf8", timeout: 180000 });
  if (b.status !== 0) throw new Error(`vite build failed: ${b.stderr}`);
  const dist = join(app, "dist");
  writeFileSync(join(dist, "index.html"), inject(readFileSync(join(dist, "index.html"), "utf8"), probe));
  return Bun.serve({ port: 0, hostname: "127.0.0.1", fetch(req: Request) {
    const p = new URL(req.url).pathname;
    const f = p.startsWith("/assets/") || p.includes(".") ? join(dist, p) : join(dist, "index.html");
    return existsSync(f) ? new Response(Bun.file(f), { headers: { "content-type": TYPES[extname(f)] ?? "application/octet-stream" } }) : new Response("", { status: 404 });
  } });
}
const staticPage = (name: string) =>
  readFileSync(join(FX, `${name}.html`), "utf8").replace(/<link rel="stylesheet" href="styles.css">/, `<style>${readFileSync(join(FX, `${name}.css`), "utf8")}</style>`);

describe("B0 shared style generator: the zip's site.css is the static styles.css block, byte for byte", () => {
  test("each fixture's site.css closes its static styles.css", () => {
    for (const name of ["f2-responsive", "f21-kinds"]) {
      const site = readFileSync(join(FX, `${name}.site.css`), "utf8");
      expect(site.trim().length).toBeGreaterThan(0);
      expect(readFileSync(join(FX, `${name}.css`), "utf8").endsWith(site)).toBe(true);
    }
    // same three media conditions as the static golden, same order; no Vite-only selector, no !important
    const site = readFileSync(join(FX, "f2-responsive.site.css"), "utf8");
    const media = (x: string) => [...x.matchAll(/@media ([^{]+)\{/g)].map((m) => m[1].replace(/\s+/g, ""));
    expect(media(site).filter((m) => /width|segments/.test(m))).toEqual(["(max-width:1024px)", "(max-width:719px)", "(horizontal-viewport-segments:2)"]);
    expect(site).toContain('[data-wb-page="home"] [data-wb-id="h"]{font-size:28px}'); // B0.1 item 3: page-scoped
    expect(site).not.toContain("!important");
    expect(site).not.toContain("data-wb-bp");
  });
});

// P2: at-rules with no producer yet (B7) ride along as a canary so the minifier's handling is tested now.
const CANARY = "@supports (display:grid){.b0-canary-a{display:grid}}@media (hover:hover){.b0-canary-b:hover{color:#123456}}" +
  "@keyframes b0-canary-spin{to{transform:rotate(360deg)}}@media (prefers-reduced-motion:reduce){.b0-canary-c{animation:none}}" +
  "@media (forced-colors:active){.b0-canary-d{border-color:CanvasText}}";
const RULES = `const out=[];const walk=(l)=>{for(const r of l){out.push(r.cssText);if(r.cssRules&&!(r instanceof CSSKeyframesRule))walk(r.cssRules);}};
for(const sh of document.styleSheets)walk(sh.cssRules);return out;`;

describe.skipIf(!CHROME || !HAS_TPL_DEPS)("B0 P1/P2: every generated rule survives the Vite build (minified), at-rules included", () => {
  test("site.css rules ⊆ built CSS rules, as Chromium parses both", async () => {
    const dir = mkdtempSync(join(tmpdir(), "b0css-"));
    let server: ReturnType<typeof Bun.serve> | null = null;
    try {
      for (const name of ["f2-responsive", "f21-kinds"]) {
        const raw = readFileSync(join(FX, `${name}.site.css`), "utf8") + CANARY;
        writeFileSync(join(dir, "raw.html"), inject(`<!doctype html><html><head><style>${raw}</style></head><body></body></html>`, RULES));
        mkdirSync(join(dir, name));
        server = buildAndServeVite(join(dir, name), join(FX, `${name}.site.json`), RULES, CANARY);
        const want: string[] = await dump(`file://${join(dir, "raw.html")}`, 1280, RULES);
        const got = new Set<string>(await dump(`http://127.0.0.1:${server.port}/`, 1280, RULES));
        expect(want.length).toBeGreaterThan(5);
        for (const r of want) expect(`${name}: ${got.has(r) ? "kept" : "LOST"} ${r}`).toBe(`${name}: kept ${r}`);
        // the five P2 at-rules (top level, as Chromium serializes them) are among the kept rules
        const top = want.filter((r) => r.startsWith("@") && r.includes("b0-canary"));
        expect(top.map((r) => r.slice(0, r.indexOf("{")).replace(/\s+/g, ""))).toEqual(["@supports(display:grid)", "@media(hover:hover)", "@keyframesb0-canary-spin", "@media(prefers-reduced-motion:reduce)", "@media(forced-colors:active)"]);
        // the built CSS file itself (grep, as the ruling asks)
        const assets = join(dir, name, "vite", "dist", "assets");
        const built = readdirSync(assets).filter((f) => f.endsWith(".css")).map((f) => readFileSync(join(assets, f), "utf8")).join("");
        for (const g of ["@supports", "hover:hover", "@keyframes b0-canary-spin", "prefers-reduced-motion", "forced-colors"]) expect(built).toContain(g);
        if (name === "f2-responsive") expect(built).toMatch(/\[data-wb-id="?h"?\]/);
        server.stop(true);
        server = null;
      }
    } finally {
      server?.stop(true);
      rmSync(dir, { recursive: true, force: true });
    }
  }, 300000);
});

describe.skipIf(!CHROME || !HAS_TPL_DEPS)("F2 D8 parity in headless Chromium: static vs Vite export at 375 / 768 / 1280", () => {
  test("computed styles of every set property match per breakpoint", async () => {
    const dir = mkdtempSync(join(tmpdir(), "f2bp-"));
    let server: ReturnType<typeof Bun.serve> | null = null;
    try {
      // static export
      writeFileSync(join(dir, "static.html"), inject(staticPage("f2-responsive")));
      // Vite export built from the template with the fixture's site.json
      server = buildAndServeVite(dir, join(FX, "f2-responsive.site.json"), PROBE);
      for (const w of [375, 768, 1280]) {
        const s = await dump(`file://${join(dir, "static.html")}`, w);
        const v = await dump(`http://127.0.0.1:${server.port}/`, w);
        for (const id of ["h", "t", "box", "t2", "bt"]) {
          for (const prop of effective(id, w)) expect(`${w} ${id} ${prop} ${v[id]?.[prop]}`).toBe(`${w} ${id} ${prop} ${s[id]?.[prop]}`);
        }
        // the overrides really took effect (not equal-but-both-wrong)
        if (w === 375) { expect(s.h["font-size"]).toBe("20px"); expect(s.t["text-align"]).toBe("right"); expect(s.box.width).toBe("50%"); }
        if (w === 768) { expect(s.h["font-size"]).toBe("28px"); expect(s.box.padding).toBe("24px"); }
        if (w === 1280) { expect(s.h["font-size"]).toBe("40px"); expect(s.bt["border-radius"]).toBe("8px"); }
        expect(v.__media?.length).toBe(3);
      }
    } finally {
      server?.stop(true);
      rmSync(dir, { recursive: true, force: true });
    }
  }, 300000);
});

// F2.1 a / b / c in both exports: default scrollArea scrolls (overflow per axis = static), the empty carousel is not a
// Tab stop, the table region is a Tab stop with a 2px #0077c2 ring (offset 2px) on :focus-visible.
const KPROBE = `const out={sa:[],car:[],tw:null};
for(const el of document.querySelectorAll('.t-scrollArea,.n-scrollArea')){const c=getComputedStyle(el);
 out.sa.push({ox:c.overflowX,oy:c.overflowY,vs:el.scrollHeight>el.clientHeight+1,hs:el.scrollWidth>el.clientWidth+1,ti:el.tabIndex});}
for(const el of document.querySelectorAll('[aria-roledescription=carousel]'))out.car.push({ti:el.getAttribute('tabindex'),slides:el.children.length,al:el.getAttribute('aria-label')});
const tw=document.querySelector('[role=region][aria-label]:not([aria-roledescription])');
if(tw){tw.focus();const c=getComputedStyle(tw);out.tw={ti:tw.getAttribute('tabindex'),fv:tw.matches(':focus-visible'),os:c.outlineStyle,ow:c.outlineWidth,oc:c.outlineColor,oo:c.outlineOffset};}
return out;`;

describe.skipIf(!CHROME || !HAS_TPL_DEPS)("F2.1 scrollArea / carousel / table in headless Chromium: static vs Vite export", () => {
  test("same overflow axes and scrolling, empty carousel not tabbable, table ring", async () => {
    const dir = mkdtempSync(join(tmpdir(), "f2bp-"));
    let server: ReturnType<typeof Bun.serve> | null = null;
    try {
      writeFileSync(join(dir, "static.html"), inject(staticPage("f21-kinds"), KPROBE));
      server = buildAndServeVite(dir, join(FX, "f21-kinds.site.json"), KPROBE);
      const s = await dump(`file://${join(dir, "static.html")}`, 1280, KPROBE);
      const v = await dump(`http://127.0.0.1:${server.port}/`, 1280, KPROBE);
      // static truth (fixture order: vertical h60, horizontal maxW200, both, vertical + explicit overflow hidden)
      expect(s.sa.map((x: any) => [x.ox, x.oy])).toEqual([["hidden", "auto"], ["auto", "hidden"], ["auto", "auto"], ["hidden", "hidden"]]);
      expect(s.sa.map((x: any) => [x.vs, x.hs])).toEqual([[true, false], [false, true], [true, true], [true, false]]);
      // a: Vite matches (axes + it really has scrollable overflow)
      expect(v.sa.map((x: any) => [x.ox, x.oy])).toEqual(s.sa.map((x: any) => [x.ox, x.oy]));
      expect(v.sa.map((x: any) => [x.vs, x.hs])).toEqual(s.sa.map((x: any) => [x.vs, x.hs]));
      // b: empty carousel has no tabindex; one with a slide keeps tabindex 0 — both exports
      for (const r of [s, v]) {
        // F2.1.1 b: every carousel is named — layer name when set, else "Carousel"
        expect(r.car).toEqual([
          { ti: null, slides: 0, al: "Carousel" },
          { ti: "0", slides: 1, al: "Carousel" },
          { ti: "0", slides: 1, al: "แกลเลอรี" },
        ]);
      }
      // c: table region is tabbable and draws the 2px solid #0077c2 ring, offset 2px — both exports
      for (const r of [s, v]) {
        expect(r.tw.ti).toBe("0");
        expect(r.tw.fv).toBe(true);
        expect([r.tw.os, r.tw.ow, r.tw.oc, r.tw.oo]).toEqual(["solid", "2px", "rgb(0, 119, 194)", "2px"]);
      }
    } finally {
      server?.stop(true);
      rmSync(dir, { recursive: true, force: true });
    }
  }, 300000);

  test("F2.1 e: the test leaves no /tmp/f2c-* Chromium profile behind", () => {
    const left = readdirSync(tmpdir()).filter((d) => d.startsWith("f2c-"));
    expect(left.filter((d) => !BEFORE_F2C.has(d))).toEqual([]);
  });
});

// ---- B0.1 (Designer pass on B0) ------------------------------------------------------------------------------
const B0FX = join(ROOT, "src-tauri", "src", "fixtures", "b0");

/** Every class / attribute selector of a generated block, at-rule wrappers and pseudo-classes stripped. */
function siteSelectors(css: string): string[] {
  const noKf = css.replace(/@keyframes[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, "");
  const flat = noKf.replace(/@[^{;]+\{/g, "");
  const out = new Set<string>();
  for (const m of flat.matchAll(/([^{}]+)\{[^{}]*\}/g)) {
    for (const sel of m[1].split(",")) {
      const s = sel.replace(/::?[a-zA-Z-]+(\([^)]*\))?/g, "").replace(/\s*([>+~])\s*/g, "$1").trim().replace(/[>+~]$/, "").trim();
      if (s && /[.[]/.test(s)) out.add(s);
    }
  }
  return [...out];
}

describe("B0.1 selector extraction", () => {
  test("strips at-rule wrappers, keyframes and pseudo-classes", () => {
    expect(siteSelectors('@media (max-width:719px){[data-wb-page="r"] [data-wb-id="h"]{color:red}}.t-switch .sw:focus-visible+.sw-track{outline:0}@keyframes x{to{opacity:1}}')).toEqual([
      '[data-wb-page="r"] [data-wb-id="h"]', ".t-switch .sw+.sw-track",
    ]);
  });
});

describe.skipIf(!CHROME || !HAS_TPL_DEPS)("B0.1 item 1: every site.css selector matches the Vite render of the all-kinds fixture", () => {
  test("each selector matches ≥1 element; every node type root carries .t-<type>", async () => {
    const dir = mkdtempSync(join(tmpdir(), "b01k-"));
    let server: ReturnType<typeof Bun.serve> | null = null;
    try {
      const css = readFileSync(join(B0FX, "b01-all-kinds.site.css"), "utf8");
      // site.css (style_css) plus kinds.css (the static `.t-x` rules the Vite template now ships for markup kinds)
      const sels = siteSelectors(css + readFileSync(join(B0FX, "b01-all-kinds.kinds.css"), "utf8"));
      const site = JSON.parse(readFileSync(join(B0FX, "b01-all-kinds.site.json"), "utf8"));
      const types = new Set<string>();
      for (const p of site.pages) for (const n of Object.values<any>(p.nodes)) types.add(n.props.type);
      const probe = `const sels=${JSON.stringify(sels)};const types=${JSON.stringify([...types])};
return {miss:sels.filter((s)=>{try{return document.querySelectorAll(s).length===0}catch(e){return true}}),
 noType:types.filter((t)=>!document.querySelector('.t-'+t)),page:document.querySelectorAll('[data-wb-page]').length,n:sels.length};`;
      server = buildAndServeVite(dir, join(B0FX, "b01-all-kinds.site.json"), probe);
      const r = await dump(`http://127.0.0.1:${server.port}/`, 1280, probe);
      expect(r.n).toBe(sels.length);
      expect(siteSelectors(css).length).toBeGreaterThan(5);
      expect(sels.some((s) => s.includes(".t-switch"))).toBe(true);
      expect(r.miss).toEqual([]);
      expect(r.noType).toEqual([]);
      expect(r.page).toBeGreaterThanOrEqual(1); // page root; open dialog portal host may add another
    } finally {
      server?.stop(true);
      rmSync(dir, { recursive: true, force: true });
    }
  }, 300000);
});

const DUP_PROBE = `const out={};for(const el of document.querySelectorAll('body *')){if(el.childElementCount)continue;const t=el.textContent.trim();
 const k=t.startsWith('หัวเรื่อง')?'h':t.startsWith('ปุ่ม')?'bt':null;if(!k)continue;const c=getComputedStyle(k==='bt'&&el.closest('button')?el.closest('button'):el);
 out[k]={text:t,fs:c.fontSize,color:c.color,bg:c.backgroundColor};}
out.page=[...document.querySelectorAll('[data-wb-page]')].map((e)=>e.getAttribute('data-wb-page'));return out;`;

describe.skipIf(!CHROME || !HAS_TPL_DEPS)("B0.1 items 2 + 3: same node ids on two pages, hooked shadcn button (static vs Vite)", () => {
  test("each page shows its own breakpoint values; the hooked button keeps its own background", async () => {
    const dir = mkdtempSync(join(tmpdir(), "b01d-"));
    let server: ReturnType<typeof Bun.serve> | null = null;
    try {
      const st = (n: number) => readFileSync(join(B0FX, `b01-dup-pages.p${n}.html`), "utf8")
        .replace(/<link rel="stylesheet" href="styles.css">/, `<style>${readFileSync(join(B0FX, `b01-dup-pages.p${n}.css`), "utf8")}</style>`);
      writeFileSync(join(dir, "p1.html"), inject(st(1), DUP_PROBE));
      writeFileSync(join(dir, "p2.html"), inject(st(2), DUP_PROBE));
      server = buildAndServeVite(dir, join(B0FX, "b01-dup-pages.site.json"), DUP_PROBE);
      const want: Record<string, [string, string, string]> = { "/": ["p1", "20px", "rgb(176, 0, 32)"], "/two": ["p2", "60px", "rgb(0, 170, 0)"] };
      for (const [path, [pg, fs, color]] of Object.entries(want)) {
        const pageId = pg === "p1" ? "p1" : "p2"; // B0.2: scope by ProjectPage.id
        const s = await dump(`file://${join(dir, `${pg}.html`)}`, 375, DUP_PROBE);
        const v = await dump(`http://127.0.0.1:${server.port}${path}`, 375, DUP_PROBE);
        const vWide = await dump(`http://127.0.0.1:${server.port}${path}`, 1280, DUP_PROBE);
        for (const [name, r] of [["static", s], ["vite", v]] as const) {
          expect(`${name} ${path} ${r.h?.text}`).toBe(`${name} ${path} หัวเรื่อง ${pg}`);
          expect(`${name} ${path} h ${r.h.fs} ${r.h.color}`).toBe(`${name} ${path} h ${fs} ${color}`);
          expect(`${name} ${path} bt ${r.bt.fs}`).toBe(`${name} ${path} bt ${fs}`);
          expect(r.page).toEqual([pageId]);
        }
        expect(vWide.h.fs).toBe("40px");
        // item 2: the hooked shadcn button keeps the template's own background at every width (never the static #0ea5e9)
        // (the button's phone override sets a background, so its family is restated: own keys only, no #0ea5e9)
        expect(vWide.bt.bg).not.toBe("rgb(14, 165, 233)");
        expect(s.bt.bg).toBe("rgb(34, 34, 34)");
        expect(v.bt.bg).toBe("rgb(34, 34, 34)");
      }
    } finally {
      server?.stop(true);
      rmSync(dir, { recursive: true, force: true });
    }
  }, 300000);
});


// ---- B0.2 ----------------------------------------------------------------------------------------------------
const DLG_PROBE = `const el=document.querySelector('[data-wb-id="dlg"],.t-dialog');
if(!el) return {missing:true};
const c=getComputedStyle(el); const r=el.getBoundingClientRect();
return {w:Math.round(r.width), bg:c.backgroundColor, fs:c.fontSize,
 page:[...document.querySelectorAll('[data-wb-page]')].map((e)=>e.getAttribute('data-wb-page')),
 host:!!el.closest('[data-wb-page]')};`;

describe.skipIf(!CHROME || !HAS_TPL_DEPS)("B0.2 item 1: hooked open dialog portal stays inside data-wb-page (static vs Vite)", () => {
  test("width and background match at 375 / 768 / 1280", async () => {
    const dir = mkdtempSync(join(tmpdir(), "b02dlg-"));
    let server: ReturnType<typeof Bun.serve> | null = null;
    try {
      const html = readFileSync(join(B0FX, "b02-dialog-hook.html"), "utf8")
        .replace(/<link rel="stylesheet" href="styles.css">/, `<style>${readFileSync(join(B0FX, "b02-dialog-hook.css"), "utf8")}</style>`);
      writeFileSync(join(dir, "static.html"), inject(html, DLG_PROBE));
      server = buildAndServeVite(dir, join(B0FX, "b02-dialog-hook.site.json"), DLG_PROBE);
      // phone 220 / white; tablet 360 / blue; desktop 300 / amber
      const want: Record<number, { w: number; bg: string }> = {
        375: { w: 220, bg: "rgb(255, 255, 255)" },
        768: { w: 360, bg: "rgb(219, 234, 254)" },
        1280: { w: 300, bg: "rgb(254, 243, 199)" },
      };
      for (const [w, exp] of Object.entries(want)) {
        const width = Number(w);
        const s = await dump(`file://${join(dir, "static.html")}`, width, DLG_PROBE);
        const v = await dump(`http://127.0.0.1:${server.port}/`, width, DLG_PROBE);
        expect(s.missing).toBeUndefined();
        expect(v.missing).toBeUndefined();
        expect(v.host).toBe(true);
        expect(v.page.length).toBeGreaterThanOrEqual(1);
        expect(v.page).toContain("home");
        expect(`${width} vite ${v.w} ${v.bg}`).toBe(`${width} vite ${exp.w} ${exp.bg}`);
        expect(`${width} static ${s.w} ${s.bg}`).toBe(`${width} static ${exp.w} ${exp.bg}`);
      }
    } finally {
      server?.stop(true);
      rmSync(dir, { recursive: true, force: true });
    }
  }, 300000);
});

describe.skipIf(!CHROME || !HAS_TPL_DEPS)("B0.2 item 2: every static :focus-visible rule reaches the Vite CSS", () => {
  test("every :focus-visible rule in static type CSS exists in Vite CSS", async () => {
    const dir = mkdtempSync(join(tmpdir(), "b02fv-"));
    let server: ReturnType<typeof Bun.serve> | null = null;
    try {
      // Static type CSS Vite mirrors: kinds.css (markup `.t-x`) + site.css (style_css / generator, including
      // carousel & table rings after the a4/a5 split). Collect every :focus-visible selector from both.
      const kinds = readFileSync(join(B0FX, "b01-all-kinds.kinds.css"), "utf8");
      const site = readFileSync(join(B0FX, "b01-all-kinds.site.css"), "utf8");
      // Also fold a1's static styles.css (canonical type CSS for many kinds) — any :focus-visible there that
      // also appears in this site's generator/kinds must still reach Vite; and carousel must be in site.
      const a1 = join(ROOT, "src-tauri/src/fixtures/a1/all-kinds.styles.css");
      const a1css = existsSync(a1) ? readFileSync(a1, "utf8") : "";
      const extract = (css: string) =>
        [...css.matchAll(/([^{}]*:focus-visible[^{]*)\{/g)].map((m) => m[1].replace(/\s+/g, ""));
      const fromStaticType = [...new Set([...extract(kinds), ...extract(site)])];
      expect(fromStaticType.some((s) => s.includes(".t-carousel:focus-visible"))).toBe(true);
      expect(fromStaticType.some((s) => s.includes(".t-tablewrap:focus-visible"))).toBe(true);
      // a1 focus-visible selectors that this all-kinds site also emits must be covered
      const a1fv = extract(a1css);
      const overlap = a1fv.filter((s) => site.replace(/\s+/g, "").includes(s) || kinds.replace(/\s+/g, "").includes(s));
      server = buildAndServeVite(dir, join(B0FX, "b01-all-kinds.site.json"), RULES);
      const assets = join(dir, "vite", "dist", "assets");
      const built = readdirSync(assets).filter((f) => f.endsWith(".css")).map((f) => readFileSync(join(assets, f), "utf8")).join("").replace(/\s+/g, "");
      expect(fromStaticType.filter((sel) => !built.includes(sel))).toEqual([]);
      expect(overlap.filter((sel) => !built.includes(sel))).toEqual([]);
    } finally {
      server?.stop(true);
      rmSync(dir, { recursive: true, force: true });
    }
  }, 300000);
});

const SW_PROBE = `const lab=document.querySelector('.t-switch');
if(!lab) return {missing:true};
const c=getComputedStyle(lab); const r=lab.getBoundingClientRect();
const track=lab.querySelector('.sw-track'); const tc=track?getComputedStyle(track):null;
return {display:c.display, ai:c.alignItems, gap:c.gap, w:Math.round(r.width), h:Math.round(r.height),
 tw:tc?Math.round(track.getBoundingClientRect().width):0, th:tc?Math.round(track.getBoundingClientRect().height):0};`;

describe.skipIf(!CHROME || !HAS_TPL_DEPS)("B0.2 item 4: switch label box matches static (kills old inline-flex style)", () => {
  test("display/align/gap and track box equal at 1280", async () => {
    const dir = mkdtempSync(join(tmpdir(), "b02sw-"));
    let server: ReturnType<typeof Bun.serve> | null = null;
    try {
      // Prefer a3 switch golden; fall back to all-kinds site which includes a switch
      const a3html = join(ROOT, "src-tauri/src/fixtures/a3/a32-switch.html");
      const a3css = join(ROOT, "src-tauri/src/fixtures/a3/a32-switch.css");
      const siteJson = existsSync(join(ROOT, "src-tauri/src/fixtures/a3/a32-switch.site.json"))
        ? join(ROOT, "src-tauri/src/fixtures/a3/a32-switch.site.json")
        : join(B0FX, "b01-all-kinds.site.json");
      // Build a one-page site.json from a32 if needed — use all-kinds which has switch + kinds.css
      const html = existsSync(a3html)
        ? readFileSync(a3html, "utf8").replace(/<link rel="stylesheet" href="styles.css">/, `<style>${readFileSync(a3css, "utf8")}</style>`)
        : null;
      if (html) writeFileSync(join(dir, "static.html"), inject(html, SW_PROBE));
      server = buildAndServeVite(dir, siteJson.endsWith("b01-all-kinds.site.json") ? join(B0FX, "b01-all-kinds.site.json") : siteJson, SW_PROBE);
      // For static from a32, compare; also always assert Vite looks like flex (not inline-flex)
      const v = await dump(`http://127.0.0.1:${server.port}/`, 1280, SW_PROBE);
      expect(v.missing).toBeUndefined();
      expect(v.display).toBe("flex");
      expect(v.ai).toBe("center");
      expect(v.tw).toBe(40);
      expect(v.th).toBe(22);
      if (html) {
        const s = await dump(`file://${join(dir, "static.html")}`, 1280, SW_PROBE);
        expect(`${s.display} ${s.ai} ${s.gap} ${s.tw}x${s.th}`).toBe(`${v.display} ${v.ai} ${v.gap} ${v.tw}x${v.th}`);
      }
    } finally {
      server?.stop(true);
      rmSync(dir, { recursive: true, force: true });
    }
  }, 300000);
});
