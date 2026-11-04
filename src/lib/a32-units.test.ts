// PHASE-11 A3.2: the switch restyle, unit level (shared look, contrast, document ops, canvas SSR, golden parity).
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { Node } from "@/schema";
import { isA3Type, isVersion4Kind } from "@/schema";
import { createNode, nodeDisplayName, setNodeProp } from "@/lib/document-ops";
import { KIND_LOOKS } from "@/lib/kind-looks";
import { A3_LOOKS, A3_STYLESHEET } from "@/lib/a3-looks";
import { SwitchView } from "@/components/editor/a3-view";

const FX = join(import.meta.dir, "..", "..", "src-tauri", "src", "fixtures", "a3");
const GOLDEN_CSS = readFileSync(join(FX, "a32-switch.css"), "utf8");
const OLD = JSON.parse(readFileSync(join(FX, "a32-switch.json"), "utf8"));

const lum = (hex: string) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const ratio = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

describe("A3.2 switch look (shared with the compiler)", () => {
  test("switch lives in a3.kinds, not the A1 table; it stays a version-3 kind", () => {
    expect(A3_LOOKS.switch).toBeDefined();
    expect(KIND_LOOKS.switch).toBeUndefined();
    expect(isA3Type("switch")).toBe(false);
    expect(isVersion4Kind("switch")).toBe(false);
    expect(A3_LOOKS.switch.extras).toEqual([["align-items", "center"], ["gap", "8px"], ["position", "relative"]]);
  });

  test("the canvas stylesheet is byte-for-byte the export's switch rules (Rust golden)", () => {
    expect(A3_LOOKS.switch.css.length).toBeGreaterThan(500);
    expect(GOLDEN_CSS).toContain(A3_LOOKS.switch.css);
    expect(A3_STYLESHEET).toContain(A3_LOOKS.switch.css);
  });

  test("literal hex, track 40x22, ring on the track, reduced motion, forced colors", () => {
    const s = A3_LOOKS.switch.css;
    expect(s).toContain("width:40px;height:22px;border:1px solid #64748b;border-radius:11px;background-color:#cbd5e1;");
    expect(s).toContain(".t-switch input:checked+.sw-track{background-color:#0f172a;border-color:#0f172a}");
    expect(s).toContain(".t-switch input:focus-visible+.sw-track{outline:2px solid #0077c2;outline-offset:2px}");
    expect(s).toContain("@media (prefers-reduced-motion:reduce){.t-switch .sw-track,.t-switch .sw-thumb{transition:none}}");
    expect(s).toContain("@media (forced-colors:active){");
    expect(s).toContain(".t-switch input:checked+.sw-track{background-color:Highlight;border-color:Highlight}");
    expect(s).not.toContain("{{");
    expect(s).not.toContain("display:none");
    expect(s).not.toContain("url(");
  });

  test("WCAG 1.4.11: every boundary that tells the state is >= 3:1", () => {
    expect(ratio("#64748b", "#ffffff")).toBeGreaterThanOrEqual(3); // off track border vs page
    expect(ratio("#64748b", "#cbd5e1")).toBeGreaterThanOrEqual(3); // thumb border vs off track
    expect(ratio("#0f172a", "#ffffff")).toBeGreaterThanOrEqual(3); // on track vs page
    expect(ratio("#ffffff", "#0f172a")).toBeGreaterThanOrEqual(3); // thumb vs on track
    expect(ratio("#0077c2", "#ffffff")).toBeGreaterThanOrEqual(3); // ring vs page
  });
});

describe("A3.2 document ops", () => {
  test("a NEW switch is labelled 'Switch'; an old one keeps its stored label", () => {
    const n = createNode("switch");
    expect(n.props).toEqual({ type: "switch", label: "Switch", checked: false });
    expect(nodeDisplayName(n)).toBe("Switch");
    const old = OLD.nodes.s2 as Node;
    expect((old.props as { label: string }).label).toBe("Checkbox");
    expect(nodeDisplayName(old)).toBe("Checkbox");
    expect(nodeDisplayName(OLD.nodes.s3 as Node)).toBe("แจ้งเตือน");
  });
  test("checked / label still write as before", () => {
    const d = {
      version: 3,
      meta: { title: "x", lang: "th" },
      root: "root",
      nodes: { root: { id: "root", type: "page", props: { type: "page", children: ["s"] }, style: {} }, s: { ...createNode("switch"), id: "s" } },
    } as never;
    const a = setNodeProp(d, "s", "checked", true);
    expect((a!.nodes.s.props as { checked: boolean }).checked).toBe(true);
    expect(setNodeProp(d, "s", "checked", "yes")).toBeNull();
  });
});

describe("A3.2 canvas (SSR)", () => {
  const html = (n: Node) => renderToStaticMarkup(createElement(SwitchView, { node: n, handlers: {}, style: n.style }));
  test("div root (never a label), inert, input not focusable, track + thumb, label span", () => {
    const h = html({ ...createNode("switch"), id: "s" });
    expect(h.startsWith("<div")).toBe(true);
    expect(h).not.toContain("<label");
    expect(h).toContain('data-cv=""');
    expect(h).toContain('class="t-switch"');
    expect(h).toMatch(/<input type="checkbox" class="sw" readOnly="" tabindex="-1" aria-hidden="true"\/?>/);
    expect(h).toContain('<span class="sw-track"><span class="sw-thumb"></span></span><span>Switch</span>');
  });
  test("checked mirrors the prop; an empty label has no span", () => {
    const h = html({ ...createNode("switch"), id: "s", props: { type: "switch", label: " ", checked: true } } as Node);
    expect(h).toContain('checked=""');
    expect(h).toMatch(/<span class="sw-thumb"><\/span><\/span><\/div>$/);
  });
});
