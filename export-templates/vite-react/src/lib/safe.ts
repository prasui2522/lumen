/**
 * A3 item 3/4: the exported site's own copy of the Rust sanitizers in `compiler.rs`, so a hand-edited or hostile
 * `src/data/site.json` cannot push script URLs, CSS that escapes its declaration, or an out-of-range easing
 * through the Vite renderer. `safeHref` = `safe_href`, `cssSafe` = `css_safe`, `easingCss` = `transition_easing`.
 * Parity is pinned by `src-tauri/src/fixtures/a3/parity.json` (Rust writes it, a bun test replays it here).
 */

/** Unicode Cc (Rust `char::is_control`). */
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/g;
/** Rust `char::is_whitespace` (White_Space), for trim / squash parity (JS `trim` also strips U+FEFF). */
const WS = "\\u0009-\\u000d\\u0020\\u0085\\u00a0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000";
const TRIM = new RegExp(`^[${WS}]+|[${WS}]+$`, "g");
const ALL_WS = new RegExp(`[${WS}]`, "g");
const asciiLower = (s: string) => s.replace(/[A-Z]/g, (c) => c.toLowerCase());

/** Relative URLs, fragments and http(s) / mailto / tel only; anything else becomes `#`. */
export function safeHref(raw: string): string {
  const h = raw.replace(CONTROL, "").replace(TRIM, "");
  if (!h) return "#";
  const squashed = asciiLower(h.replace(ALL_WS, ""));
  const delim = squashed.search(/[/?#]/);
  const firstDelim = delim < 0 ? squashed.length : delim;
  const colon = squashed.indexOf(":");
  if (colon >= 0 && colon < firstDelim) {
    return ["http", "https", "mailto", "tel"].includes(squashed.slice(0, colon)) ? h : "#";
  }
  return h;
}

const CSS_DENY = ["url(", "image-set(", "expression(", "@import", "javascript:", "-moz-binding", "vbscript:", "gradient("];

function cssBalanced(t: string): boolean {
  let quote: string | null = null;
  let depth = 0;
  for (const c of t) {
    if (quote) {
      if (c === quote) quote = null;
    } else if (c === '"' || c === "'") quote = c;
    else if (c === "(") depth++;
    else if (c === ")" && --depth < 0) return false;
  }
  return quote === null && depth === 0;
}

/** Keep a CSS value inside its declaration, or return "" (PHASE-11 A1.3 contract, see `css_safe`). */
export function cssSafe(s: string): string {
  if (s.includes("\\")) return "";
  const out: string[] = [];
  for (const c of s) {
    if ("{};<>".includes(c) || /^[\u0000-\u001f\u007f-\u009f]$/.test(c)) continue;
    out.push(c);
    const n = out.length;
    if (n >= 2 && ((out[n - 2] === "/" && out[n - 1] === "*") || (out[n - 2] === "*" && out[n - 1] === "/"))) {
      out.length = n - 2;
    }
  }
  const t = out.join("").replace(TRIM, "");
  const lower = asciiLower(t);
  if (CSS_DENY.some((d) => lower.includes(d))) return "";
  if (/behavior[\u0009-\u000d\u0020\u0085\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]*:/.test(lower)) return "";
  return cssBalanced(t) ? t : "";
}

/** Largest |y1| / |y2| in `cubic-bezier()` (Rust `BEZIER_Y_MAX`). */
export const BEZIER_Y_MAX = 5;
const BEZIER_NUM = /^[+-]?(\d+\.?\d*|\.\d+)$/;
const SPRING = "cubic-bezier(0.34,1.56,0.64,1)";

function numCss(n: number): string {
  if (!Number.isFinite(n)) return "0";
  if (Number.isInteger(n) && Math.abs(n) < 1e15) return String(n);
  return n.toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
}

/** Keyword easings, `spring`, or a bounded `cubic-bezier()`; anything else is dropped (undefined). */
export function easingCss(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const t = asciiLower(raw.replace(TRIM, ""));
  if (["ease", "ease-in", "ease-out", "ease-in-out", "linear"].includes(t)) return t;
  if (t === "spring") return SPRING;
  if (t.startsWith("cubic-bezier(") && t.endsWith(")")) {
    const parts = t.slice("cubic-bezier(".length, -1).split(",").map((s) => s.replace(TRIM, ""));
    if (parts.length !== 4 || !parts.every((s) => BEZIER_NUM.test(s) && s.replace(/^[+-]/, "").length <= 16)) return undefined;
    const n = parts.map((s) => Number(s) + 0);
    if (n[0]! < 0 || n[0]! > 1 || n[2]! < 0 || n[2]! > 1) return undefined;
    if (Math.abs(n[1]!) > BEZIER_Y_MAX || Math.abs(n[3]!) > BEZIER_Y_MAX) return undefined;
    return `cubic-bezier(${numCss(n[0]!)},${numCss(n[1]!)},${numCss(n[2]!)},${numCss(n[3]!)})`;
  }
  return undefined;
}
