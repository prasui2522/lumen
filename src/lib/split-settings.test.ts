import { describe, expect, test } from "bun:test";
import {
  SPLIT_DEFAULT,
  clampSplitSize,
  currentSplitSize,
  stepSplitSize,
} from "./split-settings";

describe("S3 split settings", () => {
  test("clamp 20–80, default 50", () => {
    expect(clampSplitSize(50)).toBe(50);
    expect(clampSplitSize(19)).toBe(20);
    expect(clampSplitSize(81)).toBe(80);
    expect(clampSplitSize(Number.NaN)).toBe(SPLIT_DEFAULT);
    expect(clampSplitSize("x")).toBe(SPLIT_DEFAULT);
  });

  test("Arrow ±2, Shift ±10 stay in range", () => {
    expect(stepSplitSize(2, 50)).toBe(52);
    expect(stepSplitSize(-2, 50)).toBe(48);
    expect(stepSplitSize(10, 50)).toBe(60);
    expect(stepSplitSize(-10, 21)).toBe(20);
    expect(stepSplitSize(10, 75)).toBe(80);
  });

  test("current size follows orientation", () => {
    expect(currentSplitSize({ dir: "lr", sizeLr: 40, sizeTb: 70, pane: "code" })).toBe(40);
    expect(currentSplitSize({ dir: "tb", sizeLr: 40, sizeTb: 70, pane: "code" })).toBe(70);
  });
});
