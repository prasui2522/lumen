import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Spinner } from "@/components/ui/spinner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DB_TYPE_LABELS, type DbColumn, type DbTable } from "@/lib/db-model";
import { useDbModelStore } from "@/lib/db-model-store";
import { useProjectsStore } from "@/stores/projects-store";
import { useEditorStore } from "@/stores/editor-store";
import {
  PAGE_SIZE,
  addRowForm,
  afterCommit,
  deleteRows,
  displayValue,
  errorColumn,
  errorLine,
  fetchRows,
  firstConnected,
  firstManualColumn,
  gridMove,
  insertRow,
  insertValues,
  labelLookup,
  openErrorText,
  parseInput,
  planErrorText,
  planLines,
  rebuildErrorText,
  newRowTarget,
  pagerFocus,
  rangeLabel,
  readOnlyColumn,
  updateCell,
  useTestDataStore,
  type FormField,
  type Pos,
  type RowsPage,
  type WireValue,
} from "@/lib/db-testdata";

const announce = (m: string) => useEditorStore.getState().announce(m);
const NULL_ITEM = "__null";

/**
 * `ข้อมูลทดสอบ` tab (PHASE-10-SPEC §6). Mounting it opens the test file;
 * a banner replaces the grid until the file is `ready`.
 */
/** Bumped by every rebuild so the grid remounts (its rows are gone). */
let resetGen = 0;

/*
 * Focus rule for a confirm that rebuilds the test file (stale, corrupt,
 * ล้างข้อมูลทดสอบ; the step 7 plan confirm uses it too): Esc / ยกเลิก → back to
 * the button that opened it; confirmed → the grid's tab stop, or เพิ่มแถว when
 * the grid is empty. Focus never rests on <body>: while the grid is not there
 * yet it waits on a stable element (เพิ่มแถว, else the opener), then moves on
 * once the remounted grid has loaded.
 */
let gridFocusPending = false;

/** The loaded grid's tab stop (เพิ่มแถว when empty), or null before it loads. */
function gridTarget(): HTMLElement | null {
  const grid = document.querySelector<HTMLElement>('[role="grid"][data-loaded]');
  if (!grid) return null;
  return grid.querySelector('[data-pos="h"]')
    ? document.querySelector<HTMLElement>("[data-add-row]")
    : grid.querySelector<HTMLElement>('tbody [tabindex="0"]');
}

function flushGridFocus() {
  if (!gridFocusPending || document.querySelector('[role="alertdialog"]')) return;
  const target = gridTarget();
  if (!target) return;
  gridFocusPending = false;
  target.focus();
}

/**
 * Put inside a dialog's content. As the content unmounts (after its close
 * animation, before its DOM goes) focus moves to `to()` in the same tick, so
 * it never drops to <body>. Skipped when focus already left the dialog.
 */
function FocusHandoff({ to }: { to: () => HTMLElement | null | undefined }) {
  const mark = useRef<HTMLSpanElement>(null);
  const get = useRef(to);
  get.current = to;
  useLayoutEffect(() => {
    const el = mark.current;
    return () => {
      const box = el?.closest('[role="dialog"],[role="alertdialog"]');
      if (box?.contains(document.activeElement)) get.current()?.focus();
    };
  }, []);
  return <span ref={mark} hidden />;
}

function useRebuildConfirmFocus() {
  const trigger = useRef<HTMLButtonElement>(null);
  /** The opener if still there; else (a failed rebuild swapped in the error banner) its retry / first button. */
  const opener = () =>
    firstConnected<HTMLElement>(
      trigger.current,
      document.querySelector<HTMLElement>("[data-tg-retry]"),
      document.querySelector<HTMLElement>("[data-tg-banner] button"),
    );
  /** Where focus goes now: the opener, or (confirmed) the grid / a stable stand-in. */
  const target = (): HTMLElement | null => {
    if (!gridFocusPending) return opener();
    const g = gridTarget();
    if (g) {
      gridFocusPending = false;
      return g;
    }
    return document.querySelector<HTMLElement>("[data-add-row]") ?? opener();
  };
  return {
    /** Put on the button that opens the confirm. */
    trigger,
    target,
    /** Call from the confirm action, before the rebuild starts. */
    confirmed: () => {
      gridFocusPending = true;
    },
    /** Nothing to focus for now (another dialog takes over, or back to the opener). */
    clear: () => {
      gridFocusPending = false;
    },
    /** Call when the rebuild failed with no dialog open: back to the opener. */
    failed: () => {
      gridFocusPending = false;
      opener()?.focus();
    },
    /** Put on `AlertDialogContent` (with `<FocusHandoff to={target} />` inside). */
    onCloseAutoFocus: (e: Event) => {
      e.preventDefault();
      if (document.activeElement === document.body) target()?.focus();
    },
  };
}

type Rebuild = "stale" | "corrupt" | "reset";
const REBUILD_TEXT: Record<Rebuild, { title: string; text: string; action: string; done: string; fail: string }> = {
  stale: {
    title: "ข้อมูลทดสอบทั้งหมดจะถูกลบ",
    text: "",
    action: "อัปเดตและลบข้อมูล",
    done: "อัปเดตข้อมูลทดสอบแล้ว",
    fail: "อัปเดตและลบข้อมูลไม่ได้",
  },
  corrupt: {
    title: "สร้างไฟล์ข้อมูลทดสอบใหม่",
    text: "แถวข้อมูลทดสอบทั้งหมดจะถูกลบ แล้วสร้างไฟล์ใหม่ตามโครงสร้างปัจจุบัน",
    action: "สร้างใหม่",
    done: "สร้างไฟล์ข้อมูลทดสอบใหม่แล้ว",
    fail: "สร้างไฟล์ข้อมูลทดสอบใหม่ไม่ได้",
  },
  reset: {
    title: "ล้างข้อมูลทดสอบ",
    text: "ทุกแถวในทุกตารางจะถูกลบ แล้วสร้างตารางใหม่ตามโครงสร้างปัจจุบัน",
    action: "ล้างข้อมูลทดสอบ",
    done: "ล้างข้อมูลทดสอบแล้ว",
    fail: "ล้างข้อมูลทดสอบไม่ได้",
  },
};

export function TestDataGrid({ table }: { table: DbTable }) {
  const projectId = useProjectsStore((s) => s.openId);
  const model = useDbModelStore((s) => s.model);
  const status = useTestDataStore((s) => s.status);
  const error = useTestDataStore((s) => s.error);
  const [confirm, setConfirm] = useState<null | Rebuild>(null);
  // Keeps the dialog's wording during its close animation.
  const lastConfirm = useRef<Rebuild>("stale");
  if (confirm) lastConfirm.current = confirm;
  const kind = confirm ?? lastConfirm.current;
  // The rebuild confirm stays open (busy) until the rebuild is done.
  const [rebuilding, setRebuilding] = useState(false);
  // A failed rebuild keeps the confirm open with this error line (role=alert).
  const [rebuildErr, setRebuildErr] = useState<string | null>(null);
  const rebuildAction = useRef<HTMLButtonElement>(null);
  // Full rebuild confirms (stale ล้างข้อมูลทดสอบ, corrupt สร้างใหม่, grid ล้างข้อมูลทดสอบ).
  const confirmFocus = useRebuildConfirmFocus();
  // Step 7: อัปเดตข้อมูลทดสอบ → plan → (lossless) apply, or the plan confirm.
  const updateFocus = useRebuildConfirmFocus();
  const planning = useTestDataStore((s) => s.planning);
  const plan = useTestDataStore((s) => s.plan);
  const planErr = useTestDataStore((s) => s.planError);
  const appliedModel = useTestDataStore((s) => s.appliedModel);
  const savedModel = useDbModelStore((s) => s.savedModel);

  useEffect(() => {
    if (projectId) void useTestDataStore.getState().open(projectId, model);
  }, [projectId, model]);

  // Leaving the tab, table or mode drops a pending plan (and its tmp file).
  useEffect(() => () => useTestDataStore.getState().discardPlan(), []);

  const update = async () => {
    if (planning) return;
    // Lossless applies with no dialog; the remounted grid then takes focus.
    updateFocus.confirmed();
    const r = await useTestDataStore.getState().update(model);
    if (r === "applied") announce("อัปเดตข้อมูลทดสอบแล้ว");
    else if (r === "error") updateFocus.failed();
    else updateFocus.clear(); // confirm: the plan dialog's own focus rule takes over
  };
  const applyPlan = async () => {
    updateFocus.confirmed();
    if (await useTestDataStore.getState().applyPlan()) announce("อัปเดตข้อมูลทดสอบแล้ว");
    else updateFocus.failed();
  };

  const rebuild = async (what: Rebuild) => {
    if (!projectId || rebuilding) return;
    setRebuilding(true);
    setRebuildErr(null);
    confirmFocus.confirmed();
    resetGen++;
    const ok = await useTestDataStore.getState().reset(projectId, model);
    setRebuilding(false);
    if (ok) {
      setConfirm(null);
      announce(REBUILD_TEXT[what].done);
      return;
    }
    // Failed: the confirm stays open with the error; closing it goes back to the
    // opener, or ลองอีกครั้ง when the file is closed (the grid / banner is gone).
    confirmFocus.clear();
    setRebuildErr(rebuildErrorText(REBUILD_TEXT[what].fail, useTestDataStore.getState().error));
  };
  const closeConfirm = () => {
    if (rebuilding) return;
    setConfirm(null);
    setRebuildErr(null);
  };
  // The error line keeps focus on the confirm button (or puts it back there).
  useLayoutEffect(() => {
    const b = rebuildAction.current;
    if (rebuildErr && b && !b.closest('[role="alertdialog"]')?.contains(document.activeElement)) b.focus();
  }, [rebuildErr]);

  let body: React.ReactNode;
  // A re-check after a model edit (ready → opening → ready, e.g. a label-only
  // change) keeps the grid mounted, so its page and active cell stay.
  const keepGrid = useRef(false);
  if (status === "ready") keepGrid.current = true;
  else if (status !== "opening") keepGrid.current = false;
  if (status === "ready" || (status === "opening" && keepGrid.current))
    body = (
      <Grid
        key={`${table.id}:${resetGen}`}
        table={table}
        resetRef={confirmFocus.trigger}
        onReset={() => setConfirm("reset")}
      />
    );
  else if (status === "error")
    body = (
      <Banner title="เปิดข้อมูลทดสอบไม่ได้" text={openErrorText(error)} destructive>
        <Button
          data-tg-retry
          type="button"
          size="sm"
          variant="outline"
          onClick={() => {
            if (!projectId) return;
            // The button goes away: the spinner, then the grid (or a banner) takes focus.
            gridFocusPending = true;
            void useTestDataStore.getState().open(projectId, model);
          }}
        >
          ลองอีกครั้ง
        </Button>
      </Banner>
    );
  else if (status === "invalid_model")
    body = (
      <Banner title="แก้ปัญหาในโครงสร้างก่อน" text="ข้อมูลทดสอบใช้ได้เมื่อโครงสร้างไม่มีปัญหา">
        <Button type="button" size="sm" variant="outline" onClick={() => useTestDataStore.getState().setTab("structure")}>
          ไปที่โครงสร้าง
        </Button>
      </Banner>
    );
  else if (status === "stale")
    body = (
      <Banner title="โครงสร้างเปลี่ยนแล้ว" text="อัปเดตข้อมูลทดสอบให้ตรงกับโครงสร้างใหม่ก่อนแก้ไข" alert={false}>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            ref={updateFocus.trigger}
            type="button"
            size="sm"
            aria-disabled={planning || undefined}
            aria-describedby={planErr ? "tg-plan-err" : undefined}
            onClick={() => void update()}
          >
            {planning ? <Spinner className="size-3.5" aria-hidden /> : null}
            {planning ? "กำลังอัปเดตข้อมูลทดสอบ…" : "อัปเดตข้อมูลทดสอบ"}
          </Button>
          <Button
            ref={confirmFocus.trigger}
            type="button"
            size="sm"
            variant="ghost"
            aria-disabled={planning || undefined}
            onClick={() => !planning && setConfirm("stale")}
          >
            ล้างข้อมูลทดสอบ
          </Button>
        </div>
        {planErr ? (
          <p id="tg-plan-err" role="alert" className="mt-2 text-xs text-destructive">
            {planErr.expired ? "แผนหมดอายุ กด อัปเดตข้อมูลทดสอบ เพื่อตรวจสอบใหม่" : planErrorText(planErr.message)}
          </p>
        ) : null}
      </Banner>
    );
  else if (status === "corrupt")
    body = (
      <Banner title="ไฟล์ข้อมูลทดสอบเสียหาย" text="สร้างไฟล์ใหม่จากโครงสร้างปัจจุบัน ข้อมูลทดสอบเดิมจะหายไป" destructive>
        <Button ref={confirmFocus.trigger} type="button" size="sm" variant="outline" onClick={() => setConfirm("corrupt")}>
          สร้างใหม่
        </Button>
      </Banner>
    );
  else body = <Opening />;

  return (
    <>
      {body}
      <AlertDialog open={confirm !== null} onOpenChange={(o) => !o && closeConfirm()}>
        <AlertDialogContent onCloseAutoFocus={confirmFocus.onCloseAutoFocus}>
          <FocusHandoff to={confirmFocus.target} />
          <AlertDialogHeader>
            <AlertDialogTitle>{REBUILD_TEXT[kind].title}</AlertDialogTitle>
            <AlertDialogDescription>
              {kind === "stale" ? (
                <>
                  <strong className="font-semibold text-foreground">แถวข้อมูลทดสอบทั้งหมดในทุกตารางจะถูกลบ</strong>{" "}
                  แล้วสร้างตารางใหม่ตามโครงสร้างปัจจุบัน ลบแล้วกู้คืนไม่ได้ ถ้าอยากเก็บแถวที่ยังใช้ได้ ให้กด อัปเดตข้อมูลทดสอบ แทน
                </>
              ) : (
                REBUILD_TEXT[kind].text
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {rebuildErr ? (
            <p id="tg-rebuild-err" role="alert" className="text-sm text-destructive">
              {rebuildErr}
            </p>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel aria-disabled={rebuilding || undefined}>ยกเลิก</AlertDialogCancel>
            <AlertDialogAction
              ref={rebuildAction}
              variant="destructive"
              aria-disabled={rebuilding || undefined}
              aria-describedby={rebuildErr ? "tg-rebuild-err" : undefined}
              onClick={(e) => {
                e.preventDefault(); // stays open (busy) until the rebuild is done
                if (confirm) void rebuild(confirm);
              }}
            >
              {rebuilding ? <Spinner className="size-3.5" aria-hidden /> : null}
              {REBUILD_TEXT[kind].action}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {/* Step 7 plan confirm (§7): per-table losses; initial focus ยกเลิก. */}
      <AlertDialog open={plan !== null} onOpenChange={(o) => !o && useTestDataStore.getState().discardPlan()}>
        <AlertDialogContent onCloseAutoFocus={updateFocus.onCloseAutoFocus} className="flex max-h-[85vh] flex-col">
          <FocusHandoff to={updateFocus.target} />
          <AlertDialogHeader className="shrink-0">
            <AlertDialogTitle>ข้อมูลทดสอบบางส่วนจะหายไป</AlertDialogTitle>
            <AlertDialogDescription>
              แถวหรือค่าที่ใช้กับโครงสร้างใหม่ไม่ได้จะถูกลบ ส่วนที่เหลือจะเก็บไว้ ลบแล้วกู้คืนไม่ได้
            </AlertDialogDescription>
          </AlertDialogHeader>
          <ul
            aria-label="สิ่งที่จะหายไป"
            tabIndex={0}
            className="min-h-0 list-disc overflow-y-auto rounded-md border border-border py-2 pr-3 pl-7 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {plan ? planLines(plan, labelLookup(plan.model, appliedModel, savedModel)).map((l) => <li key={l}>{l}</li>) : null}
          </ul>
          <AlertDialogFooter>
            <AlertDialogCancel>ยกเลิก</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => void applyPlan()}>
              อัปเดตตามนี้
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/** The spinner while the file opens; holds focus when ลองอีกครั้ง went away under it. */
function Opening() {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const a = document.activeElement;
    if (gridFocusPending && (!a || a === document.body)) ref.current?.focus({ preventScroll: true });
  }, []);
  return (
    <div ref={ref} tabIndex={-1} role="status" className="flex items-center gap-2 p-6 text-sm text-muted-foreground outline-none">
      <Spinner className="size-4" aria-hidden />
      กำลังเปิดข้อมูลทดสอบ…
    </div>
  );
}

/** `alert={false}`: no live role (the stale banner wraps busy buttons; its error line has its own). */
function Banner(p: { title: string; text: string; destructive?: boolean; alert?: boolean; children: React.ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  // A retry / rebuild that ended on a banner (error again, stale, corrupt) with
  // focus dropped: its ลองอีกครั้ง, else its first button, takes it.
  useLayoutEffect(() => {
    const a = document.activeElement;
    if (!gridFocusPending || (a && a !== document.body)) return;
    gridFocusPending = false;
    const b = box.current;
    (b?.querySelector<HTMLElement>("[data-tg-retry]") ?? b?.querySelector<HTMLElement>("button"))?.focus();
  }, []);
  return (
    <div ref={box} data-tg-banner className="p-4">
      <Alert variant={p.destructive ? "destructive" : "default"} role={p.alert === false ? undefined : "alert"} className="max-w-xl">
        <AlertTitle>{p.title}</AlertTitle>
        <AlertDescription>
          <p>{p.text}</p>
          <div className="mt-2">{p.children}</div>
        </AlertDescription>
      </Alert>
    </div>
  );
}

type Editing = { pos: Pos; text: string } | null;
type GridError = { message: string; pos: Pos | null } | null;

function Grid({
  table,
  resetRef,
  onReset,
}: {
  table: DbTable;
  resetRef: React.RefObject<HTMLButtonElement | null>;
  onReset: () => void;
}) {
  const cols = table.columns;
  const ncols = cols.length + 1; // + row-header checkbox column
  const base = `tg-${table.id}`;
  const errId = `${base}-err`;
  const [offset, setOffset] = useState(0);
  const [page, setPage] = useState<RowsPage | null>(null);
  const [active, setActive] = useState<Pos>({ row: 0, col: 1 });
  const [editing, setEditing] = useState<Editing>(null);
  const [err, setErr] = useState<GridError>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [askDelete, setAskDelete] = useState(false);
  const [adding, setAdding] = useState(false);
  const gridRef = useRef<HTMLTableElement>(null);
  const addBtn = useRef<HTMLButtonElement>(null);
  const prevBtn = useRef<HTMLButtonElement>(null);
  const nextBtn = useRef<HTMLButtonElement>(null);
  const wantFocus = useRef(false);
  // A pager click waiting for its page: where focus goes if that button disables.
  const pager = useRef<{ which: "prev" | "next"; from: RowsPage | null } | null>(null);

  const rows = page?.rows ?? [];
  // Values are positional in the model's column order (Rust sends ids).
  const colIndex = useMemo(() => {
    const m = new Map<string, number>();
    page?.columns.forEach((id, i) => m.set(id, i));
    return m;
  }, [page]);
  const valueOf = (r: number, c: DbColumn): WireValue => rows[r]?.values[colIndex.get(c.id) ?? -1] ?? null;

  const load = useCallback(
    async (at: number, focus?: Pos | { lastRowCol: number }) => {
      try {
        let p = await fetchRows(table.id, at);
        let o = at;
        if (p.rows.length === 0 && p.total > 0 && at > 0) {
          o = Math.floor((p.total - 1) / PAGE_SIZE) * PAGE_SIZE;
          p = await fetchRows(table.id, o);
        }
        setOffset(o);
        setPage(p);
        if (focus) {
          const last = "lastRowCol" in focus;
          const row = last ? p.rows.length - 1 : Math.min(focus.row, Math.max(p.rows.length - 1, 0));
          setActive({ row: Math.max(row, 0), col: last ? focus.lastRowCol : focus.col });
          wantFocus.current = true;
        } else {
          // Keep a tab stop on a shorter page.
          setActive((a) => ({ row: Math.min(a.row, Math.max(p.rows.length - 1, 0)), col: a.col }));
        }
      } catch (e) {
        setErr({ message: String(e), pos: null });
      }
    },
    [table.id],
  );

  useEffect(() => {
    void load(0);
  }, [load]);

  // Move DOM focus to the active cell when asked (keyboard moves, commits).
  useLayoutEffect(() => {
    if (!wantFocus.current || editing) return;
    wantFocus.current = false;
    focusCell(active);
  });

  // A rebuild swapped the banner (which held focus) for this grid: take focus
  // in the same commit, so it never rests on <body>; it moves on once loaded.
  useLayoutEffect(() => {
    const a = document.activeElement;
    if (gridFocusPending && (!a || a === document.body)) addBtn.current?.focus();
  }, []);

  // The confirm-focus rule: the remounted grid takes focus once loaded.
  useEffect(() => {
    if (page) flushGridFocus();
  }, [page]);

  // A pager button that disabled itself hands focus on (not to <body>).
  useLayoutEffect(() => {
    const pg = pager.current;
    if (!pg || !page || page === pg.from) return;
    pager.current = null;
    const to = pagerFocus(pg.which, { hasPrev: offset > 0, hasNext: offset + PAGE_SIZE < page.total });
    if (to === "prev") prevBtn.current?.focus();
    else if (to === "next") nextBtn.current?.focus();
    else if (to === "grid") go({ row: Math.min(active.row, Math.max(page.rows.length - 1, 0)), col: active.col });
  });

  const cellEl = (p: Pos): HTMLElement | null | undefined => {
    const el = gridRef.current?.querySelector<HTMLElement>(`[data-pos="${p.row}:${p.col}"]`);
    if (!el) return gridRef.current?.querySelector<HTMLElement>('[data-pos="h"]');
    return p.col === 0 ? el.querySelector<HTMLElement>("input") ?? el : el;
  };
  const focusCell = (p: Pos) => cellEl(p)?.focus();

  const go = (p: Pos) => {
    setActive(p);
    wantFocus.current = true;
  };

  const commit = async (value: WireValue, how: "enter" | "tab" | "shift-tab" | "stay", at: Pos) => {
    const c = cols[at.col - 1];
    const row = rows[at.row];
    if (!c || !row) return;
    const done = () => {
      setEditing(null);
      setErr(null);
      go(how === "stay" ? at : afterCommit(how, at, rows.length, ncols));
    };
    if (value === valueOf(at.row, c)) return done();
    try {
      // Show what Rust stored (e.g. a uuid in canonical lowercase).
      const stored = await updateCell(table.id, row.rowid, c.id, value);
      setPage((p) =>
        p && {
          ...p,
          rows: p.rows.map((r, i) =>
            i === at.row ? { ...r, values: r.values.map((v, j) => (j === colIndex.get(c.id) ? stored : v)) } : r,
          ),
        },
      );
      done();
    } catch (e) {
      setErr({ message: errorLine(offset + at.row + 1, String(e)), pos: at });
      if (c.type === "boolean" || c.type === "enum") {
        setEditing(null);
        go(at);
      }
    }
  };

  const startEdit = (p: Pos) => {
    const c = cols[p.col - 1];
    if (!c || !rows[p.row]) return;
    if (readOnlyColumn(c)) {
      setErr({ message: errorLine(offset + p.row + 1, `แก้ไม่ได้ เป็นลำดับอัตโนมัติ: ${c.name}`), pos: p });
      return;
    }
    const v = valueOf(p.row, c);
    if (c.type === "boolean") return void commit(!(v === true), "stay", p);
    setErr(null);
    setEditing({ pos: p, text: typeof v === "string" ? v : "" });
  };

  const onCellKey = (e: React.KeyboardEvent, p: Pos) => {
    if (editing) return;
    const c = cols[p.col - 1];
    if ((e.key === "Enter" || e.key === "F2") && p.col > 0) {
      e.preventDefault();
      return startEdit(p);
    }
    if (e.key === " " && c?.type === "boolean") {
      e.preventDefault();
      return startEdit(p);
    }
    if (e.key === "Delete" && c && rows[p.row]) {
      e.preventDefault();
      if (readOnlyColumn(c)) return startEdit(p);
      if (!c.nullable) return setErr({ message: errorLine(offset + p.row + 1, `ต้องมีค่า: ${c.name}`), pos: p });
      return void commit(null, "stay", p);
    }
    const m = gridMove(e.key, e.ctrlKey || e.metaKey, p, rows.length, ncols, {
      hasPrev: offset > 0,
      hasNext: offset + PAGE_SIZE < (page?.total ?? 0),
    });
    if (!m) return;
    e.preventDefault();
    if ("page" in m) void load(offset + m.page * PAGE_SIZE, m.pos);
    else go(m.pos);
  };

  const toggleRow = (rowid: number) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(rowid)) n.delete(rowid);
      else n.add(rowid);
      return n;
    });
  const allOnPage = rows.length > 0 && rows.every((r) => selected.has(r.rowid));

  const doDelete = async () => {
    const ids = [...selected];
    try {
      const { deleted } = await deleteRows(table.id, ids);
      setSelected(new Set());
      setErr(null);
      announce(`ลบ ${deleted} แถวแล้ว`);
      await load(offset, active);
    } catch (e) {
      setErr({ message: String(e), pos: null });
    }
  };

  const total = page?.total ?? 0;
  const errAt = (p: Pos) => !!err?.pos && err.pos.row === p.row && err.pos.col === p.col;

  return (
    <div className="flex min-h-0 flex-col gap-2 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button ref={addBtn} data-add-row type="button" size="sm" onClick={() => setAdding(true)}>
          <Plus aria-hidden />
          เพิ่มแถว
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={selected.size === 0}
          onClick={() => setAskDelete(true)}
        >
          <Trash2 aria-hidden />
          ลบแถว{selected.size > 0 ? ` (${selected.size})` : ""}
        </Button>
        <Button ref={resetRef} type="button" size="sm" variant="ghost" onClick={onReset}>
          ล้างข้อมูลทดสอบ
        </Button>
        <nav aria-label="หน้าข้อมูล" className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
          <span aria-live="polite">{rangeLabel(offset, rows.length, total)}</span>
          <Button
            ref={prevBtn}
            type="button"
            size="sm"
            variant="outline"
            disabled={offset === 0}
            onClick={() => {
              pager.current = { which: "prev", from: page };
              void load(Math.max(offset - PAGE_SIZE, 0));
            }}
          >
            <ChevronLeft aria-hidden />
            ก่อนหน้า
          </Button>
          <Button
            ref={nextBtn}
            type="button"
            size="sm"
            variant="outline"
            disabled={offset + PAGE_SIZE >= total}
            onClick={() => {
              pager.current = { which: "next", from: page };
              void load(offset + PAGE_SIZE);
            }}
          >
            ถัดไป
            <ChevronRight aria-hidden />
          </Button>
        </nav>
      </div>

      <div className="min-h-0 overflow-auto rounded-md border border-border">
        <table
          ref={gridRef}
          role="grid"
          aria-label={`ข้อมูลทดสอบ ${table.name}`}
          aria-rowcount={total + 1}
          aria-colcount={ncols}
          aria-describedby={err ? errId : undefined}
          data-loaded={page ? "" : undefined}
          className="w-max min-w-full border-collapse text-xs"
        >
          <thead className="sticky top-0 z-10 bg-muted">
            <tr role="row" aria-rowindex={1}>
              <th role="columnheader" aria-colindex={1} className="w-8 border-b border-border px-2 py-1.5">
                <input
                  type="checkbox"
                  tabIndex={-1}
                  aria-label="เลือกทุกแถวในหน้านี้"
                  checked={allOnPage}
                  disabled={rows.length === 0}
                  onChange={() =>
                    setSelected((s) => {
                      const n = new Set(s);
                      for (const r of rows) {
                        if (allOnPage) n.delete(r.rowid);
                        else n.add(r.rowid);
                      }
                      return n;
                    })
                  }
                  className="size-3.5 accent-primary"
                />
              </th>
              {cols.map((c, i) => (
                <th
                  key={c.id}
                  role="columnheader"
                  aria-colindex={i + 2}
                  className="border-b border-l border-border px-2 py-1.5 text-left font-medium whitespace-nowrap"
                >
                  <span className="font-mono">{c.name}</span>
                  <span className="ml-1.5 font-normal text-muted-foreground">{DB_TYPE_LABELS[c.type]}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr role="row">
                <td
                  role="gridcell"
                  data-pos="h"
                  tabIndex={0}
                  colSpan={ncols}
                  className="px-3 py-6 text-center text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  ยังไม่มีแถว — กด เพิ่มแถว เพื่อเริ่ม
                </td>
              </tr>
            ) : (
              rows.map((r, ri) => (
                <tr key={r.rowid} role="row" aria-rowindex={offset + ri + 2} aria-selected={selected.has(r.rowid)}>
                  <th
                    role="rowheader"
                    aria-colindex={1}
                    data-pos={`${ri}:0`}
                    className="border-b border-border px-2 py-1"
                    onClick={() => setActive({ row: ri, col: 0 })}
                  >
                    <input
                      type="checkbox"
                      tabIndex={active.row === ri && active.col === 0 ? 0 : -1}
                      aria-label={`เลือกแถว ${offset + ri + 1}`}
                      checked={selected.has(r.rowid)}
                      onChange={() => toggleRow(r.rowid)}
                      onKeyDown={(e) => onCellKey(e, { row: ri, col: 0 })}
                      onFocus={() => setActive({ row: ri, col: 0 })}
                      className="size-3.5 accent-primary"
                    />
                  </th>
                  {cols.map((c, ci) => {
                    const p = { row: ri, col: ci + 1 };
                    const isActive = active.row === ri && active.col === p.col;
                    const isEditing = !!editing && editing.pos.row === ri && editing.pos.col === p.col;
                    const v = valueOf(ri, c);
                    return (
                      <td
                        key={c.id}
                        role="gridcell"
                        aria-colindex={ci + 2}
                        aria-readonly={readOnlyColumn(c) || undefined}
                        aria-invalid={errAt(p) || undefined}
                        data-pos={`${ri}:${p.col}`}
                        tabIndex={isEditing ? -1 : isActive ? 0 : -1}
                        onKeyDown={(e) => e.target === e.currentTarget && onCellKey(e, p)}
                        onFocus={(e) => e.target === e.currentTarget && setActive(p)}
                        onClick={() => setActive(p)}
                        onDoubleClick={() => startEdit(p)}
                        className={
                          "max-w-64 border-b border-l border-border px-2 py-1 whitespace-nowrap outline-none " +
                          // `outline-none` sets outline-style none; width alone drew nothing.
                          "focus:outline-solid focus:outline-2 focus:outline-ring focus:-outline-offset-2 " +
                          (errAt(p) ? "bg-destructive/10 " : "")
                        }
                      >
                        {isEditing && editing ? (
                          <CellEditor
                            column={c}
                            text={editing.text}
                            invalid={errAt(p)}
                            errId={errId}
                            onText={(text) => setEditing({ pos: p, text })}
                            onCommit={(how, value) => void commit(value ?? parseInput(c, editing.text), how, p)}
                            onCancel={() => {
                              setEditing(null);
                              setErr(null);
                              go(p);
                            }}
                          />
                        ) : c.type === "boolean" ? (
                          <Switch
                            size="sm"
                            checked={v === true}
                            tabIndex={-1}
                            aria-hidden
                            className="pointer-events-none"
                          />
                        ) : v === null ? (
                          <span className="text-muted-foreground/60 italic">ว่าง</span>
                        ) : (
                          <span className="block truncate font-mono">{displayValue(v)}</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <p id={errId} className="min-h-4 text-xs text-destructive">
        {err?.message ?? ""}
      </p>

      <AlertDialog open={askDelete} onOpenChange={setAskDelete}>
        <AlertDialogContent
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            if (document.activeElement === document.body) focusCell(active);
          }}
        >
          <FocusHandoff to={() => cellEl(active)} />
          <AlertDialogHeader>
            <AlertDialogTitle>ลบ {selected.size} แถว</AlertDialogTitle>
            <AlertDialogDescription>ลบแล้วเลิกทำไม่ได้ ข้อมูลทดสอบไม่ได้อยู่ในประวัติการแก้ไข</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ยกเลิก</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => void doDelete()}>
              ลบแถว
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {adding ? (
        <AddRowDialog
          table={table}
          returnTo={() => addBtn.current}
          onAdded={() => {
            // Go to the new row's page, make its first editable cell the
            // active cell and focus it; then announce. Until it renders,
            // focus stays in the closing dialog, then on เพิ่มแถว.
            const at = newRowTarget(total, cols);
            void load(at.offset, { lastRowCol: at.col }).then(() => announce("เพิ่มแถวแล้ว"));
          }}
          onDone={() => setAdding(false)}
        />
      ) : null}
    </div>
  );
}

function CellEditor(p: {
  column: DbColumn;
  text: string;
  invalid: boolean;
  errId: string;
  onText: (t: string) => void;
  onCommit: (how: "enter" | "tab" | "shift-tab" | "stay", value?: WireValue) => void;
  onCancel: () => void;
}) {
  const c = p.column;
  const aria = {
    "aria-label": c.name,
    "aria-invalid": p.invalid || undefined,
    "aria-describedby": p.invalid ? p.errId : undefined,
  };
  const keys = (e: React.KeyboardEvent, multiline: boolean) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      p.onCancel();
    } else if (e.key === "Enter" && (!multiline || e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      p.onCommit("enter");
    } else if (e.key === "Tab") {
      e.preventDefault();
      p.onCommit(e.shiftKey ? "shift-tab" : "tab");
    }
  };

  if (c.type === "enum") {
    return (
      <Select
        defaultOpen
        value={p.text === "" ? NULL_ITEM : p.text}
        onValueChange={(v) => p.onCommit("stay", v === NULL_ITEM ? null : v)}
        onOpenChange={(o) => !o && p.onCancel()}
      >
        <SelectTrigger size="sm" className="h-6 text-xs" {...aria}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {c.nullable ? (
            <SelectItem value={NULL_ITEM} className="text-xs">
              ว่าง
            </SelectItem>
          ) : null}
          {(c.values ?? []).map((v) => (
            <SelectItem key={v} value={v} className="text-xs">
              {v}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  if (c.type === "json") {
    return (
      <Popover open onOpenChange={(o) => !o && p.onCancel()}>
        <PopoverAnchor asChild>
          <span className="block truncate font-mono">{p.text}</span>
        </PopoverAnchor>
        <PopoverContent className="w-80 p-2" onEscapeKeyDown={(e) => (e.preventDefault(), p.onCancel())}>
          <textarea
            autoFocus
            rows={6}
            aria-keyshortcuts="Control+Enter"
            value={p.text}
            onChange={(e) => p.onText(e.currentTarget.value)}
            onKeyDown={(e) => keys(e, true)}
            className="w-full rounded-md border border-input bg-transparent p-2 font-mono text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring aria-invalid:border-destructive"
            {...aria}
            aria-describedby={[p.invalid ? p.errId : null, `${p.errId}-jsonhint`].filter(Boolean).join(" ")}
          />
          <p id={`${p.errId}-jsonhint`} className="mt-1 text-[11px] text-muted-foreground">
            กด Ctrl+Enter เพื่อบันทึก · Esc ยกเลิก
          </p>
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <Input
      autoFocus
      value={p.text}
      placeholder={c.type === "date" ? "YYYY-MM-DD" : c.nullable ? "ว่าง" : undefined}
      onChange={(e) => p.onText(e.currentTarget.value)}
      onKeyDown={(e) => keys(e, false)}
      className="h-6 min-w-32 px-1.5 font-mono text-xs md:text-xs"
      {...aria}
    />
  );
}

function AddRowDialog({
  table,
  returnTo,
  onAdded,
  onDone,
}: {
  table: DbTable;
  returnTo: () => HTMLElement | null;
  onAdded: () => void;
  /** After the close animation (the dialog's DOM is gone). */
  onDone: () => void;
}) {
  const [open, setOpen] = useState(true);
  const [form, setForm] = useState<Record<string, FormField>>(() => addRowForm(table));
  const [error, setError] = useState<{ message: string; columnId: string | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const base = `ar-${table.id}`;
  const set = (id: string, text: string) => setForm((f) => ({ ...f, [id]: { ...f[id], text } }));

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await insertRow(table.id, insertValues(table, form));
      setOpen(false);
      onAdded();
    } catch (e) {
      const message = String(e);
      const columnId = errorColumn(table, message);
      setError({ message: errorLine(null, message), columnId });
      requestAnimationFrame(() => columnId && document.getElementById(`${base}-${columnId}`)?.focus());
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !busy && setOpen(false)}>
      <DialogContent
        className="max-h-[85vh] overflow-auto sm:max-w-md"
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          if (document.activeElement === document.body) returnTo()?.focus();
          onDone();
        }}
        onOpenAutoFocus={(e) => {
          // Start on the first field the user fills in (not an auto uuid/identity/now/today).
          const id = firstManualColumn(table, form);
          const el = id ? document.getElementById(`${base}-${id}`) : null;
          if (el && !(el as HTMLInputElement).disabled) {
            e.preventDefault();
            el.focus();
          }
        }}
      >
        <FocusHandoff to={returnTo} />
        <DialogHeader>
          <DialogTitle>เพิ่มแถว</DialogTitle>
          <DialogDescription>ตาราง {table.name}</DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          {table.columns.map((c) => {
            const f = form[c.id];
            const id = `${base}-${c.id}`;
            const bad = error?.columnId === c.id;
            const aria = { id, "aria-invalid": bad || undefined, "aria-describedby": bad ? `${base}-err` : undefined };
            return (
              <div key={c.id} className="flex flex-col gap-1">
                <label htmlFor={id} className="text-xs">
                  <span className="font-mono">{c.name}</span>
                  <span className="ml-1.5 text-muted-foreground">
                    {DB_TYPE_LABELS[c.type]}
                    {c.nullable ? "" : " · ต้องมีค่า"}
                  </span>
                </label>
                {c.type === "identity" ? (
                  <Input {...aria} disabled value="" placeholder="อัตโนมัติ" className="h-7 text-xs md:text-xs" />
                ) : c.type === "boolean" ? (
                  <Switch {...aria} checked={f.text === "true"} onCheckedChange={(v) => set(c.id, v ? "true" : "false")} />
                ) : c.type === "enum" ? (
                  <Select value={f.text === "" ? NULL_ITEM : f.text} onValueChange={(v) => set(c.id, v === NULL_ITEM ? "" : v)}>
                    <SelectTrigger {...aria} size="sm" className="h-7 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NULL_ITEM} className="text-xs">
                        {c.default ? "ค่าเริ่มต้น" : "ว่าง"}
                      </SelectItem>
                      {(c.values ?? []).map((v) => (
                        <SelectItem key={v} value={v} className="text-xs">
                          {v}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : c.type === "json" ? (
                  <textarea
                    {...aria}
                    rows={3}
                    value={f.text}
                    onChange={(e) => set(c.id, e.currentTarget.value)}
                    className="rounded-md border border-input bg-transparent p-2 font-mono text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring aria-invalid:border-destructive"
                  />
                ) : (
                  <Input
                    {...aria}
                    value={f.text}
                    placeholder={f.auto ?? (c.type === "date" ? "YYYY-MM-DD" : c.nullable ? "ว่าง" : undefined)}
                    onChange={(e) => set(c.id, e.currentTarget.value)}
                    className="h-7 font-mono text-xs md:text-xs"
                  />
                )}
              </div>
            );
          })}
          <p id={`${base}-err`} role="alert" className="min-h-4 text-xs text-destructive">
            {error?.message ?? ""}
          </p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => !busy && setOpen(false)}>
              ยกเลิก
            </Button>
            <Button type="submit" aria-disabled={busy || undefined}>
              เพิ่มแถว
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
