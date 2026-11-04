import { Database, Eye, PenLine } from "lucide-react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useEditorStore, type EditorMode } from "@/stores/editor-store";

type Props = {
  disabled?: boolean;
};

const ITEM =
  "gap-1.5 px-2.5 text-muted-foreground hover:bg-transparent hover:text-foreground data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-sm focus-visible:ring-2";

/**
 * Design / Preview / Database (Phase 10) switch (UI-REFRESH S2): Radix ToggleGroup type="single"
 * → role="group" with radio items, one Tab stop, ←/→ to move, Space/Enter to
 * select. Clicking the active item emits "" → ignored (no deselect).
 */
export function ModeSwitch({ disabled }: Props) {
  const mode = useEditorStore((s) => s.mode);
  const setMode = useEditorStore((s) => s.setMode);

  const select = (next: EditorMode) => {
    if (disabled || next === mode) return;
    setMode(next);
  };

  return (
    <ToggleGroup
      type="single"
      size="sm"
      spacing={0}
      value={mode}
      onValueChange={(v) => v && select(v as EditorMode)}
      disabled={disabled}
      aria-label="โหมดแก้ไข"
      className="gap-0.5 rounded-lg bg-muted p-0.5"
    >
      <ToggleGroupItem value="design" className={`${ITEM} rounded-md!`}>
        <PenLine className="size-3.5" aria-hidden />
        <span>ออกแบบ</span>
      </ToggleGroupItem>
      <ToggleGroupItem value="preview" className={`${ITEM} rounded-md!`}>
        <Eye className="size-3.5" aria-hidden />
        <span>ตัวอย่าง</span>
      </ToggleGroupItem>
      <ToggleGroupItem value="database" className={`${ITEM} rounded-md!`}>
        <Database className="size-3.5" aria-hidden />
        <span>ฐานข้อมูล</span>
      </ToggleGroupItem>
    </ToggleGroup>
  );
}
