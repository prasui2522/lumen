/**
 * B7.3 (§9.B): canvas force-display of the selected node's chosen state.
 * Merges paint keys from `states.<name>` onto the resolved base; callers pass
 * `transition: "none"` so the switch is instant (no CSS transition).
 */
import type { NodeStateName, NodeStates, StyleProps } from "@/schema";
import { STATE_PAINT_KEYS } from "@/schema";

/** Merge a named state onto `base`. Unknown / empty name → `base` unchanged. */
export function mergeForceState(
  base: StyleProps,
  states: NodeStates | undefined,
  name: NodeStateName | null | undefined,
): StyleProps {
  if (!name || !states) return base;
  const patch = states[name];
  if (!patch) return base;
  const next: StyleProps = { ...base };
  for (const key of STATE_PAINT_KEYS) {
    const v = patch[key];
    if (v !== undefined) (next as Record<string, unknown>)[key] = v;
  }
  // Drop authored transition so styleToCss does not emit timing; canvas adds `transition:none`.
  delete next.transition;
  return next;
}

/** True when the canvas should force-display `name` on this node (selected only). */
export function shouldForceDisplayState(
  selectedNodeId: string | null | undefined,
  nodeId: string,
  name: NodeStateName | null | undefined,
): boolean {
  return Boolean(name && selectedNodeId && selectedNodeId === nodeId);
}
