/**
 * Follow a Tier 1 / Vite preview route into the editor's open page.
 * Same outcome as PagesPanel.switchPage: no undo step, selection cleared.
 */
import type { PageDocument } from "@/schema";
import { findPageForHref } from "@/lib/link-target";
import { ensurePages, openPageIdOf, switchToPage } from "@/lib/project-pages";

export type PreviewNavResult = {
  doc: PageDocument;
  pageId: string;
  pageName: string;
};

/**
 * Map a frame `wb:route` path to a page switch. Returns null when the path is
 * unknown or already the open page.
 */
export function followPreviewRoute(
  doc: PageDocument,
  path: string,
  openPageId: string | null,
): PreviewNavResult | null {
  const withPages = ensurePages(doc);
  const current = openPageId ?? openPageIdOf(withPages);
  const page = findPageForHref(path, withPages.pages ?? []);
  if (!page || page.id === current) return null;
  const next = switchToPage(withPages, page.id);
  if (!next) return null;
  return { doc: next, pageId: page.id, pageName: page.name };
}
