import type { ReactNode } from "react";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { usePhrase } from "@/lib/phrases";
import { cn } from "@/lib/utils";

type Props = {
  id: string;
  label: string;
  overridden: boolean;
  /** Locked nodes hide reset. */
  locked: boolean;
  onReset?: () => void;
  /** Reset control name. Desktop stays `คืนค่าเริ่มต้น`; a breakpoint uses `ใช้ค่าหลัก`. */
  resetLabel?: string;
  children: ReactNode;
  /** Full-width content under the row (hints, unlinked sides, presets). */
  footer?: ReactNode;
  /**
   * The control is not a labelable element (segmented cluster, unlinked
   * sides): render the caption as a plain element with id `${id}-label`
   * instead of `<label for>`; the control references it via aria-labelledby.
   */
  group?: boolean;
  /** Caption on its own line, control full width below (wide clusters). */
  stacked?: boolean;
};

export const fieldLabelId = (id: string) => `${id}-label`;

/** `[•] label  [control]  [↺]` — spec §1 field row. */
export function FieldRow({
  id,
  label,
  overridden,
  locked,
  onReset,
  resetLabel = "คืนค่าเริ่มต้น",
  children,
  footer,
  group,
  stacked,
}: Props) {
  const p = usePhrase();
  const shownLabel = p(label);
  const shownReset = p(resetLabel);
  const captionCls = cn(
    "flex shrink-0 items-center gap-1.5 text-xs",
    stacked ? "min-w-0 flex-1" : "w-[88px]",
    overridden ? "font-medium text-foreground" : "text-muted-foreground",
  );
  const caption = (
    <>
      <span
        aria-hidden
        className={cn(
          "size-1.5 shrink-0 rounded-full",
          overridden ? "bg-primary" : "bg-transparent",
        )}
      />
      <span className="truncate">{shownLabel}</span>
    </>
  );
  const captionEl = group ? (
    <span id={fieldLabelId(id)} className={captionCls}>
      {caption}
    </span>
  ) : (
    <label id={fieldLabelId(id)} htmlFor={id} className={captionCls}>
      {caption}
    </label>
  );
  const reset = (
    <div className="flex w-6 shrink-0 justify-center">
      {overridden && onReset && !locked ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label={`${shownReset}: ${shownLabel}`}
              onClick={onReset}
            >
              <RotateCcw className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{shownReset}</TooltipContent>
        </Tooltip>
      ) : null}
    </div>
  );

  if (stacked) {
    return (
      <div className="space-y-1">
        <div className="flex min-h-6 items-center gap-2">
          {captionEl}
          {reset}
        </div>
        <div className="flex min-w-0 items-center gap-1">{children}</div>
        {footer ? <div>{footer}</div> : null}
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <div className="flex min-h-7 items-center gap-2">
        {captionEl}
        <div className="flex min-w-0 flex-1 items-center gap-1">{children}</div>
        {reset}
      </div>
      {footer ? <div className="pl-[96px] pr-8">{footer}</div> : null}
    </div>
  );
}

export const mutedCls = (overridden: boolean) =>
  overridden ? "" : "text-muted-foreground";
