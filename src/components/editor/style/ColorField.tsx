import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from "react";
import { PipetteIcon } from "lucide-react";
import { Slider as SliderPrimitive } from "radix-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Toggle } from "@/components/ui/toggle";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { COLOR_PRESETS } from "@/lib/style-fields";
import {
  COLOR_ERR_NO_TRANSPARENT,
  COLOR_ERR_T69,
  COLOR_RE,
  formatColor,
  parseColorParts,
  toOpaqueHex6,
  withPreservedAlpha,
} from "@/lib/color-hex";
import { useRafCommit } from "@/components/editor/style/useRafCommit";
import { beginHistoryGroup, endHistoryGroup, revertHistoryGroup } from "@/lib/history";

export { COLOR_RE } from "@/lib/color-hex";

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

/** Swatch fill: checker under translucent colours. */
function swatchStyle(value: string | undefined): CSSProperties {
  if (!value || value === "transparent") return CHECKER;
  const parts = parseColorParts(value);
  if (!parts) return CHECKER;
  if (parts.alpha >= 100) return { backgroundColor: parts.rgb };
  return {
    ...CHECKER,
    backgroundImage: `${CHECKER.backgroundImage}, linear-gradient(${formatColor(parts.rgb, parts.alpha)}, ${formatColor(parts.rgb, parts.alpha)})`,
    backgroundSize: "8px 8px, 100% 100%",
  };
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
 * Color row (UI-REFRESH S4c + B2.1 alpha): swatch chip = PopoverTrigger, inline
 * hex input. Popover: presets, hex (#rgb/#rgba/#rrggbb/#rrggbbaa), alpha slider
 * T56, เลือกจากระบบ… and โปร่งใส where allowed. Value stored lowercase.
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
  const hex = toOpaqueHex6(value);
  const parts = parseColorParts(value);
  const errId = `${id}-err`;
  const popHexId = `${id}-phex`;
  const popErrId = `${id}-perr`;
  const alphaId = `${id}-alpha`;
  const errText = allowTransparentToggle ? COLOR_ERR_T69 : COLOR_ERR_NO_TRANSPARENT;

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
    // Session that never changed the stored value → no undo entry.
    if (p.last === undefined || p.last === p.start) revertHistoryGroup(p.token);
    endHistoryGroup(p.token);
  };
  const endPick = useCallback(() => endPickRef.current(), []);
  const onWinFocusRef = useRef(() => setTimeout(() => endPickRef.current(), 0));
  const onWinFocus = onWinFocusRef.current;

  useEffect(() => {
    const el = nativeRef.current;
    el?.addEventListener("change", endPick);
    return () => {
      el?.removeEventListener("change", endPick);
      endPick();
    };
  }, [endPick]);

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

  // ---- alpha slider (T56): pointer drag = one write on release ----
  const [alphaDraft, setAlphaDraft] = useState<number | null>(null);
  const alphaDragging = useRef(false);
  const alphaDraftRef = useRef<number | null>(null);
  const alphaStartRef = useRef<string | undefined>(undefined);

  const finishAlphaDrag = () => {
    if (!alphaDragging.current) return;
    alphaDragging.current = false;
    const a = alphaDraftRef.current;
    alphaDraftRef.current = null;
    setAlphaDraft(null);
    if (a == null || !parts) return;
    const next = formatColor(parts.rgb, a);
    if (next !== alphaStartRef.current) commit(next);
  };

  const onAlphaChange = (a: number) => {
    setAlphaDraft(a);
    if (alphaDragging.current) {
      alphaDraftRef.current = a;
      return;
    }
    // Keyboard step: one write, coalesced by the style history key.
    if (!parts) return;
    commit(formatColor(parts.rgb, a));
  };

  // ---- presets (roving tabindex) ----
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
      finishAlphaDrag();
    }
    setOpen(o);
  };
  if (open && disabled) setOpen(false);

  const showAlpha = !!parts && value !== "transparent";
  const alphaPct = alphaDraft ?? parts?.alpha ?? 100;

  const control = (
    <>
      <Popover open={open} onOpenChange={onOpenChange}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={`เลือกสี: ${label}`}
            disabled={disabled}
            className="relative size-[22px] shrink-0 overflow-hidden rounded border border-input outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            style={swatchStyle(value)}
            title="เลือกสี"
          />
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-56 gap-2 p-2.5"
          aria-label={`สี: ${label}`}
          onEscapeKeyDown={(e) => {
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
          {showAlpha ? (
            <div className="space-y-1">
              <p id={`${alphaId}-lbl`} className="text-[11px] font-medium text-muted-foreground">
                ความโปร่งของสี
              </p>
              <div className="flex items-center gap-2">
                <SliderPrimitive.Root
                  min={0}
                  max={100}
                  step={1}
                  value={[alphaPct]}
                  disabled={disabled}
                  data-slot="slider"
                  aria-labelledby={`${alphaId}-lbl`}
                  className="relative flex h-7 min-w-0 flex-1 touch-none items-center select-none data-disabled:opacity-50"
                  onPointerDown={() => {
                    if (disabled || alphaDragging.current) return;
                    alphaDragging.current = true;
                    alphaStartRef.current = value;
                    alphaDraftRef.current = null;
                  }}
                  onValueChange={([a]) => onAlphaChange(a)}
                  onValueCommit={finishAlphaDrag}
                  onPointerUp={finishAlphaDrag}
                  onPointerCancel={finishAlphaDrag}
                  onLostPointerCapture={finishAlphaDrag}
                >
                  <SliderPrimitive.Track
                    data-slot="slider-track"
                    className="relative h-1 w-full grow overflow-hidden rounded-full bg-muted"
                  >
                    <SliderPrimitive.Range
                      data-slot="slider-range"
                      className="absolute h-full bg-primary"
                    />
                  </SliderPrimitive.Track>
                  <SliderPrimitive.Thumb
                    data-slot="slider-thumb"
                    aria-label="ความโปร่งของสี"
                    onBlur={finishAlphaDrag}
                    className="relative block size-3 shrink-0 rounded-full border border-ring bg-white ring-ring/50 focus-visible:ring-ring transition-[color,box-shadow] select-none after:absolute after:-inset-2 hover:ring-3 focus-visible:ring-2 focus-visible:outline-hidden active:ring-3 disabled:pointer-events-none"
                  />
                </SliderPrimitive.Root>
                <span className="w-8 shrink-0 text-right font-mono text-[11px] text-muted-foreground tabular-nums">
                  {alphaPct}%
                </span>
              </div>
            </div>
          ) : null}
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
                  if (p) commit("transparent");
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
      <input
        ref={nativeRef}
        type="color"
        tabIndex={-1}
        aria-hidden
        disabled={disabled}
        value={hex ?? "#000000"}
        onChange={(e) => {
          const v = withPreservedAlpha(e.currentTarget.value.toLowerCase(), value);
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
