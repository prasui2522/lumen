/**
 * S3 A3: draggable split divider (role=separator). Size is a % of the first pane.
 */
import { useCallback, useRef, type KeyboardEvent, type PointerEvent } from "react";
import { cn } from "@/lib/utils";
import {
  SPLIT_MAX,
  SPLIT_MIN,
  currentSplitSize,
  resetSplitSize,
  setSplitSize,
  stepSplitSize,
  useSplitSettings,
  type SplitDir,
} from "@/lib/split-settings";

function ariaOrientation(dir: SplitDir): "vertical" | "horizontal" {
  return dir === "lr" ? "vertical" : "horizontal";
}

export function SplitDivider() {
  const settings = useSplitSettings();
  const now = currentSplitSize(settings);
  const dir = settings.dir;
  const vertical = dir === "lr";
  const drag = useRef<{ start: number; size: number; span: number } | null>(null);

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const dec = vertical ? "ArrowLeft" : "ArrowUp";
    const inc = vertical ? "ArrowRight" : "ArrowDown";
    if (e.key === "Enter") {
      e.preventDefault();
      resetSplitSize();
      return;
    }
    if (e.key !== dec && e.key !== inc) return;
    e.preventDefault();
    const step = e.shiftKey ? 10 : 2;
    setSplitSize(stepSplitSize(e.key === inc ? step : -step, now));
  };

  const onPointerDown = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      const host = e.currentTarget.parentElement;
      if (!host) return;
      const rect = host.getBoundingClientRect();
      const span = vertical ? rect.width : rect.height;
      if (span <= 0) return;
      drag.current = {
        start: vertical ? e.clientX : e.clientY,
        size: now,
        span,
      };
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [now, vertical],
  );

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    const pos = vertical ? e.clientX : e.clientY;
    const deltaPct = ((pos - d.start) / d.span) * 100;
    setSplitSize(d.size + deltaPct);
  };

  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    drag.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  return (
    <div
      role="separator"
      tabIndex={0}
      aria-orientation={ariaOrientation(dir)}
      aria-valuemin={SPLIT_MIN}
      aria-valuemax={SPLIT_MAX}
      aria-valuenow={now}
      aria-label="ปรับขนาดแผงแยก (Resize split)"
      data-split-divider
      className={cn(
        "shrink-0 bg-border focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        vertical ? "w-1 cursor-col-resize hover:bg-ring/60" : "h-1 cursor-row-resize hover:bg-ring/60",
      )}
      onKeyDown={onKey}
      onDoubleClick={() => resetSplitSize()}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    />
  );
}
