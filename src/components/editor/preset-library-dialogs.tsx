/**
 * Phase 11 C7: save / delete preset dialogs (lazy, kept out of `preset-picker` budget).
 */
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { Node } from "@/schema";
import type { StylePreset } from "@/lib/presets-registry";
import { capturePresetFromNode } from "@/lib/preset-capture";
import { libraryDelete, libraryPut } from "@/lib/library-api";
import { useEditorStore } from "@/stores/editor-store";
import { toast } from "@/lib/toast";

/** T122 */
export const PRESET_SAVE_LABEL = "บันทึกเป็นพรีเซ็ต";
/** T123 */
export const PRESET_NAME_LABEL = "ชื่อพรีเซ็ต";
/** T124 */
export const PRESET_SAVED_MSG = "บันทึกพรีเซ็ตแล้ว";
/** T125 */
export const PRESET_DELETE_CONFIRM = (name: string) => `ลบพรีเซ็ต ${name}?`;
/** T134 */
export const PRESET_DELETED_MSG = "ลบพรีเซ็ตแล้ว";

export function PresetSaveDialog({
  open,
  onOpenChange,
  node,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  node: Node;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const announce = useEditorStore((s) => s.announce);

  useEffect(() => {
    if (open) setName("");
  }, [open]);

  const commit = async () => {
    const preset = capturePresetFromNode(node, name);
    if (!preset) {
      toast.error("ไม่มีสไตล์ที่จะบันทึก");
      return;
    }
    try {
      await libraryPut(preset.id, preset.name, JSON.stringify(preset));
      announce(PRESET_SAVED_MSG);
      onOpenChange(false);
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-sm"
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          inputRef.current?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>{PRESET_SAVE_LABEL}</DialogTitle>
        </DialogHeader>
        <label className="text-xs text-muted-foreground" htmlFor="preset-save-name">
          {PRESET_NAME_LABEL}
        </label>
        <Input
          ref={inputRef}
          id="preset-save-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void commit();
            }
          }}
          className="h-8"
        />
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            ยกเลิก
          </Button>
          <Button type="button" onClick={() => void commit()} disabled={!name.trim()}>
            บันทึก
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function PresetDeleteDialog({
  target,
  onOpenChange,
  onDeleted,
}: {
  target: StylePreset | null;
  onOpenChange: (v: boolean) => void;
  onDeleted: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const announce = useEditorStore((s) => s.announce);

  const commit = async () => {
    if (!target) return;
    try {
      await libraryDelete(target.id);
      announce(PRESET_DELETED_MSG);
      onOpenChange(false);
      onDeleted();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <AlertDialog
      open={target !== null}
      onOpenChange={(o) => {
        if (!o) onOpenChange(false);
      }}
    >
      <AlertDialogContent
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          cancelRef.current?.focus();
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>
            {target ? PRESET_DELETE_CONFIRM(target.name) : ""}
          </AlertDialogTitle>
          <AlertDialogDescription>
            การลบเอาพรีเซ็ตออกจากเครื่องนี้เท่านั้น องค์ประกอบที่ใช้ไปแล้วไม่เปลี่ยน
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <Button
            type="button"
            ref={cancelRef}
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            ยกเลิก
          </Button>
          <Button type="button" variant="destructive" onClick={() => void commit()}>
            ลบ
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
