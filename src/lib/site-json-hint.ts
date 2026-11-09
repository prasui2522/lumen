/**
 * R4: site.json completions from node kinds and style keys already in the app.
 * No language server.
 */
import { STYLE_KEYS } from "@/schema";
import type { CompletionContext, CompletionResult } from "@codemirror/autocomplete";

/** Matches `NodeType` in schema.ts. */
export const NODE_TYPES = [
  "page",
  "section",
  "container",
  "heading",
  "text",
  "image",
  "button",
  "link",
  "spacer",
  "input",
  "switch",
  "textarea",
  "kbd",
  "avatar",
  "progress",
  "slider",
  "empty",
  "item",
  "marker",
  "bubble",
  "message",
  "select",
  "radio",
  "toggle",
  "toggleGroup",
  "tabs",
  "inputGroup",
  "inputOtp",
  "accordion",
  "collapsible",
  "breadcrumb",
  "pagination",
  "navigationMenu",
  "menubar",
  "dropdownMenu",
  "dialog",
  "alertDialog",
  "sheet",
  "drawer",
  "popover",
  "tooltip",
  "hoverCard",
  "card",
  "alert",
  "badge",
  "separator",
  "skeleton",
  "spinner",
  "aspectRatio",
  "scrollArea",
  "buttonGroup",
  "checkbox",
  "field",
  "list",
  "table",
  "icon",
  "carousel",
  "chart",
  "calendar",
  "command",
  "contextMenu",
  "resizable",
  "toast",
] as const;

const DOC_KEYS = ["version", "meta", "root", "nodes", "pages", "type", "props", "style", "children", "id"];

export function siteJsonHintLabels(before: string): readonly string[] {
  if (/"style"\s*:\s*\{[^}]*$/.test(before)) return STYLE_KEYS;
  if (/"type"\s*:\s*"[\w]*$/.test(before)) return NODE_TYPES;
  return DOC_KEYS;
}

export function siteJsonComplete(ctx: CompletionContext): CompletionResult | null {
  const word = ctx.matchBefore(/[\w"]*/);
  if (!word && !ctx.explicit) return null;
  const from = word ? word.from : ctx.pos;
  const before = ctx.state.sliceDoc(Math.max(0, ctx.pos - 120), ctx.pos);
  const labels = siteJsonHintLabels(before);
  return {
    from,
    options: labels.map((label) => ({ label })),
  };
}
