/**
 * B7.3 (§9.B): canvas force-display merge + transition:none.
 */
import { describe, expect, test } from "bun:test";
import { styleToCss } from "@/lib/style-css";
import {
  mergeForceState,
  shouldForceDisplayState,
} from "@/lib/force-state";
import type { StyleProps } from "@/schema";

describe("B7.3 mergeForceState", () => {
  const base: StyleProps = {
    backgroundColor: "#0ea5e9",
    color: "#ffffff",
    padding: 10,
    transition: {
      durationMs: 120,
      easing: "ease-out",
      property: "paint",
    },
  };

  test("merges paint keys only; keeps layout; drops transition", () => {
    const out = mergeForceState(base, {
      hover: {
        backgroundColor: "#38bdf8",
        transform: { translateY: -1 },
      },
    }, "hover");
    expect(out.backgroundColor).toBe("#38bdf8");
    expect(out.color).toBe("#ffffff");
    expect(out.padding).toBe(10);
    expect(out.transform).toEqual({ translateY: -1 });
    expect(out.transition).toBeUndefined();
  });

  test("null / missing state restores base identity", () => {
    expect(mergeForceState(base, undefined, "hover")).toBe(base);
    expect(mergeForceState(base, { hover: { color: "#000" } }, null)).toBe(base);
    expect(mergeForceState(base, { active: { opacity: 0.5 } }, "hover")).toBe(base);
  });

  test("neighbours unaffected: only selected id force-displays", () => {
    expect(shouldForceDisplayState("n1", "n1", "hover")).toBe(true);
    expect(shouldForceDisplayState("n1", "n2", "hover")).toBe(false);
    expect(shouldForceDisplayState(null, "n1", "hover")).toBe(false);
    expect(shouldForceDisplayState("n1", "n1", null)).toBe(false);
  });

  test("styleToCss emits transition:none when extra last", () => {
    const merged = mergeForceState(base, {
      hover: { backgroundColor: "#38bdf8" },
    }, "hover");
    const css = styleToCss(merged, { transition: "none" });
    expect(css.backgroundColor).toBe("#38bdf8");
    expect(css.transition).toBe("none");
    expect(css.transitionProperty).toBeUndefined();
  });

  test("switching back to normal equals base look", () => {
    const forced = mergeForceState(base, {
      active: {
        backgroundColor: "#0284c7",
        boxShadow: [{ x: 0, y: 1, blur: 0, spread: 0, color: "#0369a1" }],
      },
    }, "active");
    expect(forced.backgroundColor).toBe("#0284c7");
    const restored = mergeForceState(base, {
      active: { backgroundColor: "#0284c7" },
    }, null);
    expect(restored).toBe(base);
    expect(styleToCss(restored).backgroundColor).toBe("#0ea5e9");
  });
});
