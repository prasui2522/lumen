import { useRef, useState } from "react";
import { MoreHorizontal, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { DbTable } from "@/lib/db-model";
import { useDbModelStore } from "@/lib/db-model-store";

type Props = {
  tables: DbTable[];
  selectedId: string | null;
  /** Table ids with at least one validation issue. */
  withIssues: Set<string>;
  modelIssue: string | null;
  onAdd: () => void;
  onRename: (tableId: string) => void;
  addRef: React.Ref<HTMLButtonElement>;
  listRef: React.RefObject<HTMLUListElement | null>;
};

/**
 * Left pane `ตาราง` (§5): roving tabindex over rows (↑/↓/Home/End move,
 * Enter/click opens), a `…` menu per row, `+` = เพิ่มตาราง.
 */
export function TableList({ tables, selectedId, withIssues, modelIssue, onAdd, onRename, addRef, listRef }: Props) {
  const [active, setActive] = useState<string | null>(null);
  const activeId = tables.some((t) => t.id === active) ? active : (selectedId ?? tables[0]?.id ?? null);
  /** Where focus goes when a menu closes (rename → name field, delete → neighbour). */
  const afterMenu = useRef<(() => void) | null>(null);

  const rowButton = (id: string) => listRef.current?.querySelector<HTMLElement>(`[data-table-id="${CSS.escape(id)}"]`);
  const focusRow = (index: number) => {
    const t = tables[Math.max(0, Math.min(tables.length - 1, index))];
    if (!t) return;
    setActive(t.id);
    rowButton(t.id)?.focus();
  };


  return (
    <aside aria-label="ตาราง" className="flex w-60 shrink-0 flex-col border-r border-border bg-background">
      <div className="flex h-10 shrink-0 items-center justify-between px-3">
        <h2 className="text-sm font-medium">ตาราง</h2>
        <Button ref={addRef} type="button" variant="ghost" size="icon-sm" aria-label="เพิ่มตาราง" onClick={onAdd}>
          <Plus aria-hidden />
        </Button>
      </div>
      {modelIssue ? <p className="px-3 pb-2 text-xs text-destructive">{modelIssue}</p> : null}
      <ul ref={listRef} className="min-h-0 flex-1 overflow-auto p-1">
        {tables.map((t, i) => {
          const selected = t.id === selectedId;
          const tab = t.id === activeId ? 0 : -1;
          return (
            <li key={t.id} className={cn("group flex items-center gap-0.5 rounded-md", selected && "bg-muted")}>
              <Tooltip>
              <TooltipTrigger asChild>
              <button
                type="button"
                data-table-id={t.id}
                tabIndex={tab}
                aria-current={selected ? "true" : undefined}
                className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onFocus={() => setActive(t.id)}
                onClick={() => useDbModelStore.getState().selectTable(t.id)}
                onKeyDown={(e) => {
                  const to =
                    e.key === "ArrowDown" ? i + 1 : e.key === "ArrowUp" ? i - 1 : e.key === "Home" ? 0 : e.key === "End" ? tables.length - 1 : null;
                  if (to === null) return;
                  e.preventDefault();
                  focusRow(to);
                }}
              >
                <span className="truncate font-mono text-xs">{t.name || "—"}</span>
                {t.label ? <span className="truncate text-xs text-muted-foreground">{t.label}</span> : null}
                {withIssues.has(t.id) ? (
                  <span className="ml-auto size-1.5 shrink-0 rounded-full bg-destructive" aria-label="มีปัญหา" role="img" />
                ) : null}
              </button>
              </TooltipTrigger>
              {/* Radix Tooltip: also shows on keyboard focus (full name for truncated rows). */}
              <TooltipContent side="right">{t.label ? `${t.name} (${t.label})` : t.name}</TooltipContent>
              </Tooltip>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    tabIndex={tab}
                    aria-label={`ตัวเลือกของตาราง ${t.name}`}
                    className="shrink-0"
                  >
                    <MoreHorizontal aria-hidden />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="start"
                  onCloseAutoFocus={(e) => {
                    const next = afterMenu.current;
                    afterMenu.current = null;
                    if (next) {
                      e.preventDefault();
                      next();
                    }
                  }}
                >
                  <DropdownMenuItem onSelect={() => (afterMenu.current = () => onRename(t.id))}>เปลี่ยนชื่อ</DropdownMenuItem>
                  <DropdownMenuItem disabled={i === 0} onSelect={() => useDbModelStore.getState().moveTable(t.id, -1)}>
                    เลื่อนขึ้น
                  </DropdownMenuItem>
                  <DropdownMenuItem disabled={i === tables.length - 1} onSelect={() => useDbModelStore.getState().moveTable(t.id, 1)}>
                    เลื่อนลง
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    variant="destructive"
                    onSelect={() => {
                      const rest = tables.filter((x) => x.id !== t.id);
                      const neighbour = rest[Math.min(i, rest.length - 1)] ?? null;
                      useDbModelStore.getState().removeTable(t.id);
                      if (selected) useDbModelStore.getState().selectTable(neighbour?.id ?? null);
                      afterMenu.current = () => {
                        if (neighbour) {
                          setActive(neighbour.id);
                          rowButton(neighbour.id)?.focus();
                        } else document.querySelector<HTMLElement>("[data-db-add-table]")?.focus();
                      };
                    }}
                  >
                    ลบตาราง
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
