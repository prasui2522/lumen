import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { usePhrase } from "@/lib/phrases";
import { cn } from "@/lib/utils";
import type { SegOption } from "@/lib/style-fields";

type Props = {
  id: string;
  label: string;
  options: readonly SegOption[];
  value: string | undefined;
  onChange: (v: string) => void;
  disabled?: boolean;
  /** Use column-direction icons (container align/justify). */
  column?: boolean;
  /** Id of the visible caption (FieldRow `group`); falls back to aria-label. */
  labelledBy?: string;
  /** One line, items share the full width (e.g. H1–H6). */
  fill?: boolean;
  /** Extra classes on each item (breakpoint bar needs 11px type). */
  itemClassName?: string;
  className?: string;
};

const ITEM =
  "h-6 min-w-6 rounded-md! px-1.5 text-xs text-muted-foreground hover:bg-transparent hover:text-foreground focus-visible:ring-2 data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-sm [&_svg:not([class*='size-'])]:size-3.5";

/**
 * Segmented choice (UI-REFRESH S4a): Radix ToggleGroup type="single" →
 * role="group" (keeps `id` + aria-labelledby) with radio items, one Tab stop,
 * ←/→ move focus, Space/Enter select. Arrow keys never write; only a real
 * change calls onChange (clicking the active item emits "" → ignored).
 */
export function SegmentedField({
  id,
  label,
  options,
  value,
  onChange,
  disabled,
  column,
  labelledBy,
  fill,
  itemClassName,
  className,
}: Props) {
  const p = usePhrase();
  const shownLabel = p(label);
  return (
    <ToggleGroup
      id={id}
      type="single"
      size="sm"
      spacing={0}
      value={value ?? ""}
      onValueChange={(v) => {
        if (v && v !== value) onChange(v);
      }}
      disabled={disabled}
      aria-labelledby={labelledBy}
      aria-label={labelledBy ? undefined : shownLabel}
      className={cn(
        "min-w-0 gap-0.5 rounded-lg bg-muted p-0.5",
        fill ? "flex w-full flex-nowrap" : "inline-flex flex-wrap",
        className,
      )}
    >
      {options.map((o) => {
        const Icon = (column && o.iconColumn) || o.icon;
        const optLabel = p(o.label);
        const item = (
          <ToggleGroupItem
            key={o.value}
            value={o.value}
            aria-label={Icon ? optLabel : undefined}
            title={Icon ? undefined : optLabel}
            className={cn(ITEM, fill && "min-w-0 flex-1 shrink overflow-hidden px-0", itemClassName)}
            onKeyDown={(e) => {
              // Radix ToggleGroup selects on Space (onValueChange) but not Enter.
              if (e.key !== "Enter" || disabled || e.altKey || e.ctrlKey || e.metaKey) return;
              e.preventDefault();
              if (o.value !== value) onChange(o.value);
            }}
          >
            {Icon ? <Icon /> : fill ? <span className="truncate">{optLabel}</span> : optLabel}
          </ToggleGroupItem>
        );
        if (!Icon) return item;
        return (
          <Tooltip key={o.value}>
            <TooltipTrigger asChild>{item}</TooltipTrigger>
            <TooltipContent>{optLabel}</TooltipContent>
          </Tooltip>
        );
      })}
    </ToggleGroup>
  );
}
