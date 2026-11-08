/**
 * R1: Code view edits `src/data/site.json` only. Renderer keys are stripped in
 * Rust (`parse_site_json`). The open document's version is kept — the export
 * file always says version 1.
 */
import type { PageDocument } from "@/schema";
import { ensurePages } from "@/lib/project-pages";

export const SITE_JSON_PATH = "src/data/site.json";
export const SITE_JSON_HISTORY_KEY = "code-site-json";
export const SITE_JSON_DEBOUNCE_MS = 150;

/** Put the parsed tree on screen without lowering `version` or losing the open page. */
export function viewFromParsedSite(
  parsed: PageDocument,
  current: PageDocument,
  openPageId: string | null,
): { doc: PageDocument; openPageId: string } {
  const pages = ensurePages(parsed).pages!;
  const page = pages.find((p) => p.id === openPageId) ?? pages[0]!;
  return {
    openPageId: page.id,
    doc: {
      ...parsed,
      version: current.version,
      pages,
      root: page.root,
      nodes: page.nodes,
    },
  };
}
