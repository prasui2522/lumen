/**
 * Top-bar search field → command palette (WCAG 3.2.1: focus alone never opens).
 * Opens on click, Enter, Space, or the first printable character (which is
 * carried into the query). Modifier combos, Tab, arrows and IME composition
 * keys pass through; composed text opens the palette on compositionend.
 */
export type SearchKey = {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  isComposing: boolean;
};

export type SearchKeyAction = { type: "pass" } | { type: "open"; append: string };

export function searchKeyAction(e: SearchKey): SearchKeyAction {
  if (e.isComposing || e.key === "Process" || e.key === "Unidentified") return { type: "pass" };
  if (e.ctrlKey || e.metaKey || e.altKey) return { type: "pass" };
  if (e.key === "Enter" || e.key === " ") return { type: "open", append: "" };
  // One code point = a printable character (Thai vowels/tone marks included);
  // named keys ("Tab", "ArrowDown", "Shift"…) are longer.
  if ([...e.key].length === 1) return { type: "open", append: e.key };
  return { type: "pass" };
}
