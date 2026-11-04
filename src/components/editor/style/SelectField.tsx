import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export type SelectOption = {
  value: string;
  label: string;
  title?: string;
  disabled?: boolean;
};

type Props = {
  id: string;
  value: string;
  options: readonly SelectOption[];
  onChange: (v: string) => void;
  disabled?: boolean;
  muted?: boolean;
  title?: string;
  /** Render each item in its own font (option value = CSS font stack). */
  fontPreview?: boolean;
  /** Accessible name when no <label htmlFor> points at the trigger. */
  ariaLabel?: string;
  className?: string;
  /** Trigger takes the remaining row width (default). */
  grow?: boolean;
  /** Radix restores focus to the trigger on close; callers may redirect it. */
  onCloseAutoFocus?: (e: Event) => void;
};

/**
 * Radix Select replacing the native <select> (UI-REFRESH S4b). Radix forbids
 * `value=""` on items, so an empty option value (e.g. "ระบบ (ค่าเริ่มต้น)",
 * weight "—") is mapped to a sentinel here and translated back at the edge —
 * callers keep their "" semantics. onChange fires once per real choice:
 * opening/closing, or re-picking the current item, writes nothing.
 */
const EMPTY = "__empty";
const toItem = (v: string) => (v === "" ? EMPTY : v);
const fromItem = (v: string) => (v === EMPTY ? "" : v);

export const selectTriggerCls =
  "h-7 min-w-0 px-2 text-xs focus-visible:ring-2 data-[size=sm]:h-7 [&_svg:not([class*='size-'])]:size-3.5";

export function SelectField({
  id,
  value,
  options,
  onChange,
  disabled,
  muted,
  title,
  fontPreview,
  ariaLabel,
  className,
  grow = true,
  onCloseAutoFocus,
}: Props) {
  return (
    <Select
      value={toItem(value)}
      disabled={disabled}
      onValueChange={(v) => {
        const next = fromItem(v);
        if (next !== value) onChange(next);
      }}
    >
      <SelectTrigger
        id={id}
        size="sm"
        title={title}
        aria-label={ariaLabel}
        className={cn(selectTriggerCls, grow && "flex-1", muted && "text-muted-foreground", className)}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent onCloseAutoFocus={onCloseAutoFocus}>
        {options.map((o) => (
          <SelectItem
            key={o.value}
            value={toItem(o.value)}
            disabled={o.disabled}
            title={o.title}
            className="text-xs"
            style={
              fontPreview && o.value && !o.value.startsWith("__")
                ? { fontFamily: o.value }
                : undefined
            }
          >
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
