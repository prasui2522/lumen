// F2 (Designer pass on P11 F1): D1–D7, Ruling 1 (select / input focus ring), Ruling 2 (Space never scrolls the canvas).
// Interactive behaviour (Tab order, focus return, Space) is also checked in the real WebKitGTK app; these pin the code.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ALERT_DIALOG_DEFAULT_TITLE, createNode, nodeDisplayName } from "./document-ops";
import { isTextField, shouldPreventSpaceScroll, type SpaceTarget } from "./canvas-space";
import looks from "./kind-looks.json";

const SRC = join(import.meta.dir, "..");
const src = (p: string) => readFileSync(join(SRC, p), "utf8");

describe("D1 carousel / table wrappers are not Tab stops", () => {
  test("both scrollable wrappers carry tabIndex={-1}", () => {
    expect(src("components/editor/a5-view.tsx")).toMatch(/tabIndex=\{-1\}/);
    expect(src("components/editor/a4-view.tsx")).toMatch(/tabIndex=\{-1\}/);
    expect(src("components/editor/a5-view.tsx")).not.toMatch(/tabIndex=\{0\}/);
    expect(src("components/editor/a4-view.tsx")).not.toMatch(/tabIndex=\{0\}/);
  });
});

describe("D2 empty carousel placeholder", () => {
  test("no slides → full-width placeholder carrying the canvas EmptyDropHint", () => {
    const a5 = src("components/editor/a5-view.tsx");
    expect(a5).toContain('className="t-carousel__empty"');
    expect(a5).toContain('flex: "1 1 100%"');
    expect(src("components/editor/node-view.tsx")).toMatch(/emptyHint=\{showEmptyHint\(ctx, node\) \? <EmptyDropHint \/> : null\}/);
  });
});

describe("D3 / D4 table dialog", () => {
  test("Escape / ยกเลิก return focus to แก้ไขตาราง; close button reads ปิด", () => {
    const te = src("components/editor/table-editor.tsx");
    expect(te).toContain('closeLabel="ปิด"');
    expect(te).toMatch(/onCloseAutoFocus=\{\(e\) => \{\s*const el = returnFocusRef\?\.current;/);
    // F2.1 d: run the real handler body against a mock ref: it must call el.focus() (and only then preventDefault)
    const body = /onCloseAutoFocus=\{\(e\) => \{([\s\S]*?)\n\s*\}\}/.exec(te)?.[1];
    expect(body).toBeDefined();
    const run = new Function("e", "returnFocusRef", body!) as (e: unknown, r: unknown) => void;
    let focused = 0, prevented = 0;
    run({ preventDefault: () => prevented++ }, { current: { focus: () => focused++ } });
    expect([focused, prevented]).toEqual([1, 1]);
    focused = prevented = 0;
    run({ preventDefault: () => prevented++ }, { current: null });
    expect([focused, prevented]).toEqual([0, 0]);
    expect(te).toContain("preventDefault");
    expect(src("components/editor/StylePanel.tsx")).toContain("returnFocusRef={tableEditBtn}");
    expect(src("components/editor/StylePanel.tsx")).toMatch(/ref=\{tableEditBtn\}/);
    expect(src("components/ui/dialog.tsx")).toContain('<span className="sr-only">{closeLabel}</span>');
  });
});

describe("D5 / Ruling 1 native select and input", () => {
  const sel = (looks as any).kinds.select;
  test("export select border is the muted token (#64748b) with a 2px focus ring", () => {
    expect(sel.extras).toContainEqual(["border", "1px solid {{muted}}"]);
    expect((looks as any).palette.muted).toBe("#64748b");
    expect(sel.css).toEqual([".t-select:focus-visible{outline:2px solid {{focus}};outline-offset:2px}"]);
  });
  test("editor select (phase6b-props) gets the focus-visible ring", () => {
    expect(src("components/editor/phase6b-props.tsx")).toContain("outline-none focus-visible:ring-2 focus-visible:ring-ring");
  });
  test("Vite template: select border #64748b (--muted) and select/input focus ring", () => {
    const css = src("../export-templates/vite-react/src/index.css");
    expect(css).toMatch(/\.wb-select\s*\{[^}]*border:\s*1px solid var\(--muted\)/);
    expect(css).toMatch(/\.wb-select:focus-visible,\s*\.wb-input:focus-visible\s*\{[^}]*outline:\s*2px solid/);
    const rn = src("../export-templates/vite-react/src/lib/render-node.tsx");
    expect(rn).toContain("wb-select");
    expect(rn).toContain("wb-input");
  });
});

describe("D6 row editors have row-numbered aria-labels", () => {
  test("p6-mb-* / p6-href-* / p6-lt-* fields", () => {
    const p6 = src("components/editor/phase6b-props.tsx");
    for (const l of ["ป้ายกำกับ แถว ${i + 1}", "ข้อความ แถว ${i + 1}", "ลิงก์ แถว ${i + 1}", "ชื่อเมนู ${i + 1}", "ป้ายกำกับ เมนู ${i + 1} แถว ${j + 1}", "ลิงก์ เมนู ${i + 1} แถว ${j + 1}"])
      expect(p6).toContain(`ariaLabel={\`${l}\`}`);
    // F2.1 d: both row editors (p6-mb-* and p6-href-*) carry their own 'ป้ายกำกับ แถว N'
    expect(p6.split("ariaLabel={`ป้ายกำกับ แถว ${i + 1}`}").length - 1).toBe(2);
    expect(src("components/editor/style/TextPropField.tsx")).toContain("aria-label={ariaLabel}");
    expect(src("components/editor/style/HrefField.tsx")).toContain("aria-label={ariaLabel}");
  });
});

describe("D7 new Alert Dialog is 'Alert Dialog' in Layers (no stored name)", () => {
  test("default title → type label; edited title → title; nothing stored in name", () => {
    const n = createNode("alertDialog");
    expect(n.name).toBeUndefined();
    expect((n.props as any).title).toBe(ALERT_DIALOG_DEFAULT_TITLE);
    expect(nodeDisplayName(n)).toBe("Alert Dialog");
    const edited = { ...n, props: { ...(n.props as any), title: "ลบโปรเจกต์?" } } as typeof n;
    expect(nodeDisplayName(edited)).toBe("ลบโปรเจกต์?");
  });
});

describe("Ruling 2 Space never scrolls the canvas", () => {
  const canvas: SpaceTarget = { tagName: "DIV", dataset: { kbdScope: "canvas" }, closest: () => null };
  const node: SpaceTarget = { tagName: "DIV", dataset: {}, closest: (s) => (s.includes("canvas") ? {} : null) };
  const outside: SpaceTarget = { tagName: "BUTTON", dataset: {}, closest: () => null };
  const sp = { key: " " };
  test("canvas scope and a selected node inside it → preventDefault", () => {
    expect(shouldPreventSpaceScroll(sp, canvas)).toBe(true);
    expect(shouldPreventSpaceScroll(sp, node)).toBe(true);
  });
  test("text fields, outside controls, other keys and modifiers are untouched", () => {
    expect(shouldPreventSpaceScroll(sp, { ...node, tagName: "INPUT", type: "text" })).toBe(false);
    expect(shouldPreventSpaceScroll(sp, { ...node, tagName: "TEXTAREA" })).toBe(false);
    expect(shouldPreventSpaceScroll(sp, { ...node, isContentEditable: true })).toBe(false);
    expect(shouldPreventSpaceScroll(sp, outside)).toBe(false);
    expect(shouldPreventSpaceScroll(sp, null)).toBe(false);
    expect(shouldPreventSpaceScroll({ key: "Enter" }, canvas)).toBe(false);
    expect(shouldPreventSpaceScroll({ key: " ", ctrlKey: true }, canvas)).toBe(false);
    expect(shouldPreventSpaceScroll({ key: " ", defaultPrevented: true }, canvas)).toBe(false);
    expect(isTextField({ tagName: "INPUT", type: "checkbox" })).toBe(false);
  });
  test("DesignCanvas calls the helper before the shortcut scope check", () => {
    const dc = src("components/editor/DesignCanvas.tsx");
    const i = dc.indexOf("shouldPreventSpaceScroll(e,");
    expect(i).toBeGreaterThan(0);
    expect(i).toBeLessThan(dc.indexOf("const scopeEl = isCanvasShortcutFocus();"));
  });
});
