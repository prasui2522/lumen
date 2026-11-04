import { useEffect, useState } from "react";
import { Link2, Unlink2 } from "lucide-react";
import { Toggle } from "@/components/ui/toggle";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { BoxSpacing } from "@/schema";
import { normalizeSpacing, type Sides } from "@/lib/document-ops";
import { NumberField } from "@/components/editor/style/NumberField";

const SIDES: readonly { k: keyof Sides; label: string }[] = [
  { k: "t", label: "บน" },
  { k: "r", label: "ขวา" },
  { k: "b", label: "ล่าง" },
  { k: "l", label: "ซ้าย" },
];

export function sidesDiffer(v: BoxSpacing | undefined): boolean {
  if (typeof v !== "object") return false;
  const n = normalizeSpacing(v)!;
  return !(n.t === n.r && n.r === n.b && n.b === n.l);
}

type Props = {
  id: string;
  label: string;
  value: BoxSpacing | undefined;
  min: number;
  max: number;
  onCommit: (v: BoxSpacing) => void;
  /** Visible caption id (FieldRow) for the unlinked sides group. */
  labelledBy?: string;
  disabled?: boolean;
  muted?: boolean;
};

/**
 * Margin / padding (spec §2.1). Linked writes one number; unlinked writes
 * {t,r,b,l} with all four keys. Opens unlinked when sides differ.
 */
export function useBoxSpacing({
  id,
  label,
  value,
  min,
  max,
  onCommit,
  disabled,
  muted,
  labelledBy,
}: Props) {
  const [linked, setLinked] = useState(() => !sidesDiffer(value));
  useEffect(() => {
    if (sidesDiffer(value)) setLinked(false);
  }, [value]);

  const n = normalizeSpacing(value);

  // View-only toggle (never writes the document); Radix keeps aria-pressed.
  const toggle = (
    <Tooltip>
      <TooltipTrigger asChild>
        <Toggle
          size="sm"
          aria-label="แยกแต่ละด้าน"
          pressed={!linked}
          onPressedChange={(p) => setLinked(!p)}
          disabled={disabled}
          className="size-7 min-w-7 shrink-0 px-0 focus-visible:ring-2"
        >
          {linked ? <Link2 className="size-3.5" /> : <Unlink2 className="size-3.5" />}
        </Toggle>
      </TooltipTrigger>
      <TooltipContent>แยกแต่ละด้าน</TooltipContent>
    </Tooltip>
  );

  const control = linked ? (
    <>
      <NumberField
        id={id}
        value={n?.t}
        min={min}
        max={max}
        suffix="px"
        disabled={disabled}
        muted={muted}
        onCommit={(v) => onCommit(v)}
      />
      {toggle}
    </>
  ) : (
    <>
      <span aria-hidden className="flex-1 truncate text-[11px] text-muted-foreground">
        {n ? `${n.t} ${n.r} ${n.b} ${n.l}` : "—"}
      </span>
      {toggle}
    </>
  );

  const footer = linked ? null : (
    <div
      className="grid grid-cols-4 gap-1"
      role="group"
      aria-labelledby={labelledBy}
      aria-label={labelledBy ? undefined : label}
    >
      {SIDES.map(({ k, label: sl }) => (
        <div key={k} className="min-w-0">
          <div className="mb-0.5 text-center text-[11px] text-muted-foreground">{sl}</div>
          <NumberField
            id={`${id}-${k}`}
            ariaLabel={`${label} ${sl}`}
            value={n?.[k]}
            min={min}
            max={max}
            compact
            placeholder=""
            disabled={disabled}
            muted={muted}
            onCommit={(v) => {
              const cur = n ?? { t: 0, r: 0, b: 0, l: 0 };
              onCommit({ ...cur, [k]: v });
            }}
          />
        </div>
      ))}
    </div>
  );

  return { control, footer, linked };
}
