// F2 D8 (= PREVIEW-CODE-VIEW-SPEC S1): the Vite export applies styleBreakpoints like the static export.
// The responsive fixture (src-tauri/src/fixtures/f2, goldens kept in sync by `cargo test f2_tests`) is rendered
// both ways in REAL headless Chromium at 375 / 768 / 1280 and the computed styles of every property the node
// sets (base + active breakpoints) are compared. Skipped (reported) without headless Chromium or without the
// template's installed node_modules (export-templates/vite-react/node_modules).
import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { extname, join } from "node:path";
import { BREAKPOINT_MEDIA, breakpointCss } from "../../export-templates/vite-react/src/lib/style";

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
const st=document.querySelector('style[data-wb-breakpoints]');out.__media=st?[...st.sheet.cssRules].map(r=>r.conditionText||r.media&&r.media.mediaText):null;
return out;`;

function effective(id: string, w: number): string[] {
  const n = doc.nodes[id];
  const keys = new Set(Object.keys(n.style ?? {}));
  if (w <= 1024) Object.keys(n.styleBreakpoints?.tablet ?? {}).forEach((k) => keys.add(k));
  if (w <= 719) Object.keys(n.styleBreakpoints?.phone ?? {}).forEach((k) => keys.add(k));
  return [...keys].filter((k) => CSS_PROP[k]).map((k) => CSS_PROP[k]);
}

/** Headless Chromium run with its own throw-away profile (F2.1 e: the /tmp/f2c-* profile is always removed). */
async function dump(url: string, w: number, probe = PROBE): Promise<any> {
  const profile = mkdtempSync(join(tmpdir(), "f2c-"));
  try {
    const p = Bun.spawn([CHROME!, "--no-sandbox", "--disable-gpu", "--headless", "--dump-dom", `--window-size=${w},900`, "--virtual-time-budget=3000",
      `--user-data-dir=${profile}`, url], { stdout: "pipe", stderr: "pipe" });
    const out = await new Response(p.stdout).text();
    await p.exited;
    const m = /<pre id="__r">([\s\S]*?)<\/pre>/.exec(out);
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
function buildAndServeVite(dir: string, siteJson: string, probe: string): ReturnType<typeof Bun.serve> {
  const app = join(dir, "vite");
  cpSync(TPL, app, { recursive: true, filter: (s) => !/[\\/](node_modules|dist)$/.test(s) });
  symlinkSync(join(TPL, "node_modules"), join(app, "node_modules"));
  cpSync(siteJson, join(app, "src", "data", "site.json"));
  const b = spawnSync(join(app, "node_modules", ".bin", "vite"), ["build", "--logLevel", "error"], { cwd: app, encoding: "utf8", timeout: 180000 });
  if (b.status !== 0) throw new Error(`vite build failed: ${b.stderr}`);
  const dist = join(app, "dist");
  writeFileSync(join(dist, "index.html"), inject(readFileSync(join(dist, "index.html"), "utf8"), probe));
  return Bun.serve({ port: 0, hostname: "127.0.0.1", fetch(req) {
    const p = new URL(req.url).pathname;
    const f = p.startsWith("/assets/") || p.includes(".") ? join(dist, p) : join(dist, "index.html");
    return existsSync(f) ? new Response(Bun.file(f), { headers: { "content-type": TYPES[extname(f)] ?? "application/octet-stream" } }) : new Response("", { status: 404 });
  } });
}
const staticPage = (name: string) =>
  readFileSync(join(FX, `${name}.html`), "utf8").replace(/<link rel="stylesheet" href="styles.css">/, `<style>${readFileSync(join(FX, `${name}.css`), "utf8")}</style>`);

describe("F2 D8 breakpointCss (Vite template) mirrors the static export's media order", () => {
  test("tablet → phone → foldOpen, attribute selectors, !important, sparse", () => {
    const css = breakpointCss(doc.nodes);
    const M = Object.fromEntries(BREAKPOINT_MEDIA);
    const t = css.indexOf(`@media ${M.tablet}`), p = css.indexOf(`@media ${M.phone}`), f = css.indexOf(`@media ${M.foldOpen}`);
    expect(t).toBeGreaterThanOrEqual(0);
    expect(t < p && p < f).toBe(true);
    expect(css).toContain('[data-wb-bp="h"]{font-size:28px !important}');
    expect(css).toContain("margin-top:10px !important;margin-right:0px !important");
    expect(css).not.toContain('"root"');
    // same three media conditions as the static golden, same order
    const st = readFileSync(join(FX, "f2-responsive.css"), "utf8");
    const media = (s: string) => [...s.matchAll(/@media ([^{]+)\{/g)].map((m) => m[1].replace(/\s+/g, ""));
    expect(media(css)).toEqual(media(st));
  });
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
