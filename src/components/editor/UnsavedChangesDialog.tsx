import { useRef } from "react";
import { Loader2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { useRestoreFocus } from "@/lib/modal";

/** What the user was doing when the guard fired. */
export type LeaveIntent = "navigate" | "close" | "reload";

type Props = {
  open: boolean;
  saving: boolean;
  intent: LeaveIntent;
  onSave: () => void;
  onDiscard: () => void;
  onCancel: () => void;
};

const DESCRIPTION: Record<LeaveIntent, string> = {
  navigate: "มีการแก้ไขที่ยังไม่ได้บันทึก ถ้าออกโดยไม่บันทึก การแก้ไขจะหายไป",
  close: "มีการแก้ไขที่ยังไม่ได้บันทึก ถ้าปิดโดยไม่บันทึก การแก้ไขจะหายไป",
  reload: "มีการแก้ไขที่ยังไม่ได้บันทึก ถ้าโหลดใหม่โดยไม่บันทึก การแก้ไขจะหายไป",
};

/**
 * Confirm-on-leave with unsaved changes (shadcn alert-dialog):
 * บันทึก (save, then leave) / ไม่บันทึก (discard, leave) / ยกเลิก (stay).
 * Fully controlled by EditorPage. All three actions are plain Buttons, so
 * Radix never auto-closes: บันทึก keeps the dialog open (with a spinner)
 * until the save finishes, and a failed save leaves it open. Esc and ยกเลิก
 * cancel; the overlay does not close it (AlertDialog default). ยกเลิก takes
 * initial focus (spec §7.9).
 */
export function UnsavedChangesDialog({ open, saving, intent, onSave, onDiscard, onCancel }: Props) {
  const restoreFocus = useRestoreFocus(open);
  const cancelRef = useRef<HTMLButtonElement>(null);
  return (
    <AlertDialog
      open={open}
      onOpenChange={(o) => {
        if (!o && !saving) onCancel();
      }}
    >
      <AlertDialogContent
        onCloseAutoFocus={restoreFocus}
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          cancelRef.current?.focus();
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>บันทึกการเปลี่ยนแปลงไหม</AlertDialogTitle>
          <AlertDialogDescription>{DESCRIPTION[intent]}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <Button type="button" ref={cancelRef} variant="outline" disabled={saving} onClick={onCancel}>
            ยกเลิก
          </Button>
          <Button type="button" variant="outline" disabled={saving} onClick={onDiscard}>
            ไม่บันทึก
          </Button>
          <Button type="button" disabled={saving} onClick={onSave}>
            {saving ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
            บันทึก
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
