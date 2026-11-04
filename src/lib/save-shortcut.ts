/**
 * Ctrl/Cmd+S decision (pure, unit-tested). EditorPage owns the side effects.
 *
 * - "pass": not our key, leave the event alone.
 * - "prevent": our key, preventDefault only (repeat, overlay/palette open,
 *   clean project, or a save already in flight).
 * - "commit": inline text edit open: commit it, then ask again.
 * - "commit-title": focus in the project title field: commit the typed title
 *   (same rule as blur), then ask again.
 * - "save": preventDefault and run the save-button path.
 */
export type SaveShortcutAction = "pass" | "prevent" | "commit" | "commit-title" | "save";

export type SaveKey = {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  repeat: boolean;
};

export type SaveState = {
  /** Any dialog / alert-dialog / popover / menu, or the Ctrl+K palette, is open. */
  blocked: boolean;
  editing: boolean;
  /** Focus is in the project title field (uncommitted typing). */
  titleFocused?: boolean;
  dirty: boolean;
  saving: boolean;
};

export function isSaveShortcut(e: SaveKey): boolean {
  return (e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "s";
}

export function saveShortcutAction(e: SaveKey, s: SaveState): SaveShortcutAction {
  if (!isSaveShortcut(e)) return "pass";
  if (e.repeat || s.blocked) return "prevent";
  if (s.editing) return "commit";
  if (s.titleFocused) return "commit-title";
  if (s.saving || !s.dirty) return "prevent";
  return "save";
}
