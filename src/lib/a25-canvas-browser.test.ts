// A2.5 on the canvas, in a REAL Chromium: F2 (the 1px separator can be clicked and dragged), the scrollArea (wheel scrolls,
// a drag on it still drags the NODE), F3 / F5 (the canvas and the export lay a group / aspectRatio out the same).
// Skipped, and reported as skipped, ONLY when no headless Chromium is installed.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { PageDocument } from "@/schema";
import { insertNode, setNodeProp, setNodeStyle } from "@/lib/document-ops";
import { placedDocument } from "@/lib/a25-doc";
import { BACKDROP, BODY, CSS, ENTRY } from "@/lib/a25-kinds.test";
import { CHROME, bootBrowser, click, closeBrowser, dragFrom, openPage, recordEvents, rectOf, sleep, type Browser } from "@/lib/cdp-kit.test";

const FX = join(import.meta.dir, "..", "..", "src-tauri", "src", "fixtures", "a2");

let b: Browser | null = null;
beforeAll(async () => {
  if (!CHROME) return;
  b = await bootBrowser(ENTRY, BODY, CSS);
  if (b.bundleError) throw new Error(b.bundleError);
}, 60000);
afterAll(() => closeBrowser(b));

test("reports which browser the A2.5 canvas tests used", () => {
  console.log(CHROME ? `a25-canvas: ${CHROME}` : "a25-canvas: NO headless Chromium, the behavioural tests are SKIPPED");
});

const show = async (sel: string) => {
  await b!.cdp.eval(`document.querySelector(${JSON.stringify(sel)}).scrollIntoView({block:"center"})`);
  await sleep(30);
  return rectOf(b!.cdp, sel);
};
const selected = () => b!.cdp.eval<string | null>(`window.__stores.editor.getState().selectedNodeId`);
const clear = () => b!.cdp.eval(`window.__stores.editor.getState().setSelectedNodeId(null)`);
const must = <T>(d: T | null): T => {
  if (!d) throw new Error("document op returned null");
  return d;
};

describe.skipIf(!CHROME)("F2: the 1px separator has a canvas-only hit area", () => {
  test("a click 3px above or 4px below the line selects it; 12px away does not", async () => {
    await openPage(b!, placedDocument());
    const r = await show(`[data-node-id="sep"]`);
    expect(r.h).toBe(1);
    for (const dy of [-3, 4]) {
      await clear();
      await click(b!.cdp, r.x + 40, r.y + dy);
      await sleep(40);
      expect(await selected()).toBe("sep");
    }
    await clear();
    await click(b!.cdp, r.x + 40, r.y - 12);
    await sleep(40);
    expect(await selected()).not.toBe("sep");
  });

  test("a vertical separator (1px wide) is clickable from the side too", async () => {
    await openPage(b!, must(setNodeProp(placedDocument(), "sep", "orientation", "vertical")));
    const r = await show(`[data-node-id="sep"]`);
    expect(r.w).toBe(1);
    await clear();
    await click(b!.cdp, r.x - 3, r.y + Math.min(r.h / 2, 20));
    await sleep(40);
    expect(await selected()).toBe("sep");
  });

  test("a press on the hit area (not on the line) starts a drag of the separator node", async () => {
    await openPage(b!, placedDocument());
    const r = await show(`[data-node-id="sep"]`);
    await recordEvents(b!.cdp);
    const ev = await dragFrom(b!.cdp, r.x + 40, r.y - 3);
    expect(ev).toContain("mousedown:sep");
    expect(ev).toContain("dragstart:sep");
  });

  test("the hit area exists ONLY on the canvas: the exported css and html know nothing of it", () => {
    for (const ext of ["css", "html"]) {
      const out = readFileSync(join(FX, `a25-placed.${ext}`), "utf8");
      expect(out).not.toContain("data-cv-hit");
      expect(out).not.toContain("data-a2-canvas");
      expect(out).not.toMatch(/separator[^{]*::?(before|after)/);
      expect(out).not.toContain("top:-4px");
    }
  });
});

const withScroll = (): PageDocument => {
  let d = must(setNodeStyle(placedDocument(), "scroll", "height", 80));
  for (let i = 0; i < 6; i++) {
    const t = { id: `scroll-x${i}`, type: "text", style: {}, props: { type: "text", content: `แถว ${i + 1}` } } as never;
    d = must(insertNode(d, t, "scroll", 1 + i));
  }
  return d;
};

describe.skipIf(!CHROME)("scrollArea on the canvas: the wheel scrolls, a drag still drags the node", () => {
  test("the wheel scrolls it; a drag on a child drags the CHILD and does not scroll; a drag on its own gap drags the scrollArea", async () => {
    await openPage(b!, withScroll());
    const cdp = b!.cdp;
    const sa = await show(`[data-node-id="scroll"]`);
    expect(await cdp.eval(`document.querySelector('[data-node-id="scroll"]').scrollHeight > document.querySelector('[data-node-id="scroll"]').clientHeight`)).toBe(true);
    await cdp.send("Input.dispatchMouseEvent", { type: "mouseWheel", x: sa.x + 100, y: sa.y + 30, deltaX: 0, deltaY: 60 });
    await sleep(150);
    const top = await cdp.eval<number>(`document.querySelector('[data-node-id="scroll"]').scrollTop`);
    expect(top).toBeGreaterThan(0);

    await cdp.eval(`document.querySelector('[data-node-id="scroll"]').scrollTop=0`);
    await recordEvents(cdp);
    const kid = await rectOf(cdp, `[data-node-id="scroll-t"]`);
    const ev = await dragFrom(cdp, kid.x + 8, kid.y + kid.h / 2);
    expect(ev).toContain("dragstart:scroll-t");
    expect(await cdp.eval<number>(`document.querySelector('[data-node-id="scroll"]').scrollTop`)).toBe(0);

    // the 8px gap under the first text belongs to the scrollArea itself
    await cdp.eval(`window.__ev.length=0`);
    const ev2 = await dragFrom(cdp, kid.x + 8, kid.y + kid.h + 4);
    expect(ev2).toContain("dragstart:scroll");
    expect(await cdp.eval<number>(`document.querySelector('[data-node-id="scroll"]').scrollTop`)).toBe(0);
  });
});

/** Child boxes (width, height) of `[data-node-id=id]`'s children on the canvas, and `.cls`'s in the export. */
const BOXES = (sel: string) => `[...document.querySelector(${JSON.stringify(sel)}).children].map(c=>{const r=c.getBoundingClientRect();return [Math.round(r.width*100)/100,Math.round(r.height*100)/100]})`;

describe.skipIf(!CHROME)("F3 / F5: the canvas and the export lay the same document out the same", () => {
  test("a label-less input in a buttonGroup row, and a spacer inside an aspectRatio, measure the same", async () => {
    await openPage(b!, placedDocument());
    const cdp = b!.cdp;
    await show(`[data-node-id="group"]`);
    const groupW = (await rectOf(cdp, `[data-node-id="group"]`)).w;
    const canvas = {
      group: await cdp.eval<number[][]>(BOXES(`[data-node-id="group"]`)),
      ratio: await cdp.eval<number[][]>(BOXES(`[data-node-id="ratio"]`)),
      ratioBox: await cdp.eval<number[]>(`(()=>{const r=document.querySelector('[data-node-id="ratio"]').getBoundingClientRect();return [r.width,r.height]})()`),
    };
    // the same width for the export's page, then read the same boxes there
    const html = readFileSync(join(FX, "a25-placed.html"), "utf8").replace(/[\s\S]*<body>/, "").replace(/<\/body>[\s\S]*/, "");
    const css = readFileSync(join(FX, "a25-placed.css"), "utf8");
    await cdp.eval(`document.body.innerHTML=${JSON.stringify(html)};document.head.insertAdjacentHTML('beforeend','<style>'+${JSON.stringify(css)}+'</style>');document.querySelector('.t-page').style.width='${groupW}px';document.documentElement.style.overflow='hidden'`);
    const exp = {
      group: await cdp.eval<number[][]>(BOXES(`.t-buttonGroup`)),
      ratio: await cdp.eval<number[][]>(BOXES(`.t-aspectRatio`)),
      ratioBox: await cdp.eval<number[]>(`(()=>{const r=document.querySelector('.t-aspectRatio').getBoundingClientRect();return [r.width,r.height]})()`),
    };
    expect(canvas.group.length).toBe(3);
    expect(canvas.group).toEqual(exp.group); // F5
    expect(canvas.ratio).toEqual(exp.ratio); // F3: the spacer keeps its own 32px
    expect(exp.ratio[0][1]).toBe(32);
    expect(canvas.ratioBox[1]).toBeCloseTo(exp.ratioBox[1], 1);
  });
  test("F5: a label-less input with its own width (50%) fills its canvas wrapper, which takes that width (like the export's flex item)", async () => {
    const d = placedDocument();
    const n = d.nodes["group-in"];
    await openPage(b!, { ...d, nodes: { ...d.nodes, "group-in": { ...n, style: { ...n.style, width: "50%" } } } } as typeof d);
    await show(`[data-node-id="group"]`);
    const w = await b!.cdp.eval<number[]>(`(()=>{const g=document.querySelector('[data-node-id="group"]').getBoundingClientRect().width;const wr=document.querySelector('[data-node-id="group-in"]');const i=wr.querySelector('input');return [g, wr.getBoundingClientRect().width, i.getBoundingClientRect().width]})()`);
    expect(w[2]).toBeCloseTo(w[1], 1); // the input is 100% of its wrapper
    expect(w[1]).toBeLessThan(w[0] * 0.75); // and the wrapper carries the 50%
  });
  test("A2.5.1 fix 2: a label-less input FIRST, MIDDLE and LAST in a buttonGroup has the export's corners", async () => {
    const RAD = (sel: string) =>
      `(()=>{const c=getComputedStyle(document.querySelector(${JSON.stringify(sel)}));return [c.borderTopLeftRadius,c.borderTopRightRadius,c.borderBottomRightRadius,c.borderBottomLeftRadius].join(' ')})()`;
    // the export: slot corners by position (the golden has b1 / input / b2; the rule is the same for every kind)
    const html = readFileSync(join(FX, "a25-placed.html"), "utf8").replace(/[\s\S]*<body>/, "").replace(/<\/body>[\s\S]*/, "");
    const css = readFileSync(join(FX, "a25-placed.css"), "utf8");
    await openPage(b!, placedDocument());
    await b!.cdp.eval(`document.body.innerHTML=${JSON.stringify(html)};document.head.insertAdjacentHTML('beforeend','<style>'+${JSON.stringify(css)}+'</style>')`);
    const exp: string[] = [];
    for (let i = 1; i <= 3; i++) exp.push(await b!.cdp.eval<string>(RAD(`.t-buttonGroup > :nth-child(${i})`)));
    expect(exp).toEqual(["8px 0px 0px 8px", "0px 0px 0px 0px", "0px 8px 8px 0px"]);
    const orders = [["group-in", "group-b1", "group-b2"], ["group-b1", "group-in", "group-b2"], ["group-b1", "group-b2", "group-in"]];
    for (let pos = 0; pos < 3; pos++) {
      const d = placedDocument();
      const g = d.nodes.group as typeof d.nodes.group & { props: { children: string[] } };
      const doc = { ...d, nodes: { ...d.nodes, group: { ...g, props: { ...g.props, children: orders[pos] } } } } as typeof d;
      await openPage(b!, doc);
      await show(`[data-node-id="group"]`);
      expect(`${pos}:${await b!.cdp.eval<string>(RAD(`[data-node-id="group-in"] input`))}`).toBe(`${pos}:${exp[pos]}`);
    }
  });
});
