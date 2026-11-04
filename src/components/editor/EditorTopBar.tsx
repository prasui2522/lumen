import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, ChevronRight, Download, PanelLeft, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ModeSwitch } from "@/components/editor/ModeSwitch";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useEditorStore } from "@/stores/editor-store";
import { commitProjectTitle } from "@/lib/project-title";
import { searchKeyAction } from "@/lib/search-trigger";

type Props = {
  title: string;
  dirty: boolean;
  saving?: boolean;
  /** Disable mode switch until document is ready. */
  modeDisabled?: boolean;
  onTitleChange: (title: string) => void;
  onTitleCommit: (title: string) => void;
  onSave: () => void;
  /** Back to the project list (EditorPage guards unsaved changes). */
  onBack: () => void;
  onExport: () => void;
  exporting?: boolean;
  exportDisabled?: boolean;
  /**
   * Preview-only cluster rendered between the title and ModeSwitch (S2b).
   * `compact` = top bar narrower than 1200 px (secondary controls collapse).
   */
  previewTools?: (compact: boolean) => ReactNode;
  /** Current command-palette query. The field does not import the palette. */
  paletteQuery: string;
  /** Focus or typing opens the palette (lazy, in EditorPage) with this text. */
  onPalette: (query: string) => void;
};

/** DEVICE-PREVIEW-SPEC §5: below ~1200 px move secondary preview controls into a menu. */
const COMPACT_BELOW_PX = 1200;

function VSep() {
  return (
    <span className="inline-flex h-4 shrink-0 items-stretch" aria-hidden>
      <Separator orientation="vertical" />
    </span>
  );
}

/** Editor top bar (UI-REFRESH S2): pane toggle · crumb/title · [preview tools] · mode · export · save. */
export function EditorTopBar({
  title,
  dirty,
  saving,
  modeDisabled,
  onTitleChange,
  onTitleCommit,
  onSave,
  onBack,
  onExport,
  exporting,
  exportDisabled,
  previewTools,
  paletteQuery,
  onPalette,
}: Props) {
  const mode = useEditorStore((s) => s.mode);
  const isSidebarOpen = useEditorStore((s) => s.isSidebarOpen);
  const toggleSidebar = useEditorStore((s) => s.toggleSidebar);
  const [draft, setDraft] = useState(title);
  const [searchDraft, setSearchDraft] = useState(paletteQuery);
  useEffect(() => {
    setSearchDraft(paletteQuery);
  }, [paletteQuery]);

  useEffect(() => {
    setDraft(title);
  }, [title]);

  const commit = () => {
    const next = commitProjectTitle(draft);
    setDraft(next);
    onTitleCommit(next);
  };

  // Narrow top bar → DeviceToolbar collapses zoom/hinge/multi (§5). Observed
  // only while preview tools are shown; fires on resize only.
  const headerRef = useRef<HTMLElement | null>(null);
  const [compact, setCompact] = useState(false);
  const hasTools = !!previewTools;
  useEffect(() => {
    const el = headerRef.current;
    if (!hasTools || !el || typeof ResizeObserver === "undefined") return;
    const check = () => setCompact(el.clientWidth < COMPACT_BELOW_PX);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [hasTools]);

  // `saving` is the store-wide busy flag (also true while opening); only a
  // save of dirty edits shows the saving state.
  const isSaving = !!saving && dirty;

  return (
    <header ref={headerRef} className="flex h-11 shrink-0 items-center gap-1.5 overflow-hidden border-b border-border bg-background px-2">
      <div className="flex min-w-0 flex-1 items-center gap-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="แสดง/ซ่อนแผงเลเยอร์"
              aria-pressed={isSidebarOpen}
              disabled={mode !== "design"}
              onClick={toggleSidebar}
            >
              <PanelLeft className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>แสดง/ซ่อนแผงเลเยอร์</TooltipContent>
        </Tooltip>
        <VSep />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onBack}
          aria-label="กลับไปรายการโปรเจกต์"
          className="text-muted-foreground hover:text-foreground"
        >
          โปรเจกต์
        </Button>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        {mode === "design" ? (
          <Input
            value={draft}
            onChange={(e) => {
              const v = e.currentTarget.value;
              setDraft(v);
              onTitleChange(v);
            }}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.currentTarget.blur();
              }
            }}
            placeholder="ไม่มีชื่อ"
            data-project-title=""
            className="h-7 min-w-0 max-w-xs flex-1 border-transparent bg-transparent px-2 text-sm font-medium shadow-none focus-visible:border-ring"
            aria-label="ชื่อโปรเจกต์"
          />
        ) : (
          <span
            className="h-7 min-w-0 max-w-xs flex-1 truncate px-2 text-sm font-medium leading-7"
            title={draft}
          >
            {draft || "ไม่มีชื่อ"}
          </span>
        )}
      </div>
      {previewTools ? (
        <>
          <VSep />
          {previewTools(compact)}
          <VSep />
        </>
      ) : null}
      <div className="relative w-32 shrink-0">
        <Search className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input
          // Local value so an IME composition can run here before the palette
          // opens; synced back from the palette query (cleared on close).
          value={searchDraft}
          // WCAG 3.2.1: focus alone (Tab, focus restored on close) opens nothing.
          // Open on click (primary button only), i.e. after mousedown has
          // focused this field: the palette's useRestoreFocus captures the
          // focused element in its opening render, so close returns here.
          // (pointerdown opened before focus moved → close went back to the
          // canvas/title/layer row on a warm open.)
          onClick={() => onPalette(paletteQuery)}
          onKeyDown={(e) => {
            const a = searchKeyAction({
              key: e.key,
              ctrlKey: e.ctrlKey,
              metaKey: e.metaKey,
              altKey: e.altKey,
              isComposing: e.nativeEvent.isComposing,
            });
            if (a.type === "pass") return;
            e.preventDefault();
            onPalette(paletteQuery + a.append);
          }}
          onChange={(e) => {
            const v = e.currentTarget.value;
            setSearchDraft(v);
            // Paste etc. opens at once; composed text waits for compositionend.
            if (!(e.nativeEvent as InputEvent).isComposing) onPalette(v);
          }}
          onCompositionEnd={(e) => onPalette(e.currentTarget.value)}
          placeholder="ค้นหา…"
          aria-label="ค้นหาคำสั่ง"
          className="h-7 w-full pl-7 text-sm"
        />
      </div>
      <ThemeToggle />
      <ModeSwitch disabled={modeDisabled} />
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={exporting || exportDisabled}
            aria-busy={exporting || undefined}
            onClick={onExport}
          >
            {exporting ? (
              <Spinner className="size-4" aria-hidden data-icon="inline-start" />
            ) : (
              <Download className="size-4" data-icon="inline-start" />
            )}
            ส่งออก
          </Button>
        </TooltipTrigger>
        <TooltipContent>ส่งออกเป็นไฟล์ zip (index.html + styles.css)</TooltipContent>
      </Tooltip>
      {isSaving ? (
        <Button type="button" variant="default" size="sm" disabled aria-busy>
          <Spinner className="size-4" aria-hidden data-icon="inline-start" />
          กำลังบันทึก…
        </Button>
      ) : dirty ? (
        <Button type="button" variant="default" size="sm" disabled={saving} onClick={onSave}>
          <span
            className="size-1.5 shrink-0 rounded-full bg-primary-foreground"
            aria-hidden
            data-icon="inline-start"
          />
          บันทึก
        </Button>
      ) : (
        <Button type="button" variant="ghost" size="sm" disabled>
          <Check className="size-4" data-icon="inline-start" />
          บันทึกแล้ว
        </Button>
      )}
    </header>
  );
}
