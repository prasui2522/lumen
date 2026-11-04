/** Fallback when the typed project title is empty or whitespace-only. */
export const DEFAULT_PROJECT_TITLE = "หน้าใหม่";

/** The one title rule, shared by the title field's blur and Ctrl/Cmd+S. */
export function commitProjectTitle(raw: string): string {
  return raw.trim() || DEFAULT_PROJECT_TITLE;
}

/**
 * After a title blur (or Enter) has committed via `commitOpenTitle`: save only
 * when the project is dirty and no save is already running. A blur with no net
 * change, or right after a Ctrl/Cmd+S, makes no save call.
 */
export function titleBlurShouldSave(s: { dirty: boolean; saving: boolean }): boolean {
  return s.dirty && !s.saving;
}
