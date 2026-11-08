/**
 * Phase 11 E1: Node.motion data model + cleanMotion / setNodeMotion.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanMotion, documentForSave } from "@/lib/breakpoints";
import { setNodeMotion } from "@/lib/document-ops";
import type { NodeMotion, PageDocument } from "@/schema";

const ROOT = join(import.meta.dir, "..", "..");

function doc(): PageDocument {
  return {
    version: 1,
    meta: { title: "e1" },
    root: "page",
    nodes: {
      page: {
        id: "page",
        type: "page",
        props: { type: "page", children: ["n1"] },
        style: {},
      },
      n1: {
        id: "n1",
        type: "heading",
        props: { type: "heading", level: 2, content: "Hi" },
        style: {},
      },
    },
  };
}

const entrance: NodeMotion = {
  entrance: {
    preset: "fade",
    trigger: "load",
    durationMs: 300,
    delayMs: 0,
    easing: "ease-out",
  },
};

describe("E1 cleanMotion", () => {
  test("keeps valid entrance; clamps duration/delay", () => {
    const cleaned = cleanMotion({
      entrance: {
        preset: "slideUp",
        trigger: "view",
        durationMs: 9999,
        delayMs: -5,
        easing: "ease-in",
      },
    })!;
    expect(cleaned.entrance!.durationMs).toBe(2000);
    expect(cleaned.entrance!.delayMs).toBe(0);
    expect(cleaned.entrance!.preset).toBe("slideUp");
  });

  test("drops unknown preset / empty", () => {
    expect(
      cleanMotion({
        entrance: {
          preset: "bounce" as "fade",
          trigger: "load",
          durationMs: 200,
          delayMs: 0,
          easing: "ease",
        },
      }),
    ).toBeUndefined();
    expect(cleanMotion({})).toBeUndefined();
    expect(cleanMotion(undefined)).toBeUndefined();
  });

  test("unknown easing falls back to ease-out", () => {
    const cleaned = cleanMotion({
      entrance: {
        preset: "fade",
        trigger: "load",
        durationMs: 200,
        delayMs: 0,
        easing: "steps(2)" as "ease",
      },
    })!;
    expect(cleaned.entrance!.easing).toBe("ease-out");
  });
});

describe("E1 setNodeMotion / save tier", () => {
  test("writes motion; locked refuses; clear removes", () => {
    const a = setNodeMotion(doc(), "n1", entrance)!;
    expect(a.nodes.n1!.motion).toEqual(entrance);
    const locked = doc();
    locked.nodes.n1!.locked = true;
    expect(setNodeMotion(locked, "n1", entrance)).toBeNull();
    const cleared = setNodeMotion(a, "n1", undefined)!;
    expect(cleared.nodes.n1!.motion).toBeUndefined();
  });

  test("documentForSave bumps to version 2 when motion present", () => {
    const withMotion = setNodeMotion(doc(), "n1", entrance)!;
    const saved = documentForSave(withMotion);
    expect(saved.version).toBe(2);
    expect(saved.nodes.n1!.motion?.entrance?.preset).toBe("fade");
  });
});

describe("E1 Rust/TS parity surface", () => {
  test("defaults.rs declares NodeMotion + motion field", () => {
    const rs = readFileSync(join(ROOT, "src-tauri/src/defaults.rs"), "utf8");
    expect(rs).toContain("pub struct NodeMotion");
    expect(rs).toContain("pub struct MotionEntrance");
    expect(rs).toContain("pub motion: Option<NodeMotion>");
  });
});
