/** Phase 11 A3.4: select options editor (T22 — one option per line). Cap is shared with the compiler. */
export const MAX_SELECT_OPTIONS = 100;

/** Format stored options for the multiline editor. */
export function formatSelectOptions(options: readonly string[]): string {
  return options.join("\n");
}

/**
 * Parse the T22 textarea: one option per line; a trailing blank line from the
 * textarea is dropped; at most {@link MAX_SELECT_OPTIONS} lines are kept.
 * Empty middle lines stay (they are real empty options).
 */
export function parseSelectOptions(raw: string): string[] {
  const lines = raw.split("\n");
  while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  return lines.slice(0, MAX_SELECT_OPTIONS);
}
