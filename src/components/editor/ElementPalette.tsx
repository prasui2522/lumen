import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlignJustify,
  AppWindow,
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  CircleDot,
  CircleUser,
  Columns2,
  Gauge,
  IdCard,
  Inbox,
  Info,
  Keyboard,
  List,
  ListOrdered,
  MapPin,
  Menu,
  MessageCircle,
  MessageSquare,
  PanelBottom,
  PanelRight,
  PanelTop,
  RectangleEllipsis,
  Slash,
  SlidersHorizontal,
  SquareMenu,
  TextCursor,
  ToggleRight,
  TriangleAlert,
  Box,
  Heading,
  Image,
  Link2,
  MousePointerClick,
  Square,
  TextCursorInput,
  ToggleLeft,
  SquareCheck,
  Type,
  UnfoldVertical,
  GripHorizontal,
  LoaderCircle,
  Minus,
  Ratio,
  RectangleHorizontal,
  ScrollText,
  SquareDashed,
  Tag,
  FormInput,
  Table2,
  Star,
  GalleryHorizontal,
  BarChart3,
  CalendarDays,
  Search,
} from "lucide-react";
import {
  resolveInsertTarget,
  type PaletteType,
} from "@/lib/document-ops";
import { useLocale } from "@/lib/locale";
import { phraseCount, usePhrase } from "@/lib/phrases";
import { useKindLabel } from "@/lib/kind-label";
import { useT, type MessageKey } from "@/lib/messages";
import { filterPaletteGroups, type PaletteGroup } from "@/lib/palette-meta";
import { canInsertTemplate, insertPage, insertPaletteNode } from "@/lib/node-actions";
import { PALETTE_DRAG_MIME, setDragPayload } from "@/lib/drag-session";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { PAGES } from "@/lib/pages";
import { useEditorStore } from "@/stores/editor-store";
import { useProjectsStore } from "@/stores/projects-store";

const ICONS: Record<PaletteType, typeof Box> = {
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
  field: FormInput,
  list: ListOrdered,
  table: Table2,
  icon: Star,
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
  card: RectangleHorizontal,
  alert: TriangleAlert,
  badge: Tag,
  separator: Minus,
  skeleton: SquareDashed,
  spinner: LoaderCircle,
  aspectRatio: Ratio,
  scrollArea: ScrollText,
  buttonGroup: GripHorizontal,
  carousel: GalleryHorizontal,
  chart: BarChart3,
  calendar: CalendarDays,
  command: Search,
  contextMenu: Menu,
  resizable: Columns2,
  toast: MessageSquare,
};

/**
 * Add-element palette (Design only — lives in LayersPanel, which is
 * unmounted in Preview). Click = insert at selection; drag = drop on canvas.
 */
export function ElementPalette() {
  const openDocument = useProjectsStore((s) => s.openDocument);
  const selectedNodeId = useEditorStore((s) => s.selectedNodeId);
  const blocksFlyoutOpen = useEditorStore((s) => s.blocksFlyoutOpen);
  const setBlocksFlyoutOpen = useEditorStore((s) => s.setBlocksFlyoutOpen);
  const target = openDocument
    ? resolveInsertTarget(openDocument, selectedNodeId)
    : null;

  const t = useT();
  const locale = useLocale();
  const p = usePhrase();
  const labelOf = useKindLabel();
  const groupName = (heading: PaletteGroup) => {
    const key: Record<PaletteGroup, MessageKey> = {
      Layout: "groupLayout",
      "Text & media": "groupText",
      Forms: "groupForms",
      Data: "groupData",
      Navigation: "groupNav",
      Disclosure: "groupDisclosure",
      Overlays: "groupOverlays",
      Feedback: "groupFeedback",
    };
    return t(key[heading]);
  };
  const [query, setQuery] = useState("");
  const collapsed = useEditorStore((s) => s.collapsedPaletteGroups);
  const toggleGroup = useEditorStore((s) => s.togglePaletteGroup);
  const searching = query.trim() !== "";
  const groups = useMemo(() => filterPaletteGroups(query), [query]);
  const total = groups.reduce((n, g) => n + g.types.length, 0);

  // One polite cue per pause in typing, only when the count changes
  // (the single EditorPage status region).
  const announced = useRef<string | null>(null);
  useEffect(() => {
    if (!searching) {
      // Search cleared: drop our own stale count (never someone else's message).
      if (announced.current !== null) {
        if (useEditorStore.getState().announcement === announced.current) {
          useEditorStore.setState({ announcement: "" });
        }
        announced.current = null;
      }
      return;
    }
    const id = window.setTimeout(() => {
      const msg = phraseCount(locale, total, "รายการ", "items");
      announced.current = msg;
      useEditorStore.getState().announce(msg);
    }, 400);
    return () => window.clearTimeout(id);
  }, [searching, total, locale]);

  const add = (type: PaletteType) => {
    if (!openDocument || !target) return;
    insertPaletteNode(type);
  };

  return (
    <div data-palette="elements" className="min-h-0 flex-1 overflow-y-auto border-b border-sidebar-border px-2 pb-2">
      {/* h-10 caption row = same height/inset as the Style panel header. */}
      <div className="flex h-10 items-center px-1">
        <span className="text-[11px] font-medium text-muted-foreground">
          {p("เพิ่ม")}
        </span>
      </div>
      <div className="px-1 pb-1">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape" && query !== "") {
              e.preventDefault();
              e.stopPropagation();
              setQuery("");
            }
          }}
          placeholder={p("ค้นหาองค์ประกอบ")}
          aria-label={p("ค้นหาองค์ประกอบ")}
          autoComplete="off"
          spellCheck={false}
          className="h-7 w-full rounded-md border border-muted-foreground bg-transparent px-2 text-[11px] text-sidebar-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-3 focus-visible:ring-ring [&::-webkit-search-cancel-button]:hidden"
        />
      </div>
      {searching && total === 0 ? (
        <p className="px-2 py-3 text-center text-[11px] text-muted-foreground">
          {p("ไม่พบองค์ประกอบ")}
        </p>
      ) : null}
      <div className="grid grid-cols-4 gap-1">
        {groups.map((section) => {
          const open = searching || !collapsed[section.heading];
          return (
            <div key={section.heading} className="col-span-4 grid grid-cols-4 gap-1">
              {searching ? (
                <div className="col-span-4 px-1 pt-2 text-[11px] font-medium text-muted-foreground">
                  {groupName(section.heading)}
                </div>
              ) : (
                <button
                  type="button"
                  aria-expanded={open}
                  aria-label={`${open ? t("collapseGroup") : t("expandGroup")} ${groupName(section.heading)}`}
                  onClick={() => toggleGroup(section.heading)}
                  className="col-span-4 flex h-7 items-center gap-1 rounded-md px-1 pt-1 text-left text-[11px] font-medium text-muted-foreground outline-none hover:bg-sidebar-accent focus-visible:ring-3 focus-visible:ring-ring"
                >
                  {open ? (
                    <ChevronDown className="size-3 shrink-0" aria-hidden="true" />
                  ) : (
                    <ChevronRight className="size-3 shrink-0" aria-hidden="true" />
                  )}
                  <span className="min-w-0 truncate">{groupName(section.heading)}</span>
                </button>
              )}
              {open
                ? section.types.map((type) => {
          const Icon = ICONS[type];
          const label = labelOf(type);
          const enabled = !!target;
          const tile = (
            <button
              key={type}
              type="button"
              draggable={!!openDocument && enabled}
              disabled={!enabled}
              // Radix tooltips don't fire on disabled buttons → title fallback.
              title={enabled ? undefined : label}
              aria-label={locale === "en" ? `Add ${label}` : `เพิ่ม${label}`}
              className="flex h-12 flex-col items-center justify-center gap-0.5 rounded-md text-[11px] leading-4 text-sidebar-foreground outline-none ring-transparent transition-shadow hover:bg-sidebar-accent hover:ring-1 hover:ring-ring focus-visible:ring-3 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:ring-transparent"
              onClick={() => add(type)}
              onDragStart={(e) => {
                e.dataTransfer.setData(PALETTE_DRAG_MIME, type);
                e.dataTransfer.effectAllowed = "copy";
                setDragPayload({ kind: "new", nodeType: type });
              }}
              onDragEnd={() => setDragPayload(null)}
            >
              <Icon className="size-4 text-muted-foreground" />
              <span className="max-w-full truncate px-0.5">{label}</span>
            </button>
          );
          if (!enabled) return tile;
          // Radix closes the tooltip on pointerdown, so it never covers a drag.
          return (
            <Tooltip key={type}>
              <TooltipTrigger asChild>{tile}</TooltipTrigger>
              <TooltipContent side="bottom" className="flex flex-col items-start gap-0.5">
                <span className="font-medium">{label}</span>
                <span className="opacity-80">{p("คลิกเพื่อแทรก · ลากไปวางบนผืนผ้าใบ")}</span>
              </TooltipContent>
            </Tooltip>
          );
                  })
                : null}
            </div>
          );
        })}
      </div>
      <button
        id="blocks-flyout-opener"
        type="button"
        disabled={!canInsertTemplate(openDocument)}
        className="mt-1 flex h-7 w-full items-center rounded-md px-2 text-[11px] text-sidebar-foreground outline-none hover:bg-sidebar-accent focus-visible:ring-3 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
        aria-haspopup="dialog"
        aria-expanded={blocksFlyoutOpen}
        onClick={() => setBlocksFlyoutOpen(true)}
      >
        {t("blocks")}
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            disabled={!canInsertTemplate(openDocument)}
            className="mt-1 flex h-7 w-full items-center rounded-md px-2 text-[11px] text-sidebar-foreground outline-none hover:bg-sidebar-accent focus-visible:ring-3 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
          >
            Pages
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-56">
          {PAGES.map((p) => (
            <DropdownMenuItem key={p.id} onSelect={() => insertPage(p.id)}>
              {p.name}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
