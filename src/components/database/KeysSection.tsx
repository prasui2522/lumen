import { useRef, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  addUnique,
  compatibleColumns,
  keyOptions,
  newForeignKeyId,
  pickResult,
  ON_DELETE_LABELS,
  removeForeignKey,
  removeUnique,
  setUniqueColumns,
  upsertForeignKey,
  type DbForeignKey,
  type DbModel,
  type DbTable,
} from "@/lib/db-model";
import { useDbModelStore } from "@/lib/db-model-store";
import { keyColumnNames, MISSING_TABLE, withDetail } from "@/lib/db-problems";
import type { IssueLookup } from "./TableEditor";

const commit = (f: (m: DbModel) => DbModel) => {
  const s = useDbModelStore.getState();
  s.commit(f(s.model));
};
const names = keyColumnNames;

/** `ไม่ซ้ำ` and `ความสัมพันธ์` (§5, step 4). */
export function KeysSection({ table: t, tables, base, issue }: { table: DbTable; tables: DbTable[]; base: string; issue: IssueLookup }) {
  /** Dialog stays mounted while closing so Radix's close-autofocus runs; `n` resets its state per open. */
  const [fkDialog, setFkDialog] = useState<{ initial: DbForeignKey | null; open: boolean; n: number } | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  const openFk = (initial: DbForeignKey | null, el: HTMLElement) => {
    opener.current = el;
    setFkDialog((d) => ({ initial, open: true, n: (d?.n ?? 0) + 1 }));
  };
  /** After a row is deleted its buttons are gone: focus the neighbour's edit button, else เพิ่ม. */
  const focusLater = (id: string) => requestAnimationFrame(() => document.getElementById(id)?.focus());
  const neighbour = <T extends { id: string }>(list: T[], id: string) => {
    const i = list.findIndex((x) => x.id === id);
    const rest = list.filter((x) => x.id !== id);
    return rest[Math.min(i, rest.length - 1)] ?? null;
  };
  return (
    <div className="mt-6 grid max-w-3xl gap-6">
      <section aria-labelledby={`${base}-uq-h`}>
        <div className="flex items-center gap-2">
          <h3 id={`${base}-uq-h`} className="text-sm font-medium">
            ไม่ซ้ำ
          </h3>
          <ColumnPicker
            table={t}
            initial={[]}
            title="เพิ่มชุดคอลัมน์ที่ไม่ซ้ำ"
            onDone={(cols) => cols.length > 0 && commit((m) => addUnique(m, t.id, cols).model)}
            trigger={
              <Button id={`${base}-uq-add`} type="button" variant="outline" size="sm" className="h-7 text-xs" aria-label="เพิ่มชุดไม่ซ้ำ">
                <Plus aria-hidden />
                เพิ่ม
              </Button>
            }
          />
        </div>
        {t.uniques.length === 0 ? (
          <p className="mt-1 text-xs text-muted-foreground">ยังไม่มี</p>
        ) : (
          <ul className="mt-1 grid gap-1">
            {t.uniques.map((u) => {
              const err = issue(null, `unique:${u.id}`);
              return (
                <li key={u.id} className="flex items-center gap-2 text-xs">
                  <span className="font-mono">{names(t, u.columns) || "—"}</span>
                  <ColumnPicker
                    table={t}
                    initial={u.columns}
                    title="แก้ไขชุดคอลัมน์ที่ไม่ซ้ำ"
                    onDone={(cols) => commit((m) => setUniqueColumns(m, t.id, u.id, cols))}
                    trigger={
                      <Button
                        id={`${base}-uq-${u.id}`}
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={withDetail("แก้ไขไม่ซ้ำ", names(t, u.columns))}
                        aria-invalid={err ? true : undefined}
                        aria-describedby={err ? `${base}-uq-${u.id}-err` : undefined}
                      >
                        <Pencil aria-hidden />
                      </Button>
                    }
                  />
                  <Button type="button" variant="ghost" size="icon-sm" aria-label={withDetail("ลบไม่ซ้ำ", names(t, u.columns))} onClick={() => {
                      const next = neighbour(t.uniques, u.id);
                      commit((m) => removeUnique(m, t.id, u.id));
                      focusLater(next ? `${base}-uq-${next.id}` : `${base}-uq-add`);
                    }}>
                    <Trash2 aria-hidden />
                  </Button>
                  {err ? (
                    <span id={`${base}-uq-${u.id}-err`} className="text-destructive">
                      {err}
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section aria-labelledby={`${base}-fk-h`}>
        <div className="flex items-center gap-2">
          <h3 id={`${base}-fk-h`} className="text-sm font-medium">
            ความสัมพันธ์
          </h3>
          <Button
            id={`${base}-fk-add`}
            type="button"
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            aria-label="เพิ่มความสัมพันธ์"
            onClick={(e) => openFk(null, e.currentTarget)}
          >
            <Plus aria-hidden />
            เพิ่ม
          </Button>
        </div>
        {t.foreignKeys.length === 0 ? (
          <p className="mt-1 text-xs text-muted-foreground">ยังไม่มี</p>
        ) : (
          <ul className="mt-1 grid gap-1">
            {t.foreignKeys.map((fk) => {
              const rt = tables.find((x) => x.id === fk.refTableId);
              const text = `${names(t, fk.columns) || "—"} → ${rt ? `${rt.name}.${names(rt, fk.refColumns) || "—"}` : MISSING_TABLE}`;
              const err = issue(null, `foreignKey:${fk.id}`);
              return (
                <li key={fk.id} className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="font-mono">{text}</span>
                  <span className="text-muted-foreground">เมื่อลบแถวปลายทาง: {ON_DELETE_LABELS[fk.onDelete]}</span>
                  <Button
                    id={`${base}-fk-${fk.id}`}
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`แก้ไขความสัมพันธ์ ${text}`}
                    aria-invalid={err ? true : undefined}
                    aria-describedby={err ? `${base}-fk-${fk.id}-err` : undefined}
                    onClick={(e) => openFk(fk, e.currentTarget)}
                  >
                    <Pencil aria-hidden />
                  </Button>
                  <Button type="button" variant="ghost" size="icon-sm" aria-label={`ลบความสัมพันธ์ ${text}`} onClick={() => {
                    const next = neighbour(t.foreignKeys, fk.id);
                    commit((m) => removeForeignKey(m, t.id, fk.id));
                    focusLater(next ? `${base}-fk-${next.id}` : `${base}-fk-add`);
                  }}>
                    <Trash2 aria-hidden />
                  </Button>
                  {err ? (
                    <span id={`${base}-fk-${fk.id}-err`} className="text-destructive">
                      {err}
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {fkDialog ? (
        <ForeignKeyDialog
          key={fkDialog.n}
          table={t}
          tables={tables}
          open={fkDialog.open}
          initial={fkDialog.initial}
          onClose={() => setFkDialog((d) => (d ? { ...d, open: false } : d))}
          onClosed={() => {
            // Esc, ยกเลิก and บันทึก all return focus to the opener (เพิ่ม or the row's edit button).
            const el = opener.current;
            opener.current = null;
            if (el?.isConnected) el.focus();
            else document.getElementById(`${base}-fk-add`)?.focus();
          }}
        />
      ) : null}
    </div>
  );
}

/** Column multi-pick in a Popover; the pick is committed once, on close (one undo step). */
function ColumnPicker({
  table: t,
  initial,
  title,
  onDone,
  trigger,
}: {
  table: DbTable;
  initial: string[];
  title: string;
  onDone: (cols: string[]) => void;
  trigger: React.ReactNode;
}) {
  const [picked, setPicked] = useState<string[] | null>(null);
  return (
    <Popover
      onOpenChange={(open) => {
        if (open) setPicked(initial);
        else {
          // Model column order; zero checked or same set = no change (never an empty set).
          const next = pickResult(t, initial, picked ?? initial);
          setPicked(null);
          if (next) onDone(next);
        }
      }}
    >
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent className="w-60">
        <fieldset>
          <legend className="mb-1 text-xs font-medium">{title}</legend>
          {t.columns.map((c) => {
            const id = `pick-${t.id}-${c.id}`;
            const on = (picked ?? initial).includes(c.id);
            return (
              <div key={c.id} className="flex items-center gap-2 py-0.5">
                <input
                  id={id}
                  type="checkbox"
                  className="size-3.5 accent-primary"
                  checked={on}
                  onChange={(e) => {
                    const cur = picked ?? initial;
                    setPicked(e.currentTarget.checked ? [...cur, c.id] : cur.filter((x) => x !== c.id));
                  }}
                />
                <label htmlFor={id} className="font-mono text-xs">
                  {c.name}
                </label>
              </div>
            );
          })}
        </fieldset>
      </PopoverContent>
    </Popover>
  );
}

/**
 * FK add/edit dialog (§5): ตารางปลายทาง → คอลัมน์ปลายทาง (its PK or a unique)
 * → one local `คอลัมน์` per target column → เมื่อลบแถวปลายทาง. Save = one step.
 */
function ForeignKeyDialog({
  table: t,
  tables,
  open,
  initial,
  onClose,
  onClosed,
}: {
  table: DbTable;
  tables: DbTable[];
  open: boolean;
  initial: DbForeignKey | null;
  onClose: () => void;
  onClosed: () => void;
}) {
  const [refTableId, setRefTableId] = useState(initial?.refTableId ?? "");
  const rt = tables.find((x) => x.id === refTableId) ?? null;
  const options = rt ? keyOptions(rt) : [];
  const initialKey =
    initial && rt
      ? options.find((o) => [...o.columns].sort().join() === [...initial.refColumns].sort().join())?.id ?? ""
      : "";
  const [keyId, setKeyId] = useState(initialKey);
  const key = options.find((o) => o.id === keyId) ?? null;
  const pairsFromInitial = () => {
    if (!initial || !key) return {};
    const out: Record<string, string> = {};
    initial.refColumns.forEach((r, i) => (out[r] = initial.columns[i] ?? ""));
    return out;
  };
  const [pairs, setPairs] = useState<Record<string, string>>(pairsFromInitial);
  const [onDelete, setOnDelete] = useState<DbForeignKey["onDelete"]>(initial?.onDelete ?? "no_action");

  const complete = !!key && key.columns.every((r) => !!pairs[r]);
  const save = () => {
    if (!key || !complete) return;
    const fk: DbForeignKey = {
      id: initial?.id ?? newForeignKeyId(),
      columns: key.columns.map((r) => pairs[r]!),
      refTableId,
      refColumns: key.columns,
      onDelete,
    };
    const s = useDbModelStore.getState();
    s.commit(upsertForeignKey(s.model, t.id, fk));
    onClose();
  };
  const id = `fkd-${t.id}`;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className="sm:max-w-md"
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          onClosed();
        }}
      >
        <DialogHeader>
          <DialogTitle>{initial ? "แก้ไขความสัมพันธ์" : "เพิ่มความสัมพันธ์"}</DialogTitle>
          <DialogDescription>ตาราง {t.name} อ้างอิงแถวในตารางปลายทาง</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <Field label="ตารางปลายทาง" htmlFor={`${id}-rt`}>
            <Select
              value={refTableId}
              onValueChange={(v) => {
                setRefTableId(v);
                const opts = keyOptions(tables.find((x) => x.id === v)!);
                setKeyId(opts[0]?.id ?? "");
                setPairs({});
              }}
            >
              <SelectTrigger id={`${id}-rt`} size="sm" className="w-full text-xs">
                <SelectValue placeholder="เลือกตาราง" />
              </SelectTrigger>
              <SelectContent>
                {tables.map((x) => (
                  <SelectItem key={x.id} value={x.id} className="text-xs">
                    {x.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          {rt ? (
            <Field label="คอลัมน์ปลายทาง" htmlFor={`${id}-key`}>
              {options.length === 0 ? (
                <p className="text-xs text-destructive">ตารางนี้ยังไม่มีคีย์หลักหรือชุดไม่ซ้ำ</p>
              ) : (
                <Select
                  value={keyId}
                  onValueChange={(v) => {
                    setKeyId(v);
                    setPairs({});
                  }}
                >
                  <SelectTrigger id={`${id}-key`} size="sm" className="w-full text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {options.map((o) => (
                      <SelectItem key={o.id} value={o.id} className="text-xs">
                        {names(rt, o.columns)}
                        {o.id === "pk" ? " (คีย์หลัก)" : " (ไม่ซ้ำ)"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </Field>
          ) : null}
          {rt && key
            ? key.columns.map((r) => {
                const ref = rt.columns.find((c) => c.id === r)!;
                const local = compatibleColumns(t, ref);
                return (
                  <Field key={r} label={`คอลัมน์ (คู่กับ ${ref.name})`} htmlFor={`${id}-c-${r}`}>
                    {local.length === 0 ? (
                      <p className="text-xs text-destructive">ไม่มีคอลัมน์ชนิดเดียวกับ {ref.name}</p>
                    ) : (
                      <Select value={pairs[r] ?? ""} onValueChange={(v) => setPairs((p) => ({ ...p, [r]: v }))}>
                        <SelectTrigger id={`${id}-c-${r}`} size="sm" className="w-full text-xs">
                          <SelectValue placeholder="เลือกคอลัมน์" />
                        </SelectTrigger>
                        <SelectContent>
                          {local.map((c) => (
                            <SelectItem key={c.id} value={c.id} className="text-xs">
                              {c.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </Field>
                );
              })
            : null}
          <Field label="เมื่อลบแถวปลายทาง" htmlFor={`${id}-od`}>
            <Select value={onDelete} onValueChange={(v) => setOnDelete(v as DbForeignKey["onDelete"])}>
              <SelectTrigger id={`${id}-od`} size="sm" className="w-full text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(ON_DELETE_LABELS) as DbForeignKey["onDelete"][]).map((k) => (
                  <SelectItem key={k} value={k} className="text-xs">
                    {ON_DELETE_LABELS[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            ยกเลิก
          </Button>
          <Button type="button" disabled={!complete} onClick={save}>
            บันทึก
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1">
      <label htmlFor={htmlFor} className="text-xs text-muted-foreground">
        {label}
      </label>
      {children}
    </div>
  );
}
