/**
 * DW-M2 / UI-REFRESH S8 optional menubar — ไฟล์ / แก้ไข / มุมมอง.
 * Same actions as the command palette; no new business logic.
 */
import type { ReactNode } from "react";
import { Redo2, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { redo, undo } from "@/lib/history";
import { setLocale, useLocale, type Locale } from "@/lib/locale";
import { useT } from "@/lib/messages";
import { setThemePref, useTheme, type ThemePref } from "@/lib/theme";
import { useEditorStore, type EditorMode } from "@/stores/editor-store";

export type EditorMenubarProps = {
  onSave: () => void;
  onExport: () => void;
  onOpenSite?: () => void;
  onBack: () => void;
  /** Disable save when clean / busy — caller decides. */
  saveDisabled?: boolean;
  exportDisabled?: boolean;
  modeDisabled?: boolean;
};

const THEME_PREFS: ThemePref[] = ["system", "light", "dark"];

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
  onOpenSite,
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
  const pastLen = useEditorStore((s) => s.past.length);
  const futureLen = useEditorStore((s) => s.future.length);
  const inDb = mode === "database";
  const canUndo = inDb ? !!modelHistory?.canUndo : pastLen > 0;
  const canRedo = inDb ? !!modelHistory?.canRedo : futureLen > 0;
  const doUndo = () => (inDb ? modelHistory?.undo() : void undo());
  const doRedo = () => (inDb ? modelHistory?.redo() : void redo());
  const theme = useTheme();
  const locale = useLocale();
  const t = useT();
  const themeLabel = (pref: ThemePref) =>
    pref === "light" ? t("themeLight") : pref === "dark" ? t("themeDark") : t("themeSystem");

  const goMode = (next: EditorMode) => {
    if (modeDisabled || next === mode) return;
    setMode(next);
  };

  return (
    <div className="flex items-center gap-0.5">
    <Menubar
      className="h-7 border-transparent bg-transparent p-0 shadow-none"
      aria-label={t("menubar")}
    >
      <MenubarMenu>
        <MenubarTrigger className="h-7 px-2 text-xs font-medium">{t("file")}</MenubarTrigger>
        <MenubarContent align="start" className="min-w-48">
          <MenubarItem disabled={saveDisabled} onSelect={() => onSave()}>
            {t("save")}
            <Shortcut>
              <Kbd>Ctrl</Kbd>
              <Kbd>S</Kbd>
            </Shortcut>
          </MenubarItem>
          <MenubarItem disabled={exportDisabled} onSelect={() => onExport()}>
            {t("export")}
          </MenubarItem>
          <MenubarItem disabled={!onOpenSite} onSelect={() => onOpenSite?.()}>
            {t("openFolder")}
          </MenubarItem>
          <MenubarSeparator />
          <MenubarItem onSelect={() => onBack()}>{t("backToProjects")}</MenubarItem>
        </MenubarContent>
      </MenubarMenu>

      <MenubarMenu>
        <MenubarTrigger className="h-7 px-2 text-xs font-medium">{t("edit")}</MenubarTrigger>
        <MenubarContent align="start" className="min-w-48">
          <MenubarItem disabled={!canUndo} onSelect={() => doUndo()}>
            {t("undo")}
            <Shortcut>
              <Kbd>Ctrl</Kbd>
              <Kbd>Z</Kbd>
            </Shortcut>
          </MenubarItem>
          <MenubarItem disabled={!canRedo} onSelect={() => doRedo()}>
            {t("redo")}
            <Shortcut>
              <Kbd>Ctrl</Kbd>
              <Kbd>Shift</Kbd>
              <Kbd>Z</Kbd>
            </Shortcut>
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>

      <MenubarMenu>
        <MenubarTrigger className="h-7 px-2 text-xs font-medium">{t("view")}</MenubarTrigger>
        <MenubarContent align="start" className="min-w-52">
          <MenubarItem disabled={modeDisabled} onSelect={() => goMode("design")}>
            {t("design")}
            {mode === "design" ? <MenubarShortcut>✓</MenubarShortcut> : null}
          </MenubarItem>
          <MenubarItem disabled={modeDisabled} onSelect={() => goMode("split")}>
            {t("split")}
            {mode === "split" ? <MenubarShortcut>✓</MenubarShortcut> : null}
          </MenubarItem>
          <MenubarItem disabled={modeDisabled} onSelect={() => goMode("code")}>
            {t("code")}
            {mode === "code" ? <MenubarShortcut>✓</MenubarShortcut> : null}
          </MenubarItem>
          <MenubarItem disabled={modeDisabled} onSelect={() => goMode("preview")}>
            {t("preview")}
            {mode === "preview" ? <MenubarShortcut>✓</MenubarShortcut> : null}
          </MenubarItem>
          <MenubarItem disabled={modeDisabled} onSelect={() => goMode("database")}>
            {t("database")}
            {mode === "database" ? <MenubarShortcut>✓</MenubarShortcut> : null}
          </MenubarItem>
          <MenubarSeparator />
          <MenubarItem
            disabled={mode !== "design"}
            onSelect={() => toggleSidebar()}
          >
            {sidebar ? t("hideLayers") : t("showLayers")}
          </MenubarItem>
          <MenubarSeparator />
          {THEME_PREFS.map((pref) => (
            <MenubarItem key={pref} onSelect={() => setThemePref(pref)}>
              {themeLabel(pref)}
              {theme.pref === pref ? <MenubarShortcut>✓</MenubarShortcut> : null}
            </MenubarItem>
          ))}
          <MenubarSeparator />
          {(["th", "en"] as Locale[]).map((code) => (
            <MenubarItem key={code} onSelect={() => setLocale(code)}>
              {code === "th" ? t("languageThai") : t("languageEnglish")}
              {locale === code ? <MenubarShortcut>✓</MenubarShortcut> : null}
            </MenubarItem>
          ))}
        </MenubarContent>
      </MenubarMenu>
    </Menubar>
    <span className="mx-0.5 inline-flex h-4 shrink-0 items-stretch" aria-hidden>
      <span className="w-px bg-border" />
    </span>
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          disabled={!canUndo}
          aria-label={t("undo")}
          onClick={() => doUndo()}
        >
          <Undo2 className="size-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{t("undo")}</TooltipContent>
    </Tooltip>
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          disabled={!canRedo}
          aria-label={t("redo")}
          onClick={() => doRedo()}
        >
          <Redo2 className="size-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{t("redo")}</TooltipContent>
    </Tooltip>
    </div>
  );
}
