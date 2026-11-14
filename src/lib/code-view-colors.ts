/**
 * A3 item 8: code-view colours follow the theme. CodeMirror's default token colours are dark-on-light and
 * its base selection is #d7d4f0 / #d9d9d9, so in the dark theme (light text) the selected text and many
 * tokens dropped below WCAG AA. Each default token colour maps to a CSS variable (index.css): the light
 * values are CodeMirror's own; dark values are lighter shades checked for 4.5:1 on the dark
 * background, selection, blurred selection, and search match, with selection chrome ≥ 3:1 vs the background.
 */
export const CM_TOKEN_VARS: Readonly<Record<string, string>> = {
  "#404740": "--cm-meta",
  "#708": "--cm-keyword",
  "#219": "--cm-atom",
  "#164": "--cm-literal",
  "#a11": "--cm-string",
  "#e40": "--cm-regexp",
  "#00f": "--cm-def-var",
  "#30a": "--cm-local-var",
  "#085": "--cm-type",
  "#167": "--cm-class",
  "#256": "--cm-special-var",
  "#00c": "--cm-def-prop",
  "#940": "--cm-comment",
  "#f00": "--cm-invalid",
};

/** Same specs, each known colour read from its variable (with the default as fallback). */
export function themedSpecs<T extends object>(specs: readonly T[]): T[] {
  return specs.map((s) => {
    const c = (s as { color?: unknown }).color;
    const v = typeof c === "string" ? CM_TOKEN_VARS[c] : undefined;
    return v ? { ...s, color: `var(${v}, ${c})` } : s;
  });
}
