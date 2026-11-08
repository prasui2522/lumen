/**
 * Phase 11 C3: lazy `preset-picker` chunk — Style panel พรีเซ็ต popover.
 * Chunk name must stay `preset-picker` (PHASE-11-SPEC §5.1 / §9.C). Save/delete live in
 * `preset-library-dialogs` so this chunk stays ≤ 3 kB gz.
 */
import { Suspense, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import type { Node } from "@/schema";
import {
  loadBuiltInPresets,
  presetsForType,
  type StylePreset,
} from "@/lib/presets-registry";
import { libraryList, presetsFromLibraryItems } from "@/lib/library-api";
import { writeApplyPreset } from "@/components/editor/style/write";
import { useEditorStore } from "@/stores/editor-store";
import { cn } from "@/lib/utils";
import { lazyNamed } from "@/lib/lazy";

const PresetSaveDialog = lazyNamed(() =>
  import("@/components/editor/preset-library-dialogs").then((m) => m.PresetSaveDialog),
);
const PresetDeleteDialog = lazyNamed(() =>
  import("@/components/editor/preset-library-dialogs").then((m) => m.PresetDeleteDialog),
);

/** T120 */
export const PRESET_BUTTON_LABEL = "พรีเซ็ต";
/** T121 */
export const PRESET_APPLIED_MSG = (name: string) => `ใช้พรีเซ็ต ${name} แล้ว`;
/** T122 — re-export label for the save trigger (dialog chunk owns the dialog). */
export const PRESET_SAVE_LABEL = "บันทึกเป็นพรีเซ็ต";
/** T126 */
export const PRESET_MINE = "พรีเซ็ตของฉัน";
/** T127 */
export const PRESET_SEARCH_LABEL = "ค้นหาพรีเซ็ต";
/** T135 */
export const PRESET_EMPTY = "ไม่พบพรีเซ็ต";
/** T136 */
export const PRESET_REFUSED = "พรีเซ็ตนี้ใช้กับองค์ประกอบนี้ไม่ได้";

export type PresetPickerProps = {
  node: Node;
  locked: boolean;
};

/** Static tint stand-in for backdrop-filter in thumbnails (C8). */
function PresetThumb({ preset }: { preset: StylePreset }) {
  const s = preset.style;
  const bg =
    preset.id === "card-glass"
      ? "linear-gradient(135deg,#94a3b8,#e2e8f0)"
      : s.backgroundGradient
        ? "linear-gradient(135deg,#0369a1,#4338ca)"
        : s.backgroundColor === "transparent"
          ? "transparent"
          : (s.backgroundColor ?? "#e2e8f0");
  return (
    <span
      aria-hidden
      className="block h-8 w-full rounded-md"
      style={{
        background: bg,
        border: s.borderColor
          ? `${s.borderWidth ?? 1}px solid ${s.borderColor}`
          : "1px solid #e2e8f0",
        borderRadius: s.borderRadius ?? 6,
        boxShadow:
          preset.id === "outline-glow"
            ? "0 0 0 2px #0ea5e933"
            : s.boxShadow
              ? "0 2px 6px #00000022"
              : undefined,
      }}
    />
  );
}

export function PresetPicker({ node, locked }: PresetPickerProps) {
  const [open, setOpen] = useState(false);
  const [builtIns, setBuiltIns] = useState<StylePreset[] | null>(null);
  const [mine, setMine] = useState<StylePreset[]>([]);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [saveOpen, setSaveOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<StylePreset | null>(null);
  const announce = useEditorStore((s) => s.announce);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listId = useId();
  const searchId = useId();

  const reloadMine = async () => {
    try {
      setMine(presetsFromLibraryItems(await libraryList()));
    } catch {
      setMine([]);
    }
  };

  useEffect(() => {
    if (!open) return;
    let dead = false;
    void loadBuiltInPresets().then((list) => {
      if (!dead) setBuiltIns(presetsForType(list, node.type));
    });
    void reloadMine();
    return () => {
      dead = true;
    };
  }, [open, node.type]);

  const match = (p: StylePreset, q: string) =>
    !q ||
    p.name.toLowerCase().includes(q) ||
    p.nameEn.toLowerCase().includes(q) ||
    p.id.includes(q);

  const builtFiltered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (builtIns ?? []).filter((p) => match(p, q));
  }, [builtIns, query]);

  const mineFiltered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return presetsForType(mine, node.type).filter((p) => match(p, q));
  }, [mine, node.type, query]);

  const flat = useMemo(() => {
    const rows: { preset: StylePreset; mine: boolean }[] = [
      ...builtFiltered.map((p) => ({ preset: p, mine: false })),
      ...mineFiltered.map((p) => ({ preset: p, mine: true })),
    ];
    return rows.slice(0, 12);
  }, [builtFiltered, mineFiltered]);

  useEffect(() => {
    setActive(0);
  }, [query, open, node.type]);

  const apply = (preset: StylePreset) => {
    if (locked) return;
    if (!writeApplyPreset(node.id, preset)) {
      announce(PRESET_REFUSED);
      return;
    }
    announce(PRESET_APPLIED_MSG(preset.name));
    setOpen(false);
    requestAnimationFrame(() => triggerRef.current?.focus());
  };

  const onListKeyDown = (e: KeyboardEvent) => {
    if (flat.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (i + 1) % flat.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i - 1 + flat.length) % flat.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const row = flat[active];
      if (row) apply(row.preset);
    }
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-1.5">
        <Popover
          open={open}
          onOpenChange={(v) => {
            setOpen(v);
            if (!v) {
              setQuery("");
              requestAnimationFrame(() => triggerRef.current?.focus());
            }
          }}
        >
          <PopoverTrigger asChild>
            <Button
              ref={triggerRef}
              type="button"
              variant="outline"
              size="xs"
              className="h-7 px-2 text-[11px]"
              disabled={locked}
              aria-haspopup="dialog"
            >
              {PRESET_BUTTON_LABEL}
            </Button>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            className="w-64 p-2"
            onCloseAutoFocus={(e) => {
              e.preventDefault();
              triggerRef.current?.focus();
            }}
          >
            <label htmlFor={searchId} className="sr-only">
              {PRESET_SEARCH_LABEL}
            </label>
            <Input
              id={searchId}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={PRESET_SEARCH_LABEL}
              className="mb-2 h-7 text-xs"
              onKeyDown={onListKeyDown}
            />
            <div
              id={listId}
              role="listbox"
              aria-label={PRESET_BUTTON_LABEL}
              className="max-h-64 space-y-1 overflow-auto"
              onKeyDown={onListKeyDown}
            >
              {flat.length === 0 ? (
                <p className="px-1 py-2 text-[11px] text-muted-foreground" role="status">
                  {PRESET_EMPTY}
                </p>
              ) : (
                flat.map((row, i) =>
                  row.mine ? (
                    <div
                      key={`m-${row.preset.id}`}
                      className={cn(
                        "flex items-start gap-1 rounded-md border border-transparent px-1 py-1",
                        i === active && "border-border bg-muted",
                      )}
                      onMouseEnter={() => setActive(i)}
                    >
                      <button
                        type="button"
                        role="option"
                        aria-selected={i === active}
                        className="min-w-0 flex-1 text-left"
                        onClick={() => apply(row.preset)}
                      >
                        {i === 0 || !flat[i - 1]?.mine ? (
                          <span className="mb-1 block text-[10px] font-medium text-muted-foreground">
                            {PRESET_MINE}
                          </span>
                        ) : null}
                        <PresetThumb preset={row.preset} />
                        <span className="mt-1 block truncate text-xs font-medium">
                          {row.preset.name}
                        </span>
                      </button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="xs"
                        className="h-6 shrink-0 px-1 text-[10px] text-muted-foreground"
                        onClick={() => setDeleteTarget(row.preset)}
                      >
                        ลบ
                      </Button>
                    </div>
                  ) : (
                    <button
                      key={`b-${row.preset.id}`}
                      type="button"
                      role="option"
                      aria-selected={i === active}
                      className={cn(
                        "flex w-full flex-col gap-1 rounded-md border border-transparent px-1.5 py-1.5 text-left hover:bg-muted",
                        i === active && "border-border bg-muted",
                      )}
                      onMouseEnter={() => setActive(i)}
                      onClick={() => apply(row.preset)}
                    >
                      <PresetThumb preset={row.preset} />
                      <span className="truncate text-xs font-medium">{row.preset.name}</span>
                      {row.preset.note ? (
                        <span className="text-[10px] leading-snug text-muted-foreground">
                          {row.preset.note}
                        </span>
                      ) : null}
                    </button>
                  ),
                )
              )}
            </div>
            {flat.length > 0 && mineFiltered.length === 0 ? (
              <p className="mt-2 border-t border-border pt-1.5 text-[10px] text-muted-foreground">
                {PRESET_MINE}: ยังไม่มี
              </p>
            ) : null}
          </PopoverContent>
        </Popover>

        <Button
          type="button"
          variant="ghost"
          size="xs"
          className="h-7 px-1.5 text-[11px]"
          disabled={locked}
          onClick={() => setSaveOpen(true)}
        >
          {PRESET_SAVE_LABEL}
        </Button>
      </div>

      <Suspense fallback={null}>
        {(saveOpen || deleteTarget) && (
          <>
            <PresetSaveDialog
              open={saveOpen}
              onOpenChange={setSaveOpen}
              node={node}
              onSaved={() => void reloadMine()}
            />
            <PresetDeleteDialog
              target={deleteTarget}
              onOpenChange={(v) => {
                if (!v) setDeleteTarget(null);
              }}
              onDeleted={() => void reloadMine()}
            />
          </>
        )}
      </Suspense>
    </>
  );
}

/** Lazy-chunk anchor so Rollup emits `preset-picker`. */
export function PresetPickerLazyAnchor() {
  return null;
}
