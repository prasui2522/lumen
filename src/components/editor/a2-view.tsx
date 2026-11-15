import type { CSSProperties, HTMLAttributes } from "react";
import type { Node, StyleProps } from "@/schema";
import { styleToCss } from "@/lib/style-css";
import { explicitOf } from "@/lib/kind-looks";
import { A2_CANVAS_ONLY_CSS, A2_STYLESHEET, a2ExtrasStyle, mergeOver, spinnerLabel, spinnerPx, A2_TEXTS } from "@/lib/a2-looks";

type Handlers = Record<string, unknown>;
type Root = HTMLAttributes<HTMLElement> & { "data-node-type": string; "data-cv": string; "data-cv-hit"?: string };

// The A2 look (spinner animation) comes from src/lib/kind-looks.json `a2`, shared with the Rust
// compiler. One <style> for the whole editor, in the lazy editor chunk.
if (typeof document !== "undefined" && !document.querySelector("style[data-a2-looks]")) {
  const el = document.createElement("style");
  el.setAttribute("data-a2-looks", "");
  el.textContent = A2_STYLESHEET;
  document.head.appendChild(el);
}
// Canvas-only rules (never exported): the separator hit area, A2.5 F2.
if (typeof document !== "undefined" && !document.querySelector("style[data-a2-canvas]")) {
  const el = document.createElement("style");
  el.setAttribute("data-a2-canvas", "");
  el.textContent = A2_CANVAS_ONLY_CSS;
  document.head.appendChild(el);
}

/**
 * Canvas for the leaf A2 kinds: separator, skeleton, spinner, badge. Same tags and classes as the
 * compiler (`render_node`), so the shared CSS styles both. Inert like the Phase 6b kinds
 * (`data-cv`): a click anywhere selects the node. `over` is the buttonGroup / aspectRatio
 * slot override, applied last.
 */
export function A2LeafView({
  node,
  handlers,
  chrome,
  style,
  over,
}: {
  node: Node;
  handlers: Handlers;
  chrome?: string;
  style: StyleProps;
  over?: CSSProperties;
}) {
  const p = node.props;
  const explicit = explicitOf(styleToCss(node.style), (node.style ?? {}).borderColor !== undefined);
  const base = styleToCss(style);
  const root = (extra: Partial<Root>, css: CSSProperties): Root => ({
    ...(handlers as HTMLAttributes<HTMLElement>),
    "data-node-type": node.type,
    "data-cv": "",
    // F2: only an interactive canvas node gets the separator hit area.
    ...(node.type === "separator" && typeof handlers.onClick === "function" ? { "data-cv-hit": "" } : {}),
    className: [`t-${node.type}`, chrome].filter(Boolean).join(" "),
    style: mergeOver(css, over),
    ...extra,
  });

  switch (p.type) {
    case "separator": {
      if (p.orientation === "vertical") {
        return (
          <div
            {...root(
              { role: "separator", "aria-orientation": "vertical" },
              a2ExtrasStyle("separatorVertical", a2ExtrasStyle("separator", base, explicit), explicit),
            )}
          />
        );
      }
      // Tailwind's `hr{border-top-width:1px}` is not in the export: the line is the background.
      const sep = a2ExtrasStyle("separator", base, explicit);
      const css: CSSProperties = explicit.borderWidth === undefined ? { ...sep, borderWidth: 0 } : sep;
      return <hr {...root({}, css)} />;
    }
    case "badge":
      // Same extras as `.t-badge` (align-items / gap, from kind-looks.json); display is a default style.
      return <span {...root({}, a2ExtrasStyle("badge", base, explicit))}>{p.label}</span>;
    case "skeleton":
      return <div {...root({ "aria-hidden": true }, base)} />;
    case "spinner": {
      const n = spinnerPx(p.size);
      return (
        <span {...root({ role: "status", "aria-label": spinnerLabel(node.name) }, base)}>
          <svg
            viewBox="0 0 24 24"
            width={n}
            height={n}
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            focusable="false"
          >
            <path d={A2_TEXTS.spinnerPath} />
          </svg>
        </span>
      );
    }
    default:
      return null;
  }
}
