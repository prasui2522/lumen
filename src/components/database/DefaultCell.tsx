import { useRef } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { setColumnDefault, todayLocal, type DbColumn, type DbDefault, type DbTable } from "@/lib/db-model";
import { useDbModelStore } from "@/lib/db-model-store";
import { usePhrase } from "@/lib/phrases";
import { DbTextField } from "./DbTextField";

const NONE = "__none";
const LITERAL = "__literal";

const commitDefault = (t: DbTable, c: DbColumn, def: DbDefault | undefined) => {
  const s = useDbModelStore.getState();
  s.commit(setColumnDefault(s.model, t.id, c.id, def));
};

type Props = { table: DbTable; column: DbColumn; id: string; error: string | null };

/**
 * `ค่าเริ่มต้น` control by type (§2/§3). Literal values are always sent as
 * strings (integers exceed JS safe range); booleans as bool. json and
 * identity take no default.
 */
export function DefaultCell({ table: t, column: c, id, error }: Props) {
  const tr = usePhrase();
  /** กำหนดวันที่ picked: the Select's close-autofocus goes to the date field instead of the trigger. */
  const focusDate = useRef(false);
  const def = c.default;
  const errProps = {
    "aria-invalid": error ? true : undefined,
    "aria-describedby": error ? `${id}-err` : undefined,
  } as const;
  const errLine = error ? (
    <p id={`${id}-err`} className="mt-1 text-xs text-destructive">
      {error}
    </p>
  ) : null;

  if (c.type === "json" || c.type === "identity") {
    return (
      <div>
        <span className="text-xs text-muted-foreground" id={id}>
          {c.type === "identity" ? tr("อัตโนมัติ") : "—"}
        </span>
        {errLine}
      </div>
    );
  }

  // Choice-only types: one Select.
  const choices: { value: string; label: string; def: DbDefault | undefined }[] | null =
    c.type === "boolean"
      ? [
          { value: NONE, label: tr("ไม่มี"), def: undefined },
          { value: "true", label: tr("จริง"), def: { kind: "literal", value: true } },
          { value: "false", label: tr("เท็จ"), def: { kind: "literal", value: false } },
        ]
      : c.type === "enum"
        ? [
            { value: NONE, label: tr("ไม่มี"), def: undefined },
            ...(c.values ?? []).map((v) => ({ value: `v:${v}`, label: v, def: { kind: "literal", value: v } as DbDefault })),
          ]
        : c.type === "timestamptz"
          ? [
              { value: NONE, label: tr("ไม่มี"), def: undefined },
              { value: "now", label: tr("เวลาปัจจุบัน"), def: { kind: "now" } },
            ]
          : c.type === "uuid"
            ? [
                { value: NONE, label: tr("ไม่มี"), def: undefined },
                { value: "uuid", label: tr("รหัสใหม่"), def: { kind: "uuid" } },
              ]
            : null;

  const currentValue = (): string => {
    if (!def) return NONE;
    if (def.kind !== "literal") return def.kind;
    if (typeof def.value === "boolean") return String(def.value);
    return c.type === "enum" ? `v:${def.value}` : LITERAL;
  };

  if (choices) {
    const cur = currentValue();
    // A stale value (e.g. enum value removed, or a mismatched kind) stays visible as invalid.
    const known = choices.some((x) => x.value === cur);
    return (
      <div>
        <Select
          value={known ? cur : "__stale"}
          onValueChange={(v) => commitDefault(t, c, choices.find((x) => x.value === v)?.def)}
        >
          <SelectTrigger id={id} size="sm" className="h-7 w-full min-w-0 text-xs" aria-label={`${tr("ค่าเริ่มต้นของ")} ${c.name}`} {...errProps}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {!known ? (
              <SelectItem value="__stale" className="text-xs" disabled>
                {def && def.kind === "literal" ? String(def.value) : tr("ไม่ถูกต้อง")}
              </SelectItem>
            ) : null}
            {choices.map((x) => (
              <SelectItem key={x.value} value={x.value} className="text-xs">
                {x.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {errLine}
      </div>
    );
  }

  // date: ไม่มี / วันนี้ / a fixed date; text, integer, decimal: free value (empty = none).
  const literal = def?.kind === "literal" && typeof def.value === "string" ? def.value : "";
  const field = (
    <DbTextField
      id={c.type === "date" ? `${id}-value` : id}
      label={`${tr("ค่าเริ่มต้นของ")} ${c.name}`}
      value={literal}
      mono={c.type !== "text"}
      placeholder={tr("ไม่มี")}
      error={error}
      onCommit={(v) => commitDefault(t, c, v === "" ? undefined : { kind: "literal", value: v })}
    />
  );
  if (c.type !== "date") return field;
  const cur = def?.kind === "today" ? "today" : def ? LITERAL : NONE;
  return (
    <div className="flex flex-col gap-1">
      <Select
        value={cur}
        onValueChange={(v) => {
          commitDefault(t, c, v === NONE ? undefined : v === "today" ? { kind: "today" } : { kind: "literal", value: literal || todayLocal() });
          focusDate.current = v === LITERAL;
        }}
      >
        <SelectTrigger id={id} size="sm" className="h-7 w-full min-w-0 text-xs" aria-label={`${tr("ค่าเริ่มต้นของ")} ${c.name}`} {...(cur === LITERAL ? {} : errProps)}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent
          onCloseAutoFocus={(e) => {
            if (!focusDate.current) return;
            focusDate.current = false;
            e.preventDefault();
            document.getElementById(`${id}-value`)?.focus();
          }}
        >
          <SelectItem value={NONE} className="text-xs">{tr("ไม่มี")}</SelectItem>
          <SelectItem value="today" className="text-xs">{tr("วันนี้")}</SelectItem>
          <SelectItem value={LITERAL} className="text-xs">{tr("กำหนดวันที่")}</SelectItem>
        </SelectContent>
      </Select>
      {cur === LITERAL ? field : errLine}
    </div>
  );
}
