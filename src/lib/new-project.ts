/**
 * New-project dialog submit rule. While a create is in flight the form stays
 * focusable (aria-disabled + readOnly, not disabled, so focus never drops to
 * <body>), so a second Enter must be ignored here. `busy` is the parent's
 * flag OR the dialog's own in-flight flag (set synchronously on the first
 * submit, kept until the dialog reopens or the create failed).
 */
export type NameSubmit = { kind: "ignore" } | { kind: "invalid" } | { kind: "submit"; name: string };

export function nameSubmit(name: string, busy: boolean | undefined): NameSubmit {
  if (busy) return { kind: "ignore" };
  const trimmed = name.trim();
  // Whitespace is not a name, and must not fall back to หน้าใหม่.
  if (!trimmed) return { kind: "invalid" };
  return { kind: "submit", name: trimmed };
}
