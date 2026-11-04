import { useMemo, useRef, useState } from "react";
import { Command } from "cmdk";
import { Files } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { FieldRow } from "@/components/editor/style/FieldRow";
import { checkButtonHref, missingPageWarning, type LinkPage } from "@/lib/link-target";
import type { PageDocument } from "@/schema";
import { useProjectsStore } from "@/stores/projects-store";
import { cn } from "@/lib/utils";

type Props = {
  id: string;
  value: string;
  disabled: boolean;
  /** Called with the validated href ("" = cleared). Rejected schemes do not call this. */
  onCommit: (href: string) => void;
  /** When set, wraps controls in a FieldRow with this label. Omit for embedded rows. */
  label?: string;
  className?: string;
  /** F2 D6: accessible name for the URL input in multi-row editors. */
  ariaLabel?: string;
};

const SEP = "\u0000";
const ROW = "\u0001";

function pagesKey(doc: PageDocument | null | undefined): string {
  const pages = doc?.pages;
  if (!pages || pages.length === 0) return ["home", "หน้าแรก", "/"].join(SEP);
  return pages.map((p, i) => [p.id, p.name, i === 0 ? "/" : p.path].join(SEP)).join(ROW);
}

function parsePagesKey(key: string): LinkPage[] {
  return key.split(ROW).map((row) => {
    const [id = "", name = "", path = ""] = row.split(SEP);
    return { id, name, path };
  });
}

/**
 * URL / page path input + icon `เลือกหน้า` picker (PHASE-9-SPEC §3).
 * Shared by button/link `ลิงก์ปลายทาง`, breadcrumb / navigationMenu, and menubar items.
 */
export function HrefField({ id, value, disabled, onCommit, label, className, ariaLabel }: Props) {
  const key = useProjectsStore((s) => pagesKey(s.openDocument));
  const pages = useMemo(() => parsePagesKey(key), [key]);
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const msgId = `${id}-msg`;

  const apply = (raw: string): boolean => {
    const r = checkButtonHref(raw, pages);
    if (r.kind === "reject") {
      setError(r.error);
      return false;
    }
    setError(null);
    const next = r.kind === "clear" ? "" : r.href;
    if (next !== value) onCommit(next);
    return true;
  };

  const commit = () => {
    if (draft === null) return;
    if (draft.trim() === value.trim()) {
      setDraft(null);
      setError(null);
      return;
    }
    if (apply(draft)) setDraft(null);
  };

  const discard = () => {
    setDraft(null);
    setError(null);
  };

  const onOpenChange = (o: boolean) => setOpen(o && !disabled);
  if (open && disabled) setOpen(false);

  const warning = error ? null : missingPageWarning(value, pages);
  const message = error ?? warning;

  const controls = (
    <>
      <Input
        aria-label={ariaLabel}
        ref={inputRef}
        id={id}
        value={draft ?? value}
        disabled={disabled}
        placeholder="/หน้า หรือ https://…"
        spellCheck={false}
        aria-invalid={error ? true : undefined}
        aria-describedby={message ? msgId : undefined}
        className={cn("h-7 min-w-0 flex-1 px-2 font-mono text-xs md:text-xs", className)}
        onChange={(e) => setDraft(e.currentTarget.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          else if (e.key === "Escape") {
            e.preventDefault();
            discard();
          }
        }}
      />
      <Popover open={open} onOpenChange={onOpenChange}>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <Button type="button" variant="ghost" size="icon-xs" aria-label="เลือกหน้า" disabled={disabled}>
                <Files className="size-3.5" />
              </Button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent>เลือกหน้า</TooltipContent>
        </Tooltip>
        <PopoverContent
          align="end"
          className="w-60 gap-0 p-0"
          aria-label="เลือกหน้า"
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            inputRef.current?.focus();
          }}
        >
          <Command label="เลือกหน้า" className="flex flex-col">
            <Command.Input
              placeholder="ค้นหาหน้า…"
              className="h-8 border-b border-border bg-transparent px-2.5 text-xs outline-none placeholder:text-muted-foreground"
            />
            <Command.List className="scrollbar-thin max-h-60 overflow-auto p-1">
              <Command.Empty className="py-4 text-center text-xs text-muted-foreground">ไม่พบหน้า</Command.Empty>
              {pages.map((p) => (
                <Command.Item
                  key={p.id}
                  value={p.path}
                  keywords={[p.name]}
                  onSelect={() => {
                    setOpen(false);
                    setDraft(null);
                    apply(p.path);
                  }}
                  className="flex cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-xs outline-none data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground"
                >
                  <span className="truncate">{p.name}</span>
                  <span className="ml-auto shrink-0 pl-2 font-mono text-[11px] text-muted-foreground">{p.path}</span>
                </Command.Item>
              ))}
            </Command.List>
          </Command>
        </PopoverContent>
      </Popover>
    </>
  );

  if (label === undefined) {
    return (
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex min-w-0 items-center gap-1">{controls}</div>
        {message ? (
          <p id={msgId} className="text-[11px] leading-4 text-destructive">
            {message}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <FieldRow
      id={id}
      label={label}
      overridden={false}
      locked={disabled}
      footer={
        message ? (
          <p id={msgId} className="text-[11px] leading-4 text-destructive">
            {message}
          </p>
        ) : undefined
      }
    >
      {controls}
    </FieldRow>
  );
}
