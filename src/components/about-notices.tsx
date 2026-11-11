/**
 * Phase 11 D1: lazy About + third-party notices dialog (T167 / T168).
 * Chunk name should stay `about-notices`. Also hosts Check for updates.
 */
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { checkForAppUpdate, installAppUpdate, type UpdateCheck } from "@/lib/app-updater";
import { usePhrase } from "@/lib/phrases";
import noticesMd from "../../THIRD-PARTY-NOTICES.md?raw";

/** T167 — Thai source string; UI uses `phrase()`. */
export const ABOUT_LABEL = "เกี่ยวกับ";
/** T168 */
export const NOTICES_LABEL = "ประกาศบุคคลที่สาม";
export const CHECK_UPDATES_LABEL = "ตรวจหาอัปเดต";

export function AboutMenu() {
  const [noticesOpen, setNoticesOpen] = useState(false);
  const [updateOpen, setUpdateOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<UpdateCheck | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const p = usePhrase();
  const about = p(ABOUT_LABEL);
  const notices = p(NOTICES_LABEL);
  const checkLabel = p(CHECK_UPDATES_LABEL);

  const runCheck = () => {
    setUpdateOpen(true);
    setBusy(true);
    setResult(null);
    void checkForAppUpdate().then((r) => {
      setResult(r);
      setBusy(false);
    });
  };

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
                aria-label={about}
              >
                {about}
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent>{about}</TooltipContent>
        </Tooltip>
        <DropdownMenuContent align="end" className="min-w-44">
          <DropdownMenuItem
            onSelect={() => {
              runCheck();
            }}
          >
            {checkLabel}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={() => {
              setNoticesOpen(true);
            }}
          >
            {notices}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <NoticesDialog
        open={noticesOpen}
        onOpenChange={(v) => {
          setNoticesOpen(v);
          if (!v) requestAnimationFrame(() => triggerRef.current?.focus());
        }}
      />

      <UpdateDialog
        open={updateOpen}
        busy={busy}
        result={result}
        onOpenChange={(v) => {
          setUpdateOpen(v);
          if (!v) {
            setResult(null);
            setBusy(false);
            requestAnimationFrame(() => triggerRef.current?.focus());
          }
        }}
        onInstall={async () => {
          if (!result || result.kind !== "available") return;
          setBusy(true);
          try {
            await installAppUpdate(result.update);
          } catch (e) {
            setResult({
              kind: "error",
              message: e instanceof Error ? e.message : String(e),
            });
            setBusy(false);
          }
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
  const p = usePhrase();

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
          <DialogTitle>{p(NOTICES_LABEL)}</DialogTitle>
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
            {p("ปิด")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function UpdateDialog({
  open,
  busy,
  result,
  onOpenChange,
  onInstall,
}: {
  open: boolean;
  busy: boolean;
  result: UpdateCheck | null;
  onOpenChange: (v: boolean) => void;
  onInstall: () => void;
}) {
  const p = usePhrase();
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open || busy) return;
    requestAnimationFrame(() => closeRef.current?.focus());
  }, [open, busy, result]);

  let title = p(CHECK_UPDATES_LABEL);
  let body: string | null = busy ? p("กำลังตรวจหาอัปเดต…") : null;
  let showInstall = false;

  if (!busy && result) {
    if (result.kind === "upToDate") {
      title = p("ใช้เวอร์ชันล่าสุดแล้ว");
      body = `${p("เวอร์ชันปัจจุบัน")} ${result.current}`;
    } else if (result.kind === "available") {
      title = p("มีอัปเดตใหม่");
      body = `${p("อัปเดตเป็นเวอร์ชัน")} ${result.update.version} (${p("เวอร์ชันปัจจุบัน")} ${result.current})`;
      showInstall = true;
    } else {
      title = p("ตรวจหาอัปเดตไม่สำเร็จ");
      const endpointHint =
        result.message.includes("OWNER") ||
        result.message.includes("404") ||
        result.message.includes("error sending request") ||
        result.message.includes("Failed to fetch");
      body = endpointHint
        ? `${p("ตั้งค่าที่เก็บรีลีสใน docs/UPDATER.md ก่อน")}\n${result.message}`
        : result.message;
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" onCloseAutoFocus={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {body ? (
            <DialogDescription className="whitespace-pre-wrap break-words">{body}</DialogDescription>
          ) : null}
        </DialogHeader>
        <DialogFooter>
          <Button
            ref={closeRef}
            type="button"
            variant="outline"
            disabled={busy && showInstall}
            onClick={() => onOpenChange(false)}
          >
            {p("ปิด")}
          </Button>
          {showInstall ? (
            <Button type="button" disabled={busy} onClick={() => void onInstall()}>
              {busy ? p("กำลังตรวจหาอัปเดต…") : p("ดาวน์โหลดและติดตั้ง")}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function AboutNoticesLazyAnchor() {
  return null;
}
