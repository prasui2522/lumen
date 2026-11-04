import { useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Props = {
  id: string;
  value: string;
  onCommit: (next: string) => void;
  /** Inline error (first issue for this field); wires aria-invalid + aria-describedby. */
  error?: string | null;
  label?: string;
  placeholder?: string;
  mono?: boolean;
  className?: string;
  inputRef?: React.Ref<HTMLInputElement>;
};

/**
 * Draft input committed on blur / Enter, Esc cancels (same contract as
 * `TextPropField`), plus an error line under the field. One commit = one
 * model undo step. Never touches the page history.
 */
export function DbTextField({ id, value, onCommit, error, label, placeholder, mono, className, inputRef }: Props) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft !== null && draft !== value) onCommit(draft);
    setDraft(null);
  };
  const errId = `${id}-err`;
  return (
    <div className={cn("min-w-0", className)}>
      <Input
        id={id}
        ref={inputRef}
        value={draft ?? value}
        aria-label={label}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errId : undefined}
        placeholder={placeholder}
        spellCheck={false}
        className={cn("h-7 min-w-0 px-2 text-xs md:text-xs", mono && "font-mono")}
        onChange={(e) => setDraft(e.currentTarget.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          else if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            setDraft(null);
          }
        }}
      />
      {error ? (
        <p id={errId} className="mt-1 text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
