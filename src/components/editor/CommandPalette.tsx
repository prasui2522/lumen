import { useEffect, useRef, useState, type ComponentProps, type ReactNode } from "react";
import { Command } from "cmdk";
import {
  NODE_TYPE_LABEL,
  PALETTE_TYPES,
  flattenLayers,
  resolveInsertTarget,
} from "@/lib/document-ops";
import { redo, undo } from "@/lib/history";
import { PALETTE_META } from "@/lib/palette-meta";
import {
  canInsertTemplate,
  insertPage,
  insertPaletteNode,
  insertRegistryStyleBlock,
} from "@/lib/node-actions";
import { addPage, ensurePages, openPageIdOf, switchToPage } from "@/lib/project-pages";
import { loadBlocksRegistry } from "@/lib/blocks-registry";
import type { StyleBlock } from "@/lib/block-format";
import { PAGES } from "@/lib/pages";
import { setThemePref, useTheme, type ThemePref } from "@/lib/theme";
import { Kbd } from "@/components/ui/kbd";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useRestoreFocus } from "@/lib/modal";
import { focusCaretAtEnd } from "@/lib/caret";
import { useEditorStore } from "@/stores/editor-store";
import { useProjectsStore } from "@/stores/projects-store";

type Props = {
  open: boolean;
  /** Text typed in the top-bar field before this chunk finished loading. */
  query: string;
  onQueryChange: (query: string) => void;
  onOpenChange: (open: boolean) => void;
  onSave: () => void;
  onExport: () => void;
  onBack: () => void;
};

const THEMES: { pref: ThemePref; label: string }[] = [
  { pref: "system", label: "ธีม: ตามระบบ" },
  { pref: "light", label: "ธีม: สว่าง" },
  { pref: "dark", label: "ธีม: มืด" },
];

/**
 * Ctrl/Cmd+K command palette (UI-REFRESH S8). cmdk is imported only here, so
 * the chunk loads on first open, not at startup. Not mounted on the project list.
 */
export function CommandPalette({ open, query, onQueryChange, onOpenChange, onSave, onExport, onBack }: Props) {
  const restoreFocus = useRestoreFocus(open);
  // Template insert focuses the new layer row. The dialog's close restore
  // runs a frame later and would put focus on the canvas. Skip that once.
  const keepLayerFocus = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const doc = useProjectsStore((s) => s.openDocument);
  const selected = useEditorStore((s) => s.selectedNodeId);
  const mode = useEditorStore((s) => s.mode);
  // ฐานข้อมูล: เลิกทำ/ทำซ้ำ act on the model history (PHASE-10-SPEC §8), never the page.
  const modelHistory = useEditorStore((s) => s.modelHistory);
  const inDb = mode === "database";
  const dbExport = useEditorStore((s) => s.dbExport);
  const sidebar = useEditorStore((s) => s.isSidebarOpen);
  const theme = useTheme();
  const canInsert = !!doc && resolveInsertTarget(doc, selected) !== null;
  const layers = doc ? flattenLayers(doc) : [];
  const [registryBlocks, setRegistryBlocks] = useState<StyleBlock[] | null>(null);
  useEffect(() => {
    if (!open) return;
    let dead = false;
    void loadBlocksRegistry().then((list) => {
      if (!dead) setRegistryBlocks(list);
    });
    return () => {
      dead = true;
    };
  }, [open]);
  const groupCls =
    "[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground";
  const close = () => onOpenChange(false);
  const run = (fn: () => void) => {
    fn();
    // Close after this keydown so focus restore cannot re-enter it.
    setTimeout(close, 0);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="gap-0 overflow-hidden p-0 sm:max-w-md"
        aria-describedby={undefined}
        onOpenAutoFocus={(e) => {
          // Radix's focus scope would focus the input with select(): seeded
          // text (first typed key from the top bar) got replaced by the next
          // key. Focus ourselves, caret at the end; re-apply next frame in
          // case the input/value is not committed in this tick.
          e.preventDefault();
          focusCaretAtEnd(inputRef.current);
          requestAnimationFrame(() => focusCaretAtEnd(inputRef.current));
        }}
        onCloseAutoFocus={(e) => {
          if (keepLayerFocus.current) {
            keepLayerFocus.current = false;
            e.preventDefault();
            return;
          }
          // เพิ่มหน้า rename: keep pending until popover closes; never restore to ออกแบบ.
          if (useEditorStore.getState().pendingPageRenameId) {
            e.preventDefault();
            return;
          }
          restoreFocus(e);
        }}
      >
        <DialogTitle className="sr-only">คำสั่ง</DialogTitle>
        <DialogDescription className="sr-only">ค้นหาคำสั่งหรือเลเยอร์</DialogDescription>
        <Command label="คำสั่ง" className="flex flex-col">
          <Command.Input
            ref={inputRef}
            placeholder="ค้นหาคำสั่งหรือเลเยอร์…"
            value={query}
            onValueChange={onQueryChange}
            className="h-10 border-b border-border bg-transparent px-3 text-sm outline-none placeholder:text-muted-foreground"
          />
          <Command.List className="scrollbar-thin max-h-80 overflow-auto p-1">
            <Command.Empty className="py-6 text-center text-sm text-muted-foreground">
              ไม่พบคำสั่ง
            </Command.Empty>
            <Command.Group heading="คำสั่ง" className={groupCls}>
              <Item value="save" keywords={["บันทึก", "save"]} onSelect={() => run(onSave)}>
                บันทึก
              </Item>
              <Item value="export" keywords={["ส่งออก", "export"]} onSelect={() => run(onExport)}>
                ส่งออก
              </Item>
              {inDb && dbExport ? (
                <Item value="db-export-sql" keywords={["ส่งออกโครงสร้างฐานข้อมูล", "sql", "schema", "export"]} onSelect={() => run(dbExport)}>
                  ส่งออกโครงสร้างฐานข้อมูล (.sql)
                </Item>
              ) : null}
              <Item
                value="mode-preview"
                keywords={["ตัวอย่าง", "mode", "preview"]}
                onSelect={() => run(() => useEditorStore.getState().setMode("preview"))}
              >
                โหมดตัวอย่าง
              </Item>
              <Item
                value="mode-split"
                keywords={["แยก", "split", "mode"]}
                onSelect={() => run(() => useEditorStore.getState().setMode("split"))}
              >
                โหมดแยก
              </Item>
              <Item
                value="mode-code"
                keywords={["โค้ด", "code", "mode"]}
                onSelect={() => run(() => useEditorStore.getState().setMode("code"))}
              >
                โหมดโค้ด
              </Item>
              <Item
                value="mode-design"
                keywords={["ออกแบบ", "design", "mode"]}
                onSelect={() => run(() => useEditorStore.getState().setMode("design"))}
              >
                โหมดออกแบบ
              </Item>
              <Item value="back" keywords={["กลับ", "projects", "back"]} onSelect={() => run(onBack)}>
                กลับไปรายการโปรเจกต์
              </Item>
              <Item
                value="undo"
                keywords={["เลิกทำ", "undo"]}
                disabled={inDb && !modelHistory?.canUndo}
                onSelect={() => run(() => (inDb ? modelHistory?.undo() : void undo()))}
              >
                เลิกทำ
                <Hint>
                  <Kbd>Ctrl</Kbd>
                  <Kbd>Z</Kbd>
                </Hint>
              </Item>
              <Item
                value="redo"
                keywords={["ทำซ้ำ", "redo"]}
                disabled={inDb && !modelHistory?.canRedo}
                onSelect={() => run(() => (inDb ? modelHistory?.redo() : void redo()))}
              >
                ทำซ้ำ
                <Hint>
                  <Kbd>Ctrl</Kbd>
                  <Kbd>Shift</Kbd>
                  <Kbd>Z</Kbd>
                </Hint>
              </Item>
            </Command.Group>
            {(
              [
                { heading: "เพิ่มองค์ประกอบ", types: PALETTE_TYPES.slice(0, PALETTE_TYPES.indexOf("textarea")) },
                { heading: "Text", types: PALETTE_TYPES.slice(PALETTE_TYPES.indexOf("textarea"), PALETTE_TYPES.indexOf("select")) },
                { heading: "Choices", types: PALETTE_TYPES.slice(PALETTE_TYPES.indexOf("select"), PALETTE_TYPES.indexOf("accordion")) },
                { heading: "Disclosure", types: PALETTE_TYPES.slice(PALETTE_TYPES.indexOf("accordion"), PALETTE_TYPES.indexOf("card")) },
                { heading: "เค้าโครงและสถานะ", types: PALETTE_TYPES.slice(PALETTE_TYPES.indexOf("card")) },
              ] as const
            ).map((section) => (
              <Command.Group key={section.heading} heading={section.heading} className={groupCls}>
                {section.types.map((type) => (
                  <Item
                    key={type}
                    value={`add-${type}`}
                    keywords={[NODE_TYPE_LABEL[type], type, "add", ...PALETTE_META[type].keywords]}
                    disabled={!canInsert}
                    onSelect={() => run(() => void insertPaletteNode(type))}
                  >
                    {NODE_TYPE_LABEL[type]}
                  </Item>
                ))}
              </Command.Group>
            ))}
            <Command.Group heading="บล็อก" className={groupCls}>
              {(registryBlocks ?? []).map((b) => (
                <Item
                  key={b.id}
                  value={`block-${b.id}`}
                  keywords={[b.name, b.nameEn, b.category, "block", "บล็อก", ...b.keywords]}
                  disabled={!canInsertTemplate(doc)}
                  onSelect={() =>
                    run(() => {
                      if (insertRegistryStyleBlock(b)) keepLayerFocus.current = true;
                    })
                  }
                >
                  <span className="flex min-w-0 flex-col">
                    <span>{b.name}</span>
                    <span className="text-[11px] text-muted-foreground">{b.nameEn}</span>
                  </span>
                </Item>
              ))}
            </Command.Group>
            <Command.Group heading="Pages" className={groupCls}>
              {PAGES.map((p) => (
                <Item
                  key={p.id}
                  value={`page-${p.id}`}
                  keywords={[p.name, "page", "pages", "login", "signup"]}
                  disabled={!canInsertTemplate(doc)}
                  onSelect={() =>
                    run(() => {
                      if (insertPage(p.id)) keepLayerFocus.current = true;
                    })
                  }
                >
                  {p.name}
                </Item>
              ))}
            </Command.Group>
            <Command.Group heading="หน้า" className={groupCls}>
              {(doc ? ensurePages(doc).pages! : []).map((p) => (
                <Item
                  key={p.id}
                  value={`page-switch-${p.id}`}
                  keywords={[p.name, p.path, "page", "หน้า"]}
                  onSelect={() =>
                    run(() => {
                      if (!doc) return;
                      const cur = useEditorStore.getState().openPageId ?? openPageIdOf(doc);
                      if (p.id === cur) return;
                      const next = switchToPage(ensurePages(doc), p.id);
                      if (!next) return;
                      useEditorStore.getState().setOpenPageId(p.id);
                      useEditorStore.getState().setSelectedNodeId(null);
                      useProjectsStore.getState().restoreDocument(next);
                    })
                  }
                >
                  <span className="truncate">{p.name}</span>
                  <span className="ml-auto pl-2 text-[11px] text-muted-foreground">{p.path}</span>
                </Item>
              ))}
              <Item
                value="add-page"
                keywords={["เพิ่มหน้า", "add page", "page"]}
                disabled={!doc}
                onSelect={() =>
                  run(() => {
                    if (!doc) return;
                    const cur = useEditorStore.getState().openPageId ?? openPageIdOf(doc);
                    const { doc: next, pageId } = addPage(ensurePages(doc), cur);
                    const ed = useEditorStore.getState();
                    ed.setOpenPageId(pageId);
                    ed.setSelectedNodeId(null);
                    ed.setEditingNodeId(null);
                    useProjectsStore.getState().updateOpenDocument(next);
                    ed.requestPageRename(pageId);
                  })
                }
              >
                เพิ่มหน้า
              </Item>
            </Command.Group>
            {layers.length > 0 ? (
              <Command.Group heading="เลเยอร์" className={groupCls}>
                {layers.map((row) => (
                  <Item
                    key={row.id}
                    value={`layer-${row.id}`}
                    keywords={[row.label, NODE_TYPE_LABEL[row.type], row.type, "layer"]}
                    onSelect={() => run(() => useEditorStore.getState().setSelectedNodeId(row.id))}
                  >
                    <span className="truncate">{row.label}</span>
                    <span className="ml-auto pl-2 text-[11px] text-muted-foreground">
                      {NODE_TYPE_LABEL[row.type]}
                    </span>
                  </Item>
                ))}
              </Command.Group>
            ) : null}
            <Command.Group heading="มุมมอง" className={groupCls}>
              <Item
                value="sidebar"
                keywords={["แผงเลเยอร์", "layers", "sidebar"]}
                onSelect={() => run(() => useEditorStore.getState().toggleSidebar())}
              >
                แผงเลเยอร์
                <span className="ml-auto text-[11px] text-muted-foreground">
                  {sidebar ? "แสดงอยู่" : "ซ่อนอยู่"}
                </span>
              </Item>
              {THEMES.map((t) => (
                <Item
                  key={t.pref}
                  value={`theme-${t.pref}`}
                  keywords={[t.label, t.pref, "theme", "dark", "light"]}
                  onSelect={() => run(() => setThemePref(t.pref))}
                >
                  {t.label}
                  {theme.pref === t.pref ? (
                    <span className="ml-auto text-[11px] text-muted-foreground">ใช้อยู่</span>
                  ) : null}
                </Item>
              ))}
            </Command.Group>
          </Command.List>
        </Command>
      </DialogContent>
    </Dialog>
  );
}

function Item({ children, ...props }: ComponentProps<typeof Command.Item>) {
  return (
    <Command.Item
      {...props}
      className="flex cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none data-[disabled=true]:opacity-40 data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground"
    >
      {children}
    </Command.Item>
  );
}

function Hint({ children }: { children: ReactNode }) {
  return <span className="ml-auto flex items-center gap-1">{children}</span>;
}
