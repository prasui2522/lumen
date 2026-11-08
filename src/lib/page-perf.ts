/**
 * B6.2 (§5.3): per-page cost counters for blur / heavy shadows / animated nodes.
 * One O(n) pass — call on heavy-key write or page open, never per frame.
 */
import type { BoxShadowLayer, Node, PageDocument, StyleProps } from "@/schema";

export const MAX_BLUR_EFFECTS = 6;
export const MAX_ANIMATED_NODES = 30;
export const MAX_SHADOW_BLUR_SUM = 1200;
export const MAX_NODE_SHADOW_BLUR = 100;

export const HEAVY_STYLE_KEYS = [
  "boxShadow",
  "filter",
  "backdropFilter",
  "transition",
] as const satisfies readonly (keyof StyleProps)[];

export type PagePerfStats = {
  /** Nodes with filter.blur or backdropFilter.blur > 0. */
  blurEffects: number;
  /** Sum of box-shadow layer blur radii on the page. */
  shadowBlurSum: number;
  /** Largest single layer blur on any node. */
  maxNodeShadowBlur: number;
  /** Nodes with entrance motion (E) — 0 until motion ships. */
  animated: number;
};

export type PagePerfWarningKind = "blur" | "shadow" | "animated";

export type PagePerfWarning = {
  kind: PagePerfWarningKind;
  message: string;
};

export function formatBlurWarning(n: number, max = MAX_BLUR_EFFECTS): string {
  return `หน้านี้ใช้เอฟเฟกต์เบลอ ${n} จุด อาจทำให้เครื่องช้าลง แนะนำไม่เกิน ${max} จุด`;
}

export function formatShadowWarning(): string {
  return "เงาในหน้านี้ใหญ่และซ้อนกันมาก อาจทำให้เครื่องช้าลง";
}

export function formatAnimatedWarning(n: number, max = MAX_ANIMATED_NODES): string {
  return `หน้านี้มีองค์ประกอบที่เคลื่อนไหว ${n} จุด แนะนำไม่เกิน ${max} จุด`;
}

function stylesOf(node: Node): StyleProps[] {
  const out: StyleProps[] = [];
  if (node.style) out.push(node.style);
  const bp = node.styleBreakpoints;
  if (bp?.tablet) out.push(bp.tablet);
  if (bp?.phone) out.push(bp.phone);
  if (bp?.foldOpen) out.push(bp.foldOpen);
  return out;
}

function nodeHasBlurEffect(node: Node): boolean {
  for (const s of stylesOf(node)) {
    if ((s.filter?.blur ?? 0) > 0) return true;
    if ((s.backdropFilter?.blur ?? 0) > 0) return true;
  }
  return false;
}

function shadowLayers(node: Node): BoxShadowLayer[] {
  // Base style layers (breakpoint overrides replace whole key when set — count base +
  // any breakpoint that holds boxShadow, taking the max blur sum per node to avoid
  // double-counting identical stacks).
  const candidates: BoxShadowLayer[][] = [];
  if (node.style?.boxShadow?.length) candidates.push(node.style.boxShadow);
  const bp = node.styleBreakpoints;
  for (const s of [bp?.tablet, bp?.phone, bp?.foldOpen]) {
    if (s?.boxShadow?.length) candidates.push(s.boxShadow);
  }
  if (candidates.length === 0) return [];
  let best = candidates[0]!;
  let bestSum = sumBlur(best);
  for (let i = 1; i < candidates.length; i++) {
    const layers = candidates[i]!;
    const sum = sumBlur(layers);
    if (sum > bestSum) {
      best = layers;
      bestSum = sum;
    }
  }
  return best;
}

function sumBlur(layers: readonly BoxShadowLayer[]): number {
  let sum = 0;
  for (const layer of layers) {
    const b = layer.blur;
    if (typeof b === "number" && Number.isFinite(b) && b > 0) sum += b;
  }
  return sum;
}

function maxBlur(layers: readonly BoxShadowLayer[]): number {
  let m = 0;
  for (const layer of layers) {
    const b = layer.blur;
    if (typeof b === "number" && Number.isFinite(b) && b > m) m = b;
  }
  return m;
}

/** Nodes with `motion.entrance` (Phase 11 E). Safe before the field exists. */
function nodeIsAnimated(node: Node): boolean {
  const motion = (node as { motion?: { entrance?: unknown } }).motion;
  return motion != null && motion.entrance != null;
}

export function countPagePerf(nodes: Record<string, Node>): PagePerfStats {
  let blurEffects = 0;
  let shadowBlurSum = 0;
  let maxNodeShadowBlur = 0;
  let animated = 0;
  for (const node of Object.values(nodes)) {
    if (node.type === "page") continue;
    if (nodeHasBlurEffect(node)) blurEffects += 1;
    const layers = shadowLayers(node);
    if (layers.length) {
      shadowBlurSum += sumBlur(layers);
      const m = maxBlur(layers);
      if (m > maxNodeShadowBlur) maxNodeShadowBlur = m;
    }
    if (nodeIsAnimated(node)) animated += 1;
  }
  return { blurEffects, shadowBlurSum, maxNodeShadowBlur, animated };
}

export function countPagePerfFromDoc(doc: PageDocument): PagePerfStats {
  return countPagePerf(doc.nodes);
}

export function warningsFromStats(stats: PagePerfStats): PagePerfWarning[] {
  const out: PagePerfWarning[] = [];
  if (stats.blurEffects > MAX_BLUR_EFFECTS) {
    out.push({
      kind: "blur",
      message: formatBlurWarning(stats.blurEffects, MAX_BLUR_EFFECTS),
    });
  }
  if (
    stats.shadowBlurSum > MAX_SHADOW_BLUR_SUM ||
    stats.maxNodeShadowBlur > MAX_NODE_SHADOW_BLUR
  ) {
    out.push({ kind: "shadow", message: formatShadowWarning() });
  }
  if (stats.animated > MAX_ANIMATED_NODES) {
    out.push({
      kind: "animated",
      message: formatAnimatedWarning(stats.animated, MAX_ANIMATED_NODES),
    });
  }
  return out;
}

/** Short status for the Preview toolbar (blur count when over, else empty). */
export function toolbarPerfStatus(stats: PagePerfStats): string | null {
  if (stats.blurEffects > MAX_BLUR_EFFECTS) {
    return `เบลอ ${stats.blurEffects}/${MAX_BLUR_EFFECTS}`;
  }
  if (
    stats.shadowBlurSum > MAX_SHADOW_BLUR_SUM ||
    stats.maxNodeShadowBlur > MAX_NODE_SHADOW_BLUR
  ) {
    return "เงาหนัก";
  }
  if (stats.animated > MAX_ANIMATED_NODES) {
    return `เคลื่อนไหว ${stats.animated}/${MAX_ANIMATED_NODES}`;
  }
  return null;
}
