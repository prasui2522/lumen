import { beforeEach, describe, expect, mock, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Phase 11 A2.2: one drop / insert / delete / layout edit inside a card = exactly one
// history step, and one undo restores the previous document object.
const NEST = JSON.parse(
  readFileSync(join(import.meta.dir, "..", "..", "src-tauri/src/fixtures/a2/seed-a2-nest.json"), "utf8"),
);
mock.module("@tauri-apps/api/core", () => ({
  invoke: async (cmd: string) =>
    cmd === "open_project"
      ? { id: "p1", name: "P", createdAt: "t", updatedAt: "t", document: JSON.parse(JSON.stringify(NEST)) }
      : null,
}));
(globalThis as { requestAnimationFrame?: unknown }).requestAnimationFrame ??= (cb: () => void) => setTimeout(cb, 0);

const { useProjectsStore } = await import("../stores/projects-store");
const { useEditorStore } = await import("../stores/editor-store");
const H = await import("./history");
const A = await import("./node-actions");
const D = await import("./document-ops");

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
  expect(ps().openDocument!.nodes).toBe(start!.nodes);
};

const kids = (id: string) => (ps().openDocument!.nodes[id].props as { children: string[] }).children;

describe("A2.2 history: one step, one undo", () => {
  test("drop a heading into a card", () =>
    oneStepThenUndo(() => {
      const next = D.moveNodeInDocument(ps().openDocument!, "hd", "card1", 0)!;
      ps().updateOpenDocument(next);
      expect(kids("card1")[0]).toBe("hd");
    }));

  test("palette insert with a card selected lands inside it", () =>
    oneStepThenUndo(() => {
      ed().setSelectedNodeId("card1");
      expect(A.insertPaletteNode("heading")).toBe(true);
      expect(kids("card1").length).toBe(3);
      expect(ed().selectedNodeId).toBe(kids("card1")[2]);
    }));

  test("palette insert with a badge selected lands after it in its parent, never inside it", () =>
    oneStepThenUndo(() => {
      ed().setSelectedNodeId("badge1");
      expect(A.insertPaletteNode("text")).toBe(true);
      expect(kids("grp")).toHaveLength(3);
      expect(kids("grp")[0]).toBe("badge1");
    }));

  test("delete a card (subtree) and undo restores every node", () => {
    oneStepThenUndo(() => {
      expect(A.deleteNodeAction("card1")).toBe(true);
      expect(ps().openDocument!.nodes["btns"]).toBeUndefined();
    });
    expect(ps().openDocument!.nodes["btns"]).toBeDefined();
  });

  test("keyboard move up / down inside a card (one step each)", () => {
    expect(A.canMoveNode(ps().openDocument!, "txt1", -1)).toBe(true);
    oneStepThenUndo(() => {
      expect(A.moveNodeAction("txt1", -1)).toBe(true);
      expect(kids("card1")).toEqual(["txt1", "alert1"]);
    });
    expect(A.canMoveNode(ps().openDocument!, "alert1", -1)).toBe(false); // first child
  });

  test("layout edit on a card is one step", () =>
    oneStepThenUndo(() => {
      ps().updateOpenDocument(D.setNodeProp(ps().openDocument!, "card1", "gap", 32)!);
    }));
});
