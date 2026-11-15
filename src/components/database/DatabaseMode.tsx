import { useEffect, useMemo, useRef } from "react";
import { Database, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { useProjectsStore } from "@/stores/projects-store";
import { useDbModelStore } from "@/lib/db-model-store";
import { validateModel } from "@/lib/db-validate";
import { dbUndoAction, isTextTarget } from "@/lib/db-shortcuts";
import { isOverlayOpen, nativeUndoAllowed } from "@/lib/modal";
import { runSqlExport } from "@/lib/db-export";
import { useTestDataStore } from "@/lib/db-testdata";
import { useEditorStore } from "@/stores/editor-store";
import { SqlExportButton } from "./SqlExportButton";
import { FormDbActions } from "./FormDbActions";
import { TableList } from "./TableList";
import { TableEditor, type IssueLookup } from "./TableEditor";
import { tableProblems } from "@/lib/db-problems";
import { phraseIssue } from "@/lib/db-issue-i18n";
import { phraseIpcError } from "@/lib/ipc-error-i18n";
import { useLocale } from "@/lib/locale";
import { usePhrase } from "@/lib/phrases";

/**
 * `ฐานข้อมูล` mode (PHASE-10-SPEC §5). Lazy chunk, loaded on the first switch
 * to the mode. Step 3: table list + table/column editor, inline validation
 * (TS mirror), and the model's own undo history (§8).
 */
export function DatabaseMode() {
  const p = usePhrase();
  const locale = useLocale();
  const openId = useProjectsStore((s) => s.openId);
  const status = useDbModelStore((s) => s.status);
  const error = useDbModelStore((s) => s.error);
  const model = useDbModelStore((s) => s.model);
  const selectedId = useDbModelStore((s) => s.selectedTableId);
  const tables = model.tables;
  const listRef = useRef<HTMLUListElement>(null);
  const addRef = useRef<HTMLButtonElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const focusNewTable = useRef<string | null>(null);
  /** Set by ลองอีกครั้ง: the retry button unmounts, so focus must land somewhere. */
  const focusAfterRetry = useRef(false);

  useEffect(() => {
    if (openId) void useDbModelStore.getState().ensureLoaded(openId);
  }, [openId]);

  // Leaving ฐานข้อมูล closes the test file (Rust drops the connection).
  useEffect(() => () => useTestDataStore.getState().close(), []);

  // Palette command `ส่งออกโครงสร้างฐานข้อมูล (.sql)` (bridge: no DB code in the palette).
  useEffect(() => {
    useEditorStore.getState().setDbExport(() => void runSqlExport());
    return () => useEditorStore.getState().setDbExport(null);
  }, []);

  // Ctrl/Cmd+Z, Shift+Z, Ctrl+Y → model history while this mode is shown.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const redo = e.shiftKey || e.key.toLowerCase() === "y";
      const action = dbUndoAction(e, {
        textTarget: isTextTarget(e.target),
        overlayOpen: isOverlayOpen(),
        nativeOk: nativeUndoAllowed(e.target, redo),
      });
      if (action === "pass") return;
      e.preventDefault();
      if (action === "block") return;
      const s = useDbModelStore.getState();
      if (action === "undo") s.undo();
      else s.redo();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (status !== "ready" || !focusAfterRetry.current) return;
    focusAfterRetry.current = false;
    const first = listRef.current?.querySelector<HTMLElement>("[data-table-id]");
    (first ?? addRef.current)?.focus();
  }, [status]);

  useEffect(() => {
    const id = focusNewTable.current;
    if (id) {
      focusNewTable.current = null;
      listRef.current?.querySelector<HTMLElement>(`[data-table-id="${CSS.escape(id)}"]`)?.focus();
      return;
    }
    // Last table deleted (or undo emptied the list): the list unmounted.
    if (tables.length === 0 && document.activeElement === document.body) addRef.current?.focus();
  }, [tables]);

  const issues = useMemo(() => validateModel(model), [model]);
  const byKey = useMemo(() => {
    const m = new Map<string, string>();
    for (const x of issues) {
      const k = `${x.tableId ?? ""}|${x.columnId ?? ""}|${x.field}`;
      if (!m.has(k)) m.set(k, x.message);
    }
    return m;
  }, [issues]);
  const withIssues = useMemo(() => new Set(issues.flatMap((x) => (x.tableId ? [x.tableId] : []))), [issues]);
  const modelIssueRaw = issues.find((x) => !x.tableId && x.field === "model" && tables.length > 0)?.message ?? null;
  const modelIssue = modelIssueRaw ? phraseIssue(locale, modelIssueRaw) : null;

  const selected = tables.find((t) => t.id === selectedId) ?? tables[0] ?? null;
  const issue: IssueLookup = (columnId, field) => {
    const msg = byKey.get(`${selected?.id ?? ""}|${columnId ?? ""}|${field}`) ?? null;
    return msg ? phraseIssue(locale, msg) : null;
  };
  const tableIssues = useMemo(() => (selected ? tableProblems(selected, issues) : []), [issues, selected]);

  const onAdd = () => {
    focusNewTable.current = useDbModelStore.getState().addTable();
  };

  const onRename = (tableId: string) => {
    useDbModelStore.getState().selectTable(tableId);
    requestAnimationFrame(() => {
      nameRef.current?.focus();
      nameRef.current?.select();
    });
  };

  if (status === "error") {
    return (
      <div className="flex flex-1 items-start justify-center p-6">
        <Alert variant="destructive" className="max-w-md">
          <AlertTitle>{p("อ่านโครงสร้างไม่ได้")}</AlertTitle>
          <AlertDescription>
            <p>{error ? phraseIpcError(locale, error) : null}</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={() => {
                focusAfterRetry.current = true;
                void useDbModelStore.getState().reload();
              }}
            >
              {p("ลองอีกครั้ง")}
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (status !== "ready") {
    return (
      <div role="status" className="flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground">
        <Spinner className="size-4" aria-hidden />
        {p("กำลังโหลดฐานข้อมูล…")}
      </div>
    );
  }

  if (tables.length === 0) {
    return (
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <DbHeader />
      <div className="flex flex-1 items-center justify-center p-6">
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Database aria-hidden />
            </EmptyMedia>
            <EmptyTitle>{p("ยังไม่มีตาราง")}</EmptyTitle>
            <EmptyDescription>{p("เพิ่มตารางแรกเพื่อเริ่มออกแบบฐานข้อมูล")}</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button ref={addRef} data-db-add-table type="button" onClick={onAdd}>
              <Plus aria-hidden />
              {p("เพิ่มตาราง")}
            </Button>
          </EmptyContent>
        </Empty>
      </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
    <DbHeader />
    <div className="flex min-h-0 min-w-0 flex-1">
      <TableList
        tables={tables}
        selectedId={selected?.id ?? null}
        withIssues={withIssues}
        modelIssue={modelIssue}
        onAdd={onAdd}
        onRename={onRename}
        addRef={addRef}
        listRef={listRef}
      />
      {selected ? (
        <TableEditor key={selected.id} table={selected} tables={tables} issue={issue} tableIssues={tableIssues} nameRef={nameRef} />
      ) : null}
    </div>
    </div>
  );
}

/** Mode-level bar: `ส่งออก .sql` exports the whole schema (reachable with 0 tables). */
function DbHeader() {
  return (
    <div className="flex flex-wrap items-center justify-end gap-2 border-b border-border px-3 py-1.5">
      <FormDbActions />
      <SqlExportButton />
    </div>
  );
}
