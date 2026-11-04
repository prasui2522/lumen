/**
 * Preview page links (PHASE-9-SPEC §6 as amended by the PM). The sandboxed
 * Preview frame has no scripts, so a page link carries a real href to an
 * inert marker, `about:blank#wb-page=<encodeURIComponent(path)>`. A click or
 * Enter navigates the frame to that blank page; the parent's iframe `load`
 * reads the marker and opens the page. Pure helpers: no store, no DOM.
 * Export never sees a marker (Preview-only compile option).
 */
import { findPageForHref, type LinkPage } from "./link-target";
import { pageHtmlName } from "./project-pages";

/** Must match `PAGE_MARKER_PREFIX` in src-tauri/src/compiler.rs. */
export const PAGE_MARKER_PREFIX = "about:blank#wb-page=";

/** Marker href for a page path. */
export function pageMarkerHref(path: string): string {
  return PAGE_MARKER_PREFIX + encodeURIComponent(path);
}

/**
 * Decoded payload of a marker URL (the frame's `location.href`), or null when
 * the URL is not a marker (e.g. the srcdoc load) or does not decode.
 */
export function parsePageMarker(href: string): string | null {
  if (!href.startsWith(PAGE_MARKER_PREFIX)) return null;
  try {
    return decodeURIComponent(href.slice(PAGE_MARKER_PREFIX.length));
  } catch {
    return null;
  }
}

/**
 * The page a marker URL opens, or null (not a marker, no such page, or the
 * page already open). The payload is matched like an authored href, so
 * `/login`, `/login/` and `login.html` (trimmed) all resolve.
 */
export function resolvePageMarker<P extends LinkPage>(
  href: string,
  pages: readonly P[],
  currentPageId: string | null,
): P | null {
  const payload = parsePageMarker(href);
  if (payload === null) return null;
  const page = findPageForHref(payload, pages);
  return page && page.id !== currentPageId ? page : null;
}

/**
 * `pageMarkers` for compile_preview: page file → marker href, for every page
 * except the open one (a link to the current page gets no href, so a click
 * does nothing and the frame never flashes blank).
 */
export function previewPageMarkers(
  pages: readonly LinkPage[],
  currentPageId: string | null,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const p of pages) {
    if (p.id !== currentPageId) out[pageHtmlName(p.path)] = pageMarkerHref(p.path);
  }
  return out;
}

/**
 * `pagePaths` for compile_preview: authored forms → page file. `/login`,
 * `/login/` (export uses the same two) plus the file forms `login.html` and
 * `./login.html` (`index.html`, `./index.html` for home), so every form the
 * link field accepts as a page resolves in Preview too.
 */
export function previewPagePaths(pages: readonly LinkPage[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const p of pages) {
    const file = pageHtmlName(p.path);
    out[p.path] = file;
    if (p.path !== "/") out[`${p.path}/`] = file;
    out[file] = file;
    out[`./${file}`] = file;
  }
  return out;
}
