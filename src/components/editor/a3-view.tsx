import type { CSSProperties, HTMLAttributes } from "react";
import type { Node, StyleProps } from "@/schema";
import { styleToCss } from "@/lib/style-css";
import { explicitOf } from "@/lib/kind-looks";
import { mergeOver } from "@/lib/a2-looks";
import { A3_STYLESHEET, a3ExtrasStyle } from "@/lib/a3-looks";

type Handlers = Record<string, unknown>;

// The A3 looks (checkbox box + checkmark, A3.2 switch track + thumb) come from src/lib/kind-looks.json `a3`, shared with the
// Rust compiler. One <style> for the whole editor, in the lazy editor chunk.
if (typeof document !== "undefined" && !document.querySelector("style[data-a3-looks]")) {
  const el = document.createElement("style");
  el.setAttribute("data-a3-looks", "");
  el.textContent = A3_STYLESHEET;
  document.head.appendChild(el);
}

/**
 * Canvas for the checkbox (PHASE-11 A3.1). Same class and inner tags as the export
 * (`.t-checkbox` > input + span) so the shared CSS draws the box and checkmark, but the root is a
 * `div`, never a `<label>`: a canvas click selects and can never toggle (ruling 5). The input is
 * not focusable (tabIndex -1), read-only and inert (`data-cv`); `checked` mirrors the saved prop.
 */
export function CheckboxView({
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
  if (p.type !== "checkbox") return null;
  const explicit = explicitOf(styleToCss(node.style), (node.style ?? {}).borderColor !== undefined);
  const css = a3ExtrasStyle("checkbox", styleToCss(style), explicit);
  return (
    <div
      {...(handlers as HTMLAttributes<HTMLDivElement>)}
      data-node-type="checkbox"
      data-cv=""
      className={["t-checkbox", chrome].filter(Boolean).join(" ")}
      style={mergeOver(css, over)}
    >
      <input type="checkbox" checked={p.checked} readOnly tabIndex={-1} aria-hidden="true" onChange={() => {}} />
      {p.label.trim() ? <span>{p.label}</span> : null}
    </div>
  );
}

/**
 * Canvas for the switch (PHASE-11 A3.2). Same class and inner tags as the export
 * (`.t-switch` > input.sw + span.sw-track > span.sw-thumb + span) so the shared CSS draws the track
 * and thumb, but the root is a `div`, never a `<label>`: a canvas click selects and never toggles
 * (ruling 5). The input is visually hidden by the shared CSS, not focusable (tabIndex -1), read-only
 * and inert (`data-cv`); `checked` mirrors the saved prop. Stored data is never touched.
 */
export function SwitchView({
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
  if (p.type !== "switch") return null;
  const explicit = explicitOf(styleToCss(node.style), (node.style ?? {}).borderColor !== undefined);
  const css = a3ExtrasStyle("switch", styleToCss(style), explicit);
  return (
    <div
      {...(handlers as HTMLAttributes<HTMLDivElement>)}
      data-node-type="switch"
      data-cv=""
      className={["t-switch", chrome].filter(Boolean).join(" ")}
      style={mergeOver(css, over)}
    >
      <input type="checkbox" className="sw" checked={p.checked} readOnly tabIndex={-1} aria-hidden="true" onChange={() => {}} />
      <span className="sw-track">
        <span className="sw-thumb" />
      </span>
      {p.label.trim() ? <span>{p.label}</span> : null}
    </div>
  );
}
