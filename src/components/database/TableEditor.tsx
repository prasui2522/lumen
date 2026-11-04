import { useRef, useState } from "react";
import { useTestDataStore } from "@/lib/db-testdata";
import { TestDataGrid } from "./TestDataGrid";
import { MoreHorizontal, Plus, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  DB_TYPE_LABELS,
  DB_TYPES,
  setColumnType,
  nullableLocked,
  setPrimaryKey,
  updateColumn,
  updateTable,
  type DbColumn,
  type DbTable,
  type DbType,
} from "@/lib/db-model";
import { useDbModelStore } from "@/lib/db-model-store";
import { focusProblemTarget, type TableProblem } from "@/lib/db-problems";
import { DbTextField } from "./DbTextField";
import { DefaultCell } from "./DefaultCell";
import { KeysSection } from "./KeysSection";

/** First issue per (column, field) — duplicates of one id show once. */
export type IssueLookup = (columnId: string | null, field: string) => string | null;

const commit = (f: (m: ReturnType<typeof model>) => ReturnType<typeof model>) => {
  const s = useDbModelStore.getState();
  s.commit(f(s.model));
};
const model = () => useDbModelStore.getState().model;

type Props = {
  table: DbTable;
  tables: DbTable[];
  issue: IssueLookup;
  tableIssues: TableProblem[];
  nameRef: React.Ref<HTMLInputElement>;
};

export function TableEditor({ table, tables, issue, tableIssues, nameRef }: Props) {
  // Kept in the test-data store so it survives switching tables.
  const tab = useTestDataStore((s) => s.tab);
  const setTab = useTestDataStore((s) => s.setTab);
  const addColRef = useRef<HTMLButtonElement>(null);
  const tableRef = useRef<HTMLTableElement>(null);
  const t = table;
  const base = `db-${t.id}`;

  const focusColumnName = (columnId: string | null) => {
    requestAnimationFrame(() => {
      const el = columnId ? document.getElementById(`${base}-${columnId}-name`) : null;
      (el ?? addColRef.current)?.focus();
    });
  };

  return (
    <main data-table-editor={t.id} className="flex min-w-0 flex-1 flex-col overflow-auto" aria-label={`ตาราง ${t.name}`}>
      <div className="flex flex-wrap items-start gap-3 border-b border-border px-4 py-3">
        <div className="flex w-56 flex-col gap-1">
          <label htmlFor={`${base}-name`} className="text-xs text-muted-foreground">
            ชื่อตาราง
          </label>
          <DbTextField
            id={`${base}-name`}
            inputRef={nameRef}
            value={t.name}
            mono
            error={issue(null, "name")}
            onCommit={(v) => useDbModelStore.getState().renameTable(t.id, v)}
          />
        </div>
        <div className="flex w-56 flex-col gap-1">
          <label htmlFor={`${base}-label`} className="text-xs text-muted-foreground">
            ชื่อที่แสดง
          </label>
          <DbTextField
            id={`${base}-label`}
            value={t.label ?? ""}
            placeholder="เช่น ผู้ใช้"
            onCommit={(v) => commit((m) => updateTable(m, t.id, { label: v.trim() }))}
          />
        </div>
        <ToggleGroup
          type="single"
          size="sm"
          value={tab}
          onValueChange={(v) => v && setTab(v as "structure" | "data")}
          aria-label="มุมมองตาราง"
          className="ml-auto self-end rounded-lg bg-muted p-0.5"
        >
          <ToggleGroupItem value="structure" className="px-2.5 data-[state=on]:bg-background">
            โครงสร้าง
          </ToggleGroupItem>
          <ToggleGroupItem value="data" className="px-2.5 data-[state=on]:bg-background">
            ข้อมูลทดสอบ
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      {tab === "data" ? (
        <TestDataGrid table={t} />
      ) : (
        <div className="p-4">
          <table ref={tableRef} className="w-full max-w-4xl border-separate border-spacing-y-1 text-sm">
            <caption className="sr-only">คอลัมน์ของตาราง {t.name}</caption>
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th scope="col" className="w-[30%] font-normal">คอลัมน์</th>
                <th scope="col" className="w-[24%] font-normal">ชนิด</th>
                <th scope="col" className="font-normal">ต้องมีค่า</th>
                <th scope="col" className="font-normal">คีย์หลัก</th>
                <th scope="col" className="w-[24%] font-normal">ค่าเริ่มต้น</th>
                <th scope="col" className="w-8 font-normal"><span className="sr-only">ตัวเลือก</span></th>
              </tr>
            </thead>
            <tbody>
              {t.columns.map((c, i) => (
                <ColumnRow
                  key={c.id}
                  table={t}
                  column={c}
                  index={i}
                  base={base}
                  issue={issue}
                  onDeleted={focusColumnName}
                />
              ))}
            </tbody>
          </table>
          <Button
            ref={addColRef}
            id={`${base}-add-col`}
            type="button"
            variant="outline"
            size="sm"
            className="mt-2"
            onClick={() => focusColumnName(useDbModelStore.getState().addColumn(t.id))}
          >
            <Plus aria-hidden />
            เพิ่มคอลัมน์
          </Button>

          <KeysSection table={t} tables={tables} base={base} issue={issue} />

          {tableIssues.length > 0 ? (
            <div className="mt-6 max-w-3xl">
              <h3 className="text-xs font-medium text-destructive">ปัญหาของตาราง</h3>
              <ul className="mt-1 grid gap-0.5 text-xs">
                {tableIssues.map((x) => {
                  return (
                    <li key={x.key}>
                      <button
                        type="button"
                        data-table-problem
                        className="text-left text-destructive underline-offset-2 hover:underline focus-visible:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:no-underline"
                        disabled={x.targets.length === 0}
                        onClick={() => focusProblemTarget(x.targets)}
                      >
                        {x.text}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}
        </div>
      )}
    </main>
  );
}

function ColumnRow({
  table: t,
  column: c,
  index,
  base,
  issue,
  onDeleted,
}: {
  table: DbTable;
  column: DbColumn;
  index: number;
  base: string;
  issue: IssueLookup;
  onDeleted: (focusColumnId: string | null) => void;
}) {
  const id = `${base}-${c.id}`;
  const isPk = t.primaryKey.includes(c.id);
  const typeError = issue(c.id, "type") ?? issue(c.id, "precision") ?? issue(c.id, "values");
  const nullError = issue(c.id, "nullable");
  const afterMenu = useRef<(() => void) | null>(null);
  return (
    <tr className="align-top">
      <td className="pr-2">
        <div className="flex items-start gap-1.5">
          <DbTextField
            id={`${id}-name`}
            label={`ชื่อคอลัมน์ ${index + 1}`}
            value={c.name}
            mono
            className="flex-1"
            error={issue(c.id, "name") ?? issue(c.id, "column")}
            onCommit={(v) => useDbModelStore.getState().renameColumn(t.id, c.id, v)}
          />
        </div>
      </td>
      <td className="pr-2">
        <div className="flex items-center gap-1">
          <Select value={c.type} onValueChange={(v) => commit((m) => setColumnType(m, t.id, c.id, v as DbType))}>
            <SelectTrigger
              id={`${id}-type`}
              size="sm"
              className="h-7 min-w-0 flex-1 text-xs"
              aria-label={`ชนิดของ ${c.name}`}
              aria-invalid={typeError ? true : undefined}
              aria-describedby={typeError ? `${id}-type-err` : undefined}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DB_TYPES.map((ty) => (
                <SelectItem key={ty} value={ty} className="text-xs">
                  {DB_TYPE_LABELS[ty]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {c.type === "decimal" ? <DecimalPopover table={t} column={c} /> : null}
          {c.type === "enum" ? <EnumPopover table={t} column={c} /> : null}
        </div>
        {typeError ? (
          <p id={`${id}-type-err`} className="mt-1 text-xs text-destructive">
            {typeError}
          </p>
        ) : null}
      </td>
      <td className="pr-2 pt-1">
        <Switch
          id={`${id}-null`}
          checked={!c.nullable}
          disabled={nullableLocked(t, c.id)}
          aria-label={`${c.name} ต้องมีค่า`}
          aria-invalid={nullError ? true : undefined}
          aria-describedby={
            [nullError ? `${id}-null-err` : "", nullableLocked(t, c.id) ? `${id}-pk-hint` : ""].filter(Boolean).join(" ") ||
            undefined
          }
          onCheckedChange={(on) => commit((m) => updateColumn(m, t.id, c.id, { nullable: !on }))}
        />
        {nullableLocked(t, c.id) ? (
          <span id={`${id}-pk-hint`} className="mt-0.5 block max-w-[5.5rem] text-[11px] leading-tight text-muted-foreground">
            คีย์หลักต้องมีค่าเสมอ
          </span>
        ) : null}
        {nullError ? (
          <p id={`${id}-null-err`} className="mt-1 text-xs text-destructive">
            {nullError}
          </p>
        ) : null}
      </td>
      <td className="pr-2 pt-1">
        <Switch
          id={`${id}-pk`}
          checked={isPk}
          aria-label={`${c.name} เป็นคีย์หลัก`}
          onCheckedChange={(on) => commit((m) => setPrimaryKey(m, t.id, c.id, on))}
        />
      </td>
      <td className="pr-2">
        <DefaultCell table={t} column={c} id={`${id}-default`} error={issue(c.id, "default")} />
      </td>
      <td>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="ghost" size="icon-sm" aria-label={`ตัวเลือกของคอลัมน์ ${c.name}`}>
              <MoreHorizontal aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            onCloseAutoFocus={(e) => {
              const next = afterMenu.current;
              afterMenu.current = null;
              if (next) {
                e.preventDefault();
                next();
              }
            }}
          >
            <DropdownMenuItem disabled={index === 0} onSelect={() => useDbModelStore.getState().moveColumn(t.id, c.id, -1)}>
              เลื่อนขึ้น
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={index === t.columns.length - 1}
              onSelect={() => useDbModelStore.getState().moveColumn(t.id, c.id, 1)}
            >
              เลื่อนลง
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onSelect={() => {
                const rest = t.columns.filter((x) => x.id !== c.id);
                const neighbour = rest[Math.min(index, rest.length - 1)]?.id ?? null;
                useDbModelStore.getState().removeColumn(t.id, c.id);
                afterMenu.current = () => onDeleted(neighbour);
                // The row unmounts, so its menu may not get to restore focus.
                onDeleted(neighbour);
              }}
            >
              ลบคอลัมน์
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </td>
    </tr>
  );
}

function intOrUndefined(s: string): number | undefined {
  return /^\d+$/.test(s.trim()) ? Number(s.trim()) : undefined;
}

function DecimalPopover({ table: t, column: c }: { table: DbTable; column: DbColumn }) {
  const [open, setOpen] = useState(false);
  const [p, setP] = useState<string | null>(null);
  const [s, setS] = useState<string | null>(null);
  const save = () => {
    const precision = p === null ? c.precision : intOrUndefined(p);
    const scale = s === null ? c.scale : intOrUndefined(s);
    setP(null);
    setS(null);
    if (precision !== c.precision || scale !== c.scale) commit((m) => updateColumn(m, t.id, c.id, { precision, scale }));
  };
  const id = `db-${t.id}-${c.id}`;
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) save();
      }}
    >
      <PopoverTrigger asChild>
        <Button id={`db-${t.id}-${c.id}-decimal`} type="button" variant="outline" size="sm" className="h-7 px-2 font-mono text-xs" aria-label={`ความแม่นยำของ ${c.name}`}>
          {c.precision ?? "?"},{c.scale ?? "?"}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 space-y-2">
        {(
          [
            ["p", "ความแม่นยำ (1–38)", p, setP, c.precision],
            ["s", "ตำแหน่งทศนิยม", s, setS, c.scale],
          ] as const
        ).map(([k, label, draft, setDraft, value]) => (
          <div key={k} className="flex items-center justify-between gap-2">
            <label htmlFor={`${id}-${k}`} className="text-xs">
              {label}
            </label>
            <Input
              id={`${id}-${k}`}
              inputMode="numeric"
              className="h-7 w-16 text-xs md:text-xs"
              value={draft ?? (value === undefined ? "" : String(value))}
              onChange={(e) => setDraft(e.currentTarget.value)}
              onBlur={save}
              onKeyDown={(e) => {
                // Enter saves and closes; Radix returns focus to the trigger.
                if (e.key !== "Enter") return;
                e.preventDefault();
                save();
                setOpen(false);
              }}
            />
          </div>
        ))}
      </PopoverContent>
    </Popover>
  );
}

function EnumPopover({ table: t, column: c }: { table: DbTable; column: DbColumn }) {
  const [draft, setDraft] = useState<string | null>(null);
  const save = () => {
    if (draft === null) return;
    const values = draft
      .split("\n")
      .map((v) => v.trim())
      .filter((v) => v !== "");
    setDraft(null);
    const old = c.values ?? [];
    if (values.length !== old.length || values.some((v, i) => v !== old[i]))
      commit((m) => updateColumn(m, t.id, c.id, { values }));
  };
  const id = `db-${t.id}-${c.id}-values`;
  return (
    <Popover onOpenChange={(open) => !open && save()}>
      <PopoverTrigger asChild>
        <Button id={`db-${t.id}-${c.id}-enum`} type="button" variant="outline" size="sm" className="h-7 px-2 text-xs" aria-label={`ตัวเลือกของ ${c.name}`}>
          <Settings2 aria-hidden />
          {c.values?.length ?? 0}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 space-y-1">
        <label htmlFor={id} className="text-xs">
          ตัวเลือก (บรรทัดละ 1 ค่า)
        </label>
        <textarea
          id={id}
          rows={6}
          className="w-full rounded-md border border-input bg-transparent px-2 py-1 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
          value={draft ?? (c.values ?? []).join("\n")}
          onChange={(e) => setDraft(e.currentTarget.value)}
          onBlur={save}
        />
      </PopoverContent>
    </Popover>
  );
}


