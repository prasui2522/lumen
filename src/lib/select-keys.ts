/**
 * Enter on a ui/select option. Radix commits on keydown, and the list's focus
 * handoff (ui/select SelectFocusReturn) moves focus to the trigger before that
 * keydown has finished. The browser's Enter activation (keypress → a click
 * with detail 0) then lands on the trigger and the list reopens. Cancelling
 * the keydown's default once the option has handled it stops the activation;
 * focus still goes straight to the trigger (never <body>). Space already has
 * its default cancelled by Radix.
 */
export type CommitKeyEvent = {
  key: string;
  defaultPrevented: boolean;
  altKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  isComposing?: boolean;
  target: unknown;
  preventDefault(): void;
};

/** True when this keydown commits an option and its default must be cancelled. */
export function isOptionCommitKey(e: CommitKeyEvent, isOption: (target: unknown) => boolean): boolean {
  if (e.key !== "Enter" || e.defaultPrevented || e.isComposing) return false;
  if (e.altKey || e.ctrlKey || e.metaKey) return false;
  return isOption(e.target);
}

/** DOM check: an enabled option of a ui/select list. */
export function isSelectOption(target: unknown): boolean {
  if (typeof Element === "undefined" || !(target instanceof Element)) return false;
  return target.getAttribute("role") === "option" && target.getAttribute("aria-disabled") !== "true" && !!target.closest('[data-slot="select-content"]');
}

/** Bubble-phase keydown handler for the list (runs after the option has committed). */
export function cancelOptionCommitKey(e: CommitKeyEvent, isOption: (target: unknown) => boolean = isSelectOption): void {
  if (isOptionCommitKey(e, isOption)) e.preventDefault();
}
