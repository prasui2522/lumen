import { useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { NumberField } from "@/components/editor/style/NumberField";
import { SelectField } from "@/components/editor/style/SelectField";

type Unit = "px" | "%" | "auto" | "raw";

function parse(v: number | string | undefined): {
  unit: Unit;
  n?: number;
  raw?: string;
} {
  if (v === undefined) return { unit: "px" };
  if (typeof v === "number") return { unit: "px", n: v };
  const s = v.trim();
  if (s === "auto") return { unit: "auto" };
  const pct = /^(-?\d+(?:\.\d+)?)%$/.exec(s);
  if (pct) return { unit: "%", n: Number(pct[1]) };
  const px = /^(-?\d+(?:\.\d+)?)(px)?$/.exec(s);
  if (px) return { unit: "px", n: Number(px[1]) };
  return { unit: "raw", raw: v };
}

type Props = {
  id: string;
  label: string;
  value: number | string | undefined;
  onCommit: (v: number | string) => void;
  disabled?: boolean;
  muted?: boolean;
};

/**
 * Number + unit (spec §2): px → number, % → "N%", auto → "auto".
 * Unknown strings (e.g. "100vh") are shown read-only with unit "—".
 */
export function UnitField({ id, label, value, onCommit, disabled, muted }: Props) {
  const parsed = parse(value);
  // auto → px with no number yet: show an empty px input and write nothing
  // until the user types (writing 0 would collapse e.g. an image's height).
  // Reset when the saved value changes (commit) — PanelBody remounts per node.
  const [pendingPx, setPendingPx] = useState<{ for: typeof value } | null>(null);
  const pending = pendingPx !== null && pendingPx.for === value && parsed.unit === "auto";
  const p = pending ? { unit: "px" as Unit, n: undefined } : parsed;
  const max = p.unit === "%" ? 100 : 4000;
  /** auto → px picked: keep focus on the (autofocused) px input, not the trigger. */
  const focusNumber = useRef(false);

  return (
    <>
      {p.unit === "raw" ? (
        <Input
          id={id}
          readOnly
          value={p.raw}
          title={p.raw}
          className="h-7 min-w-0 flex-1 px-2 text-xs md:text-xs"
        />
      ) : p.unit === "auto" ? (
        <Input
          id={id}
          disabled
          value=""
          placeholder="auto"
          className="h-7 min-w-0 flex-1 px-2 text-xs md:text-xs"
        />
      ) : (
        <NumberField
          id={id}
          value={p.n}
          min={0}
          max={max}
          disabled={disabled}
          muted={muted}
          placeholder={pending ? "px" : "—"}
          autoFocus={pending}
          onCommit={(n) => onCommit(p.unit === "%" ? `${n}%` : n)}
        />
      )}
      <SelectField
        id={`${id}-unit`}
        ariaLabel={`หน่วย: ${label}`}
        className="w-[68px] shrink-0 gap-1 px-1.5"
        grow={false}
        onCloseAutoFocus={(e) => {
          if (!focusNumber.current) return;
          focusNumber.current = false;
          e.preventDefault();
          document.getElementById(id)?.focus();
        }}
        disabled={disabled}
        muted={muted}
        value={p.unit}
        options={[
          { value: "px", label: "px" },
          { value: "%", label: "%" },
          { value: "auto", label: "auto" },
          ...(p.unit === "raw" ? [{ value: "raw", label: "—", disabled: true }] : []),
        ]}
        onChange={(v) => {
          const u = v as Unit;
          setPendingPx(null);
          if (u === "auto") onCommit("auto");
          else if (u === "%") onCommit(`${Math.min(100, Math.max(0, p.n ?? 100))}%`);
          else if (u === "px") {
            if (p.n !== undefined) onCommit(Math.max(0, p.n));
            else {
              focusNumber.current = true;
              setPendingPx({ for: value }); // wait for a typed number
            }
          }
        }}
      />
    </>
  );
}
