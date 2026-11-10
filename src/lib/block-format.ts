/**
 * Phase 11 D1: block registry format + validator (PHASE-11-SPEC §9.D).
 * Insert engine (D2) remaps localIds → UUIDs; this module only validates.
 */
import type { NodeType, StyleProps } from "@/schema";
import { NODE_TYPE_LABEL } from "@/lib/document-ops";

export const BLOCK_FORMAT_VERSION = 1 as const;
export const BLOCK_MAX_NODES = 200;
export const BLOCK_MAX_THUMB_RECTS = 12;

export type BlockScope = "page" | "inline";

export type BlockCategory =
  | "header"
  | "hero"
  | "features"
  | "pricing"
  | "testimonials"
  | "faq"
  | "cta"
  | "footer"
  | "contact"
  | "logoCloud"
  | "stats"
  | "elements"
  | "dashboard"
  | "sidebar"
  | "login";

export type BlockSource =
  | { kind: "original" }
  | { kind: "mit"; project: string; ref: string; retrieved: string };

export type BlockThumbRect = {
  x: number;
  y: number;
  w: number;
  h: number;
  tone: "ink" | "muted" | "fill" | "accent";
};

/** Node as stored in a block (localId keys; no document `id` field required). */
export type BlockNode = {
  type: NodeType;
  name?: string;
  props: Record<string, unknown>;
  style?: StyleProps;
  states?: unknown;
  motion?: unknown;
  styleBreakpoints?: unknown;
};

export type StyleBlock = {
  formatVersion: typeof BLOCK_FORMAT_VERSION;
  id: string;
  category: BlockCategory;
  scope: BlockScope;
  name: string;
  nameEn: string;
  keywords: string[];
  source: BlockSource;
  thumb: BlockThumbRect[];
  root: string;
  /** Optional localId to select after insert (migrated templates/blocks). */
  focus?: string;
  nodes: Record<string, BlockNode>;
};

export type BlockValidationError = { path: string; message: string };

const CATEGORIES = new Set<string>([
  "header",
  "hero",
  "features",
  "pricing",
  "testimonials",
  "faq",
  "cta",
  "footer",
  "contact",
  "logoCloud",
  "stats",
  "elements",
  "dashboard",
  "sidebar",
  "login",
]);

const KNOWN_TYPES = new Set<string>(Object.keys(NODE_TYPE_LABEL));
const THUMB_TONES = new Set(["ink", "muted", "fill", "accent"]);
const NET_URL = /^https?:\/\//i;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function collectChildRefs(props: Record<string, unknown>, out: string[]): void {
  for (const [k, v] of Object.entries(props)) {
    if (k === "children" && Array.isArray(v)) {
      for (const id of v) {
        if (typeof id === "string") out.push(id);
      }
    } else if (k === "type") {
      continue;
    } else if (Array.isArray(v)) {
      for (const item of v) {
        if (isPlainObject(item)) collectChildRefs(item, out);
      }
    } else if (isPlainObject(v)) {
      collectChildRefs(v, out);
    }
  }
}

function scanForbiddenStrings(
  value: unknown,
  path: string,
  errors: BlockValidationError[],
): void {
  if (typeof value === "string") {
    if (NET_URL.test(value)) {
      errors.push({ path, message: "network URL not allowed" });
    }
    // Block images must be empty placeholders: `src` as a bare id (legacy) or the AssetRef `{ id }` (A2).
    if ((path.endsWith(".src") || path.endsWith(".src.id")) && value.trim() !== "") {
      errors.push({ path, message: "image src must be empty placeholder" });
    }
    if (value.length > 2000) {
      errors.push({ path, message: "string exceeds 2000 chars" });
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((v, i) => scanForbiddenStrings(v, `${path}[${i}]`, errors));
    return;
  }
  if (isPlainObject(value)) {
    for (const [k, v] of Object.entries(value)) {
      scanForbiddenStrings(v, path ? `${path}.${k}` : k, errors);
    }
  }
}

function hasCycle(root: string, nodes: Record<string, BlockNode>): boolean {
  const visiting = new Set<string>();
  const done = new Set<string>();
  const walk = (id: string): boolean => {
    if (done.has(id)) return false;
    if (visiting.has(id)) return true;
    visiting.add(id);
    const n = nodes[id];
    if (n) {
      const refs: string[] = [];
      collectChildRefs(n.props, refs);
      for (const r of refs) {
        if (walk(r)) return true;
      }
    }
    visiting.delete(id);
    done.add(id);
    return false;
  };
  return walk(root);
}

/** Validate one block. All-or-nothing: any error → no `block`. */
export function validateBlock(raw: unknown): {
  block?: StyleBlock;
  errors: BlockValidationError[];
} {
  const errors: BlockValidationError[] = [];
  if (!isPlainObject(raw)) {
    return { errors: [{ path: "", message: "block must be an object" }] };
  }
  if (raw.formatVersion !== 1) {
    errors.push({ path: "formatVersion", message: "must be 1" });
  }
  if (typeof raw.id !== "string" || !raw.id.trim() || raw.id.length > 64) {
    errors.push({ path: "id", message: "required non-empty string ≤64" });
  }
  if (typeof raw.category !== "string" || !CATEGORIES.has(raw.category)) {
    errors.push({ path: "category", message: "unknown category" });
  }
  if (raw.scope !== "page" && raw.scope !== "inline") {
    errors.push({ path: "scope", message: 'must be "page"|"inline"' });
  }
  if (typeof raw.name !== "string" || !raw.name.trim()) {
    errors.push({ path: "name", message: "required" });
  }
  if (typeof raw.nameEn !== "string" || !raw.nameEn.trim()) {
    errors.push({ path: "nameEn", message: "required" });
  }
  if (
    !Array.isArray(raw.keywords) ||
    !raw.keywords.every((k) => typeof k === "string")
  ) {
    errors.push({ path: "keywords", message: "must be string[]" });
  }
  const sourceObj = isPlainObject(raw.source) ? raw.source : null;
  if (!sourceObj || typeof sourceObj.kind !== "string") {
    errors.push({ path: "source", message: "required" });
  } else if (sourceObj.kind === "original") {
    // ok
  } else if (sourceObj.kind === "mit") {
    for (const f of ["project", "ref", "retrieved"] as const) {
      if (typeof sourceObj[f] !== "string" || !String(sourceObj[f]).trim()) {
        errors.push({ path: `source.${f}`, message: "required for mit" });
      }
    }
  } else {
    errors.push({ path: "source.kind", message: 'must be "original"|"mit"' });
  }

  if (!Array.isArray(raw.thumb)) {
    errors.push({ path: "thumb", message: "must be an array" });
  } else if (raw.thumb.length > BLOCK_MAX_THUMB_RECTS) {
    errors.push({
      path: "thumb",
      message: `max ${BLOCK_MAX_THUMB_RECTS} rects`,
    });
  } else {
    raw.thumb.forEach((r, i) => {
      if (!isPlainObject(r)) {
        errors.push({ path: `thumb[${i}]`, message: "must be object" });
        return;
      }
      for (const k of ["x", "y", "w", "h"] as const) {
        if (typeof r[k] !== "number" || !Number.isFinite(r[k])) {
          errors.push({ path: `thumb[${i}].${k}`, message: "must be number" });
        }
      }
      if (typeof r.tone !== "string" || !THUMB_TONES.has(r.tone)) {
        errors.push({ path: `thumb[${i}].tone`, message: "invalid tone" });
      }
    });
  }

  if (typeof raw.root !== "string" || !raw.root.trim()) {
    errors.push({ path: "root", message: "required" });
  }
  if (!isPlainObject(raw.nodes)) {
    errors.push({ path: "nodes", message: "must be object" });
  } else {
    const keys = Object.keys(raw.nodes);
    if (keys.length === 0) {
      errors.push({ path: "nodes", message: "empty" });
    }
    if (keys.length > BLOCK_MAX_NODES) {
      errors.push({ path: "nodes", message: `max ${BLOCK_MAX_NODES} nodes` });
    }
    if (typeof raw.root === "string" && !raw.nodes[raw.root]) {
      errors.push({ path: "root", message: "root id missing from nodes" });
    }
    const nodes: Record<string, BlockNode> = {};
    for (const [lid, nraw] of Object.entries(raw.nodes)) {
      if (!isPlainObject(nraw)) {
        errors.push({ path: `nodes.${lid}`, message: "must be object" });
        continue;
      }
      if (typeof nraw.type !== "string" || !KNOWN_TYPES.has(nraw.type)) {
        errors.push({
          path: `nodes.${lid}.type`,
          message: `unknown type (${String(nraw.type)})`,
        });
        continue;
      }
      if (!isPlainObject(nraw.props)) {
        errors.push({ path: `nodes.${lid}.props`, message: "required object" });
        continue;
      }
      if (nraw.props.type !== nraw.type) {
        errors.push({
          path: `nodes.${lid}.props.type`,
          message: "must match node.type",
        });
      }
      scanForbiddenStrings(nraw.props, `nodes.${lid}.props`, errors);
      scanForbiddenStrings(nraw.style, `nodes.${lid}.style`, errors);
      nodes[lid] = {
        type: nraw.type as NodeType,
        props: nraw.props,
        style: isPlainObject(nraw.style) ? (nraw.style as StyleProps) : undefined,
        name: typeof nraw.name === "string" ? nraw.name : undefined,
        states: nraw.states,
        motion: nraw.motion,
        styleBreakpoints: nraw.styleBreakpoints,
      };
    }

    // Reference integrity
    for (const [lid, n] of Object.entries(nodes)) {
      const refs: string[] = [];
      collectChildRefs(n.props, refs);
      for (const r of refs) {
        if (!nodes[r]) {
          errors.push({
            path: `nodes.${lid}`,
            message: `dangling child ref ${r}`,
          });
        }
      }
    }
    if (typeof raw.root === "string" && nodes[raw.root] && hasCycle(raw.root, nodes)) {
      errors.push({ path: "nodes", message: "cycle in children" });
    }

    if (errors.length) return { errors };

    const source: BlockSource =
      sourceObj && sourceObj.kind === "mit"
        ? {
            kind: "mit",
            project: String(sourceObj.project).trim(),
            ref: String(sourceObj.ref).trim(),
            retrieved: String(sourceObj.retrieved).trim(),
          }
        : { kind: "original" };

    if (typeof raw.focus === "string" && raw.focus.trim()) {
      if (!nodes[raw.focus.trim()]) {
        errors.push({ path: "focus", message: "focus id missing from nodes" });
      }
    }
    if (errors.length) return { errors };

    const block: StyleBlock = {
      formatVersion: 1,
      id: String(raw.id).trim(),
      category: raw.category as BlockCategory,
      scope: raw.scope as BlockScope,
      name: String(raw.name).trim(),
      nameEn: String(raw.nameEn).trim(),
      keywords: (raw.keywords as string[]).map((k) => k.trim()).filter(Boolean),
      source,
      thumb: (raw.thumb as BlockThumbRect[]).map((t) => ({
        x: t.x,
        y: t.y,
        w: t.w,
        h: t.h,
        tone: t.tone,
      })),
      root: String(raw.root).trim(),
      nodes,
    };
    if (typeof raw.focus === "string" && raw.focus.trim()) {
      block.focus = raw.focus.trim();
    }
    return { block, errors: [] };
  }

  return { errors };
}
