/**
 * Phase 11 C1: built-in style presets (lazy-loaded JSON registry).
 * Spec §9.C — validate with STYLE_KEYS / STATE_PAINT_KEYS; no layout keys in states.
 */
import type {
  NodeStateName,
  NodeStates,
  NodeType,
  StateStyle,
  StyleProps,
} from "@/schema";
import {
  NODE_STATE_NAMES,
  STATE_PAINT_KEYS,
  STYLE_KEYS,
} from "@/schema";
import { cleanStateStyle, cleanStates, cleanStyle } from "@/lib/breakpoints";

export type PresetCategory = "button" | "card" | "surface";

export type PresetSource = { kind: "original" } | { kind: "user" };

export type StylePreset = {
  formatVersion: 1;
  id: string;
  name: string;
  nameEn: string;
  category: PresetCategory;
  appliesTo: NodeType[];
  style: StyleProps;
  states?: NodeStates;
  source: PresetSource;
  /** Optional panel note (e.g. T133 for glass). */
  note?: string;
};

/**
 * Keys captured when saving a user preset (paint + effects + transition).
 * Never size / spacing / typography — a preset must not drag layout.
 */
export const PRESET_CAPTURE_KEYS = [
  ...STATE_PAINT_KEYS,
  "borderRadius",
  "borderWidth",
  "borderStyle",
  "borderSides",
  "borderRadiusCorners",
  "transition",
] as const satisfies readonly (keyof StyleProps)[];

const CATEGORIES = new Set<string>(["button", "card", "surface"]);
const STYLE_KEY_SET = new Set<string>(STYLE_KEYS);
const STATE_KEY_SET = new Set<string>(STATE_PAINT_KEYS);
const STATE_NAME_SET = new Set<string>(NODE_STATE_NAMES);

/** Known node types that presets may list in `appliesTo` (subset used by built-ins). */
const KNOWN_APPLY_TYPES = new Set<string>([
  "button",
  "link",
  "container",
  "card",
  "section",
]);

export type PresetValidationError = {
  path: string;
  message: string;
};

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function validateStyleKeys(
  style: unknown,
  path: string,
  allow: Set<string>,
  errors: PresetValidationError[],
): StyleProps | undefined {
  if (style === undefined) return undefined;
  if (!isPlainObject(style)) {
    errors.push({ path, message: "must be an object" });
    return undefined;
  }
  const out: StyleProps = {};
  for (const [k, v] of Object.entries(style)) {
    if (!allow.has(k)) {
      errors.push({ path: `${path}.${k}`, message: `key not allowed (${k})` });
      continue;
    }
    (out as Record<string, unknown>)[k] = v;
  }
  return cleanStyle(out);
}

function validateStates(
  states: unknown,
  path: string,
  errors: PresetValidationError[],
): NodeStates | undefined {
  if (states === undefined) return undefined;
  if (!isPlainObject(states)) {
    errors.push({ path, message: "must be an object" });
    return undefined;
  }
  const out: NodeStates = {};
  for (const [name, raw] of Object.entries(states)) {
    if (!STATE_NAME_SET.has(name)) {
      errors.push({ path: `${path}.${name}`, message: `unknown state (${name})` });
      continue;
    }
    if (!isPlainObject(raw)) {
      errors.push({ path: `${path}.${name}`, message: "must be an object" });
      continue;
    }
    for (const k of Object.keys(raw)) {
      if (!STATE_KEY_SET.has(k)) {
        errors.push({
          path: `${path}.${name}.${k}`,
          message: `layout/disallowed key in states (${k})`,
        });
      }
    }
    const cleaned = cleanStateStyle(raw as StateStyle);
    if (cleaned) out[name as NodeStateName] = cleaned;
  }
  return cleanStates(out);
}

/** Validate one preset (built-in or user). Returns cleaned preset or errors. */
export function validatePreset(raw: unknown): {
  preset?: StylePreset;
  errors: PresetValidationError[];
} {
  const errors: PresetValidationError[] = [];
  if (!isPlainObject(raw)) {
    return { errors: [{ path: "", message: "preset must be an object" }] };
  }
  if (raw.formatVersion !== 1) {
    errors.push({ path: "formatVersion", message: "must be 1" });
  }
  if (typeof raw.id !== "string" || !raw.id.trim()) {
    errors.push({ path: "id", message: "required non-empty string" });
  }
  if (typeof raw.name !== "string" || !raw.name.trim()) {
    errors.push({ path: "name", message: "required non-empty string" });
  }
  if (typeof raw.nameEn !== "string" || !raw.nameEn.trim()) {
    errors.push({ path: "nameEn", message: "required non-empty string" });
  }
  if (typeof raw.category !== "string" || !CATEGORIES.has(raw.category)) {
    errors.push({ path: "category", message: "must be button|card|surface" });
  }
  if (!Array.isArray(raw.appliesTo) || raw.appliesTo.length === 0) {
    errors.push({ path: "appliesTo", message: "required non-empty array" });
  } else {
    for (let i = 0; i < raw.appliesTo.length; i++) {
      const t = raw.appliesTo[i];
      if (typeof t !== "string" || !KNOWN_APPLY_TYPES.has(t)) {
        errors.push({ path: `appliesTo[${i}]`, message: `unknown type (${String(t)})` });
      }
    }
  }
  if (
    !isPlainObject(raw.source) ||
    (raw.source.kind !== "original" && raw.source.kind !== "user")
  ) {
    errors.push({ path: "source", message: 'must be {kind:"original"|"user"}' });
  }

  const style = validateStyleKeys(raw.style, "style", STYLE_KEY_SET, errors) ?? {};
  const states = validateStates(raw.states, "states", errors);

  if (errors.length) return { errors };

  const preset: StylePreset = {
    formatVersion: 1,
    id: String(raw.id).trim(),
    name: String(raw.name).trim(),
    nameEn: String(raw.nameEn).trim(),
    category: raw.category as PresetCategory,
    appliesTo: raw.appliesTo as NodeType[],
    style,
    source: { kind: raw.source.kind as "original" | "user" },
  };
  if (states) preset.states = states;
  if (typeof raw.note === "string" && raw.note.trim()) preset.note = raw.note.trim();
  return { preset, errors: [] };
}

let cached: StylePreset[] | null = null;

/** Dynamic import of the JSON registry (kept out of the entry graph until first use). */
export async function loadBuiltInPresets(): Promise<StylePreset[]> {
  if (cached) return cached;
  const mod = await import("@/lib/presets-registry.json");
  const list = (mod.default ?? mod) as unknown[];
  const out: StylePreset[] = [];
  for (const item of list) {
    const { preset, errors } = validatePreset(item);
    if (!preset) {
      throw new Error(
        `invalid built-in preset: ${errors.map((e) => `${e.path}: ${e.message}`).join("; ")}`,
      );
    }
    out.push(preset);
  }
  cached = out;
  return out;
}

/** Sync access after load (tests / after await). */
export function getCachedBuiltInPresets(): StylePreset[] | null {
  return cached;
}

/** For tests: reset the lazy cache. */
export function resetBuiltInPresetCache(): void {
  cached = null;
}

export function presetsForType(presets: StylePreset[], type: NodeType): StylePreset[] {
  return presets.filter((p) => p.appliesTo.includes(type));
}

export function findPreset(presets: StylePreset[], id: string): StylePreset | undefined {
  return presets.find((p) => p.id === id);
}

/** Sync: whether any built-in may apply to this kind (Style panel gate; no JSON load). */
export function nodeTypeHasPresets(type: NodeType): boolean {
  return KNOWN_APPLY_TYPES.has(type);
}
