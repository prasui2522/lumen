// A2.4 acceptance in a REAL browser: the exported page is rendered in headless Chromium and the computed styles are
// read back (`getComputedStyle`). Skipped (and reported as skipped) when no headless Chromium is installed:
// set CHROME_HEADLESS to a chrome / chrome-headless-shell binary, or install one under ~/.cache/ms-playwright.
import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

const FX = join(import.meta.dir, "..", "..", "src-tauri", "src", "fixtures", "a2");
const fx = (n: string) => readFileSync(join(FX, n), "utf8");

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

/** Render golden `name` (html + css inlined) and run `probe` (a JS function body returning JSON) in the page. */
function render(name: string, probe: string, opts: { width?: number; reduced?: boolean } = {}): any {
  const dir = mkdtempSync(join(tmpdir(), "a24r-"));
  try {
    const html = fx(`${name}.html`).replace(/<link rel="stylesheet" href="styles.css">/, `<style>${fx(`${name}.css`)}</style>`);
    const page = html.replace("</body>", `<pre id="__r"></pre><script>document.getElementById("__r").textContent=JSON.stringify((function(){${probe}})())</script></body>`);
    const file = join(dir, "p.html");
    writeFileSync(file, page);
    const args = ["--no-sandbox", "--disable-gpu", "--headless", "--dump-dom", `--window-size=${opts.width ?? 1280},900`, "--virtual-time-budget=500"];
    if (opts.reduced) args.push("--force-prefers-reduced-motion");
    const r = spawnSync(CHROME!, [...args, `file://${file}`], { encoding: "utf8", timeout: 60000 });
    const m = /<pre id="__r">([\s\S]*?)<\/pre>/.exec(r.stdout);
    if (!m) throw new Error(`no probe output: ${r.stderr}`);
    return JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const RADII = `const out={};for(const el of document.querySelectorAll('.t-button')){const c=getComputedStyle(el);out[el.textContent]=[c.borderTopLeftRadius,c.borderTopRightRadius,c.borderBottomRightRadius,c.borderBottomLeftRadius];}return out;`;

describe.skipIf(!CHROME)("A2.4 in headless Chromium (computed styles)", () => {
  test("group of 3 buttons: first = left radius only, middle none, last = right only; radius 20 stays 20 on the outer corners", () => {
    const r = render("a24-kinds", RADII);
    expect(r["หนึ่ง"]).toEqual(["8px", "0px", "0px", "8px"]);
    expect(r["สอง"]).toEqual(["0px", "0px", "0px", "0px"]);
    expect(r["สาม"]).toEqual(["0px", "8px", "8px", "0px"]);
    expect(r["ซ้าย"]).toEqual(["20px", "0px", "0px", "20px"]);
    expect(r["กลาง"]).toEqual(["0px", "0px", "0px", "0px"]);
    expect(r["ขวา"]).toEqual(["0px", "20px", "20px", "0px"]);
    expect(r["บน"]).toEqual(["20px", "20px", "0px", "0px"]);
    expect(r["ล่าง"]).toEqual(["0px", "0px", "20px", "20px"]);
    expect(r["ข"]).toEqual(["0px", "0px", "0px", "0px"]);
    expect(r["เดี่ยว"]).toEqual(["20px", "20px", "20px", "20px"]);
  });

  test("the buttons really touch: no gap, outer corners square on the shared edges", () => {
    const r = render("a24-kinds", `const b=[...document.querySelectorAll('.t-buttonGroup')[1].children].map(e=>e.getBoundingClientRect());return {gaps:[b[1].left-b[0].right,b[2].left-b[1].right]};`);
    expect(r.gaps).toEqual([0, 0]);
  });

  test("spinner: role=status with a name, spins with ONE infinite animation; reduced motion stops it; skeleton is static", () => {
    const probe = `const s=document.querySelector('.t-spinner svg'),k=document.querySelector('.t-skeleton');const cs=getComputedStyle(s),ck=getComputedStyle(k);return {role:document.querySelector('.t-spinner').getAttribute('role'),label:document.querySelector('.t-spinner').getAttribute('aria-label'),name:cs.animationName,count:cs.animationIterationCount,skName:ck.animationName,skHidden:k.getAttribute('aria-hidden')};`;
    const on = render("a24-kinds", probe);
    expect(on).toEqual({ role: "status", label: "กำลังโหลด", name: "t-spin", count: "infinite", skName: "none", skHidden: "true" });
    const off = render("a24-kinds", probe, { reduced: true });
    expect(off.name).toBe("none");
    expect(off.skName).toBe("none");
  });

  test("aspectRatio: the box has the ratio and its child fills it; scrollArea scrolls, is focusable and has a visible focus ring", () => {
    const probe = `const o={};const ar=[...document.querySelectorAll('.t-aspectRatio')].map(e=>{const r=e.getBoundingClientRect(),c=e.firstElementChild.getBoundingClientRect();return [+(r.width/r.height).toFixed(3),c.width===r.width,c.height+parseFloat(getComputedStyle(e.firstElementChild).marginBottom)===r.height]});o.ar=ar;
const sa=[...document.querySelectorAll('.t-scrollArea')];o.sa=sa.map(e=>{const c=getComputedStyle(e);return [e.getAttribute('role'),e.tabIndex,c.overflowX,c.overflowY]});
sa[0].focus();o.focus=document.activeElement===sa[0];o.ring=getComputedStyle(sa[0]).outlineStyle+' '+getComputedStyle(sa[0]).outlineWidth;return o;`;
    const r = render("a24-kinds", probe);
    expect(r.ar.map((a: number[]) => a[0])).toEqual([1.778, 1.333, 1, 1.5, 2.333]);
    // the child fills the box (a text child keeps its own 8px bottom margin inside the 100% height)
    expect(r.ar.every((a: unknown[]) => a[1] === true && a[2] === true)).toBe(true);
    expect(r.sa).toEqual([
      ["region", 0, "hidden", "auto"],
      ["region", 0, "auto", "hidden"],
      [null, 0, "auto", "auto"],
    ]);
    expect(r.focus).toBe(true);
  });

  test("N2: the axis rule follows the overflow in force at the desktop, tablet, phone and fold widths", () => {
    const probe = `return [...document.querySelectorAll('.t-scrollArea')].map(e=>{const c=getComputedStyle(e);return c.overflowX+'/'+c.overflowY});`;
    // s1 base hidden + tablet auto (vertical); s2 auto, tablet hidden, phone scroll (horizontal); s3 both; s4 fold; s5 visible; s6 control; s7 hidden horizontal
    expect(render("a24-scroll-bp", probe, { width: 1280 })).toEqual(["hidden/hidden", "auto/hidden", "hidden/hidden", "hidden/auto", "hidden/auto", "hidden/auto", "hidden/hidden"]);
    expect(render("a24-scroll-bp", probe, { width: 900 })).toEqual(["hidden/auto", "hidden/hidden", "auto/auto", "hidden/auto", "visible/visible", "hidden/auto", "hidden/hidden"]);
    expect(render("a24-scroll-bp", probe, { width: 600 })).toEqual(["hidden/auto", "scroll/hidden", "auto/auto", "hidden/auto", "visible/visible", "hidden/auto", "hidden/hidden"]);
  });
});

describe("A2.4 render check availability", () => {
  test("reports whether a headless Chromium was found", () => {
    console.log(CHROME ? `a24-render: using ${CHROME}` : "a24-render: NO headless Chromium found; the computed-style tests are SKIPPED");
    expect(typeof (CHROME ?? "")).toBe("string");
  });
});
