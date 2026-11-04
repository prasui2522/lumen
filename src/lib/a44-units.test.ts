// PHASE-11 A4.4: icon-paths chunk data — count, SVG goldens, notices, entry isolation, size.
import { describe, expect, test } from "bun:test";
import { gzipSync } from "node:zlib";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  FEATHER_DERIVED_ICON_NAMES,
  ICON_NAMES,
  ICON_PATHS,
  IconPathsLazyAnchor,
  iconInnerSvg,
  iconSvgMarkup,
  isIconName,
} from "@/lib/icon-paths";

const ROOT = join(import.meta.dir, "..", "..");
const NOTICES = readFileSync(join(ROOT, "THIRD-PARTY-NOTICES.md"), "utf8");
const ICON_PATHS_SRC = readFileSync(join(ROOT, "src/lib/icon-paths.ts"), "utf8");
const ENTRY_FILES = ["src/main.tsx", "src/App.tsx"].map((p) =>
  readFileSync(join(ROOT, p), "utf8"),
);

/** Minimal well-formedness for the inline SVG we emit (export + canvas). */
function assertValidIconSvg(svg: string, name: string) {
  expect(svg.startsWith("<svg "), `${name}: opens with <svg`).toBe(true);
  expect(svg.endsWith("</svg>"), `${name}: closes </svg>`).toBe(true);
  expect(svg).toContain('viewBox="0 0 24 24"');
  expect(svg).toContain('fill="none"');
  expect(svg).toContain('stroke="currentColor"');
  expect(svg).toContain('stroke-linecap="round"');
  expect(svg).toContain('stroke-linejoin="round"');
  // At least one shape child from Lucide path data.
  expect(
    /<(path|circle|rect|line|polyline|polygon)\s/.test(svg),
    `${name}: has a shape element`,
  ).toBe(true);
  // No unescaped raw `<` inside attribute values (naive but catches generator bugs).
  expect(svg.includes("<<"), `${name}: no <<`).toBe(false);
}

describe("A4.4 icon-paths registry", () => {
  test("curates ≈ 80 icons; every name has path markup", () => {
    expect(ICON_NAMES.length).toBe(80);
    expect(Object.keys(ICON_PATHS).length).toBe(80);
    for (const name of ICON_NAMES) {
      expect(isIconName(name)).toBe(true);
      const inner = iconInnerSvg(name);
      expect(inner, name).toBeTruthy();
      expect(inner!.length).toBeGreaterThan(5);
      expect(ICON_PATHS[name]).toBe(inner!);
    }
    expect(isIconName("not-an-icon")).toBe(false);
    expect(iconInnerSvg("not-an-icon")).toBeUndefined();
  });

  test("each icon golden: valid decorative SVG; labelled gets role=img", () => {
    for (const name of ICON_NAMES) {
      const deco = iconSvgMarkup(name);
      expect(deco, name).toBeTruthy();
      assertValidIconSvg(deco!, name);
      expect(deco).toContain('aria-hidden="true"');
      expect(deco).not.toContain("role=");

      const labelled = iconSvgMarkup(name, { label: "ดาว", size: 32, strokeWidth: 1.5 });
      assertValidIconSvg(labelled!, name);
      expect(labelled).toContain('role="img"');
      expect(labelled).toContain('aria-label="ดาว"');
      expect(labelled).toContain('width="32"');
      expect(labelled).toContain('stroke-width="1.5"');
      expect(labelled).not.toContain("aria-hidden");
    }
  });

  test("Feather-derived subset is listed and ⊂ curated names", () => {
    expect(FEATHER_DERIVED_ICON_NAMES.length).toBeGreaterThan(20);
    for (const name of FEATHER_DERIVED_ICON_NAMES) {
      expect(ICON_NAMES.includes(name), name).toBe(true);
      expect(NOTICES).toContain(name);
    }
  });

  test("THIRD-PARTY-NOTICES.md lists every curated icon + Lucide ISC + Feather MIT", () => {
    expect(NOTICES).toContain("ISC License");
    expect(NOTICES).toContain("Copyright (c) 2026 Lucide Icons and Contributors");
    expect(NOTICES).toContain("The MIT License (MIT)");
    expect(NOTICES).toContain("Copyright (c) 2013-present Cole Bemis");
    expect(NOTICES).toContain("Curated icons (80)");
    for (const name of ICON_NAMES) {
      expect(NOTICES.includes(name), `notices lists ${name}`).toBe(true);
    }
  });

  test("icon-paths payload ≤ 12 kB gz; absent from entry graph", () => {
    const gz = gzipSync(Buffer.from(ICON_PATHS_SRC), { level: 9 });
    expect(gz.byteLength).toBeLessThanOrEqual(12 * 1024);
    expect(gz.byteLength).toBeGreaterThan(2 * 1024);
    for (const src of ENTRY_FILES) {
      expect(src).not.toContain("icon-paths");
      expect(src).not.toContain("ICON_PATHS");
      expect(src).not.toContain("IconPathsLazyAnchor");
    }
    // Anchor exists for lazyNamed wiring (StylePanel / A4.5).
    expect(IconPathsLazyAnchor()).toBeNull();
  });

  test("StylePanel wires lazyNamed import of icon-paths chunk (no whenIdle)", () => {
    const panel = readFileSync(join(ROOT, "src/components/editor/StylePanel.tsx"), "utf8");
    expect(panel).toContain('import("@/components/editor/icon-paths")');
    expect(panel).toContain("IconPathsLazyAnchor");
    expect(panel).toContain("getIconPaths");
    // No idle preload for this chunk (§5).
    expect(panel.includes("whenIdle(() => void IconPaths")).toBe(false);
  });
});
