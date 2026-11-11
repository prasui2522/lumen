import { useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent } from "react";
import {
  AlignJustify,
  AppWindow,
  ChevronDown,
  ChevronsDownUp,
  ChevronsUpDown,
  CircleDot,
  CircleUser,
  Columns2,
  Gauge,
  GripHorizontal,
  IdCard,
  Inbox,
  Info,
  Keyboard,
  List,
  ListOrdered,
  Table2,
  Star,
  GalleryHorizontal,
  BarChart3,
  CalendarDays,
  MapPin,
  LoaderCircle,
  Menu,
  MessageCircle,
  MessageSquare,
  PanelBottom,
  PanelRight,
  PanelTop,
  Ratio,
  RectangleEllipsis,
  RectangleHorizontal,
  ScrollText,
  Slash,
  SlidersHorizontal,
  SquareDashed,
  SquareMenu,
  Tag,
  TextCursor,
  ToggleRight,
  TriangleAlert,
  Box,
  File,
  FormInput,
  Heading,
  Image,
  Link2,
  Lock,
  Minus,
  MousePointerClick,
  Square,
  TextCursorInput,
  ToggleLeft,
  SquareCheck,
  Type,
  UnfoldVertical,
  Search,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Button } from "@/components/ui/button";
import { Empty, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { ElementPalette } from "@/components/editor/ElementPalette";
import { PagesPanel } from "@/components/editor/PagesPanel";
import { findParent, flattenLayers, toggleNodeLocked } from "@/lib/document-ops";
import { useDisplayLayerLabel } from "@/lib/layer-display";
import { useKindLabel } from "@/lib/kind-label";
import { usePhrase } from "@/lib/phrases";
import { useT } from "@/lib/messages";
import { getChildren, isLocked } from "@/schema";
import {
  canDeleteNode,
  canEditText,
  canInsertTemplate,
  canMoveNode,
  deleteNodeAction,
  editTextAction,
  insertTemplate,
  moveNodeAction,
} from "@/lib/node-actions";
import type { NodeType } from "@/schema";
import { focusInsertedLayer } from "@/lib/layer-focus";
import { useEditorStore } from "@/stores/editor-store";
import { useProjectsStore } from "@/stores/projects-store";

const ICONS: Record<NodeType, typeof File> = {
  page: File,
  section: Square,
  container: Box,
  heading: Heading,
  text: Type,
  image: Image,
  button: MousePointerClick,
  link: Link2,
  spacer: UnfoldVertical,
  input: TextCursorInput,
  switch: ToggleLeft,
  checkbox: SquareCheck,
  textarea: AlignJustify,
  kbd: Keyboard,
  avatar: CircleUser,
  progress: Gauge,
  slider: SlidersHorizontal,
  empty: Inbox,
  item: List,
  marker: MapPin,
  bubble: MessageSquare,
  message: MessageCircle,
  select: ChevronDown,
  radio: CircleDot,
  toggle: ToggleRight,
  toggleGroup: Columns2,
  tabs: PanelTop,
  inputGroup: TextCursor,
  inputOtp: RectangleEllipsis,
  accordion: ChevronsUpDown,
  collapsible: ChevronsDownUp,
  breadcrumb: Slash,
  pagination: ListOrdered,
  navigationMenu: Menu,
  menubar: SquareMenu,
  dropdownMenu: ChevronDown,
  dialog: AppWindow,
  alertDialog: TriangleAlert,
  sheet: PanelRight,
  drawer: PanelBottom,
  popover: MessageSquare,
  tooltip: Info,
  hoverCard: IdCard,
  // Phase 11 A2.1 stand-ins; the real tiles are A2.5.
  card: RectangleHorizontal,
  alert: TriangleAlert,
  badge: Tag,
  separator: Minus,
  skeleton: SquareDashed,
  spinner: LoaderCircle,
  aspectRatio: Ratio,
  scrollArea: ScrollText,
  buttonGroup: GripHorizontal,
  // Phase 11 A3.3
  field: FormInput,
  // Phase 11 A4.1
  list: ListOrdered,
  // Phase 11 A4.2
  table: Table2,
  // Phase 11 A4.5
  icon: Star,
  // Phase 11 A5.1
  carousel: GalleryHorizontal,
  chart: BarChart3,
  calendar: CalendarDays,
  command: Search,
  contextMenu: Menu,
  resizable: Columns2,
  toast: MessageSquare,
};

const INDENT = 12;
/** Depth guide: 1 px line per ancestor level, centred under the parent icon. */
const GUIDE = "repeating-linear-gradient(to right, var(--sidebar-border) 0 1px, transparent 1px 12px)";

/**
 * แก้ไขข้อความ is deferred until the menu has closed: the inline editor focuses
 * itself on mount, and the modal menu's focus trap would otherwise pull focus
 * back and drop it on <body> when it unmounts.
 */
let pendingEdit: string | null = null;

/** After any menu action, focus goes back into the layers scope (selected row). */
function refocusLayers(e: Event) {
  e.preventDefault();
  requestAnimationFrame(() => {
    if (pendingEdit) {
      const id = pendingEdit;
      pendingEdit = null;
      if (editTextAction(id)) return; // editor mounts and takes focus (same as Enter)
    }
    if (useEditorStore.getState().editingNodeId) return; // inline editor owns focus
    const sel = useEditorStore.getState().selectedNodeId;
    const row = sel
      ? document.querySelector<HTMLElement>(`[data-layer-row][data-layer-id="${CSS.escape(sel)}"]`)
      : null;
    (row ?? document.querySelector<HTMLElement>('[data-kbd-scope="layers"]'))?.focus({
      preventScroll: true,
    });
  });
}

/**
 * Rendered as a child of ContextMenuContent, which mounts children only while
 * open — so rows pay nothing (no store subscription, no can* checks) when closed.
 */
function LayerMenuItems({ id }: { id: string }) {
  const doc = useProjectsStore((s) => s.openDocument);
  const updateOpenDocument = useProjectsStore((s) => s.updateOpenDocument);
  const p = usePhrase();
  if (!doc) return null;
  const node = doc.nodes[id];
  const locked = !!node && isLocked(node);
  // Locked page: children's lock is frozen too; the page row stays usable.
  const rootNode = doc.nodes[doc.root];
  const lockFrozen = id !== doc.root && !!rootNode && isLocked(rootNode);
  const scope = () => document.querySelector<HTMLElement>('[data-kbd-scope="layers"]');
  return (
    <>
      <ContextMenuItem disabled={!canEditText(doc, id)} onSelect={() => {
          pendingEdit = id;
        }}>
        {p("แก้ไขข้อความ")}
        <ContextMenuShortcut>Enter</ContextMenuShortcut>
      </ContextMenuItem>
      <ContextMenuItem
        disabled={lockFrozen}
        onSelect={() => {
          const next = toggleNodeLocked(doc, id);
          if (next) updateOpenDocument(next);
        }}
      >
        {locked ? p("ปลดล็อก") : p("ล็อก")}
      </ContextMenuItem>
      <ContextMenuItem disabled={!canMoveNode(doc, id, -1)} onSelect={() => moveNodeAction(id, -1)}>
        {p("เลื่อนขึ้น")}
      </ContextMenuItem>
      <ContextMenuItem disabled={!canMoveNode(doc, id, 1)} onSelect={() => moveNodeAction(id, 1)}>
        {p("เลื่อนลง")}
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem
        variant="destructive"
        disabled={!canDeleteNode(doc, id)}
        onSelect={() => deleteNodeAction(id, scope())}
      >
        {p("ลบ")}
        <ContextMenuShortcut>Delete</ContextMenuShortcut>
      </ContextMenuItem>
    </>
  );
}

export function LayersPanel() {
  const openDocument = useProjectsStore((s) => s.openDocument);
  const selectedNodeId = useEditorStore((s) => s.selectedNodeId);
  const focusLayerId = useEditorStore((s) => s.focusLayerId);
  const setSelectedNodeId = useEditorStore((s) => s.setSelectedNodeId);
  const showLabel = useDisplayLayerLabel();
  const kindOf = useKindLabel();
  const t = useT();
  const p = usePhrase();

  const rows = openDocument ? flattenLayers(openDocument) : [];
  // A saved page always has the page row, so an empty `rows` list never happens.
  const root = openDocument?.nodes[openDocument.root];
  const pageHasChildren = !!root && getChildren(root).length > 0;
  const listRef = useRef<HTMLDivElement>(null);
  // Roving tabindex (§7 #12, PM-approved): ONE Tab stop — the selected row,
  // or the first row when nothing (visible) is selected.
  const entryId = rows.some((r) => r.id === selectedNodeId) ? selectedNodeId : (rows[0]?.id ?? null);

  const rowEl = (id: string) =>
    listRef.current?.querySelector<HTMLElement>(`[data-layer-row][data-layer-id="${CSS.escape(id)}"]`) ??
    null;

  // Template insert: focus the new row even when focus was outside the list
  // (palette menu, command palette, empty-page แนะนำ). Selection is already set.
  useEffect(() => {
    if (!focusLayerId) return;
    return focusInsertedLayer(focusLayerId);
  }, [focusLayerId]);

  // Focus follows selection while focus is on a layer row (window-level Esc,
  // context-menu actions, undo…). Never steals focus from elsewhere.
  useEffect(() => {
    const a = document.activeElement;
    if (!selectedNodeId || !(a instanceof HTMLElement) || a.dataset.layerRow === undefined) return;
    if (!listRef.current?.contains(a) || a.dataset.layerId === selectedNodeId) return;
    rowEl(selectedNodeId)?.focus({ preventScroll: false });
  }, [selectedNodeId]);

  /**
   * Row navigation (focus + selection move together): ↑/↓ = previous/next row
   * in tree order, Home/End = first/last, ← = parent (the tree has no
   * collapse). preventDefault makes DesignCanvas's window handler skip these
   * keys (it ignores defaultPrevented events), so the canvas's own ↑/↓
   * sibling navigation is unchanged when focus is on the canvas.
   */
  const onListKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
    const t = e.target as HTMLElement;
    if (t.dataset.layerRow === undefined || !openDocument) return;
    const i = rows.findIndex((r) => r.id === t.dataset.layerId);
    if (i < 0) return;
    let next: string | null | undefined;
    if (e.key === "ArrowUp") next = rows[i - 1]?.id;
    else if (e.key === "ArrowDown") next = rows[i + 1]?.id;
    else if (e.key === "Home") next = rows[0]?.id;
    else if (e.key === "End") next = rows[rows.length - 1]?.id;
    else if (e.key === "ArrowLeft") next = findParent(openDocument, rows[i].id)?.parentId;
    else return;
    e.preventDefault();
    if (!next) return; // edge: stay put
    setSelectedNodeId(next);
    rowEl(next)?.focus();
  };

  const openAtRow = (el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    el.dispatchEvent(
      new MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
        clientX: r.left + 24,
        clientY: r.bottom - 2,
      }),
    );
  };

  /** Menu key / Shift+F10 → open at the row (not every platform fires contextmenu). */
  const onRowKeyDown = (e: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "ContextMenu" || (e.shiftKey && e.key === "F10")) {
      e.preventDefault();
      openAtRow(e.currentTarget);
    }
  };

  const onRowContextMenu = (e: ReactMouseEvent<HTMLButtonElement>, id: string) => {
    setSelectedNodeId(id); // right-click selects first
    // Menu key / Shift+F10 can report (0,0) or a point outside the row; Radix
    // anchors the menu at the event point, so re-dispatch at the row instead.
    const r = e.currentTarget.getBoundingClientRect();
    const inside =
      e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    if (!inside) {
      e.preventDefault(); // skips Radix's handler for this event + native menu
      openAtRow(e.currentTarget);
    }
  };

  return (
    <aside className="flex h-full w-full min-h-0 min-w-0 flex-col bg-sidebar text-sidebar-foreground">
      <ElementPalette />
      <PagesPanel />
      <div className="flex h-10 shrink-0 items-center px-3">
        <span className="text-[11px] font-medium text-muted-foreground">{t("layers")}</span>
      </div>
      <div
        ref={listRef}
        data-kbd-scope="layers"
        tabIndex={-1}
        onKeyDown={onListKeyDown}
        role="listbox"
        aria-label={t("layers")}
        className="scrollbar-thin min-h-32 flex-1 overflow-auto px-2 pb-2 outline-none"
      >
        {rows.map((row) => {
            const Icon = ICONS[row.type] ?? Square;
            const selected = selectedNodeId === row.id;
            return (
              <ContextMenu key={row.id}>
                <ContextMenuTrigger asChild>
                  <button
                    type="button"
                    data-layer-row
                    data-layer-id={row.id}
                    role="option"
                    aria-selected={selected}
                    tabIndex={row.id === entryId ? 0 : -1}
                    className={cn(
                      "relative flex h-7 w-full items-center gap-2 rounded-md px-2 text-left text-[13px] outline-none hover:bg-sidebar-accent/60 focus-visible:outline-2 focus-visible:outline-solid focus-visible:-outline-offset-2 focus-visible:outline-ring",
                      selected &&
                        "bg-sidebar-accent text-sidebar-accent-foreground shadow-[inset_2px_0_0_var(--sidebar-primary)] hover:bg-sidebar-accent",
                      row.locked && "opacity-60",
                    )}
                    style={{ paddingLeft: 8 + row.depth * INDENT }}
                    title={kindOf(row.type)}
                    onClick={() => setSelectedNodeId(row.id)}
                    onContextMenu={(e) => onRowContextMenu(e, row.id)}
                    onKeyDown={onRowKeyDown}
                  >
                    {row.depth > 0 ? (
                      <span
                        aria-hidden
                        className="pointer-events-none absolute inset-y-0"
                        style={{ left: 15, width: row.depth * INDENT, backgroundImage: GUIDE }}
                      />
                    ) : null}
                    <Icon className="size-3.5 shrink-0 text-muted-foreground" />
                    <span className="truncate">{showLabel(row.label, row.type)}</span>
                    {row.locked ? (
                      <>
                        <Lock aria-hidden className="ml-auto size-3 shrink-0 text-muted-foreground" />
                        <span className="sr-only">{p("(ล็อก)")}</span>
                      </>
                    ) : null}
                  </button>
                </ContextMenuTrigger>
                <ContextMenuContent className="min-w-44" onCloseAutoFocus={refocusLayers}>
                  <LayerMenuItems id={row.id} />
                </ContextMenuContent>
              </ContextMenu>
            );
          })}
        {!pageHasChildren ? (
          <Empty className="gap-2 p-3">
            <EmptyHeader>
              <EmptyTitle className="text-xs font-normal text-muted-foreground">
                {p("ไม่มีเลเยอร์")}
              </EmptyTitle>
            </EmptyHeader>
            {canInsertTemplate(openDocument) ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 text-[11px]"
                onClick={() => insertTemplate("hero")}
              >
                {p("แนะนำ")}
              </Button>
            ) : null}
          </Empty>
        ) : null}
      </div>
    </aside>
  );
}
