import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Check, MoreHorizontal, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  addPage,
  deletePage,
  ensurePages,
  movePage,
  openPageIdOf,
  pathErrorMessage,
  renamePage,
  setPagePath,
  switchToPage,
  togglePageRootLocked,
  type PathError,
} from "@/lib/project-pages";
import { useEditorStore } from "@/stores/editor-store";
import { useProjectsStore } from "@/stores/projects-store";
import { isLocked } from "@/schema";

type MenuPending = { kind: "rename" | "path"; id: string; draft: string };

/**
 * `หน้า` list at the top of the Layers pane (PHASE-8-SPEC).
 * Phase 7 Add-menu Pages (Login/Signup) is unrelated.
 */
export function PagesPanel() {
  const openDocument = useProjectsStore((s) => s.openDocument);
  const updateOpenDocument = useProjectsStore((s) => s.updateOpenDocument);
  const openPageId = useEditorStore((s) => s.openPageId);
  const setOpenPageId = useEditorStore((s) => s.setOpenPageId);
  const setSelectedNodeId = useEditorStore((s) => s.setSelectedNodeId);
  const setEditingNodeId = useEditorStore((s) => s.setEditingNodeId);
  const pendingPageRenameId = useEditorStore((s) => s.pendingPageRenameId);

  const [renameId, setRenameId] = useState<string | null>(null);
  const [pathId, setPathId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [pathErr, setPathErr] = useState<PathError | null>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const rowRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  /** Rename/path chosen from a menu — open popover only after menu close autofocus. */
  const menuPendingRef = useRef<MenuPending | null>(null);
  /** Row to focus when the delete dialog closes (cancel or confirm). */
  const returnFocusIdRef = useRef<string | null>(null);

  // Palette เพิ่มหน้า → same rename UX as +. Keep pendingPageRenameId until the
  // rename popover closes so CommandPalette onCloseAutoFocus still sees it.
  useEffect(() => {
    if (!pendingPageRenameId) return;
    if (renameId === pendingPageRenameId) return;
    const id = pendingPageRenameId;
    const page = useProjectsStore.getState().openDocument;
    const list = page ? ensurePages(page).pages : undefined;
    const found = list?.find((p) => p.id === id);
    if (!found) return;
    setPathId(null);
    setDraft(found.name);
    setRenameId(id);
  }, [pendingPageRenameId, renameId]);

  // Select-all after focus for every open route (+, palette, menus).
  useLayoutEffect(() => {
    if (!renameId) return;
    const el = document.getElementById("page-rename") as HTMLInputElement | null;
    if (!el) return;
    el.focus();
    el.select();
  }, [renameId]);

  useLayoutEffect(() => {
    if (!pathId) return;
    const el = document.getElementById("page-path") as HTMLInputElement | null;
    if (!el) return;
    el.focus();
    el.select();
  }, [pathId]);

  if (!openDocument) return null;
  const doc = ensurePages(openDocument);
  const pages = doc.pages!;
  const currentId = openPageId ?? openPageIdOf(doc);

  const commitDoc = (next: typeof doc, nextOpenId: string) => {
    setOpenPageId(nextOpenId);
    setSelectedNodeId(null);
    setEditingNodeId(null);
    updateOpenDocument(next);
  };

  const switchPage = (id: string) => {
    if (id === currentId) {
      rowRefs.current[id]?.focus();
      return;
    }
    const next = switchToPage(doc, id);
    if (!next) return;
    // Switching pages is not an undo step.
    setOpenPageId(id);
    setSelectedNodeId(null);
    setEditingNodeId(null);
    useProjectsStore.getState().restoreDocument(next);
    requestAnimationFrame(() => rowRefs.current[id]?.focus());
  };

  const onAdd = () => {
    const { doc: next, pageId } = addPage(doc, currentId);
    commitDoc(next, pageId);
    setDraft(next.pages!.find((p) => p.id === pageId)?.name ?? "หน้าใหม่");
    setPathId(null);
    setRenameId(pageId);
  };

  const pageLocked = (id: string) => {
    const p = pages.find((x) => x.id === id);
    if (!p) return false;
    const node = p.nodes[p.root];
    return !!node && isLocked(node);
  };

  const armRename = (id: string, name: string) => {
    menuPendingRef.current = { kind: "rename", id, draft: name };
  };
  const armPath = (id: string, path: string) => {
    menuPendingRef.current = { kind: "path", id, draft: path };
  };

  /** Radix returns focus to the menu trigger on close; that dismisses the popover. */
  const onMenuCloseAutoFocus = (e: Event) => {
    const pending = menuPendingRef.current;
    if (!pending) return;
    e.preventDefault();
    menuPendingRef.current = null;
    setDraft(pending.draft);
    if (pending.kind === "rename") {
      setPathId(null);
      setRenameId(pending.id);
    } else {
      setRenameId(null);
      setPathErr(null);
      setPathId(pending.id);
    }
  };

  const openDelete = (id: string) => {
    returnFocusIdRef.current = id;
    setDeleteId(id);
  };

  return (
    <div className="shrink-0 border-b border-sidebar-border">
      <div className="flex h-10 items-center gap-1 px-3">
        <span className="text-[11px] font-medium text-muted-foreground">หน้า</span>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="ml-auto size-7"
          aria-label="เพิ่มหน้า"
          onClick={onAdd}
        >
          <Plus className="size-3.5" />
        </Button>
      </div>
      <div
        className="scrollbar-thin max-h-24 space-y-0.5 overflow-y-auto px-2 pb-2"
        role="listbox"
        aria-label="หน้า"
      >
        {pages.map((page, index) => {
          const selected = page.id === currentId;
          const locked = pageLocked(page.id);
          const isHome = index === 0;
          return (
            <div key={page.id} className="flex items-center gap-0.5">
              <ContextMenu>
                <ContextMenuTrigger asChild>
                  <button
                    type="button"
                    ref={(el) => {
                      rowRefs.current[page.id] = el;
                    }}
                    role="option"
                    aria-selected={selected}
                    className={cn(
                      "flex h-7 min-w-0 flex-1 items-center gap-2 rounded-md px-2 text-left text-[13px] outline-none hover:bg-sidebar-accent/60 focus-visible:outline-2 focus-visible:outline-solid focus-visible:-outline-offset-2 focus-visible:outline-ring",
                      selected &&
                        "bg-sidebar-accent text-sidebar-accent-foreground shadow-[inset_2px_0_0_var(--sidebar-primary)]",
                      locked && "opacity-60",
                    )}
                    onClick={() => switchPage(page.id)}
                  >
                    <span className="truncate font-medium">{page.name}</span>
                    <span className="ml-auto truncate text-[11px] text-muted-foreground">{page.path}</span>
                  </button>
                </ContextMenuTrigger>
                <ContextMenuContent className="min-w-44" onCloseAutoFocus={onMenuCloseAutoFocus}>
                  <ContextMenuItem
                    disabled={locked}
                    onSelect={() => armRename(page.id, page.name)}
                  >
                    เปลี่ยนชื่อ
                  </ContextMenuItem>
                  <ContextMenuItem
                    disabled={locked || isHome}
                    onSelect={() => armPath(page.id, page.path)}
                  >
                    ตั้งค่าเส้นทาง
                  </ContextMenuItem>
                  <ContextMenuItem
                    onSelect={() => {
                      const next = togglePageRootLocked(doc, page.id);
                      if (next) updateOpenDocument(next);
                    }}
                  >
                    {locked ? "ปลดล็อก" : "ล็อก"}
                  </ContextMenuItem>
                  <ContextMenuSeparator />
                  <ContextMenuItem
                    disabled={isHome || index <= 1}
                    onSelect={() => {
                      const next = movePage(doc, page.id, -1);
                      if (next) updateOpenDocument(next);
                    }}
                  >
                    เลื่อนขึ้น
                  </ContextMenuItem>
                  <ContextMenuItem
                    disabled={isHome || index >= pages.length - 1}
                    onSelect={() => {
                      const next = movePage(doc, page.id, 1);
                      if (next) updateOpenDocument(next);
                    }}
                  >
                    เลื่อนลง
                  </ContextMenuItem>
                  <ContextMenuSeparator />
                  <ContextMenuItem
                    disabled={locked || isHome}
                    variant="destructive"
                    onSelect={() => openDelete(page.id)}
                  >
                    ลบหน้า
                  </ContextMenuItem>
                </ContextMenuContent>
              </ContextMenu>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="size-7 shrink-0"
                    aria-label={`ตัวเลือกหน้า ${page.name}`}
                  >
                    <MoreHorizontal className="size-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  className="min-w-44"
                  onCloseAutoFocus={onMenuCloseAutoFocus}
                >
                  <DropdownMenuItem
                    disabled={locked}
                    onSelect={() => armRename(page.id, page.name)}
                  >
                    เปลี่ยนชื่อ
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={locked || isHome}
                    onSelect={() => armPath(page.id, page.path)}
                  >
                    ตั้งค่าเส้นทาง
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => {
                      const next = togglePageRootLocked(doc, page.id);
                      if (next) updateOpenDocument(next);
                    }}
                  >
                    {locked ? "ปลดล็อก" : "ล็อก"}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    disabled={isHome || index <= 1}
                    onSelect={() => {
                      const next = movePage(doc, page.id, -1);
                      if (next) updateOpenDocument(next);
                    }}
                  >
                    เลื่อนขึ้น
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={isHome || index >= pages.length - 1}
                    onSelect={() => {
                      const next = movePage(doc, page.id, 1);
                      if (next) updateOpenDocument(next);
                    }}
                  >
                    เลื่อนลง
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    disabled={locked || isHome}
                    variant="destructive"
                    onSelect={() => openDelete(page.id)}
                  >
                    ลบหน้า
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          );
        })}
      </div>

      <Popover
        open={renameId !== null}
        onOpenChange={(o) => {
          if (!o) {
            const id = renameId;
            setRenameId(null);
            useEditorStore.getState().clearPendingPageRename();
            if (id) requestAnimationFrame(() => rowRefs.current[id]?.focus());
          }
        }}
      >
        <PopoverTrigger asChild>
          <span className="sr-only" />
        </PopoverTrigger>
        <PopoverContent className="w-56 p-2" align="start" onOpenAutoFocus={(e) => {
          // Keep focus in the name field (default), ignore menu leftovers.
          const input = (e.currentTarget as HTMLElement).querySelector<HTMLInputElement>("#page-rename");
          if (input) {
            e.preventDefault();
            input.focus();
            input.select();
          }
        }}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!renameId) return;
              const next = renamePage(doc, renameId, draft);
              if (next) updateOpenDocument(next);
              const id = renameId;
              setRenameId(null);
              requestAnimationFrame(() => rowRefs.current[id]?.focus());
            }}
          >
            <label className="text-[11px] text-muted-foreground" htmlFor="page-rename">
              ชื่อหน้า
            </label>
            <Input
              id="page-rename"
              className="mt-1 h-7 text-[13px]"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
            <Button type="submit" size="sm" className="mt-2 h-7 w-full text-[11px]">
              <Check className="size-3.5" />
              ตกลง
            </Button>
          </form>
        </PopoverContent>
      </Popover>

      <Popover
        open={pathId !== null}
        onOpenChange={(o) => {
          if (!o) {
            const id = pathId;
            setPathId(null);
            setPathErr(null);
            if (id) requestAnimationFrame(() => rowRefs.current[id]?.focus());
          }
        }}
      >
        <PopoverTrigger asChild>
          <span className="sr-only" />
        </PopoverTrigger>
        <PopoverContent className="w-56 p-2" align="start" onOpenAutoFocus={(e) => {
          const input = (e.currentTarget as HTMLElement).querySelector<HTMLInputElement>("#page-path");
          if (input) {
            e.preventDefault();
            input.focus();
            input.select();
          }
        }}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!pathId) return;
              const result = setPagePath(doc, pathId, draft);
              if ("error" in result) {
                setPathErr(result.error);
                return;
              }
              updateOpenDocument(result.doc);
              const id = pathId;
              setPathId(null);
              setPathErr(null);
              requestAnimationFrame(() => rowRefs.current[id]?.focus());
            }}
          >
            <label className="text-[11px] text-muted-foreground" htmlFor="page-path">
              เส้นทาง
            </label>
            <Input
              id="page-path"
              className="mt-1 h-7 font-mono text-[13px]"
              value={draft}
              aria-invalid={!!pathErr}
              aria-describedby={pathErr ? "page-path-err" : undefined}
              onChange={(e) => {
                setDraft(e.target.value);
                setPathErr(null);
              }}
            />
            {pathErr ? (
              <p id="page-path-err" className="mt-1 text-[11px] text-destructive">
                {pathErrorMessage(pathErr)}
              </p>
            ) : null}
            <Button type="submit" size="sm" className="mt-2 h-7 w-full text-[11px]">
              <Check className="size-3.5" />
              ตกลง
            </Button>
          </form>
        </PopoverContent>
      </Popover>

      <AlertDialog
        open={deleteId !== null}
        onOpenChange={(o) => {
          if (!o) setDeleteId(null);
        }}
      >
        <AlertDialogContent
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            cancelRef.current?.focus();
          }}
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            const id = returnFocusIdRef.current;
            returnFocusIdRef.current = null;
            if (id) requestAnimationFrame(() => rowRefs.current[id]?.focus());
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>ลบหน้านี้ไหม</AlertDialogTitle>
            <AlertDialogDescription>
              การลบจะเอาทั้งหน้าออกจากโปรเจกต์ และยกเลิกได้ด้วยเลิกทำ
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button type="button" ref={cancelRef} variant="outline" onClick={() => setDeleteId(null)}>
              ยกเลิก
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                if (!deleteId) return;
                const result = deletePage(doc, deleteId);
                if (result) {
                  returnFocusIdRef.current = result.focusPageId;
                  setDeleteId(null);
                  commitDoc(result.doc, result.focusPageId);
                } else {
                  setDeleteId(null);
                }
              }}
            >
              ลบหน้า
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
