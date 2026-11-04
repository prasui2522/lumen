// A2.5 Style panel in a REAL Chromium: the A2 kinds' fields write the document, the Thai strings are there (T10 T11 T12
// T73 T74), and N7: the overflow segment shows "เลื่อน" selected for a stored `auto` AND `scroll`.
// Skipped, and reported as skipped, ONLY when no headless Chromium is installed.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { Node, PageDocument } from "@/schema";
import { placedDocument } from "@/lib/a25-doc";
import { A2_KINDS_FOR_TEST, BODY, CSS, ENTRY } from "@/lib/a25-kinds.test";
import { CHROME, bootBrowser, click, closeBrowser, openPage, press, rectOf, sleep, type Browser } from "@/lib/cdp-kit.test";

let b: Browser | null = null;
beforeAll(async () => {
  if (!CHROME) return;
  b = await bootBrowser(ENTRY, BODY, CSS);
  if (b.bundleError) throw new Error(b.bundleError);
}, 60000);
afterAll(() => closeBrowser(b));

test("reports which browser the A2.5 panel tests used", () => {
  console.log(CHROME ? `a25-panel: ${CHROME}` : "a25-panel: NO headless Chromium, the behavioural tests are SKIPPED");
});

const open = (doc: PageDocument, sel: string) => openPage(b!, doc, `window.__SELECT=${JSON.stringify(sel)};`);
const node = (id: string) => b!.cdp.eval<Node>(`window.__stores.projects.getState().openDocument.nodes[${JSON.stringify(id)}]`);
const panelText = () => b!.cdp.eval<string>(`document.getElementById('style').innerText`);
const withStyle = (id: string, style: object): PageDocument => {
  const d = placedDocument();
  return { ...d, nodes: { ...d.nodes, [id]: { ...d.nodes[id], style } } };
};
/** Click the segmented item `label` inside `#groupId` (a real click on its real box). */
async function pick(groupId: string, label: string) {
  const sel = `#${groupId} [role=radio][title="${label}"], #${groupId} [role=radio][aria-label="${label}"]`;
  const r = await rectOf(b!.cdp, sel);
  await click(b!.cdp, r.x + r.w / 2, r.y + r.h / 2);
  await sleep(60);
}
const checked = (groupId: string) =>
  b!.cdp.eval<string>(`(()=>{const e=document.querySelector('#${groupId} [role=radio][aria-checked=true]');return e?(e.getAttribute('aria-label')||e.title||e.textContent):'none'})()`);
async function typeInto(id: string, text: string) {
  const r = await rectOf(b!.cdp, `#${id}`);
  await click(b!.cdp, r.x + r.w / 2, r.y + r.h / 2);
  await b!.cdp.send("Input.insertText", { text });
  await press(b!.cdp, "Enter", "Enter", 13);
  await sleep(80);
}

describe.skipIf(!CHROME)("A2.5 panel fields (real clicks and typing)", () => {
  test("every A2 kind opens a panel with its name and the common sections", async () => {
    for (const k of A2_KINDS_FOR_TEST) {
      await open(placedDocument(), k.type === "separator" ? "sep" : k.type === "skeleton" ? "skel" : k.type === "spinner" ? "spin" : k.type === "aspectRatio" ? "ratio" : k.type === "scrollArea" ? "scroll" : k.type === "buttonGroup" ? "group" : k.type);
      const t = await panelText();
      expect(t).toContain("องค์ประกอบ");
      expect(t).toContain(k.type === "buttonGroup" ? "Button Group" : k.type === "aspectRatio" ? "Aspect Ratio" : k.type === "scrollArea" ? "Scroll Area" : k.tile.replace("เพิ่ม", ""));
    }
  });

  test("aspectRatio: อัตราส่วน (T10) is a select; choosing 4:3 writes the ratio and the canvas box follows", async () => {
    await open(placedDocument(), "ratio");
    expect(await panelText()).toContain("อัตราส่วน");
    const trig = await rectOf(b!.cdp, "#pf-ratio");
    await click(b!.cdp, trig.x + trig.w / 2, trig.y + trig.h / 2);
    await sleep(120);
    const opt = await b!.cdp.eval<{ x: number; y: number } | null>(`(()=>{const o=[...document.querySelectorAll('[role=option]')].find(e=>e.textContent.trim()==='4:3');if(!o)return null;const r=o.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
    expect(opt).not.toBeNull();
    await click(b!.cdp, opt!.x, opt!.y);
    await sleep(120);
    expect((await node("ratio")).props).toMatchObject({ type: "aspectRatio", ratio: "4/3" });
    const box = await rectOf(b!.cdp, `[data-node-id="ratio"]`);
    expect(box.w / box.h).toBeCloseTo(4 / 3, 1);
  });

  test("spinner: the accessible-name field (T11) names the node and the canvas spinner's aria-label", async () => {
    await open(placedDocument(), "spin");
    const t = await panelText();
    expect(t).toContain("ชื่อสำหรับโปรแกรมอ่านหน้าจอ");
    expect(t).toContain("ขนาด");
    expect(await b!.cdp.eval(`document.querySelector('[data-node-id="spin"]').getAttribute('aria-label')`)).toBe("กำลังโหลด");
    await typeInto("pf-spinner-name", "กำลังบันทึก");
    expect((await node("spin")).name).toBe("กำลังบันทึก");
    expect(await b!.cdp.eval(`document.querySelector('[data-node-id="spin"]').getAttribute('aria-label')`)).toBe("กำลังบันทึก");
  });

  test("scrollArea: แนวเลื่อน offers แนวตั้ง / แนวนอน (T74 / T73) / ทั้งสองแนว (T12); T11 writes props.label", async () => {
    await open(placedDocument(), "scroll");
    expect(await checked("pf-scroll-orientation")).toBe("แนวตั้ง");
    await pick("pf-scroll-orientation", "ทั้งสองแนว");
    expect((await node("scroll")).props).toMatchObject({ orientation: "both" });
    expect(await checked("pf-scroll-orientation")).toBe("ทั้งสองแนว");
    await pick("pf-scroll-orientation", "แนวนอน");
    expect((await node("scroll")).props).toMatchObject({ orientation: "horizontal" });
    expect(await b!.cdp.eval(`(()=>{const e=document.getElementById('pf-scroll-label');return e&&e.tagName==='INPUT'?[...(e.labels||[])].map(l=>l.textContent).join('|')+'#'+(e.getAttribute('aria-labelledby')||''):'none'})()`)).toBe("ชื่อสำหรับโปรแกรมอ่านหน้าจอ#") // T11 is the input's own <label for>;
    await typeInto("pf-scroll-label", "รายการสินค้า");
    expect((await node("scroll")).props).toMatchObject({ label: "รายการสินค้า" });
    expect(await b!.cdp.eval(`document.querySelector('[data-node-id="scroll"]').getAttribute('aria-label')`)).toBe("รายการสินค้า");
  });

  test("A2.5.1 fix 1: cycling แนวเลื่อน keeps the canvas scrollArea scrolling (computed overflow after every step)", async () => {
    await open(placedDocument(), "scroll");
    const ov = () =>
      b!.cdp.eval<string>(`(()=>{const e=document.querySelector('[data-node-id="scroll"]');const c=getComputedStyle(e);return c.overflowX+'/'+c.overflowY})()`);
    expect(await ov()).toBe("hidden/auto"); // stored แนวตั้ง
    const steps: [string, string][] = [
      ["ทั้งสองแนว", "auto/auto"], ["แนวนอน", "auto/hidden"], ["แนวตั้ง", "hidden/auto"], ["ทั้งสองแนว", "auto/auto"],
      ["แนวตั้ง", "hidden/auto"], ["แนวนอน", "auto/hidden"], ["ทั้งสองแนว", "auto/auto"],
    ];
    for (const [label, want] of steps) {
      await pick("pf-scroll-orientation", label);
      expect(`${label}:${await ov()}`).toBe(`${label}:${want}`);
    }
    // the canvas element never carries the shorthand next to the longhands
    expect(await b!.cdp.eval<string>(`document.querySelector('[data-node-id="scroll"]').style.overflow`)).toMatch(/^(auto|auto auto)?$/);
  });

  test("separator: orientation uses แนวนอน / แนวตั้ง (T73 / T74)", async () => {
    await open(placedDocument(), "sep");
    expect(await checked("pf-orientation")).toBe("แนวนอน");
    await pick("pf-orientation", "แนวตั้ง");
    expect((await node("sep")).props).toMatchObject({ orientation: "vertical" });
  });

  test("badge: the label is a panel field", async () => {
    await open(placedDocument(), "badge");
    const r = await rectOf(b!.cdp, "#pf-badge-label");
    await click(b!.cdp, r.x + r.w / 2, r.y + r.h / 2);
    await b!.cdp.send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "a", code: "KeyA", windowsVirtualKeyCode: 65, modifiers: 2 });
    await b!.cdp.send("Input.insertText", { text: "ใหม่" });
    await press(b!.cdp, "Enter", "Enter", 13);
    await sleep(80);
    expect((await node("badge")).props).toMatchObject({ type: "badge", label: "ใหม่" });
    expect(await b!.cdp.eval(`document.querySelector('[data-node-id="badge"]').textContent`)).toBe("ใหม่");
  });

  // N7: "เลื่อน" is the segment that stores `auto`; a stored `scroll` must read as the same segment
  for (const [stored, shown] of [["auto", "เลื่อน"], ["scroll", "เลื่อน"], ["hidden", "ซ่อน"], ["visible", "แสดง"]] as const) {
    test(`N7: a card with stored overflow "${stored}" shows the "${shown}" segment as selected`, async () => {
      await open(withStyle("card", { overflow: stored }), "card");
      const label = await checked("sf-overflow");
      expect(label).toBe(shown);
    });
  }

  test("N7: a stored `scroll` is not rewritten just by selecting the node (the panel only reads it)", async () => {
    await open(withStyle("card", { overflow: "scroll" }), "card");
    expect((await node("card")).style).toMatchObject({ overflow: "scroll" });
  });
});
