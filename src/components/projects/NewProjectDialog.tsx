import { useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRestoreFocus } from "@/lib/modal";
import { nameSubmit } from "@/lib/new-project";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Resolve `false` when the create failed (the form unlocks); anything else keeps it locked until it reopens. */
  onSubmit: (name: string) => void | boolean | Promise<void | boolean>;
  busy?: boolean;
};

export function NewProjectDialog({
  open,
  onOpenChange,
  onSubmit,
  busy,
}: Props) {
  const [name, setName] = useState("หน้าใหม่");
  const [invalid, setInvalid] = useState(false);
  const restoreFocus = useRestoreFocus(open);
  const errId = "project-name-error";
  // A submit in flight: set synchronously, so a second Enter before the parent's
  // `busy` re-renders, or after it clears while the dialog closes, is ignored.
  // Cleared when the dialog reopens or the parent reports a failed create.
  const pending = useRef(false);
  const [sending, setSending] = useState(false);
  const locked = busy || sending;
  const unlock = () => {
    pending.current = false;
    setSending(false);
  };

  useEffect(() => {
    if (open) {
      setName("หน้าใหม่");
      setInvalid(false);
      unlock();
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" onCloseAutoFocus={restoreFocus}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const r = nameSubmit(name, busy || pending.current);
            if (r.kind === "ignore") return;
            if (r.kind === "invalid") {
              setInvalid(true);
              return;
            }
            setInvalid(false);
            pending.current = true;
            setSending(true);
            Promise.resolve(onSubmit(r.name)).then(
              (ok) => ok === false && unlock(),
              unlock,
            );
          }}
        >
          <DialogHeader>
            <DialogTitle>โปรเจกต์ใหม่</DialogTitle>
          </DialogHeader>
          <div className="mt-4 space-y-2">
            <Label htmlFor="project-name">ชื่อโปรเจกต์</Label>
            <Input
              id="project-name"
              value={name}
              onChange={(e) => {
                setName(e.currentTarget.value);
                if (e.currentTarget.value.trim()) setInvalid(false);
              }}
              placeholder="ชื่อโปรเจกต์"
              autoFocus
              // Busy: stays focusable (disabled would drop focus to <body>).
              readOnly={locked}
              aria-disabled={locked || undefined}
              className="aria-disabled:opacity-50"
              aria-invalid={invalid || undefined}
              aria-describedby={invalid ? errId : undefined}
            />
            {invalid ? (
              <p id={errId} className="text-[11px] text-destructive">
                กรุณาใส่ชื่อโปรเจกต์
              </p>
            ) : null}
          </div>
          <DialogFooter className="mt-6">
            <Button
              type="button"
              variant="outline"
              onClick={() => !locked && onOpenChange(false)}
              aria-disabled={locked || undefined}
              className="aria-disabled:opacity-50"
            >
              ยกเลิก
            </Button>
            <Button type="submit" aria-disabled={locked || undefined} className="aria-disabled:opacity-50">
              สร้าง
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
