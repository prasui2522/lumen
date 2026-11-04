import { useEffect, useRef, useState } from "react";
import { Slider as SliderPrimitive } from "radix-ui";
import { NumberField } from "@/components/editor/style/NumberField";

type Props = {
  id: string;
  /** Canvas node the slider edits. Used only to preview opacity on its DOM node. */
  nodeId: string;
  label: string;
  value: number | undefined;
  /** `undefined` = remove the key (opacity 1 is the CSS default). */
  onCommit: (v: number | undefined) => void;
  disabled?: boolean;
  muted?: boolean;
  /**
   * Breakpoint override: 100% commits `1` so it can differ from a base that
   * is not fully opaque. Desktop leaves this off and still deletes the key.
   * Canvas preview is skipped — the design canvas stays on the base style.
   */
  keepFull?: boolean;
};

/**
 * Opacity 0–100 % → saved 0–1 (two decimals). 100 % deletes the key: CSS
 * opacity is not inherited and defaults to 1, so touching the control on a
 * node without saved opacity never writes `opacity: 1` (setNodeStyle then
 * no-ops → no dirty, no undo entry).
 */
function toUnit(pct: number, keepFull: boolean): number | undefined {
  const u = Math.round(Math.min(100, Math.max(0, pct))) / 100;
  if (u === 1) return keepFull ? 1 : undefined;
  return u;
}

/** The value the slider is already showing, in stored units. */
function shownUnit(value: number | undefined, keepFull: boolean): number | undefined {
  return toUnit(Math.round((value ?? 1) * 100), keepFull);
}

function canvasNode(nodeId: string): HTMLElement | null {
  return document.querySelector(
    `[data-kbd-scope="canvas"] [data-node-id="${CSS.escape(nodeId)}"]`,
  );
}

/**
 * Radix Slider (UI-REFRESH S4b). A pointer drag previews opacity on the
 * canvas node only — the document is not written per frame (a 3s drag used
 * to re-render the whole tree). pointerup commits ONE history step. Released
 * back at the start → no write, not dirty. Keyboard steps (←/→ 5 %,
 * PageUp/Down, Home/End) write once per key and coalesce by field key
 * (COALESCE_MS) like every other Style field. The thumb follows a local
 * draft so it never waits on the document.
 */
export function OpacityField({
  id,
  nodeId,
  label,
  value,
  onCommit,
  disabled,
  muted,
  keepFull = false,
}: Props) {
  const pct = Math.round((value ?? 1) * 100);
  const [draft, setDraft] = useState<number | null>(null);
  const dragging = useRef(false);
  const draftRef = useRef<number | null>(null);
  const startRef = useRef<number | undefined>(undefined);
  /** Inline opacity from before the preview, restored if the drag is a no-op. */
  const prevInline = useRef<string | null>(null);

  const preview = (p: number) => {
    // A breakpoint drag must not paint the override onto the desktop canvas.
    if (keepFull) return;
    const el = canvasNode(nodeId);
    if (!el) return;
    if (prevInline.current === null) prevInline.current = el.style.opacity;
    const u = toUnit(p, false);
    el.style.opacity = u === undefined ? "1" : String(u);
  };

  const restorePreview = () => {
    if (prevInline.current === null) return;
    const el = canvasNode(nodeId);
    if (el) el.style.opacity = prevInline.current;
    prevInline.current = null;
  };

  const finishDrag = () => {
    if (!dragging.current) return;
    dragging.current = false;
    const p = draftRef.current;
    draftRef.current = null;
    restorePreview();
    setDraft(null);
    if (p == null) return;
    const next = toUnit(p, keepFull);
    if (next !== startRef.current) onCommit(next);
  };

  useEffect(() => () => restorePreview(), [nodeId]);

  return (
    <>
      <SliderPrimitive.Root
        min={0}
        max={100}
        step={5}
        value={[draft ?? pct]}
        disabled={disabled}
        data-slot="slider"
        className="relative flex h-7 min-w-0 flex-1 touch-none items-center select-none data-disabled:opacity-50"
        onPointerDown={() => {
          if (disabled || dragging.current) return;
          dragging.current = true;
          startRef.current = shownUnit(value, keepFull);
          draftRef.current = null;
        }}
        onValueChange={([p]) => {
          setDraft(p);
          if (dragging.current) {
            draftRef.current = p;
            preview(p);
            return;
          }
          // Keyboard step: one write, coalesced by the style history key.
          onCommit(toUnit(p, keepFull));
        }}
        onValueCommit={finishDrag}
        onPointerUp={finishDrag}
        onPointerCancel={finishDrag}
        onLostPointerCapture={finishDrag}
      >
        <SliderPrimitive.Track
          data-slot="slider-track"
          className="relative h-1 w-full grow overflow-hidden rounded-full bg-muted"
        >
          <SliderPrimitive.Range data-slot="slider-range" className="absolute h-full bg-primary" />
        </SliderPrimitive.Track>
        <SliderPrimitive.Thumb
          data-slot="slider-thumb"
          aria-label={label}
          onBlur={finishDrag}
          className="relative block size-3 shrink-0 rounded-full border border-ring bg-white ring-ring/50 focus-visible:ring-ring transition-[color,box-shadow] select-none after:absolute after:-inset-2 hover:ring-3 focus-visible:ring-2 focus-visible:outline-hidden active:ring-3 disabled:pointer-events-none"
        />
      </SliderPrimitive.Root>
      <NumberField
        id={id}
        value={value === undefined ? undefined : pct}
        placeholder="100"
        min={0}
        max={100}
        suffix="%"
        className="w-16 flex-none"
        disabled={disabled}
        muted={muted}
        onCommit={(p) => onCommit(toUnit(p, keepFull))}
      />
    </>
  );
}
