/**
 * S2 Tier 1 Preview (PREVIEW-CODE-VIEW-SPEC §1): protocol between the app and the
 * prebuilt runtime frame (`public/preview-runtime/preview.html`, built from
 * `export-templates/vite-react/src/preview-runtime.tsx`). Pure helpers, no DOM.
 */

/** Served by Vite (dev) / the Tauri frontend dist (prod) under the app origin. */
export const RUNTIME_URL = "/preview-runtime/preview.html";

/** Frame did not report ready within this → fall back to the in-app compiler. */
export const RUNTIME_READY_TIMEOUT_MS = 3000;

/** Debounce for re-sending the document while Preview is open. */
export const RUNTIME_UPDATE_MS = 150;

/** `preview_bundle` command result (camelCase via serde). */
export type PreviewBundle = {
  siteJson: string;
  siteCss: string;
  kindsCss: string;
  assetUrls: Record<string, string>;
};

export type RuntimePayload = {
  site: Record<string, unknown>;
  siteCss: string;
  kindsCss: string;
};

/** Merge the bundle into the message the frame expects (`assetUrls` lives on the site object). */
export function payloadFromBundle(b: PreviewBundle): RuntimePayload {
  const site = JSON.parse(b.siteJson) as Record<string, unknown>;
  if (Object.keys(b.assetUrls).length > 0) site.assetUrls = b.assetUrls;
  return { site, siteCss: b.siteCss, kindsCss: b.kindsCss };
}

export type AppToFrame =
  | ({ type: "wb:site"; path?: string } & RuntimePayload)
  | { type: "wb:navigate"; path: string };

export type FrameToApp =
  | { type: "wb:ready" }
  | { type: "wb:height"; height: number }
  | { type: "wb:route"; path: string }
  | { type: "wb:external"; href: string }
  | { type: "wb:select"; id: string | null }
  | { type: "wb:boxes"; boxes: { id: string; x: number; y: number; w: number; h: number }[] }
  | { type: "wb:edit"; id: string | null };

const FRAME_TYPES = new Set([
  "wb:ready",
  "wb:height",
  "wb:route",
  "wb:external",
  "wb:select",
  "wb:boxes",
  "wb:edit",
]);

/**
 * Accept a message only from the given frame's own window. Tier 1 uses an
 * opaque origin (`"null"`). Tier 2 Vite uses `http://127.0.0.1:<port>`.
 */
export function frameMessage(
  e: { source: unknown; origin: string; data: unknown },
  frame: HTMLIFrameElement | null,
  origin = "null",
): FrameToApp | null {
  if (!frame?.contentWindow || e.source !== frame.contentWindow) return null;
  if (e.origin !== origin) return null;
  const d = e.data as { type?: unknown } | null;
  if (!d || typeof d !== "object" || typeof d.type !== "string" || !FRAME_TYPES.has(d.type)) return null;
  return d as FrameToApp;
}

/**
 * Fill-height from the frame's reported document height (DeviceStage `fill`):
 * keeps the frame at least `min`, grows with content, and treats a page that
 * grows with the frame (vh content) as `base` so it scrolls inside the frame.
 */
export function nextFillHeight(
  reported: number,
  current: number,
  base: number,
  min: number,
  slack: number,
): number {
  if (reported <= base + 1) return Math.max(min, Math.min(base, reported + slack));
  // Content already fits the frame we grew to → vh-driven page.
  if (current > base && Math.abs(reported - current) <= slack + 2) return base;
  return reported + slack;
}
