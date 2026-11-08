/**
 * Phase 11 D4/D5: lazy `blocks-flyout` — non-modal Blocks panel over the canvas.
 * D10 RAM: card meta only in React state; virtualised grid; clear on close.
 */
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type UIEvent,
} from "react";
import { MoreHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import {
  findRegistryBlock,
  getCachedBlocksRegistry,
  loadBlocksRegistry,
} from "@/lib/blocks-registry";
import type {
  BlockCategory,
  BlockScope,
  BlockThumbRect,
  StyleBlock,
} from "@/lib/block-format";
import {
  insertBlock,
  type InsertBlockPosition,
} from "@/lib/block-insert";
import { BLOCK_DRAG_MIME, setDragPayload } from "@/lib/drag-session";
import { getChildren } from "@/schema";
import { resolveInsertTarget } from "@/lib/document-ops";
import { useEditorStore } from "@/stores/editor-store";
import { useProjectsStore } from "@/stores/projects-store";
import { canInsertTemplate } from "@/lib/node-actions";

/** T140 */
export const BLOCKS_SEARCH = "ค้นหาบล็อก";
/** T141 */
export const BLOCKS_INSERT = "แทรก";
/** T142 */
export const BLOCKS_INSERT_END = "แทรกท้ายหน้า";
/** T143 */
export const BLOCKS_INSERT_AFTER = "แทรกหลังส่วนที่เลือก";
/** T144 */
export const BLOCKS_INSERT_INTO = "แทรกในองค์ประกอบที่เลือก";
/** T147 */
export const BLOCKS_HINT = "ลากไปวางบนผืนผ้าใบ หรือกดแทรก";
/** T148 */
export const BLOCKS_EMPTY = "ไม่พบบล็อก";
/** T149 */
export const BLOCKS_CLOSE = "ปิดแผงบล็อก";
/** T145 */
export const BLOCKS_INSERTED = (name: string) => `แทรกบล็อก ${name} แล้ว`;
/** T146 */
export const BLOCKS_INVALID = "บล็อกนี้ใช้ไม่ได้";
/** T151 */
export const BLOCKS_LOCKED = "หน้าถูกล็อก จึงแทรกไม่ได้";
/** T152 */
export const BLOCKS_INSERT_OPTIONS = "ตัวเลือกการแทรก";

/** Display fields only — full `nodes` stay in the registry cache until insert. */
export type StyleBlockCard = {
  id: string;
  category: BlockCategory;
  scope: BlockScope;
  name: string;
  nameEn: string;
  keywords: string[];
  thumb: BlockThumbRect[];
};

export function toBlockCard(b: StyleBlock): StyleBlockCard {
  return {
    id: b.id,
    category: b.category,
    scope: b.scope,
    name: b.name,
    nameEn: b.nameEn,
    keywords: b.keywords,
    thumb: b.thumb,
  };
}

export const BLOCK_CATEGORIES: { id: "all" | BlockCategory; label: string }[] = [
  { id: "all", label: "ทั้งหมด" },
  { id: "header", label: "แถบหัวเว็บ" },
  { id: "hero", label: "ส่วนแนะนำ" },
  { id: "features", label: "จุดเด่น" },
  { id: "pricing", label: "ราคา" },
  { id: "testimonials", label: "เสียงจากลูกค้า" },
  { id: "faq", label: "คำถามที่พบบ่อย" },
  { id: "cta", label: "ชวนทำ" },
  { id: "footer", label: "ท้ายหน้า" },
  { id: "contact", label: "ติดต่อ" },
  { id: "logoCloud", label: "โลโก้พันธมิตร" },
  { id: "stats", label: "ตัวเลขเด่น" },
  { id: "elements", label: "องค์ประกอบ" },
];

const TONE: Record<BlockThumbRect["tone"], string> = {
  ink: "#0f172a",
  muted: "#94a3b8",
  fill: "#e2e8f0",
  accent: "#0ea5e9",
};

/** Card cell height incl. gap (2-col grid). */
const CARD_ROW = 168;
const COLS = 2;
const OVERSCAN = 2;

function WireThumb({ thumb, name }: { thumb: BlockThumbRect[]; name: string }) {
  return (
    <svg
      viewBox="0 0 100 70"
      className="h-14 w-full rounded-md bg-muted"
      role="img"
      aria-label={`โครงร่างของบล็อก ${name}`}
    >
      {thumb.map((r, i) => (
        <rect
          key={i}
          x={r.x}
          y={r.y}
          width={r.w}
          height={r.h}
          fill={TONE[r.tone]}
          rx={2}
        />
      ))}
    </svg>
  );
}

function resolveBlock(id: string): StyleBlock | undefined {
  const list = getCachedBlocksRegistry();
  return list ? findRegistryBlock(list, id) : undefined;
}

export type BlocksFlyoutProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function BlocksFlyout({ open, onOpenChange }: BlocksFlyoutProps) {
  const [cards, setCards] = useState<StyleBlockCard[] | null>(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<"all" | BlockCategory>("all");
  const [active, setActive] = useState(0);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewH, setViewH] = useState(480);
  const announce = useEditorStore((s) => s.announce);
  const selectedNodeId = useEditorStore((s) => s.selectedNodeId);
  const setSelectedNodeId = useEditorStore((s) => s.setSelectedNodeId);
  const setFocusLayerId = useEditorStore((s) => s.setFocusLayerId);
  const openDocument = useProjectsStore((s) => s.openDocument);
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const searchId = useId();
  const titleId = useId();
  const locked = !canInsertTemplate(openDocument);

  const close = useCallback(() => {
    onOpenChange(false);
    requestAnimationFrame(() => {
      document.getElementById("blocks-flyout-opener")?.focus();
    });
  }, [onOpenChange]);

  useEffect(() => {
    if (!open) {
      setCards(null);
      setQuery("");
      setCategory("all");
      setActive(0);
      setScrollTop(0);
      return;
    }
    let dead = false;
    void loadBlocksRegistry().then((list) => {
      if (!dead) setCards(list.map(toBlockCard));
    });
    requestAnimationFrame(() => closeBtnRef.current?.focus());
    return () => {
      dead = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open || !listRef.current) return;
    const el = listRef.current;
    const ro = new ResizeObserver(() => setViewH(el.clientHeight || 480));
    ro.observe(el);
    setViewH(el.clientHeight || 480);
    return () => ro.disconnect();
  }, [open, cards]);

  const filtered = useMemo(() => {
    const list = cards ?? [];
    const q = query.trim().toLowerCase();
    return list.filter((b) => {
      if (category !== "all" && b.category !== category) return false;
      if (!q) return true;
      return (
        b.name.toLowerCase().includes(q) ||
        b.nameEn.toLowerCase().includes(q) ||
        b.id.includes(q) ||
        b.keywords.some((k) => k.toLowerCase().includes(q))
      );
    });
  }, [cards, query, category]);

  useEffect(() => {
    setActive(0);
    setScrollTop(0);
    if (listRef.current) listRef.current.scrollTop = 0;
  }, [query, category]);

  useEffect(() => {
    if (!open || !cards) return;
    announce(
      filtered.length === 0
        ? BLOCKS_EMPTY
        : `พบ ${filtered.length} บล็อก`,
    );
  }, [open, cards, filtered.length, announce]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  const doInsert = useCallback(
    (blockId: string, position?: InsertBlockPosition) => {
      const doc = useProjectsStore.getState().openDocument;
      if (!doc || !canInsertTemplate(doc)) {
        announce(BLOCKS_LOCKED);
        return;
      }
      const block = resolveBlock(blockId);
      if (!block) {
        announce(BLOCKS_INVALID);
        return;
      }
      const sel = useEditorStore.getState().selectedNodeId;
      const result = insertBlock(doc, sel, block, position);
      if (!result) {
        announce(BLOCKS_INVALID);
        return;
      }
      useProjectsStore.getState().updateOpenDocument(result.doc, {
        historyKey: `block:${block.id}`,
      });
      setSelectedNodeId(result.rootId);
      setFocusLayerId(result.rootId);
      announce(BLOCKS_INSERTED(block.name));
      close();
    },
    [announce, close, setFocusLayerId, setSelectedNodeId],
  );

  const positionEnd = (): InsertBlockPosition | undefined => {
    const doc = useProjectsStore.getState().openDocument;
    if (!doc) return undefined;
    const page = doc.nodes[doc.root];
    if (!page) return undefined;
    return { kind: "page", index: getChildren(page).length };
  };

  const positionInto = (): InsertBlockPosition | undefined => {
    const doc = useProjectsStore.getState().openDocument;
    if (!doc) return undefined;
    const t = resolveInsertTarget(doc, selectedNodeId);
    if (!t) return undefined;
    return { kind: "inline", parentId: t.parentId, index: t.index };
  };

  const onListScroll = (e: UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  };

  const rowCount = Math.ceil(filtered.length / COLS);
  const startRow = Math.max(0, Math.floor(scrollTop / CARD_ROW) - OVERSCAN);
  const endRow = Math.min(
    rowCount,
    Math.ceil((scrollTop + viewH) / CARD_ROW) + OVERSCAN,
  );
  const padTop = startRow * CARD_ROW;
  const padBot = Math.max(0, (rowCount - endRow) * CARD_ROW);
  const visible: { card: StyleBlockCard; index: number }[] = [];
  for (let row = startRow; row < endRow; row++) {
    for (let col = 0; col < COLS; col++) {
      const index = row * COLS + col;
      const card = filtered[index];
      if (card) visible.push({ card, index });
    }
  }

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      className="absolute top-2 bottom-2 left-2 z-30 flex w-[min(360px,calc(100%-1rem))] min-w-[340px] max-w-[380px] flex-col overflow-hidden rounded-lg border border-border bg-background shadow-lg"
    >
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border px-2">
        <h2 id={titleId} className="min-w-0 flex-1 truncate text-sm font-medium">
          บล็อก
        </h2>
        <Button
          ref={closeBtnRef}
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label={BLOCKS_CLOSE}
          onClick={close}
        >
          <X className="size-3.5" />
        </Button>
      </div>
      <div className="border-b border-border p-2">
        <label htmlFor={searchId} className="sr-only">
          {BLOCKS_SEARCH}
        </label>
        <Input
          id={searchId}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={BLOCKS_SEARCH}
          className="h-8 text-xs"
        />
      </div>
      <div className="flex min-h-0 flex-1">
        <nav
          aria-label="หมวดบล็อก"
          className="scrollbar-thin w-[7.5rem] shrink-0 overflow-auto border-r border-border py-1"
        >
          {BLOCK_CATEGORIES.map((c) => (
            <button
              key={c.id}
              type="button"
              className={cn(
                "flex w-full px-2 py-1.5 text-left text-[11px] hover:bg-muted",
                category === c.id && "bg-muted font-medium",
              )}
              onClick={() => setCategory(c.id)}
            >
              {c.label}
            </button>
          ))}
        </nav>
        <div
          ref={listRef}
          className="scrollbar-thin min-w-0 flex-1 overflow-auto p-2"
          onScroll={onListScroll}
        >
          {filtered.length === 0 ? (
            <p className="px-1 py-6 text-center text-xs text-muted-foreground" role="status">
              {BLOCKS_EMPTY}
            </p>
          ) : (
            <div style={{ paddingTop: padTop, paddingBottom: padBot }}>
              <div className="grid grid-cols-2 gap-2">
                {visible.map(({ card: b, index: i }) => (
                  <div
                    key={b.id}
                    role="button"
                    tabIndex={0}
                    draggable={!locked}
                    className={cn(
                      "flex flex-col gap-1 rounded-md border border-transparent p-1.5 hover:bg-muted outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      i === active && "border-border bg-muted",
                      !locked && "cursor-grab active:cursor-grabbing",
                    )}
                    style={{ minHeight: CARD_ROW - 8 }}
                    onMouseEnter={() => setActive(i)}
                    onFocus={() => setActive(i)}
                    onDragStart={(e) => {
                      if (locked) {
                        e.preventDefault();
                        return;
                      }
                      e.dataTransfer.setData(BLOCK_DRAG_MIME, b.id);
                      e.dataTransfer.effectAllowed = "copy";
                      setDragPayload({
                        kind: "block",
                        blockId: b.id,
                        scope: b.scope,
                      });
                    }}
                    onDragEnd={() => setDragPayload(null)}
                    onKeyDown={(e) => {
                      if (e.key !== "Enter") return;
                      e.preventDefault();
                      doInsert(b.id);
                    }}
                  >
                    <WireThumb thumb={b.thumb} name={b.name} />
                    <span className="truncate text-[11px] font-medium">{b.name}</span>
                    <span className="text-[10px] leading-snug text-muted-foreground">
                      {BLOCKS_HINT}
                    </span>
                    <div className="flex gap-1">
                      <Button
                        type="button"
                        size="xs"
                        className="h-7 min-w-0 flex-1 text-[11px]"
                        disabled={locked}
                        onClick={(e) => {
                          e.stopPropagation();
                          doInsert(b.id);
                        }}
                      >
                        {BLOCKS_INSERT}
                      </Button>
                      {/* Mount menu only for the active card — cuts Radix trees when open. */}
                      {i === active ? (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              type="button"
                              size="icon-xs"
                              variant="outline"
                              className="h-7 w-7 shrink-0"
                              disabled={locked}
                              aria-label={BLOCKS_INSERT_OPTIONS}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <MoreHorizontal className="size-3.5" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="min-w-[12rem]">
                            <DropdownMenuItem onSelect={() => doInsert(b.id, positionEnd())}>
                              {BLOCKS_INSERT_END}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onSelect={() => doInsert(b.id, { kind: "page" })}
                            >
                              {BLOCKS_INSERT_AFTER}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onSelect={() => {
                                const pos = positionInto();
                                if (!pos) {
                                  announce(BLOCKS_INVALID);
                                  return;
                                }
                                doInsert(b.id, pos);
                              }}
                            >
                              {BLOCKS_INSERT_INTO}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      ) : (
                        <Button
                          type="button"
                          size="icon-xs"
                          variant="outline"
                          className="h-7 w-7 shrink-0"
                          disabled={locked}
                          aria-label={BLOCKS_INSERT_OPTIONS}
                          onClick={(e) => {
                            e.stopPropagation();
                            setActive(i);
                          }}
                        >
                          <MoreHorizontal className="size-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
