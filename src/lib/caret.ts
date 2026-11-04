/** Minimal input surface (testable without a DOM). */
export type CaretTarget = {
  value: string;
  focus: (opts?: FocusOptions) => void;
  setSelectionRange: (start: number, end: number) => void;
};

/**
 * Focus and put the caret after the last character, never selecting the text.
 * Used when the command palette opens seeded with typed text (Radix focus
 * scope would otherwise `select()` it, so the next key replaced it).
 */
export function focusCaretAtEnd(el: CaretTarget | null | undefined): boolean {
  if (!el) return false;
  el.focus({ preventScroll: true });
  const len = el.value.length;
  el.setSelectionRange(len, len);
  return true;
}
