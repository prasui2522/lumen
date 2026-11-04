// A2.5 acceptance in a REAL Chromium: "each kind placeable by click and drag, selectable, restylable, deletable;
// scrollArea keeps the canvas drag working (it scrolls with the wheel, not by drag)". The real LayersPanel (palette),
// DesignCanvas and StylePanel are bundled by `Bun.build` (a25-browser-entry.tsx) and driven with trusted CDP input.
// Skipped, and reported as skipped, ONLY when no headless Chromium is installed.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { A2_KINDS_FOR_TEST, BACKDROP, BODY, CSS, EMPTY, ENTRY } from "@/lib/a25-kinds.test";
import { CHROME, activeDesc, bootBrowser, click, closeBrowser, dragDrop, mouse, openPage, press, rectOf, recordEvents, sleep, type Browser } from "@/lib/cdp-kit.test";

let b: Browser | null = null;
beforeAll(async () => {
  if (!CHROME) return;
  b = await bootBrowser(ENTRY, BODY, CSS);
  if (b.bundleError) throw new Error(b.bundleError);
}, 60000);
afterAll(() => closeBrowser(b));

test("reports which browser the A2.5 behavioural tests used", () => {
  console.log(CHROME ? `a25-browser: ${CHROME}` : "a25-browser: NO headless Chromium, the behavioural tests are SKIPPED");
});

/** The palette tile's box, after scrolling it into view in the (long) panel. */
const tileRect = async (cdp: Browser["cdp"], tile: string) => {
  await cdp.eval(`document.querySelector(${JSON.stringify(`[aria-label="${tile}"]`)}).scrollIntoView({block:"center"})`);
  await sleep(30);
  return rectOf(cdp, `[aria-label="${tile}"]`);
};
const docState = (cdp: Browser["cdp"]) =>
  cdp.eval<{ types: string[]; sel: string | null; active: string }>(
    `(()=>{const s=window.__stores;const d=s.projects.getState().openDocument;const k=d.nodes[d.root].props.children;return {types:k.map(i=>d.nodes[i].type),sel:s.editor.getState().selectedNodeId,active:document.activeElement?document.activeElement.tagName:'null'}})()`,
  );

describe.skipIf(!CHROME)("A2.5 in headless Chromium: palette, canvas, panel", () => {
  for (const k of A2_KINDS_FOR_TEST) {
    test(`${k.type}: tile "${k.tile}" adds it by CLICK (selected, drawn, with a hit area), a click on it selects it, Delete removes it`, async () => {
      await openPage(b!, EMPTY);
      const cdp = b!.cdp;
      const tile = await tileRect(cdp, k.tile);
      await click(cdp, tile.x + tile.w / 2, tile.y + tile.h / 2);
      await sleep(80);
      let st = await docState(cdp);
      expect(st.types).toEqual([k.type]);
      expect(st.sel).not.toBeNull();
      const id = st.sel!;
      // drawn: the node's element exists with a real box (the separator is 1px tall)
      const r = await rectOf(cdp, `[data-node-id="${id}"]`);
      expect(r.w).toBeGreaterThan(0);
      expect(r.h).toBeGreaterThan(0);
      // clear the selection (click the empty canvas backdrop), then select it by clicking ON it
      await click(cdp, BACKDROP.x, BACKDROP.y);
      expect((await docState(cdp)).sel).toBeNull();
      await click(cdp, r.x + r.w / 2, r.y + r.h / 2);
      await sleep(50);
      st = await docState(cdp);
      expect(st.sel).toBe(id);
      // Delete removes it (focus is on the canvas scope after a click on a node)
      await press(cdp, "Delete", "Delete", 46);
      await sleep(80);
      expect((await docState(cdp)).types).toEqual([]);
    }, 30000);

    test(`${k.type}: tile "${k.tile}" adds it by real DRAG and drop on the canvas page`, async () => {
      await openPage(b!, EMPTY);
      const cdp = b!.cdp;
      const tile = await tileRect(cdp, k.tile);
      const page = await rectOf(cdp, `[data-node-id="root"]`);
      const data = await dragDrop(cdp, tile.x + tile.w / 2, tile.y + tile.h / 2, page.x + page.w / 2, page.y + Math.min(page.h - 4, 60));
      expect(data).not.toBeNull();
      await sleep(80);
      const st = await docState(cdp);
      expect(st.types).toEqual([k.type]);
      expect(st.sel).not.toBeNull();
    }, 30000);
  }
});
