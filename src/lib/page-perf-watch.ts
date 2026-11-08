/**
 * B6.2: evaluate page perf once after a heavy write or page open.
 * Announces each warning kind at most once while it stays over threshold.
 */
import type { PageDocument } from "@/schema";
import type { StyleKey } from "@/lib/document-ops";
import {
  HEAVY_STYLE_KEYS,
  countPagePerfFromDoc,
  toolbarPerfStatus,
  warningsFromStats,
  type PagePerfStats,
  type PagePerfWarning,
  type PagePerfWarningKind,
} from "@/lib/page-perf";
import { useEditorStore } from "@/stores/editor-store";

const announcedByPage = new Map<string, Set<PagePerfWarningKind>>();

function pageKey(doc: PageDocument): string {
  return doc.root;
}

export function isHeavyStyleKey(key: string): boolean {
  return (HEAVY_STYLE_KEYS as readonly string[]).includes(key);
}

export function evaluatePagePerf(doc: PageDocument | null | undefined): {
  stats: PagePerfStats;
  warnings: PagePerfWarning[];
  toolbar: string | null;
} | null {
  if (!doc) {
    useEditorStore.getState().setPagePerf(null, [], null);
    return null;
  }
  const stats = countPagePerfFromDoc(doc);
  const warnings = warningsFromStats(stats);
  const toolbar = toolbarPerfStatus(stats);
  useEditorStore.getState().setPagePerf(stats, warnings, toolbar);

  const key = pageKey(doc);
  let announced = announcedByPage.get(key);
  if (!announced) {
    announced = new Set();
    announcedByPage.set(key, announced);
  }
  const active = new Set(warnings.map((w) => w.kind));
  for (const kind of [...announced]) {
    if (!active.has(kind)) announced.delete(kind);
  }
  const announce = useEditorStore.getState().announce;
  for (const w of warnings) {
    if (announced.has(w.kind)) continue;
    announced.add(w.kind);
    announce(w.message);
  }
  return { stats, warnings, toolbar };
}

/** Clear announce-once memory (tests / project close). */
export function resetPagePerfAnnounced(): void {
  announcedByPage.clear();
}

export function evaluatePagePerfIfHeavy(
  doc: PageDocument | null | undefined,
  touchedKeys: readonly StyleKey[],
): void {
  if (!doc) return;
  if (!touchedKeys.some((k) => isHeavyStyleKey(k))) return;
  evaluatePagePerf(doc);
}
