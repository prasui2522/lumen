/**
 * Phase 11 A4.4/A4.5 — Lucide path-data glyph + icon picker (lazy `icon-paths` chunk).
 * Dynamically imported; do not static-import from the entry or App.
 */
import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import {
  FEATHER_DERIVED_ICON_NAMES,
  ICON_NAMES,
  ICON_PATHS,
  getIconPaths,
  iconInnerSvg,
  isIconName,
  type IconName,
} from "@/lib/icon-paths";
import { usePhrase } from "@/lib/phrases";

export {
  FEATHER_DERIVED_ICON_NAMES,
  ICON_NAMES,
  ICON_PATHS,
  getIconPaths,
  iconInnerSvg,
  isIconName,
};
export type { IconName };

/** Keep path data in this async chunk when only the anchor is selected. */
export function IconPathsLazyAnchor(_props: object = {}) {
  void ICON_PATHS;
  return null;
}

export function IconGlyph({
  name,
  size = 24,
  strokeWidth = 2,
  label,
  className,
  style,
}: {
  name: string;
  size?: number;
  strokeWidth?: number;
  label?: string;
  className?: string;
  style?: CSSProperties;
}) {
  const inner = iconInnerSvg(name) ?? ICON_PATHS.star;
  const lab = label?.trim() ?? "";
  const a11y = lab
    ? ({ role: "img", "aria-label": lab } as const)
    : ({ "aria-hidden": true as const });
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
      {...a11y}
      dangerouslySetInnerHTML={{ __html: inner }}
    />
  );
}

/** T36 search + grid with roving focus; selection announces the icon name (T38a). */
export function IconPicker({
  value,
  disabled,
  onPick,
}: {
  value: string;
  disabled?: boolean;
  onPick: (name: IconName) => void;
}) {
  const tr = usePhrase();
  const [q, setQ] = useState("");
  const listId = useId();
  const liveId = useId();
  const [live, setLive] = useState("");
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return ICON_NAMES as readonly IconName[];
    return ICON_NAMES.filter((n) => n.includes(needle));
  }, [q]);
  const active = isIconName(value) ? value : "star";
  const [focusName, setFocusName] = useState<IconName>(active);
  const gridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!filtered.includes(focusName)) {
      setFocusName(filtered[0] ?? active);
    }
  }, [filtered, focusName, active]);

  function announce(name: IconName) {
    setLive(name);
  }

  function pick(name: IconName) {
    onPick(name);
    announce(name);
  }

  function onGridKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const cols = 6;
    const i = filtered.indexOf(focusName);
    if (i < 0) return;
    let next = i;
    if (e.key === "ArrowRight") next = Math.min(filtered.length - 1, i + 1);
    else if (e.key === "ArrowLeft") next = Math.max(0, i - 1);
    else if (e.key === "ArrowDown") next = Math.min(filtered.length - 1, i + cols);
    else if (e.key === "ArrowUp") next = Math.max(0, i - cols);
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = filtered.length - 1;
    else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      pick(focusName);
      return;
    } else return;
    e.preventDefault();
    const name = filtered[next];
    if (name) {
      setFocusName(name);
      const btn = gridRef.current?.querySelector<HTMLButtonElement>(`[data-icon="${name}"]`);
      btn?.focus();
    }
  }

  return (
    <div className="space-y-2">
      <label className="sr-only" htmlFor={listId}>
        {tr("ค้นหาไอคอน")}
      </label>
      <input
        id={listId}
        type="search"
        value={q}
        disabled={disabled}
        placeholder={tr("ค้นหาไอคอน")}
        className="h-8 w-full rounded-md border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring"
        onChange={(e) => setQ(e.currentTarget.value)}
      />
      <p className="text-[11px] text-muted-foreground" aria-live="polite" id={liveId}>
        {live ? `${tr("เลือกแล้ว")}: ${live}` : `${tr("ชื่อไอคอน")}: ${active}`}
      </p>
      <div
        ref={gridRef}
        role="listbox"
        aria-label={tr("ไอคอน")}
        aria-activedescendant={focusName ? `icon-opt-${focusName}` : undefined}
        className="grid max-h-48 grid-cols-6 gap-1 overflow-y-auto"
        onKeyDown={onGridKeyDown}
      >
        {filtered.map((name) => {
          const selected = name === active;
          return (
            <button
              key={name}
              type="button"
              id={`icon-opt-${name}`}
              data-icon={name}
              role="option"
              aria-selected={selected}
              aria-label={name}
              disabled={disabled}
              tabIndex={name === focusName ? 0 : -1}
              className={[
                "flex aspect-square items-center justify-center rounded-md border text-foreground",
                selected ? "border-ring bg-accent" : "border-transparent hover:bg-muted",
              ].join(" ")}
              onClick={() => pick(name)}
              onFocus={() => setFocusName(name)}
            >
              <IconGlyph name={name} size={18} strokeWidth={2} />
            </button>
          );
        })}
      </div>
      {filtered.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">ไม่พบไอคอน</p>
      ) : null}
    </div>
  );
}
