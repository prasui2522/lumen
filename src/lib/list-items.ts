/** Phase 11 A4.1: list items editor (T24 — one item per line). Cap shared with the compiler. */
export const MAX_LIST_ITEMS = 50;

/** Format stored items for the multiline editor. */
export function formatListItems(items: readonly string[]): string {
  return items.join("\n");
}

/**
 * Parse the T24 textarea: one item per line; a trailing blank line from the
 * textarea is dropped; at most {@link MAX_LIST_ITEMS} lines are kept.
 * Empty middle lines stay (they are real empty items).
 */
export function parseListItems(raw: string): string[] {
  const lines = raw.split("\n");
  while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  return lines.slice(0, MAX_LIST_ITEMS);
}
