// PHASE-11 A3.3 in a REAL Chromium: the field form row on the canvas selects, never uses a real <label for>
// (inert; unpaired look is span.t-field-label), shows description / error, and the panel fields write props.
// Skipped, and reported as skipped, ONLY when no headless Chromium is installed.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { Node, PageDocument } from "@/schema";
import { createNode, insertNode } from "@/lib/document-ops";
import { placedDocument } from "@/lib/a25-doc";
import { BODY, CSS, ENTRY } from "@/lib/a25-kinds.test";
import { CHROME, bootBrowser, click, closeBrowser, openPage, press, rectOf, sleep, type Browser } from "@/lib/cdp-kit.test";

let b: Browser | null = null;
beforeAll(async () => {
  if (!CHROME) return;
  b = await bootBrowser(ENTRY, BODY, CSS);
  if (b.bundleError) throw new Error(b.bundleError);
}, 60000);
afterAll(() => closeBrowser(b));

test("reports which browser the A3.3 tests used", () => {
  console.log(CHROME ? `a33: ${CHROME}` : "a33: NO headless Chromium, the behavioural tests are SKIPPED");
});

function doc(): PageDocument {
  let d = placedDocument();
  const add = (n: Node) => {
    const kids = (d.nodes.root.props as { children: string[] }).children;
    const next = insertNode(d, n, "root", kids.length === 0 ? 0 : 1);
    if (!next) throw new Error("insert");
    d = next;
  };
  const empty = { ...createNode("field"), id: "f-empty", props: { type: "field" as const, label: "", children: [] as string[] } };
  const labelled: Node = {
    ...createNode("field"),
    id: "f",
    props: {
      type: "field",
      label: "อีเมล",
      description: "ใช้สำหรับเข้าสู่ระบบ",
      error: "ต้องกรอก",
      children: [],
    },
  };
  add(empty);
  add(labelled);
  // Pairable child on a separate field (canvas still uses span, never <label for>).
  const withInput: Node = { ...createNode("field"), id: "f-in", props: { type: "field", label: "ชื่อ", children: [] } };
  add(withInput);
  const input = { ...createNode("input"), id: "inp" };
  const next = insertNode(d, input, "f-in", 0);
  if (!next) throw new Error("insert input");
  d = next;
  return d;
}

const node = (id: string) => b!.cdp.eval<Node>(`window.__stores.projects.getState().openDocument.nodes[${JSON.stringify(id)}]`);
const selected = () => b!.cdp.eval<string | null>(`window.__stores.editor.getState().selectedNodeId`);
const show = async (sel: string) => {
  await b!.cdp.eval(`document.querySelector(${JSON.stringify(sel)}).scrollIntoView({block:"center"})`);
  await sleep(30);
  return rectOf(b!.cdp, sel);
};

describe.skipIf(!CHROME)("A3.3 field on the canvas", () => {
  test("click on the label span selects the field; never a real <label>", async () => {
    await openPage(b!, doc());
    const tags = await b!.cdp.eval<string>(
      `[...document.querySelectorAll('[data-node-type="field"]')].map(e=>e.tagName+':'+[...e.querySelectorAll('label,span.t-field-label,p.t-field-d,p.t-field-e')].map(x=>x.tagName+'.'+x.className).join('/')).join('|')`,
    );
    expect(tags).not.toContain("LABEL");
    expect(tags).toContain("SPAN.t-field-label");
    expect(tags).toContain("P.t-field-d");
    expect(tags).toContain("P.t-field-e");
    const r = await show(`[data-node-id="f"] .t-field-label`);
    await click(b!.cdp, r.x + 4, r.y + r.h / 2);
    await sleep(60);
    expect(await selected()).toBe("f");
  });

  test("empty label omits the span; description / error text match the props", async () => {
    await openPage(b!, doc());
    expect(await b!.cdp.eval<number>(`document.querySelectorAll('[data-node-id="f-empty"] .t-field-label').length`)).toBe(0);
    expect(await b!.cdp.eval<string>(`document.querySelector('[data-node-id="f"] .t-field-label').textContent`)).toBe("อีเมล");
    expect(await b!.cdp.eval<string>(`document.querySelector('[data-node-id="f"] .t-field-d').textContent`)).toBe("ใช้สำหรับเข้าสู่ระบบ");
    expect(await b!.cdp.eval<string>(`document.querySelector('[data-node-id="f"] .t-field-e').textContent`)).toBe("ต้องกรอก");
  });

  test("shared look: column flex, gap 6, desc muted, error red", async () => {
    await openPage(b!, doc());
    const row = await b!.cdp.eval<string>(
      `(()=>{const c=getComputedStyle(document.querySelector('[data-node-id="f"]'));return [c.display,c.flexDirection,c.rowGap||c.gap].join('|')})()`,
    );
    expect(row).toBe("flex|column|6px");
    expect(await b!.cdp.eval<string>(`getComputedStyle(document.querySelector('[data-node-id="f"] .t-field-d')).color`)).toBe(
      "rgb(100, 116, 139)",
    );
    expect(await b!.cdp.eval<string>(`getComputedStyle(document.querySelector('[data-node-id="f"] .t-field-e')).color`)).toBe(
      "rgb(185, 28, 28)",
    );
  });

  test("a field with an input child still uses span.t-field-label on the canvas", async () => {
    await openPage(b!, doc());
    expect(await b!.cdp.eval<number>(`document.querySelectorAll('[data-node-id="f-in"] label').length`)).toBe(0);
    expect(await b!.cdp.eval<string>(`document.querySelector('[data-node-id="f-in"] .t-field-label').textContent`)).toBe("ชื่อ");
    expect(await b!.cdp.eval<string>(`document.querySelector('[data-node-id="inp"]')?.getAttribute('data-node-type')`)).toBe("input");
  });
});

describe.skipIf(!CHROME)("A3.3 panel fields", () => {
  const open = (sel: string) => openPage(b!, doc(), `window.__SELECT=${JSON.stringify(sel)};`);
  test("ป้ายกำกับ / คำอธิบาย / ข้อผิดพลาด write the props and the canvas follows", async () => {
    await open("f");
    const t = await b!.cdp.eval<string>(`document.getElementById('style').innerText`);
    expect(t).toContain("ป้ายกำกับ");
    expect(t).toContain("คำอธิบาย");
    expect(t).toContain("ข้อผิดพลาด");
    const lb = await rectOf(b!.cdp, "#pf-field-label");
    await click(b!.cdp, lb.x + lb.w / 2, lb.y + lb.h / 2);
    await b!.cdp.eval(`document.getElementById('pf-field-label').select()`);
    await b!.cdp.send("Input.insertText", { text: "เบอร์โทร" });
    await press(b!.cdp, "Enter", "Enter", 13);
    await sleep(80);
    expect(((await node("f")).props as { label: string }).label).toBe("เบอร์โทร");
    expect(await b!.cdp.eval<string>(`document.querySelector('[data-node-id="f"] .t-field-label').textContent`)).toBe("เบอร์โทร");
  });
});
