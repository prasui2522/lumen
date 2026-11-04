#!/usr/bin/env node
/**
 * Phase 11 A4.4 — generate `src/lib/icon-paths.ts` from lucide-react path data.
 * Run: `node scripts/gen-icon-paths.mjs`
 *
 * Curated ≈ 80 icons for website-builder blocks (features, pricing, contact, UI).
 * Re-run after bumping lucide-react if path data drifts.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ICONS_DIR = join(ROOT, "node_modules/lucide-react/dist/esm/icons");
const OUT = join(ROOT, "src/lib/icon-paths.ts");
const OUT_RS = join(ROOT, "src-tauri/src/icon_paths.rs");

/** kebab-case Lucide names — keep ≈ 80. Order is display order in the picker. */
const ICON_NAMES = [
  // Navigation & arrows
  "arrow-down",
  "arrow-left",
  "arrow-right",
  "arrow-up",
  "arrow-down-circle",
  "arrow-left-circle",
  "arrow-right-circle",
  "arrow-up-circle",
  "chevron-down",
  "chevron-left",
  "chevron-right",
  "chevron-up",
  "chevrons-down",
  "chevrons-up",
  "external-link",
  "menu",
  // Actions
  "link",
  "link-2",
  "plus",
  "minus",
  "x",
  "check",
  "search",
  "download",
  "upload",
  "copy",
  "trash-2",
  "pencil",
  "settings",
  "filter",
  "share-2",
  // Feedback
  "info",
  "alert-triangle",
  "alert-circle",
  "help-circle",
  "circle-check",
  "circle",
  "x-circle",
  // People & contact
  "home",
  "user",
  "users",
  "mail",
  "phone",
  "map-pin",
  "calendar",
  "clock",
  // Content
  "star",
  "heart",
  "bookmark",
  "tag",
  "image",
  "file",
  "folder",
  "globe",
  "eye",
  "eye-off",
  // Commerce / features
  "shopping-cart",
  "credit-card",
  "package",
  "truck",
  "gift",
  "zap",
  "sparkles",
  "award",
  "trophy",
  "target",
  "shield",
  "lock",
  "unlock",
  // Communication / media / chrome
  "bell",
  "message-circle",
  "send",
  "play",
  "camera",
  "layout-grid",
  "layers",
  "sun",
  "moon",
  "log-in",
  "log-out",
];

/** Feather-derived Lucide icons (MIT, Cole Bemis) — from lucide-react LICENSE. */
const FEATHER_DERIVED = new Set(
  `airplay, alert-circle, alert-octagon, alert-triangle, aperture, arrow-down-circle, arrow-down-left, arrow-down-right, arrow-down, arrow-left-circle, arrow-left, arrow-right-circle, arrow-right, arrow-up-circle, arrow-up-left, arrow-up-right, arrow-up, at-sign, calendar, cast, check, chevron-down, chevron-left, chevron-right, chevron-up, chevrons-down, chevrons-left, chevrons-right, chevrons-up, circle, clipboard, clock, code, columns, command, compass, corner-down-left, corner-down-right, corner-left-down, corner-left-up, corner-right-down, corner-right-up, corner-up-left, corner-up-right, crosshair, database, divide-circle, divide-square, dollar-sign, download, external-link, feather, frown, hash, headphones, help-circle, info, italic, key, layout, life-buoy, link-2, link, loader, lock, log-in, log-out, maximize, meh, minimize, minimize-2, minus-circle, minus-square, minus, monitor, moon, more-horizontal, more-vertical, move, music, navigation-2, navigation, octagon, pause-circle, percent, plus-circle, plus-square, plus, power, radio, rss, search, server, share, shopping-bag, sidebar, smartphone, smile, square, table-2, tablet, target, terminal, trash-2, trash, triangle, tv, type, upload, x-circle, x-octagon, x-square, x, zoom-in, zoom-out`
    .split(", ")
    .map((s) => s.trim()),
);

const ATTR_ORDER = [
  "d",
  "cx",
  "cy",
  "r",
  "x",
  "y",
  "x1",
  "y1",
  "x2",
  "y2",
  "width",
  "height",
  "rx",
  "ry",
  "points",
  "fill",
  "stroke",
  "stroke-width",
  "stroke-linecap",
  "stroke-linejoin",
  "stroke-dasharray",
  "opacity",
  "transform",
];

function esc(v) {
  return String(v)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}

function serializeNode(node) {
  const [tag, attrs] = node;
  if (typeof tag !== "string" || !attrs || typeof attrs !== "object") {
    throw new Error(`unexpected lucide node: ${JSON.stringify(node)}`);
  }
  const parts = [];
  const seen = new Set();
  for (const k of ATTR_ORDER) {
    if (k in attrs && k !== "key") {
      parts.push(`${k}="${esc(attrs[k])}"`);
      seen.add(k);
    }
  }
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "key" || seen.has(k)) continue;
    parts.push(`${k}="${esc(v)}"`);
  }
  return parts.length ? `<${tag} ${parts.join(" ")}/>` : `<${tag}/>`;
}

async function importIconModule(name) {
  const file = join(ICONS_DIR, `${name}.mjs`);
  const mod = await import(pathToFileURL(file).href);
  if (mod.__iconData?.node) return mod;
  // Alias barrel: `export { default } from './canonical.mjs'`
  const src = readFileSync(file, "utf8");
  const m = src.match(/from\s+['"]\.\/([^'"]+)['"]/);
  if (!m) throw new Error(`no __iconData and no re-export for ${name}`);
  const target = m[1].replace(/\.mjs$/, "");
  const canon = await import(pathToFileURL(join(ICONS_DIR, `${target}.mjs`)).href);
  if (!canon.__iconData?.node) throw new Error(`canonical ${target} has no __iconData for alias ${name}`);
  return canon;
}

async function loadInner(name) {
  const mod = await importIconModule(name);
  return mod.__iconData.node.map(serializeNode).join("");
}

const inners = {};
for (const name of ICON_NAMES) {
  inners[name] = await loadInner(name);
}

const featherUsed = ICON_NAMES.filter((n) => FEATHER_DERIVED.has(n));
const header = `/**
 * Phase 11 A4.4 — curated Lucide icon path data (lazy \`icon-paths\` chunk).
 *
 * GENERATED by \`scripts/gen-icon-paths.mjs\` from lucide-react — do not edit by hand.
 * Licence: ISC (Lucide); Feather-derived icons also MIT (Cole Bemis). See THIRD-PARTY-NOTICES.md.
 */
`;

const namesLit = ICON_NAMES.map((n) => `  "${n}",`).join("\n");
const pathsLit = ICON_NAMES.map((n) => `  "${n}": ${JSON.stringify(inners[n])},`).join("\n");

const body = `${header}
export const ICON_NAMES = [
${namesLit}
] as const;

export type IconName = (typeof ICON_NAMES)[number];

/** SVG child markup (path/circle/rect/…) for each curated icon. */
export const ICON_PATHS: Record<IconName, string> = {
${pathsLit}
};

const NAME_SET: ReadonlySet<string> = new Set(ICON_NAMES);

export function isIconName(name: string): name is IconName {
  return NAME_SET.has(name);
}

export function iconInnerSvg(name: string): string | undefined {
  return isIconName(name) ? ICON_PATHS[name] : undefined;
}

export type IconSvgOptions = {
  size?: number;
  strokeWidth?: number;
  /** When set, \`role="img"\` + \`aria-label\`; otherwise decorative \`aria-hidden\`. */
  label?: string;
  className?: string;
};

/** Full inline SVG markup matching Phase 11 §9 A4 \`icon\` export shape. */
export function iconSvgMarkup(name: string, opts: IconSvgOptions = {}): string | undefined {
  const inner = iconInnerSvg(name);
  if (inner === undefined) return undefined;
  const size = opts.size ?? 24;
  const strokeWidth = opts.strokeWidth ?? 2;
  const label = opts.label?.trim() ?? "";
  const cls = opts.className ? \` class="\${opts.className}"\` : "";
  const a11y = label
    ? \` role="img" aria-label="\${escAttr(label)}"\`
    : \` aria-hidden="true"\`;
  return \`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="\${size}" height="\${size}" fill="none" stroke="currentColor" stroke-width="\${strokeWidth}" stroke-linecap="round" stroke-linejoin="round"\${cls}\${a11y}>\${inner}</svg>\`;
}

function escAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

/**
 * Lazy-chunk anchor for \`lazyNamed\` (A4.4). A4.5 mounts the real picker/view;
 * this keeps path data out of the entry graph until first preload/render.
 * Touches \`ICON_PATHS\` so Rollup does not tree-shake the registry out of the async chunk
 * when the importer only selects this export.
 */
export function IconPathsLazyAnchor(_props: object = {}) {
  void ICON_PATHS;
  return null;
}

/** Stable handle for A4.5 (picker / canvas / export) after the chunk loads. */
export function getIconPaths() {
  return ICON_PATHS;
}

/** Feather-derived subset present in this curated list (for notices / A4.6). */
export const FEATHER_DERIVED_ICON_NAMES = [
${featherUsed.map((n) => `  "${n}",`).join("\n")}
] as const satisfies readonly IconName[];
`;

writeFileSync(OUT, body);
// Same path table for the Vite export template (Phase 12 + A4.5/A4.6).
writeFileSync(join(ROOT, "export-templates/vite-react/src/lib/icon-paths.ts"), body);

const rsArms = ICON_NAMES.map(
  (n) => `        "${n}" => Some(r###"${inners[n]}"###),`,
).join("\n");
const rsFeather = featherUsed.map((n) => `    "${n}",`).join("\n");
const rs = `//! Phase 11 A4.4/A4.5 — curated Lucide icon path data for the HTML compiler.
//! GENERATED by \`scripts/gen-icon-paths.mjs\` — do not edit by hand.
//! Licence: ISC (Lucide); Feather-derived also MIT (Cole Bemis). See THIRD-PARTY-NOTICES.md.

/// Inner SVG markup (path/circle/rect/…) for a curated icon name.
pub fn icon_inner(name: &str) -> Option<&'static str> {
    match name {
${rsArms}
        _ => None,
    }
}

/// Default glyph when \`name\` is missing from the curated set.
pub const DEFAULT_ICON_NAME: &str = "star";

/// Feather-derived names present in the curated set (A4.6 notices).
pub const FEATHER_DERIVED_ICON_NAMES: &[&str] = &[
${rsFeather}
];

/// Every curated icon name (picker / tests).
#[allow(dead_code)]
pub const ICON_NAMES: &[&str] = &[
${ICON_NAMES.map((n) => `    "${n}",`).join("\n")}
];
`;
writeFileSync(OUT_RS, rs);

console.log(
  `wrote ${OUT} + ${OUT_RS} (${ICON_NAMES.length} icons, ${featherUsed.length} Feather-derived, ts ${Buffer.byteLength(body)} B)`,
);
