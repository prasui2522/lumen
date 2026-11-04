import type { CSSProperties, HTMLAttributes, ReactNode } from "react";
import { splitControlStyle } from "@/lib/kind-looks";

export type ControlProps = { className: string; style: CSSProperties; tabIndex: number };

/**
 * Canvas wrapper for a leaf native control (select, slider, unlabelled textarea).
 * `root` is whatever the canvas root carries (handlers incl. `draggable` and drag events,
 * `data-node-id`, `data-node-type`, `data-cv`, click wrapper). The wrapper carries all of
 * it, so mousedown / click / drag land on the wrapper; the control inside is inert
 * (`[data-node-type][data-cv] *{pointer-events:none}`) and out of the tab order, so it
 * never opens or takes focus. No new deps; pure React (kept free of Tauri imports so it is
 * unit-testable in bun).
 */
export function controlShell(
  root: HTMLAttributes<HTMLElement>,
  chrome: string | undefined,
  type: string,
  rootStyle: CSSProperties,
  control: (props: ControlProps) => ReactNode,
): ReactNode {
  const { wrapper, control: inner } = splitControlStyle(rootStyle);
  return (
    <div {...{ ...root, className: chrome, style: wrapper }}>
      {control({ className: `t-${type}`, style: inner, tabIndex: -1 })}
    </div>
  );
}
