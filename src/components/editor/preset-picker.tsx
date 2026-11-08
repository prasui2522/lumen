/**
 * Phase 11 C3/C7: lazy `preset-picker` chunk — Style panel พรีเซ็ต popover + save/delete.
 * Chunk name must stay `preset-picker` (PHASE-11-SPEC §5.1 / §9.C).
 */
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { Node } from "@/schema";
import {
  loadBuiltInPresets,
  presetsForType,
  type StylePreset,
} from "@/lib/presets-registry";
import { capturePresetFromNode } from "@/lib/preset-capture";
import {
  libraryDelete,
  libraryList,
  libraryPut,
  presetsFromLibraryItems,
} from "@/lib/library-api";
import { writeApplyPreset } from "@/components/editor/style/write";
import { useEditorStore } from "@/stores/editor-store";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";

/** T120 */
export const PRESET_BUTTON_LABEL = "พรีเซ็ต";
/** T121 */
export const PRESET_APPLIED_MSG = (name: string) => `ใช้พรีเซ็ต ${name} แล้ว`;
/** T122 */
export const PRESET_SAVE_LABEL = "บันทึกเป็นพรีเซ็ต";
/** T123 */
export const PRESET_NAME_LABEL = "ชื่อพรีเซ็ต";
/** T124 */
export const PRESET_SAVED_MSG = "บันทึกพรีเซ็ตแล้ว";
/** T125 */
export const PRESET_DELETE_CONFIRM = (name: string) => `ลบพรีเซ็ต ${name}?`;
/** T126 */
export const PRESET_MINE = "พรีเซ็ตของฉัน";
/** T127 */
export const PRESET_SEARCH_LABEL = "ค้นหาพรีเซ็ต";
/** T134 */
export const PRESET_DELETED_MSG = "ลบพรีเซ็ตแล้ว";
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
      ? "linear-gradient(135deg, #94a3b8 0%, #e2e8f0 100%)"
      : s.backgroundGradient
        ? "linear-gradient(135deg, #0369a1 0%, #4338ca 100%)"
        : s.backgroundColor === "transparent"
          ? "transparent"
          : (s.backgroundColor ?? "#e2e8f0");
  const border = s.borderColor
    ? `${s.borderWidth ?? 1}px solid ${s.borderColor}`
    : "1px solid #e2e8f0";
  return (
    <span
      aria-hidden
      className="block h-8 w-full rounded-md"
      style={{
        background: bg,
        border,
        borderRadius: s.borderRadius !== undefined ? s.borderRadius : 6,
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
  const [saveName, setSaveName] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<StylePreset | null>(null);
  const announce = useEditorStore((s) => s.announce);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const saveInputRef = useRef<HTMLInputElement>(null);
  const deleteCancelRef = useRef<HTMLButtonElement>(null);
  const listId = useId();
  const searchId = useId();

  const reloadMine = async () => {
    try {
      const items = await libraryList();
      setMine(presetsFromLibraryItems(items));
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

  const builtFiltered = useMemo(() => {
    const list = builtIns ?? [];
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.nameEn.toLowerCase().includes(q) ||
        p.id.includes(q),
    );
  }, [builtIns, query]);

  const mineFiltered = useMemo(() => {
    const list = presetsForType(mine, node.type);
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.nameEn.toLowerCase().includes(q) ||
        p.id.includes(q),
    );
  }, [mine, node.type, query]);

  /** Flat list for keyboard roving (built-ins then mine), capped at 12 thumbs. */
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
    const ok = writeApplyPreset(node.id, preset);
    if (!ok) {
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

  const commitSave = async () => {
    const preset = capturePresetFromNode(node, saveName);
    if (!preset) {
      toast.error("ไม่มีสไตล์ที่จะบันทึก");
      return;
    }
    try {
      await libraryPut(preset.id, preset.name, JSON.stringify(preset));
      announce(PRESET_SAVED_MSG);
      setSaveOpen(false);
      setSaveName("");
      await reloadMine();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  };

  const commitDelete = async () => {
    if (!deleteTarget) return;
    try {
      await libraryDelete(deleteTarget.id);
      announce(PRESET_DELETED_MSG);
      setDeleteTarget(null);
      await reloadMine();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
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
          onClick={() => {
            setSaveName("");
            setSaveOpen(true);
          }}
        >
          {PRESET_SAVE_LABEL}
        </Button>
      </div>

      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent
          className="sm:max-w-sm"
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            saveInputRef.current?.focus();
          }}
        >
          <DialogHeader>
            <DialogTitle>{PRESET_SAVE_LABEL}</DialogTitle>
          </DialogHeader>
          <label className="text-xs text-muted-foreground" htmlFor="preset-save-name">
            {PRESET_NAME_LABEL}
          </label>
          <Input
            ref={saveInputRef}
            id="preset-save-name"
            value={saveName}
            onChange={(e) => setSaveName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void commitSave();
              }
            }}
            className="h-8"
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setSaveOpen(false)}>
              ยกเลิก
            </Button>
            <Button type="button" onClick={() => void commitSave()} disabled={!saveName.trim()}>
              บันทึก
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(o) => {
          if (!o) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            deleteCancelRef.current?.focus();
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>
              {deleteTarget ? PRESET_DELETE_CONFIRM(deleteTarget.name) : ""}
            </AlertDialogTitle>
            <AlertDialogDescription>
              การลบเอาพรีเซ็ตออกจากเครื่องนี้เท่านั้น องค์ประกอบที่ใช้ไปแล้วไม่เปลี่ยน
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button
              type="button"
              ref={deleteCancelRef}
              variant="outline"
              onClick={() => setDeleteTarget(null)}
            >
              ยกเลิก
            </Button>
            <Button type="button" variant="destructive" onClick={() => void commitDelete()}>
              ลบ
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/** Lazy-chunk anchor so Rollup emits `preset-picker`. */
export function PresetPickerLazyAnchor() {
  return null;
}
