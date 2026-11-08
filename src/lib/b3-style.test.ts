/**
 * B3.1 (§9.B / §4.2): backgroundGradient + textGradient — TS goldens, exclusivity, cleanStyle.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";
import { STYLE_KEYS, type StyleProps } from "@/schema";
import { gradientToCss, styleToCss } from "@/lib/style-css";
import { cleanStyle } from "@/lib/breakpoints";

const STYLE_FX = join(import.meta.dir, "../../src-tauri/src/fixtures/style");
const DEFAULTS_RS = readFileSync(join(import.meta.dir, "../../src-tauri/src/defaults.rs"), "utf8");

function camelToSnake(k: string): string {
  return k.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`);
}

function cssFromStyle(style: StyleProps): string {
  const react = styleToCss(style);
  const lines: string[] = [];
  const wantKeys = new Set<string>();
  if (style.backgroundGradient !== undefined) wantKeys.add("backgroundImage");
  if (style.textGradient !== undefined && !gradientToCss(style.backgroundGradient)) {
    wantKeys.add("backgroundImage");
    wantKeys.add("WebkitBackgroundClip");
    wantKeys.add("backgroundClip");
    wantKeys.add("color");
  }
  for (const [k, v] of Object.entries(react)) {
    if (v === undefined || v === null || v === "") continue;
    if (!wantKeys.has(k)) continue;
    const kebab = k
      .replace(/Webkit/g, "-webkit")
      .replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
    lines.push(`${kebab}: ${v};`);
  }
  lines.sort();
  return lines.length ? lines.join("\n") + "\n" : "";
}

describe("B3 STYLE_KEYS parity", () => {
  test("STYLE_KEYS has 27 entries including transform + transition", () => {
    expect(STYLE_KEYS.length).toBe(29);
    expect(STYLE_KEYS).toContain("backgroundGradient");
    expect(STYLE_KEYS).toContain("textGradient");
    const struct = DEFAULTS_RS.slice(
      DEFAULTS_RS.indexOf("pub struct StyleProps {"),
      DEFAULTS_RS.indexOf("\nimpl StyleProps {"),
    );
    const isEmpty = DEFAULTS_RS.slice(
      DEFAULTS_RS.indexOf("pub fn is_empty(&self) -> bool {"),
      DEFAULTS_RS.indexOf("\n}\n\n#[derive(Debug, Clone, Default, Serialize, Deserialize)]\n#[serde(rename_all = \"camelCase\")]\npub struct StyleBreakpoints"),
    );
    const overlay = DEFAULTS_RS.slice(
      DEFAULTS_RS.indexOf("fn overlay_style(base: &mut StyleProps, over: &StyleProps) {"),
      DEFAULTS_RS.indexOf("\n}\n\n/// Merge type defaults", DEFAULTS_RS.indexOf("fn overlay_style")),
    );
    for (const key of ["backgroundGradient", "textGradient"] as const) {
      const snake = camelToSnake(key);
      expect(struct.includes(`pub ${snake}:`), `${key} struct`).toBe(true);
      expect(isEmpty.includes(`self.${snake}`), `${key} is_empty`).toBe(true);
      expect(overlay.includes(`over.${snake}`), `${key} overlay`).toBe(true);
    }
  });
});

describe("B3 gradient goldens (TS ↔ fixtures/style)", () => {
  test.each([
    "grad-linear",
    "grad-radial",
    "grad-conic",
    "grad-text",
    "grad-exclusive",
    "grad-unsorted",
  ] as const)("%s", (name) => {
    const style = JSON.parse(readFileSync(join(STYLE_FX, `${name}.json`), "utf8")) as StyleProps;
    expect(cssFromStyle(style)).toBe(readFileSync(join(STYLE_FX, `${name}.css`), "utf8"));
  });
});

describe("B3 exclusivity + cleanStyle", () => {
  test("background wins; text alone clips", () => {
    expect(
      gradientToCss({
        kind: "linear",
        angle: 90,
        stops: [
          { color: "#0ea5e9", at: 0 },
          { color: "#0369a1", at: 100 },
        ],
      }),
    ).toBe("linear-gradient(90deg, #0ea5e9 0%, #0369a1 100%)");
    const both = styleToCss({
      backgroundGradient: {
        kind: "linear",
        angle: 0,
        stops: [
          { color: "#000", at: 0 },
          { color: "#fff", at: 100 },
        ],
      },
      textGradient: {
        kind: "linear",
        stops: [
          { color: "#f00", at: 0 },
          { color: "#0f0", at: 100 },
        ],
      },
    });
    expect(both.backgroundImage).toContain("#000");
    expect(both.color).not.toBe("transparent");
    expect(both.backgroundClip).toBeUndefined();
  });

  test("cleanStyle drops empty-stop gradients", () => {
    expect(
      cleanStyle({
        backgroundGradient: { kind: "linear", stops: [] },
        color: "#111",
      }),
    ).toEqual({ color: "#111" });
    expect(cleanStyle({ textGradient: { kind: "linear" } })).toBeUndefined();
  });
});
