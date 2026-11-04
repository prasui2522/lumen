import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from "react";
import { PipetteIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Toggle } from "@/components/ui/toggle";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { COLOR_PRESETS } from "@/lib/style-fields";
import { useRafCommit } from "@/components/editor/style/useRafCommit";
import { beginHistoryGroup, endHistoryGroup, revertHistoryGroup } from "@/lib/history";

/** Accepts #rgb, #rrggbb, transparent (spec §2.2). */
export const COLOR_RE = /^(#[0-9a-f]{3}|#[0-9a-f]{6}|transparent)$/i;

const CHECKER: CSSProperties = {
  backgroundImage: "conic-gradient(#cbd5e1 25%, #ffffff 0 50%, #cbd5e1 0 75%, #ffffff 0)",
  backgroundSize: "8px 8px",
};

/** Thai names for the preset palette (tooltips + aria labels). */
const PRESET_NAMES: Record<string, string> = {
  "#0f172a": "กรมท่าเข้ม",
  "#334155": "เทาเข้ม",
  "#ffffff": "ขาว",
  "#0ea5e9": "ฟ้า",
  "#0284c7": "ฟ้าเข้ม",
  "#e2e8f0": "เทาอ่อน",
  "#f8fafc": "ขาวอมเทา",
};

function toHex6(v: string | undefined): string | null {
  if (!v) return null;
  if (/^#[0-9a-f]{6}$/i.test(v)) return v.toLowerCase();
  const m = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(v);
  return m ? `#${m[1]}${m[1]}${m[2]}${m[2]}${m[3]}${m[3]}`.toLowerCase() : null;
}

/** Hex text draft: commit on blur/Enter when the regex passes (spec §3). */
function useHexDraft(commit: (v: string) => void) {
  const [draft, setDraft] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(false);
  const reset = () => {
    setDraft(null);
    setInvalid(false);
  };
  const commitText = () => {
    if (draft === null) return;
    const t = draft.trim();
    if (t === "") return reset();
    if (COLOR_RE.test(t)) {
      commit(t.toLowerCase());
      reset();
    } else setInvalid(true);
  };
  const change = (v: string) => {
    setDraft(v);
    setInvalid(false);
  };
  return { draft, invalid, reset, commitText, change };
}

type Props = {
  id: string;
  label: string;
  value: string | undefined;
  onCommit: (v: string) => void;
  allowTransparentToggle?: boolean;
  disabled?: boolean;
  muted?: boolean;
};

/**
 * Color row (UI-REFRESH S4c): swatch chip = PopoverTrigger, inline hex input
 * for fast typing. Popover: presets (roving tabindex, Thai tooltips), hex
 * input, เลือกจากระบบ… (native picker) and โปร่งใส where allowed.
 *
 * Writes: preset / transparent / valid hex = one write each (setNodeStyle
 * no-ops on the current value → no dirty, no undo entry). Opening/closing the
 * popover writes nothing. A native-picker session is ONE undo step: a history
 * group opens when เลือกจากระบบ… is pressed, live `input` events are
 * rAF-coalesced into it, and it closes on the native `change`, on window
 * refocus (GTK dialog closed), on popover close, before any other write from
 * this field, or on unmount. A session that ends on the start color (or never
 * changed it) is reverted → no undo entry, not dirty. The hidden native input
 * lives in the row, not the popover, so closing the popover can't drop events.
 */
export function useColorField({
  id,
  label,
  value,
  onCommit,
  allowTransparentToggle,
  disabled,
  muted,
}: Props) {
  const [open, setOpen] = useState(false);
  const hex = toHex6(value);
  const errId = `${id}-err`;
  const popHexId = `${id}-phex`;
  const popErrId = `${id}-perr`;
  const errText = allowTransparentToggle
    ? "รูปแบบสีไม่ถูกต้อง (#rgb, #rrggbb, transparent)"
    : "รูปแบบสีไม่ถูกต้อง (#rgb, #rrggbb)";

  // ---- native picker session (one history group) ----
  const nativeRef = useRef<HTMLInputElement>(null);
  const pick = useRef<{
    token: number;
    start: string | undefined;
    last?: string;
  } | null>(null);
  const live = useRafCommit(onCommit);
  const endPickRef = useRef<() => void>(() => {});
  endPickRef.current = () => {
    live.flush();
    const p = pick.current;
    if (!p) return;
    pick.current = null;
    window.removeEventListener("focus", onWinFocus);
    if (p.last === undefined || p.last === toHex6(p.start)) revertHistoryGroup(p.token);
    endHistoryGroup(p.token);
  };
  const endPick = useCallback(() => endPickRef.current(), []);
  // Stable listener identity so removeEventListener matches.
  const onWinFocusRef = useRef(() => setTimeout(() => endPickRef.current(), 0));
  const onWinFocus = onWinFocusRef.current;

  useEffect(() => {
    const el = nativeRef.current;
    el?.addEventListener("change", endPick); // native change = picker closed/confirmed
    return () => {
      el?.removeEventListener("change", endPick);
      endPick();
    };
  }, [endPick]);

  /** Every discrete write from this field closes a pending picker session first. */
  const commit = (v: string) => {
    endPick();
    onCommit(v);
  };

  const openSystemPicker = () => {
    const el = nativeRef.current;
    if (!el || disabled) return;
    if (!pick.current) {
      pick.current = { token: beginHistoryGroup(), start: value };
      window.addEventListener("focus", onWinFocus);
    }
    try {
      el.showPicker();
    } catch {
      el.click();
    }
  };

  // ---- hex drafts ----
  const inline = useHexDraft(commit);
  const pop = useHexDraft(commit);

  // ---- presets (roving tabindex, unchanged behaviour) ----
  // Transparent only where it makes sense (background); the โปร่งใส toggle
  // covers it, so the preset grid never repeats it.
  const presets = COLOR_PRESETS.filter((c) => c !== "transparent");
  const presetRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const activeIdx = Math.max(
    0,
    presets.findIndex((c) => c === value?.toLowerCase()),
  );
  const [focusIdx, setFocusIdx] = useState<number | null>(null);
  const tabIdx = focusIdx ?? activeIdx;
  const onPresetKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const last = presets.length - 1;
    const next =
      e.key === "ArrowRight" || e.key === "ArrowDown"
        ? (i + 1) % presets.length
        : e.key === "ArrowLeft" || e.key === "ArrowUp"
          ? (i - 1 + presets.length) % presets.length
          : e.key === "Home"
            ? 0
            : e.key === "End"
              ? last
              : null;
    if (next === null) return;
    e.preventDefault();
    setFocusIdx(next);
    presetRefs.current[next]?.focus();
  };

  const onOpenChange = (o: boolean) => {
    if (o && disabled) return;
    if (!o) {
      endPick();
      pop.reset();
    }
    setOpen(o);
  };
  // Node became locked while open → close.
  if (open && disabled) setOpen(false);

  const control = (
    <>
      <Popover open={open} onOpenChange={onOpenChange}>
        {/* No Tooltip on the chip: focus returns here on close and would re-open it. */}
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={`เลือกสี: ${label}`}
            disabled={disabled}
            className="relative size-[22px] shrink-0 overflow-hidden rounded border border-input outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            style={hex ? { backgroundColor: hex } : CHECKER}
            title="เลือกสี"
          />
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-56 gap-2 p-2.5"
          aria-label={`สี: ${label}`}
          onEscapeKeyDown={(e) => {
            // First Esc in the popover hex field reverts its draft and keeps
            // the popover open; the next Esc closes (focus → trigger).
            if (pop.draft !== null && e.target instanceof HTMLElement && e.target.id === popHexId) {
              e.preventDefault();
              pop.reset();
            }
          }}
        >
          <div className="space-y-1.5">
            <p id={`${id}-ph`} className="text-[11px] font-medium text-muted-foreground">
              สีสำเร็จรูป
            </p>
            <div className="flex flex-wrap gap-1.5" role="group" aria-labelledby={`${id}-ph`}>
              {presets.map((c, i) => {
                const name = PRESET_NAMES[c] ?? c;
                return (
                  <Tooltip key={c}>
                    <TooltipTrigger asChild>
                      <button
                        ref={(el) => {
                          presetRefs.current[i] = el;
                        }}
                        type="button"
                        aria-label={`${label}: ${name} (${c})`}
                        aria-pressed={value?.toLowerCase() === c}
                        tabIndex={i === tabIdx ? 0 : -1}
                        disabled={disabled}
                        onClick={() => commit(c)}
                        onKeyDown={(e) => onPresetKey(e, i)}
                        onFocus={() => setFocusIdx(i)}
                        onBlur={() => setFocusIdx(null)}
                        className={cn(
                          "size-5 rounded-sm border border-input focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring disabled:opacity-50",
                          value?.toLowerCase() === c && "ring-2 ring-ring/60 ring-offset-1",
                        )}
                        style={{ backgroundColor: c }}
                      />
                    </TooltipTrigger>
                    {/* The popover auto-focuses the active swatch, which opens its
                        tooltip — the top dismiss layer. Esc must still close
                        the popover in one press (focus → trigger). */}
                    <TooltipContent onEscapeKeyDown={() => onOpenChange(false)}>
                      {name} <span className="font-mono">{c}</span>
                    </TooltipContent>
                  </Tooltip>
                );
              })}
            </div>
          </div>
          <div className="space-y-1">
            <Input
              id={popHexId}
              aria-label={`รหัสสี: ${label}`}
              value={pop.draft ?? value ?? ""}
              placeholder="#rrggbb"
              disabled={disabled}
              aria-invalid={pop.invalid || undefined}
              aria-describedby={pop.invalid ? popErrId : undefined}
              spellCheck={false}
              className="h-7 px-2 font-mono text-xs md:text-xs"
              onChange={(e) => pop.change(e.currentTarget.value)}
              onBlur={pop.commitText}
              onKeyDown={(e) => {
                if (e.key === "Enter") pop.commitText();
              }}
            />
            {pop.invalid ? (
              <p id={popErrId} className="text-[11px] text-destructive">
                {errText}
              </p>
            ) : null}
          </div>
          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              variant="outline"
              size="xs"
              className="flex-1"
              disabled={disabled}
              onClick={openSystemPicker}
            >
              <PipetteIcon />
              เลือกจากระบบ…
            </Button>
            {allowTransparentToggle ? (
              <Toggle
                size="sm"
                variant="outline"
                className="h-6 min-w-0 gap-1 px-2 text-xs"
                aria-label={`${label}: โปร่งใส`}
                pressed={value === "transparent"}
                disabled={disabled}
                onPressedChange={(p) => {
                  if (p) commit("transparent"); // un-pressing is a no-op
                }}
              >
                <span
                  aria-hidden
                  className="size-3 rounded-[3px] border border-input"
                  style={CHECKER}
                />
                โปร่งใส
              </Toggle>
            ) : null}
          </div>
        </PopoverContent>
      </Popover>
      {/* Native picker target (opened by เลือกจากระบบ…); outside the popover on purpose. */}
      <input
        ref={nativeRef}
        type="color"
        tabIndex={-1}
        aria-hidden
        disabled={disabled}
        value={hex ?? "#000000"}
        onChange={(e) => {
          const v = e.currentTarget.value.toLowerCase();
          if (pick.current) pick.current.last = v;
          live.schedule(v);
        }}
        className="pointer-events-none absolute size-px opacity-0"
      />
      <Input
        id={id}
        value={inline.draft ?? value ?? ""}
        placeholder="—"
        disabled={disabled}
        aria-invalid={inline.invalid || undefined}
        aria-describedby={inline.invalid ? errId : undefined}
        spellCheck={false}
        className={cn(
          "h-7 min-w-0 flex-1 px-2 font-mono text-xs md:text-xs",
          muted && inline.draft === null && "text-muted-foreground",
        )}
        onChange={(e) => inline.change(e.currentTarget.value)}
        onBlur={inline.commitText}
        onKeyDown={(e) => {
          if (e.key === "Enter") inline.commitText();
          else if (e.key === "Escape") {
            e.preventDefault();
            inline.reset();
          }
        }}
      />
    </>
  );

  const footer = inline.invalid ? (
    <p id={errId} className="text-[11px] text-destructive">
      {errText}
    </p>
  ) : null;

  return { control, footer };
}
