/**
 * F2 Ruling 2: Space must not scroll the window while focus is on the canvas or a selected node in it.
 * Text fields (input / textarea / contenteditable, the inline editor included) keep Space as a character.
 * Pure (structural types only) so it is unit-testable in bun without a DOM.
 */
export type SpaceTarget = {
  tagName?: string;
  type?: string;
  readOnly?: boolean;
  disabled?: boolean;
  isContentEditable?: boolean;
  dataset?: Record<string, string | undefined>;
  closest?: (selector: string) => unknown;
};

const TEXT_INPUT_TYPES = new Set(["text", "number", "search", "url", "email", "password", "tel", ""]);

export function isTextField(el: SpaceTarget | null | undefined): boolean {
  if (!el) return false;
  if (el.isContentEditable) return true;
  const tag = (el.tagName ?? "").toUpperCase();
  if (tag === "TEXTAREA") return true;
  if (tag === "INPUT") return TEXT_INPUT_TYPES.has(el.type ?? "") && !el.readOnly && !el.disabled;
  return false;
}

/** True when a Space keydown should be default-prevented (canvas scope or a node inside it, not a text field). */
export function shouldPreventSpaceScroll(
  e: { key: string; defaultPrevented?: boolean; ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean },
  active: SpaceTarget | null | undefined,
): boolean {
  if (e.key !== " " || e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return false;
  if (!active || isTextField(active)) return false;
  if (active.dataset?.kbdScope === "canvas") return true;
  return Boolean(active.closest?.('[data-kbd-scope="canvas"]'));
}
