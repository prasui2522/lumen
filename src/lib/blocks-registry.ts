/**
 * Phase 11 D3: lazy blocks registry (migrated Phase 5B + templates first).
 * Chunk / JSON stay out of the entry graph until first open (D4).
 */
import {
  validateBlock,
  type StyleBlock,
} from "@/lib/block-format";
import { materialiseBlock } from "@/lib/block-insert";
import type { BuiltTemplate } from "@/lib/templates";
import type { NodeId } from "@/schema";
import { getChildren } from "@/schema";

let cached: StyleBlock[] | null = null;

export async function loadBlocksRegistry(): Promise<StyleBlock[]> {
  if (cached) return cached;
  const mod = await import("@/lib/blocks-registry/migrated.json");
  const list = (mod.default ?? mod) as unknown[];
  const out: StyleBlock[] = [];
  for (const item of list) {
    const { block, errors } = validateBlock(item);
    if (!block) {
      throw new Error(
        `invalid registry block: ${errors.map((e) => `${e.path}: ${e.message}`).join("; ")}`,
      );
    }
    out.push(block);
  }
  cached = out;
  return out;
}

export function resetBlocksRegistryCache(): void {
  cached = null;
}

export function findRegistryBlock(
  blocks: StyleBlock[],
  id: string,
): StyleBlock | undefined {
  return blocks.find((b) => b.id === id);
}

function focusFromBlock(block: StyleBlock, idMap: Record<string, string>): NodeId {
  if (block.focus && idMap[block.focus]) return idMap[block.focus]!;
  return idMap[block.root]!;
}

/** Materialise a registry block as a BuiltTemplate (same shape as buildBlock/buildTemplate). */
export function builtFromRegistryBlock(block: StyleBlock): BuiltTemplate {
  const { nodes, rootId, idMap } = materialiseBlock(block);
  return {
    nodes,
    sectionId: rootId,
    focusId: focusFromBlock(block, idMap),
  };
}

/**
 * Normalise a built tree for deep-equal: BFS local ids, drop node `id`,
 * keep type / props / style / name.
 */
export function normaliseBuiltTree(built: BuiltTemplate): unknown {
  const byId = new Map(built.nodes.map((n) => [n.id, n]));
  const uuidToLocal = new Map<string, string>();
  let i = 0;
  const queue: string[] = [built.sectionId];
  const order: string[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    if (uuidToLocal.has(id)) continue;
    uuidToLocal.set(id, `n${i++}`);
    order.push(id);
    const n = byId.get(id);
    if (!n) continue;
    for (const c of getChildren(n)) queue.push(c);
  }
  for (const n of built.nodes) {
    if (!uuidToLocal.has(n.id)) {
      uuidToLocal.set(n.id, `n${i++}`);
      order.push(n.id);
    }
  }
  const remap = (v: unknown): unknown => {
    if (typeof v === "string") return uuidToLocal.get(v) ?? v;
    if (Array.isArray(v)) return v.map(remap);
    if (v && typeof v === "object") {
      const o: Record<string, unknown> = {};
      for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
        o[k] = remap(val);
      }
      return o;
    }
    return v;
  };
  const nodes: Record<string, unknown> = {};
  for (const id of order) {
    const n = byId.get(id)!;
    const lid = uuidToLocal.get(id)!;
    const entry: Record<string, unknown> = {
      type: n.type,
      props: remap(n.props),
      style: n.style ?? {},
    };
    if (n.name) entry.name = n.name;
    nodes[lid] = entry;
  }
  return {
    root: uuidToLocal.get(built.sectionId),
    focus: uuidToLocal.get(built.focusId),
    nodes,
  };
}

export function registryIdForLegacyBlock(id: string): string {
  return `elements-${id}`;
}

export function registryIdForLegacyTemplate(id: string): string {
  return `template-${id}`;
}
