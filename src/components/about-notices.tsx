/**
 * Phase 11 D1: lazy About + third-party notices dialog (T167 / T168).
 * Chunk name should stay `about-notices`.
 */
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import noticesMd from "../../THIRD-PARTY-NOTICES.md?raw";

/** T167 */
export const ABOUT_LABEL = "เกี่ยวกับ";
/** T168 */
export const NOTICES_LABEL = "ประกาศบุคคลที่สาม";

export function AboutMenu() {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button
                ref={triggerRef}
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 px-2 text-xs"
                aria-label={ABOUT_LABEL}
              >
                {ABOUT_LABEL}
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent>{ABOUT_LABEL}</TooltipContent>
        </Tooltip>
        <DropdownMenuContent align="end" className="min-w-44">
          <DropdownMenuItem
            onSelect={() => {
              setOpen(true);
            }}
          >
            {NOTICES_LABEL}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <NoticesDialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) requestAnimationFrame(() => triggerRef.current?.focus());
        }}
      />
    </>
  );
}

function NoticesDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() => closeRef.current?.focus());
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex max-h-[80vh] w-[min(40rem,92vw)] flex-col gap-3 sm:max-w-2xl"
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>{NOTICES_LABEL}</DialogTitle>
        </DialogHeader>
        <pre className="scrollbar-thin min-h-0 flex-1 overflow-auto whitespace-pre-wrap rounded-md border border-border bg-muted/40 p-3 font-mono text-[11px] leading-relaxed text-foreground">
          {noticesMd}
        </pre>
        <div className="flex justify-end">
          <Button
            ref={closeRef}
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            ปิด
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function AboutNoticesLazyAnchor() {
  return null;
}
