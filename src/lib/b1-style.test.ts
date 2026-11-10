/**
 * B1 (§9.B / §4.2 / §4.5): css_color + boxShadow plumbing — TS side goldens, parity, cleanStyle trap.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { STYLE_KEYS, type StyleProps } from "@/schema";
import { boxShadowToCss, cssColor, styleToCss } from "@/lib/style-css";
import { cleanBreakpoints, cleanStyle } from "@/lib/breakpoints";

const STYLE_FX = join(import.meta.dir, "../../src-tauri/src/fixtures/style");
const DEFAULTS_RS = readFileSync(join(import.meta.dir, "../../src-tauri/src/defaults.rs"), "utf8");

function camelToSnake(k: string): string {
  return k.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`);
}

/** Map styleToCss output → "prop: value;\n" sorted (mirror Rust decls_css). */
function cssFromStyle(style: StyleProps): string {
  const react = styleToCss(style);
  const lines: string[] = [];
  for (const [k, v] of Object.entries(react)) {
    if (v === undefined || v === null || v === "") continue;
    // A2: canvas-only custom properties (`--wb-glass-solid`, read by index.css `.wb-glass`) are not export
    // declarations; the shared goldens are the Rust `decls_css` output. Checked on their own in b6-style.
    if (k.startsWith("--")) continue;
    // styleToCss always sets borderColor to currentColor; goldens are shadow-only → skip defaults that
    // the node did not set. Only emit keys present on the input style (plus boxShadow when produced).
    const inputHad =
      k === "boxShadow"
        ? style.boxShadow !== undefined
        : (style as Record<string, unknown>)[k] !== undefined;
    if (!inputHad && k === "borderColor") continue;
    const kebab = k.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
    lines.push(`${kebab}: ${v};`);
  }
  lines.sort();
  return lines.length ? lines.join("\n") + "\n" : "";
}

describe("B1 STYLE_KEYS parity (§4.5.1)", () => {
  test("STYLE_KEYS matches schema StyleProps and defaults.rs struct/is_empty/overlay_style", () => {
    expect(STYLE_KEYS.length).toBe(31);
    expect(STYLE_KEYS).toContain("boxShadow");
    expect(STYLE_KEYS).toContain("backgroundGradient");
    expect(STYLE_KEYS).toContain("textGradient");

    // struct body
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

    for (const key of STYLE_KEYS) {
      const snake = camelToSnake(key);
      expect(struct.includes(`pub ${snake}:`), `${key} missing in struct`).toBe(true);
      expect(isEmpty.includes(`self.${snake}`), `${key} missing in is_empty`).toBe(true);
      expect(overlay.includes(`over.${snake}`), `${key} missing in overlay_style`).toBe(true);
    }
  });
});

describe("B1 cssColor", () => {
  test("accepts hex3/4/6/8 and keywords", () => {
    expect(cssColor("#abc")).toBe("#abc");
    expect(cssColor("#AABBCCDD")).toBe("#aabbccdd");
    expect(cssColor(" TRANSPARENT ")).toBe("transparent");
    expect(cssColor("CurrentColor")).toBe("currentColor");
  });
  test("rejects hostile", () => {
    for (const bad of ["url(x)", "red", "#gg", "}", "#ab}", "rgb(0,0,0)", ""]) {
      expect(cssColor(bad)).toBeUndefined();
    }
  });
});

describe("B1 style goldens (TS ↔ fixtures/style)", () => {
  const names = readdirSync(STYLE_FX)
    .filter((f) => f.endsWith(".json") && !f.startsWith("round-trip"))
    .map((f) => f.replace(/\.json$/, ""));

  for (const name of names) {
    test(name, () => {
      const style = JSON.parse(readFileSync(join(STYLE_FX, `${name}.json`), "utf8")) as StyleProps;
      const want = readFileSync(join(STYLE_FX, `${name}.css`), "utf8");
      expect(cssFromStyle(style)).toBe(want);
    });
  }
});

describe("B1 boxShadow hostile (TS)", () => {
  test("NaN / huge / url( / } / 100 layers → clamped or dropped", () => {
    const layers = [
      { x: NaN, y: 1e12, blur: -50, spread: 999, color: "#112233" },
      { x: 1, y: 1, blur: 1, spread: 1, color: "url(https://evil.test/x.png)" },
      { x: 1, y: 1, blur: 1, spread: 1, color: "#ab}" },
      ...Array.from({ length: 100 }, (_, i) => ({
        x: i,
        y: 0,
        blur: 0,
        spread: 0,
        color: `#${i.toString(16).padStart(2, "0")}0000`,
      })),
    ];
    const css = boxShadowToCss(layers)!;
    expect(css.startsWith("0px 200px 0px 100px #112233")).toBe(true);
    expect(css.includes("url(")).toBe(false);
    expect(css.includes("}")).toBe(false);
    expect(css.split(",").length).toBeLessThanOrEqual(6);
  });
});

describe("B1 cleanStyle empty-array + breakpoint-only shadow", () => {
  test("boxShadow [] is dropped (≡ unset)", () => {
    expect(cleanStyle({ boxShadow: [] })).toBeUndefined();
    expect(cleanStyle({ boxShadow: [], opacity: 1 })).toEqual({ opacity: 1 });
  });

  test("breakpoint holding only boxShadow survives cleanBreakpoints (is_empty trap)", () => {
    const map = cleanBreakpoints({
      phone: {
        boxShadow: [{ x: 0, y: 4, blur: 8, spread: 0, color: "#00000080" }],
      },
    });
    expect(map).toBeDefined();
    expect(map!.phone?.boxShadow?.length).toBe(1);
  });
});
