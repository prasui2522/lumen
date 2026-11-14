import {
  useEffect,
  useId,
  useLayoutEffect,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FieldRow, fieldLabelId } from "@/components/editor/style/FieldRow";
import { TextPropField } from "@/components/editor/style/TextPropField";
import { writeTableEditorCommit } from "@/components/editor/style/write";
import { toastIpcError } from "@/lib/ipc-error-i18n";
import { usePhrase } from "@/lib/phrases";
import { toast } from "@/lib/toast";
import {
  TABLE_FULL_MESSAGE,
  MAX_TABLE_COLS,
  MAX_TABLE_ROWS,
  addTableColumn,
  addTableRow,
  cloneGrid,
  pasteTsvAt,
  removeTableColumn,
  removeTableRow,
  type TableGrid,
} from "@/lib/table-model";

export type TableEditorProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  nodeId: string;
  columns: readonly string[];
  rows: readonly (readonly string[])[];
  caption?: string;
  headerRow: boolean;
  striped: boolean;
  locked?: boolean;
  /** F2 D3: element that gets focus back when the dialog closes (the แก้ไขตาราง button). */
  returnFocusRef?: { readonly current: HTMLElement | null };
};

/** Header cells use row index -1 in the id scheme. */
function cellId(prefix: string, r: number, c: number) {
  return `${prefix}-r${r}-c${c}`;
}

/**
 * Phase 11 A4.3 — lazy table grid editor (T29–T35).
 * Draft edits locally; Commit applies columns+rows (+ caption/header/striped) in one undo step.
 */
export function TableEditor({
  open,
  onOpenChange,
  returnFocusRef,
  nodeId,
  columns,
  rows,
  caption,
  headerRow,
  striped,
  locked = false,
}: TableEditorProps) {
  const uid = useId();
  const tr = usePhrase();
  const [grid, setGrid] = useState<TableGrid>(() => cloneGrid(columns, rows));
  const [draftCaption, setDraftCaption] = useState(caption ?? "");
  const [draftHeader, setDraftHeader] = useState(headerRow);
  const [draftStriped, setDraftStriped] = useState(striped);
  /** null = leave focus alone; {r:-1,c} = header; {r,c} = body. */
  const [focusCell, setFocusCell] = useState<{ r: number; c: number } | null>(null);

  useEffect(() => {
    if (!open) return;
    setGrid(cloneGrid(columns, rows));
    setDraftCaption(caption ?? "");
    setDraftHeader(headerRow);
    setDraftStriped(striped);
    setFocusCell({ r: -1, c: 0 });
  }, [open, columns, rows, caption, headerRow, striped]);

  useLayoutEffect(() => {
    if (!open || !focusCell) return;
    const el = document.getElementById(cellId(uid, focusCell.r, focusCell.c)) as HTMLInputElement | null;
    if (el) {
      el.focus();
      el.select();
    }
  }, [open, focusCell, uid, grid.columns.length, grid.rows.length]);

  const queueFocus = (r: number, c: number) => {
    setFocusCell({ r, c });
  };

  const clampFocus = (r: number, c: number, g: TableGrid) => {
    if (r < 0) return { r: -1, c: Math.max(0, Math.min(c, g.columns.length - 1)) };
    return {
      r: Math.max(0, Math.min(r, g.rows.length - 1)),
      c: Math.max(0, Math.min(c, g.columns.length - 1)),
    };
  };

  const setHeader = (c: number, value: string) => {
    setGrid((g) => {
      const nextCols = [...g.columns];
      nextCols[c] = value;
      return { ...g, columns: nextCols };
    });
  };

  const setCell = (r: number, c: number, value: string) => {
    setGrid((g) => {
      const nextRows = g.rows.map((row, i) => (i === r ? [...row] : row));
      const row = [...(nextRows[r] ?? [])];
      row[c] = value;
      nextRows[r] = row;
      return { ...g, rows: nextRows };
    });
  };

  const onAddCol = () => {
    if (locked) return;
    setGrid((g) => {
      const next = addTableColumn(g, `คอลัมน์ ${g.columns.length + 1}`);
      if (!next) {
        queueMicrotask(() => toast.error(toastIpcError(TABLE_FULL_MESSAGE)));
        return g;
      }
      queueMicrotask(() => queueFocus(-1, next.columns.length - 1));
      return next;
    });
  };

  const onAddRow = () => {
    if (locked) return;
    setGrid((g) => {
      const next = addTableRow(g);
      if (!next) {
        queueMicrotask(() => toast.error(toastIpcError(TABLE_FULL_MESSAGE)));
        return g;
      }
      queueMicrotask(() => queueFocus(next.rows.length - 1, 0));
      return next;
    });
  };

  const onRemoveCol = (c: number) => {
    if (locked) return;
    setGrid((g) => {
      const next = removeTableColumn(g, c);
      if (!next) return g;
      queueMicrotask(() => queueFocus(-1, Math.min(c, next.columns.length - 1)));
      return next;
    });
  };

  const onRemoveRow = (r: number) => {
    if (locked) return;
    setGrid((g) => {
      const next = removeTableRow(g, r);
      if (!next) return g;
      const fc = focusCell?.c ?? 0;
      const fr = Math.min(r, next.rows.length - 1);
      const nextFocus = clampFocus(fr, fc, next);
      queueMicrotask(() => queueFocus(nextFocus.r, nextFocus.c));
      return next;
    });
  };

  const onPaste = (r: number, c: number, text: string) => {
    if (locked) return;
    setGrid((g) => {
      const startRow = r < 0 ? 0 : r;
      const { grid: next, refusedCols } = pasteTsvAt(g, startRow, c, text);
      if (refusedCols) queueMicrotask(() => toast.error(toastIpcError(TABLE_FULL_MESSAGE)));
      return next;
    });
  };

  const moveFocus = (fromR: number, fromC: number, delta: 1 | -1) => {
    const cols = grid.columns.length;
    const bodyRows = grid.rows.length;
    // Linear order: headers (r=-1) then body rows.
    const total = cols * (1 + bodyRows);
    let idx = fromR < 0 ? fromC : cols + fromR * cols + fromC;
    idx = (idx + delta + total) % total;
    if (idx < cols) queueFocus(-1, idx);
    else {
      const body = idx - cols;
      queueFocus(Math.floor(body / cols), body % cols);
    }
  };

  const onCellKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>, r: number, c: number) => {
    if (e.key === "Tab") {
      e.preventDefault();
      moveFocus(r, c, e.shiftKey ? -1 : 1);
      return;
    }
    if (e.key === "Enter" && !e.nativeEvent.isComposing) {
      e.preventDefault();
      if (r < 0) {
        queueFocus(0, c);
      } else if (r + 1 < grid.rows.length) {
        queueFocus(r + 1, c);
      } else {
        onAddRow();
      }
    }
  };

  const commit = () => {
    if (!locked) {
      writeTableEditorCommit(nodeId, {
        columns: grid.columns,
        rows: grid.rows,
        caption: draftCaption,
        headerRow: draftHeader,
        striped: draftStriped,
      });
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex max-h-[min(90vh,40rem)] w-[min(100%-2rem,48rem)] max-w-none flex-col gap-3 sm:max-w-none"
        closeLabel="ปิด"
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          queueFocus(-1, 0);
        }}
        onCloseAutoFocus={(e) => {
          const el = returnFocusRef?.current;
          if (!el) return;
          e.preventDefault();
          el.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>แก้ไขตาราง</DialogTitle>
          <DialogDescription>
            สูงสุด {MAX_TABLE_COLS} คอลัมน์ {MAX_TABLE_ROWS} แถว — Tab เลื่อนช่อง, Enter ลงแถวถัดไป, วาง TSV ได้
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <FieldRow id={`${uid}-caption`} label="คำบรรยายตาราง" overridden={false} locked={locked}>
            <TextPropField
              id={`${uid}-caption`}
              value={draftCaption}
              placeholder="—"
              disabled={locked}
              onCommit={(v) => setDraftCaption(v)}
            />
          </FieldRow>
          <FieldRow id={`${uid}-header`} label="แถวหัวตาราง" overridden={false} locked={locked}>
            <Switch
              id={`${uid}-header`}
              size="lg"
              checked={draftHeader}
              disabled={locked}
              onCheckedChange={setDraftHeader}
              aria-labelledby={fieldLabelId(`${uid}-header`)}
            />
          </FieldRow>
          <FieldRow id={`${uid}-striped`} label="แถบสลับสี" overridden={false} locked={locked}>
            <Switch
              id={`${uid}-striped`}
              size="lg"
              checked={draftStriped}
              disabled={locked}
              onCheckedChange={setDraftStriped}
              aria-labelledby={fieldLabelId(`${uid}-striped`)}
            />
          </FieldRow>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" disabled={locked} onClick={onAddRow}>
            เพิ่มแถว
          </Button>
          <Button type="button" size="sm" variant="outline" disabled={locked} onClick={onAddCol}>
            เพิ่มคอลัมน์
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto rounded-lg border">
          <table className="w-max min-w-full border-collapse text-xs">
            <thead>
              <tr>
                {grid.columns.map((h, c) => (
                  <th key={c} className="border-b border-r bg-muted/40 p-1 font-normal">
                    <div className="flex items-center gap-1">
                      <input
                        id={cellId(uid, -1, c)}
                        className="min-w-24 flex-1 rounded border bg-transparent px-1.5 py-1 outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        value={h}
                        disabled={locked}
                        aria-label={`${tr("หัวคอลัมน์")} ${c + 1}`}
                        onChange={(e) => setHeader(c, e.currentTarget.value)}
                        onFocus={() => setFocusCell({ r: -1, c })}
                        onKeyDown={(e) => onCellKeyDown(e, -1, c)}
                        onPaste={(e) => {
                          const text = e.clipboardData.getData("text");
                          if (text.includes("\t") || text.includes("\n")) {
                            e.preventDefault();
                            onPaste(-1, c, text);
                          }
                        }}
                      />
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        className="shrink-0"
                        disabled={locked || grid.columns.length <= 1}
                        aria-label={`${tr("ลบคอลัมน์")} ${c + 1}`}
                        onClick={() => onRemoveCol(c)}
                      >
                        ×
                      </Button>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {grid.rows.map((row, r) => (
                <tr key={r}>
                  {row.map((cell, c) => (
                    <td key={c} className="border-b border-r p-1 align-top">
                      <div className="flex items-center gap-1">
                        <input
                          id={cellId(uid, r, c)}
                          className="min-w-24 flex-1 rounded border bg-transparent px-1.5 py-1 outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          value={cell}
                          disabled={locked}
                          aria-label={`${tr("แถว")} ${r + 1} ${tr("คอลัมน์")} ${c + 1}`}
                          onChange={(e) => setCell(r, c, e.currentTarget.value)}
                          onFocus={() => setFocusCell({ r, c })}
                          onKeyDown={(e) => onCellKeyDown(e, r, c)}
                          onPaste={(e) => {
                            const text = e.clipboardData.getData("text");
                            if (text.includes("\t") || text.includes("\n")) {
                              e.preventDefault();
                              onPaste(r, c, text);
                            }
                          }}
                        />
                        {c === 0 ? (
                          <Button
                            type="button"
                            size="icon-sm"
                            variant="ghost"
                            className="shrink-0"
                            disabled={locked || grid.rows.length <= 1}
                            aria-label={`${tr("ลบแถว")} ${r + 1}`}
                            onClick={() => onRemoveRow(r)}
                          >
                            ×
                          </Button>
                        ) : null}
                      </div>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            ยกเลิก
          </Button>
          <Button type="button" disabled={locked} onClick={commit}>
            บันทึก
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
