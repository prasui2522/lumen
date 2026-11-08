import { Code2, Columns2, Database, Eye, PenLine } from "lucide-react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useEditorStore, type EditorMode } from "@/stores/editor-store";

type Props = {
  disabled?: boolean;
};

const ITEM =
  "gap-1.5 px-2 text-muted-foreground hover:bg-transparent hover:text-foreground data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-sm focus-visible:ring-2";

/**
 * Design / Split / Code / Preview (PREVIEW-CODE-VIEW §3) / Database (Phase 10).
 * Radix ToggleGroup type="single" → one Tab stop, ←/→ to move.
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
      data-kbd-pane="mode"
      className="gap-0.5 rounded-lg bg-muted p-0.5"
    >
      <ToggleGroupItem value="design" className={`${ITEM} rounded-md!`}>
        <PenLine className="size-3.5" aria-hidden />
        <span>ออกแบบ</span>
      </ToggleGroupItem>
      <ToggleGroupItem value="split" className={`${ITEM} rounded-md!`}>
        <Columns2 className="size-3.5" aria-hidden />
        <span>แยก</span>
      </ToggleGroupItem>
      <ToggleGroupItem value="code" className={`${ITEM} rounded-md!`}>
        <Code2 className="size-3.5" aria-hidden />
        <span>โค้ด</span>
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
