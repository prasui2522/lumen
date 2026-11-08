/**
 * Phase 11 C7: capture paint/effect style from a node into a user StylePreset.
 */
import type { Node, NodeType, StyleProps } from "@/schema";
import { cleanStates, cleanStyle } from "@/lib/breakpoints";
import {
  PRESET_CAPTURE_KEYS,
  type PresetCategory,
  type StylePreset,
} from "@/lib/presets-registry";

export function categoryForNodeType(type: NodeType): PresetCategory | null {
  if (type === "button" || type === "link") return "button";
  if (type === "card" || type === "container") return "card";
  if (type === "section") return "surface";
  return null;
}

export function appliesToForNodeType(type: NodeType): NodeType[] {
  if (type === "button" || type === "link") return ["button", "link"];
  if (type === "card" || type === "container") return ["container", "card"];
  if (type === "section") return ["container", "card", "section"];
  return [type];
}

/** Pick only preset-safe keys from a style object. */
export function capturePresetStyle(style: StyleProps): StyleProps {
  const out: StyleProps = {};
  for (const key of PRESET_CAPTURE_KEYS) {
    const v = style[key];
    if (v !== undefined) (out as Record<string, unknown>)[key] = v;
  }
  return cleanStyle(out) ?? {};
}

/**
 * Build a user preset from the node's current paint/effects/states.
 * Returns null when the kind cannot host presets or there is nothing to save.
 */
export function capturePresetFromNode(
  node: Node,
  name: string,
  id: string = crypto.randomUUID(),
): StylePreset | null {
  const category = categoryForNodeType(node.type);
  if (!category) return null;
  const style = capturePresetStyle(node.style);
  const states = cleanStates(node.states);
  if (Object.keys(style).length === 0 && !states) return null;
  const trimmed = name.trim();
  if (!trimmed) return null;
  return {
    formatVersion: 1,
    id,
    name: trimmed,
    nameEn: trimmed,
    category,
    appliesTo: appliesToForNodeType(node.type),
    style,
    states,
    source: { kind: "user" },
  };
}
