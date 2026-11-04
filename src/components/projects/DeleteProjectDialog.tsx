import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useRestoreFocus } from "@/lib/modal";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectName: string;
  onConfirm: () => void | Promise<void>;
  busy?: boolean;
};

/**
 * Destructive confirm (shadcn alert-dialog). Cancel gets initial focus (Radix
 * AlertDialog default); overlay clicks never close it. ลบ is a plain Button,
 * not AlertDialogAction, so the dialog stays open while `busy` — the parent
 * closes it after the delete finishes.
 */
export function DeleteProjectDialog({ open, onOpenChange, projectName, onConfirm, busy }: Props) {
  const restoreFocus = useRestoreFocus(open);
  return (
    <AlertDialog
      open={open}
      onOpenChange={(o) => {
        if (!busy) onOpenChange(o);
      }}
    >
      <AlertDialogContent onCloseAutoFocus={restoreFocus}>
        <AlertDialogHeader>
          <AlertDialogTitle>ลบโปรเจกต์?</AlertDialogTitle>
          <AlertDialogDescription>
            การกระทำนี้ย้อนกลับไม่ได้ —{" "}
            <span className="font-medium text-foreground">{projectName}</span>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>ยกเลิก</AlertDialogCancel>
          <Button type="button" variant="destructive" disabled={busy} onClick={() => void onConfirm()}>
            ลบ
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
