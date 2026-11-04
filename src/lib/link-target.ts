/**
 * Link targets for button/link hrefs (PHASE-9-SPEC §3, §6.2). Pure helpers:
 * no store, no DOM. Scheme detection mirrors `safe_href` in compiler.rs,
 * which stays the compile-time guard for hand-edited files.
 */

/** Page fields the helpers need (a ProjectPage satisfies this). */
export type LinkPage = { id: string; name: string; path: string };

export const HREF_SCHEME_ERROR = "ใช้ได้เฉพาะ http, https, mailto, tel หรือเส้นทางหน้า";
export const HREF_MISSING_PAGE = "ไม่มีหน้านี้ในโปรเจกต์";

const ALLOWED_SCHEMES = new Set(["http", "https", "mailto", "tel"]);

/**
 * Lowercase scheme, or null for a relative href. Like `safe_href`: control
 * characters and whitespace are removed, and the scheme is the text before
 * `:` only when no `/`, `?` or `#` comes first.
 */
export function hrefScheme(raw: string): string | null {
  const squashed = raw.replace(/[\u0000-\u001f\u007f-\u009f]/g, "").replace(/\s/g, "").toLowerCase();
  const colon = squashed.indexOf(":");
  if (colon < 0) return null;
  const delim = squashed.search(/[/?#]/);
  if (delim >= 0 && delim < colon) return null;
  return squashed.slice(0, colon);
}

/**
 * The project page an href points to, or null. The href is trimmed first
 * (a stored value with stray spaces still matches); `?query` and `#fragment`
 * are ignored. `/login`, `/login/`, `login.html` and `./login.html` match the
 * page at `/login`; `/`, `index.html` and `./index.html` match home (the
 * file forms work as written in the export). `/login.html` does not: export
 * keeps it as an absolute path, which breaks a static site. Matching is exact
 * otherwise (paths are stored lowercase), the same as the export rewrite.
 */
export function findPageForHref<P extends LinkPage>(href: string, pages: readonly P[]): P | null {
  const h = href.trim();
  if (!h || hrefScheme(h) !== null || h.startsWith("//")) return null;
  const cut = h.search(/[?#]/);
  let path = cut >= 0 ? h.slice(0, cut) : h;
  if (!path) return null;
  if (path.endsWith(".html")) {
    const file = path.startsWith("./") ? path.slice(2) : path;
    if (file.includes("/")) return null;
    path = file === "index.html" ? "/" : `/${file.slice(0, -".html".length)}`;
  } else {
    if (!path.startsWith("/")) return null;
    // Like the compiler: every trailing `/` goes (`/login//` → `/login`).
    if (path.length > 1) path = path.replace(/\/+$/, "") || "/";
  }
  return pages.find((p) => p.path === path) ?? null;
}

export type ButtonHrefCheck =
  | { kind: "clear" }
  | { kind: "apply"; href: string; warning: string | null }
  | { kind: "reject"; error: string };

/**
 * Validate a typed button href (§3 table). Empty → clear the link. A blocked
 * scheme is rejected (not applied). A `/…` path with no page is applied with
 * a warning; other relative forms (`./x`, `#top`, `?q`) apply silently.
 */
export function checkButtonHref(raw: string, pages: readonly LinkPage[]): ButtonHrefCheck {
  const href = raw.trim();
  if (!href) return { kind: "clear" };
  const scheme = hrefScheme(href);
  if (scheme !== null) {
    return ALLOWED_SCHEMES.has(scheme)
      ? { kind: "apply", href, warning: null }
      : { kind: "reject", error: HREF_SCHEME_ERROR };
  }
  return { kind: "apply", href, warning: missingPageWarning(href, pages) };
}

/** Warning for a stored href: `/…` (not `//host`) with no matching page. */
export function missingPageWarning(href: string, pages: readonly LinkPage[]): string | null {
  const h = href.trim();
  if (!h.startsWith("/") || h.startsWith("//")) return null;
  return findPageForHref(h, pages) ? null : HREF_MISSING_PAGE;
}
