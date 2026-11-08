/**
 * B9.1 (§9.B): 3D press-down button — TS serializer + save round-trip + sink invariant.
 *
 * Automated: (2) TS style serializer, (3) save → reopen JSON, (4) one style write = one
 * document-ops step (clearing last state key removes the object), (8) desktop-only note.
 * Real-app only: (5) pointer, (6) OS reduced-motion. Rust covers (1) and (7).
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";
import type { Node, PageDocument, StateStyle, StyleProps } from "@/schema";
import { documentForSave } from "@/lib/breakpoints";
import { setNodeStateStyle } from "@/lib/document-ops";
import {
  boxShadowToCss,
  styleToCss,
  transformToCss,
} from "@/lib/style-css";

const FIXTURE = join(
  import.meta.dir,
  "../../src-tauri/src/fixtures/b9/press-button.json",
);

function pressDoc(): PageDocument {
  return JSON.parse(readFileSync(FIXTURE, "utf8")) as PageDocument;
}

function btn(doc: PageDocument): Node {
  return doc.nodes.btn!;
}

/** Sink invariant: translateY(d) + primary hard-shadow y (6−d) keeps the lower edge fixed. */
function sinkInvariant(translateY: number, shadowY: number, baseY = 6): boolean {
  return translateY + shadowY === baseY;
}

describe("B9.1 3D press-button", () => {
  test("(2) TS serializer matches base + state declarations", () => {
    const n = btn(pressDoc());
    const base = styleToCss(n.style as StyleProps);
    expect(base.boxShadow).toBe("0px 6px 0px 0px #0369a1, 0px 10px 12px 0px #00000033");
    expect(base.transitionProperty).toBe(
      "background-color,color,border-color,box-shadow,opacity,transform,filter,backdrop-filter",
    );
    // React camelCase longhands; duration as string with ms from applyTransition.
    expect(String(base.transitionDuration)).toMatch(/120/);
    expect(base.transitionTimingFunction).toBe("ease-out");

    const hover = n.states!.hover as StateStyle;
    expect(hover.backgroundColor).toBe("#38bdf8");
    expect(transformToCss(hover.transform)).toBe("translate(0px, -1px)");

    const active = n.states!.active as StateStyle;
    expect(transformToCss(active.transform)).toBe("translate(0px, 5px)");
    expect(boxShadowToCss(active.boxShadow)).toBe(
      "0px 1px 0px 0px #0369a1, 0px 2px 4px 0px #00000033",
    );
  });

  test("sink invariant translateY(d)+shadowY(6−d)=6", () => {
    expect(sinkInvariant(-1, 7)).toBe(true); // raise: optional; hover keeps base shadow
    expect(sinkInvariant(5, 1)).toBe(true); // active key sink
    expect(sinkInvariant(0, 6)).toBe(true); // rest
    const active = btn(pressDoc()).states!.active!;
    expect(active.transform!.translateY).toBe(5);
    expect(active.boxShadow![0]!.y).toBe(1);
    expect(sinkInvariant(active.transform!.translateY!, active.boxShadow![0]!.y!)).toBe(
      true,
    );
  });

  test("(3) save → reopen identical JSON (states + style)", () => {
    const doc = pressDoc();
    const saved = documentForSave(doc);
    expect(saved.version).toBe(2);
    const again = documentForSave(saved as PageDocument);
    // Key order may differ after clean; values must match.
    expect(again.nodes.btn!.style).toEqual(doc.nodes.btn!.style);
    expect(again.nodes.btn!.states).toEqual(doc.nodes.btn!.states);
  });

  test("(4) clearing last state key removes the object (one write step)", () => {
    let doc = pressDoc();
    // Drop hover keys one by one — last clear removes hover; active remains.
    doc = setNodeStateStyle(doc, "btn", "hover", "backgroundColor", undefined)!;
    doc = setNodeStateStyle(doc, "btn", "hover", "transform", undefined)!;
    expect(doc.nodes.btn!.states?.hover).toBeUndefined();
    expect(doc.nodes.btn!.states?.active).toBeDefined();
    doc = setNodeStateStyle(doc, "btn", "active", "transform", undefined)!;
    doc = setNodeStateStyle(doc, "btn", "active", "boxShadow", undefined)!;
    expect(doc.nodes.btn!.states).toBeUndefined();
  });

  test("(8) unlinked press is documented desktop-only in the Phase 11 spec", () => {
    const spec = readFileSync(
      join(import.meta.dir, "../../docs/PHASE-11-SPEC.md"),
      "utf8",
    );
    expect(spec).toMatch(/unlinked.*desktop only/i);
    expect(spec).toContain("Unlinked buttons export as `<span>`");
  });
});
