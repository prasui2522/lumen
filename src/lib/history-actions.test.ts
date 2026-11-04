import { beforeEach, describe, expect, mock, test } from "bun:test";

// Each user action = exactly 1 page-history step, and 1 undo restores it
// (dirty cleared when it returns to the saved state).
mock.module("@tauri-apps/api/core", () => ({
  invoke: async (cmd: string) => {
    if (cmd === "open_project")
      return {
        id: "p1", name: "P", createdAt: "t", updatedAt: "t",
        document: {
          version: 1, meta: { title: "P" }, root: "r",
          nodes: {
            r: { id: "r", type: "page", props: { type: "page", children: ["h"] }, style: {} },
            h: { id: "h", type: "heading", props: { type: "heading", text: "A", level: 1 }, style: {} },
          },
        },
      };
    return null;
  },
}));
(globalThis as { requestAnimationFrame?: unknown }).requestAnimationFrame ??= (cb: () => void) => setTimeout(cb, 0);

const { useProjectsStore } = await import("../stores/projects-store");
const { useEditorStore } = await import("../stores/editor-store");
const H = await import("./history");
const P = await import("./project-pages");
const A = await import("./node-actions");
const { emptiedBackToUnset } = await import("../components/editor/style/number-draft");
const { PAGES } = await import("./pages");
const { TEMPLATES } = await import("./templates");
const { BLOCKS } = await import("./blocks");

const ps = () => useProjectsStore.getState();
const ed = () => useEditorStore.getState();
let start: ReturnType<typeof ps>["openDocument"];

beforeEach(async () => {
  ps().closeOpen();
  await ps().openProject("p1");
  ed().clearHistory();
  ed().setSelectedNodeId(null);
  start = ps().openDocument;
});

const oneStepThenUndo = (act: () => void) => {
  act();
  expect(ed().past.length).toBe(1);
  expect(ps().dirty).toBe(true);
  expect(H.undo()).toBe(true);
  expect(ps().dirty).toBe(false);
  const d = ps().openDocument!;
  expect(P.isProjectDirty(d, start!)).toBe(false);
  expect(d.nodes).toBe(start!.nodes);
};

/** Palette เพิ่มหน้า / PagesPanel + (same writes). */
const addPage = () => {
  const d = ps().openDocument!;
  const cur = ed().openPageId ?? P.openPageIdOf(d);
  const { doc: next, pageId } = P.addPage(P.ensurePages(d), cur);
  ed().setOpenPageId(pageId);
  ps().updateOpenDocument(next);
  return pageId;
};

describe("NumberField: originally EMPTY value (กว้าง)", () => {
  test("decision helper", () => {
    expect(emptiedBackToUnset(undefined, "")).toBe(true);
    expect(emptiedBackToUnset(undefined, "  ")).toBe(true);
    expect(emptiedBackToUnset(undefined, "1")).toBe(false);
    expect(emptiedBackToUnset(16, "")).toBe(false);
  });
  test("1 → 12 → 123 → empty (native undo) → Tab: 0 steps, document back, not dirty", () => {
    const g = H.beginHistoryGroup();
    for (const w of [1, 12, 123]) {
      const d = ps().openDocument!;
      ps().updateOpenDocument({ ...d, nodes: { ...d.nodes, h: { ...d.nodes.h!, style: { width: w } } as never } });
    }
    expect(ed().past.length).toBe(1);
    // What NumberField now does when the text is empty again and start was unset:
    H.revertHistoryGroup(g);
    H.endHistoryGroup(g); // blur / Tab
    expect(ed().past.length).toBe(0);
    expect(ps().openDocument!.nodes).toBe(start!.nodes);
    expect(ps().dirty).toBe(false);
  });
});

describe("page actions: exactly 1 step, 1 undo restores", () => {
  test("palette เพิ่มหน้า / PagesPanel +", () => oneStepThenUndo(() => void addPage()));
  test("เพิ่มหน้า then the rename popover submitted unchanged: still 1 step", () =>
    oneStepThenUndo(() => {
      const id = addPage();
      const d = ps().openDocument!;
      const same = d.pages!.find((p) => p.id === id)!.name;
      ps().updateOpenDocument(P.renamePage(d, id, same)!);
    }));
  test("เพิ่มหน้า while a number field's session is open (focus in กว้าง): 1 step", () =>
    oneStepThenUndo(() => {
      const g = H.beginHistoryGroup();
      addPage();
      H.endHistoryGroup(g);
    }));
  test("Pages > Login (insertPage)", () => oneStepThenUndo(() => expect(A.insertPage(PAGES[0]!.id)).toBe(true)));
  test("template insert", () => oneStepThenUndo(() => expect(A.insertTemplate(TEMPLATES[0]!.id)).toBe(true)));
  test("block insert", () => oneStepThenUndo(() => expect(A.insertBlock(BLOCKS[0]!.id)).toBe(true)));
  test("palette element insert", () => oneStepThenUndo(() => expect(A.insertPaletteNode("text" as never)).toBe(true)));
  test("delete element", () => oneStepThenUndo(() => expect(A.deleteNodeAction("h")).toBe(true)));
  test("move element (layer menu เลื่อนลง after an insert)", () => {
    A.insertPaletteNode("text" as never);
    ed().clearHistory();
    ps().saveOpenProject?.();
    const before = ps().openDocument!;
    expect(A.moveNodeAction("h", 1)).toBe(true);
    expect(ed().past.length).toBe(1);
    H.undo();
    expect(ps().openDocument!.nodes).toBe(before.nodes);
  });
  test("no-op write records nothing", () => {
    ps().updateOpenDocument({ ...ps().openDocument! });
    expect(ed().past.length).toBe(0);
    expect(ps().dirty).toBe(false);
  });
});
