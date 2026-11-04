import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useRafCommit } from "@/components/editor/style/useRafCommit";
import { emptiedBackToUnset } from "@/components/editor/style/number-draft";
import {
  beginHistoryGroup,
  endHistoryGroup,
  revertHistoryGroup,
} from "@/lib/history";

type Props = {
  id: string;
  value: number | undefined;
  onCommit: (n: number) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  disabled?: boolean;
  muted?: boolean;
  placeholder?: string;
  ariaLabel?: string;
  className?: string;
  compact?: boolean;
  autoFocus?: boolean;
};

const fmt = (v: number) => String(Math.round(v * 100) / 100);

/**
 * Number input (spec §2, §5): writes each valid parse coalesced per frame;
 * empty/invalid/out-of-range text is not written while typing; Enter/blur
 * finalise (out-of-range is clamped then); Escape restores the
 * document from focus time (no undo entry); Shift+Arrow steps ×10; clamped.
 * One focus → Enter/blur session is ONE undo step (history group).
 */
export function NumberField({
  id,
  value,
  onCommit,
  min = -Infinity,
  max = Infinity,
  step = 1,
  suffix,
  disabled,
  muted,
  placeholder = "—",
  ariaLabel,
  className,
  compact,
  autoFocus,
}: Props) {
  const [draft, setDraft] = useState<string | null>(null);
  const groupRef = useRef<number | null>(null);
  /** Value at focus: an originally EMPTY field emptied again means "unset". */
  const startRef = useRef<number | undefined>(undefined);
  const { schedule, flush, cancel } = useRafCommit(onCommit);

  const endGroup = () => {
    if (groupRef.current !== null) endHistoryGroup(groupRef.current);
    groupRef.current = null;
  };
  // Unmount while focused (selection change) may skip onBlur — close group.
  useEffect(() => () => endGroup(), []);

  const clamp = (n: number) => Math.min(max, Math.max(min, n));
  const shown = draft ?? (value === undefined ? "" : fmt(value));
  const invalid =
    draft !== null && draft.trim() !== "" && !Number.isFinite(Number(draft));

  const inRange = (n: number) => n >= min && n <= max;

  // Out-of-range text is only clamped + written on Enter/blur, so typing
  // "1" on the way to "14" (min 8) does not write 8.
  const finish = () => {
    flush();
    if (draft !== null && draft.trim() !== "") {
      const n = Number(draft);
      if (Number.isFinite(n) && !inRange(n)) onCommit(clamp(n));
    }
    setDraft(null);
    endGroup();
  };

  return (
    <div className={cn("relative min-w-0 flex-1", className)}>
      <Input
        id={id}
        type="number"
        inputMode="decimal"
        value={shown}
        min={Number.isFinite(min) ? min : undefined}
        max={Number.isFinite(max) ? max : undefined}
        step={step}
        disabled={disabled}
        placeholder={placeholder}
        autoFocus={autoFocus}
        aria-label={ariaLabel}
        aria-invalid={invalid || undefined}
        className={cn(
          "h-7 text-xs md:text-xs",
          compact ? "px-1" : "px-2",
          suffix && "pr-7",
          muted && draft === null && "text-muted-foreground",
          "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
        )}
        onFocus={() => {
          endGroup();
          startRef.current = value;
          groupRef.current = beginHistoryGroup();
        }}
        onChange={(e) => {
          const t = e.currentTarget.value;
          setDraft(t);
          const n = Number(t);
          if (emptiedBackToUnset(startRef.current, t)) {
            // Typed 1 → 12 → 123 then emptied (Backspace or native Ctrl+Z):
            // drop the pending write and every write of this session, so the
            // document is back to its pre-focus object (0 steps, not dirty).
            // Without this the last valid draft ("1") stayed written.
            cancel();
            if (groupRef.current !== null) revertHistoryGroup(groupRef.current);
          } else if (t.trim() !== "" && Number.isFinite(n) && inRange(n)) schedule(n);
        }}
        onBlur={finish}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            finish();
            groupRef.current = beginHistoryGroup(); // still focused
          } else if (e.key === "Escape") {
            e.preventDefault();
            cancel();
            setDraft(null);
            if (groupRef.current !== null) revertHistoryGroup(groupRef.current);
          } else if (
            e.shiftKey &&
            (e.key === "ArrowUp" || e.key === "ArrowDown")
          ) {
            e.preventDefault();
            const base = Number(draft ?? value ?? 0);
            const n = clamp(
              (Number.isFinite(base) ? base : 0) +
                (e.key === "ArrowUp" ? 10 : -10) * step,
            );
            setDraft(fmt(n));
            schedule(n);
          }
        }}
      />
      {suffix ? (
        <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-[11px] text-muted-foreground">
          {suffix}
        </span>
      ) : null}
    </div>
  );
}
