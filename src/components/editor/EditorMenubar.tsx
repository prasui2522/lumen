/**
 * DW-M2 / UI-REFRESH S8 optional menubar — ไฟล์ / แก้ไข / มุมมอง.
 * Same actions as the command palette; no new business logic.
 */
import type { ReactNode } from "react";
import { Kbd } from "@/components/ui/kbd";
import {
  Menubar,
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarSeparator,
  MenubarShortcut,
  MenubarTrigger,
} from "@/components/ui/menubar";
import { redo, undo } from "@/lib/history";
import { setThemePref, useTheme, type ThemePref } from "@/lib/theme";
import { useEditorStore, type EditorMode } from "@/stores/editor-store";

export type EditorMenubarProps = {
  onSave: () => void;
  onExport: () => void;
  onBack: () => void;
  /** Disable save when clean / busy — caller decides. */
  saveDisabled?: boolean;
  exportDisabled?: boolean;
  modeDisabled?: boolean;
};

const THEMES: { pref: ThemePref; label: string }[] = [
  { pref: "system", label: "ธีม: ตามระบบ" },
  { pref: "light", label: "ธีม: สว่าง" },
  { pref: "dark", label: "ธีม: มืด" },
];

function Shortcut({ children }: { children: ReactNode }) {
  return (
    <MenubarShortcut className="flex items-center gap-0.5 opacity-70">
      {children}
    </MenubarShortcut>
  );
}

export function EditorMenubar({
  onSave,
  onExport,
  onBack,
  saveDisabled,
  exportDisabled,
  modeDisabled,
}: EditorMenubarProps) {
  const mode = useEditorStore((s) => s.mode);
  const setMode = useEditorStore((s) => s.setMode);
  const sidebar = useEditorStore((s) => s.isSidebarOpen);
  const toggleSidebar = useEditorStore((s) => s.toggleSidebar);
  const modelHistory = useEditorStore((s) => s.modelHistory);
  const inDb = mode === "database";
  const theme = useTheme();

  const goMode = (next: EditorMode) => {
    if (modeDisabled || next === mode) return;
    setMode(next);
  };

  return (
    <Menubar
      className="h-7 border-transparent bg-transparent p-0 shadow-none"
      aria-label="แถบเมนู"
    >
      <MenubarMenu>
        <MenubarTrigger className="h-7 px-2 text-xs font-medium">ไฟล์</MenubarTrigger>
        <MenubarContent align="start" className="min-w-48">
          <MenubarItem disabled={saveDisabled} onSelect={() => onSave()}>
            บันทึก
            <Shortcut>
              <Kbd>Ctrl</Kbd>
              <Kbd>S</Kbd>
            </Shortcut>
          </MenubarItem>
          <MenubarItem disabled={exportDisabled} onSelect={() => onExport()}>
            ส่งออก
          </MenubarItem>
          <MenubarSeparator />
          <MenubarItem onSelect={() => onBack()}>กลับไปรายการโปรเจกต์</MenubarItem>
        </MenubarContent>
      </MenubarMenu>

      <MenubarMenu>
        <MenubarTrigger className="h-7 px-2 text-xs font-medium">แก้ไข</MenubarTrigger>
        <MenubarContent align="start" className="min-w-48">
          <MenubarItem
            disabled={inDb && !modelHistory?.canUndo}
            onSelect={() => (inDb ? modelHistory?.undo() : void undo())}
          >
            เลิกทำ
            <Shortcut>
              <Kbd>Ctrl</Kbd>
              <Kbd>Z</Kbd>
            </Shortcut>
          </MenubarItem>
          <MenubarItem
            disabled={inDb && !modelHistory?.canRedo}
            onSelect={() => (inDb ? modelHistory?.redo() : void redo())}
          >
            ทำซ้ำ
            <Shortcut>
              <Kbd>Ctrl</Kbd>
              <Kbd>Shift</Kbd>
              <Kbd>Z</Kbd>
            </Shortcut>
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>

      <MenubarMenu>
        <MenubarTrigger className="h-7 px-2 text-xs font-medium">มุมมอง</MenubarTrigger>
        <MenubarContent align="start" className="min-w-52">
          <MenubarItem disabled={modeDisabled} onSelect={() => goMode("design")}>
            ออกแบบ
            {mode === "design" ? <MenubarShortcut>✓</MenubarShortcut> : null}
          </MenubarItem>
          <MenubarItem disabled={modeDisabled} onSelect={() => goMode("split")}>
            แยก
            {mode === "split" ? <MenubarShortcut>✓</MenubarShortcut> : null}
          </MenubarItem>
          <MenubarItem disabled={modeDisabled} onSelect={() => goMode("code")}>
            โค้ด
            {mode === "code" ? <MenubarShortcut>✓</MenubarShortcut> : null}
          </MenubarItem>
          <MenubarItem disabled={modeDisabled} onSelect={() => goMode("preview")}>
            ตัวอย่าง
            {mode === "preview" ? <MenubarShortcut>✓</MenubarShortcut> : null}
          </MenubarItem>
          <MenubarItem disabled={modeDisabled} onSelect={() => goMode("database")}>
            ฐานข้อมูล
            {mode === "database" ? <MenubarShortcut>✓</MenubarShortcut> : null}
          </MenubarItem>
          <MenubarSeparator />
          <MenubarItem
            disabled={mode !== "design"}
            onSelect={() => toggleSidebar()}
          >
            {sidebar ? "ซ่อนแผงเลเยอร์" : "แสดงแผงเลเยอร์"}
          </MenubarItem>
          <MenubarSeparator />
          {THEMES.map((t) => (
            <MenubarItem key={t.pref} onSelect={() => setThemePref(t.pref)}>
              {t.label}
              {theme.pref === t.pref ? <MenubarShortcut>✓</MenubarShortcut> : null}
            </MenubarItem>
          ))}
        </MenubarContent>
      </MenubarMenu>
    </Menubar>
  );
}
