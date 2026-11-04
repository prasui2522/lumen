/** The field started empty (unset) and its text is empty again: no value, no step. */
export const emptiedBackToUnset = (start: number | undefined, text: string) =>
  start === undefined && text.trim() === "";
