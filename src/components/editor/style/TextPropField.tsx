import { useState } from "react";
import { Input } from "@/components/ui/input";

type Props = {
  id: string;
  value: string;
  onCommit: (v: string) => void;
  disabled?: boolean;
  placeholder?: string;
  mono?: boolean;
  /** F2 D6: accessible name when the visible row label does not name this input. */
  ariaLabel?: string;
};

/**
 * Plain text prop (href, asset id, alt). Commits once on blur/Enter (one undo
 * step); Escape discards the draft without writing (no history entry).
 */
export function TextPropField({ id, value, onCommit, disabled, placeholder, mono, ariaLabel }: Props) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft !== null && draft !== value) onCommit(draft);
    setDraft(null);
  };
  return (
    <Input
      id={id}
      aria-label={ariaLabel}
      value={draft ?? value}
      disabled={disabled}
      placeholder={placeholder}
      spellCheck={false}
      className={`h-7 min-w-0 flex-1 px-2 text-xs md:text-xs${mono ? " font-mono" : ""}`}
      onChange={(e) => setDraft(e.currentTarget.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
        else if (e.key === "Escape") {
          e.preventDefault();
          setDraft(null);
        }
      }}
    />
  );
}
