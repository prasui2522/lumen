import { useEffect, useRef, useState, type ComponentType } from "react";
import {
  BookOpen,
  Columns3,
  Laptop,
  Maximize,
  Monitor,
  RotateCw,
  SeparatorVertical,
  SlidersHorizontal,
  Smartphone,
  SquareDashed,
  Tablet,
  ChevronDown,
  CheckIcon,
} from "lucide-react";
import { Select as SelectPrimitive } from "radix-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Toggle } from "@/components/ui/toggle";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  clampCustom,
  deviceById,
  DEVICES,
  effectiveSize,
  MULTI_DEVICES,
  MULTI_MAX,
  type DeviceGroup,
  type DeviceIcon,
  type DeviceId,
  type DevicePreset,
} from "@/lib/devices";
import {
  usePreviewDeviceStore,
  usePreviewScale,
  type PreviewZoom,
} from "@/stores/preview-device-store";
import { useEditorStore } from "@/stores/editor-store";
import { useProjectsStore } from "@/stores/projects-store";
import { isDocumentEmpty } from "@/components/editor/node-view";
import { ViteRunButton } from "@/components/editor/preview/ViteRunButton";
import { displayPerfWarning } from "@/lib/announce-i18n";
import { usePhrase } from "@/lib/phrases";

const ICONS: Record<DeviceIcon, ComponentType<{ className?: string }>> = {
  fill: Maximize,
  desktop: Monitor,
  laptop: Laptop,
  tablet: Tablet,
  phone: Smartphone,
  fold: BookOpen,
  custom: SquareDashed,
};

const GROUPS: { id: DeviceGroup; label?: string }[] = [
  { id: "general", label: "ทั่วไป" },
  { id: "handheld", label: "มือถือและแท็บเล็ต" },
  { id: "fold", label: "จอพับ" },
  { id: "custom" },
];

const ROTATE_HINT = "ใช้ได้กับแท็บเล็ต มือถือ และจอพับ";

/** Select row: icon + label are the ItemText (shown in the trigger, used for Thai typeahead); size sits outside it. */
function DeviceItem({ dev }: { dev: DevicePreset }) {
  const Icon = ICONS[dev.icon];
  const p = usePhrase();
  const label = p(dev.label);
  return (
    <SelectPrimitive.Item
      value={dev.id}
      textValue={label}
      data-slot="select-item"
      className="relative flex w-full cursor-pointer items-center gap-1.5 rounded-md py-1 pr-8 pl-1.5 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50"
    >
      <span className="pointer-events-none absolute right-2 flex size-4 items-center justify-center">
        <SelectPrimitive.ItemIndicator>
          <CheckIcon className="pointer-events-none size-4" />
        </SelectPrimitive.ItemIndicator>
      </span>
      <SelectPrimitive.ItemText>
        <Icon className="size-4 shrink-0 text-muted-foreground" />
        {label}
      </SelectPrimitive.ItemText>
      {dev.w ? (
        <span className="ml-auto pl-3 text-xs text-muted-foreground tabular-nums">
          {dev.w}×{dev.h}
        </span>
      ) : null}
    </SelectPrimitive.Item>
  );
}

function IconTip({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

/** Custom W × H (§3): commit on Enter/blur, clamp 240–3840, Esc restores. Not a document edit. */
function CustomSizeInputs({
  disabled,
  wRef,
}: {
  disabled: boolean;
  wRef: React.RefObject<HTMLInputElement | null>;
}) {
  const p = usePhrase();
  const w = usePreviewDeviceStore((s) => s.custom.w);
  const h = usePreviewDeviceStore((s) => s.custom.h);
  const setCustom = usePreviewDeviceStore((s) => s.setCustom);
  const [dw, setDw] = useState(String(w));
  const [dh, setDh] = useState(String(h));
  useEffect(() => setDw(String(w)), [w]);
  useEffect(() => setDh(String(h)), [h]);

  const commit = (axis: "w" | "h", raw: string) => {
    const n = Number.parseInt(raw, 10);
    if (!Number.isFinite(n)) {
      // Invalid → keep the last committed value.
      if (axis === "w") setDw(String(w));
      else setDh(String(h));
      return;
    }
    const c = clampCustom(n);
    if (axis === "w") setDw(String(c));
    else setDh(String(c));
    setCustom(axis === "w" ? { w: c, h } : { w, h: c });
  };

  const field = (axis: "w" | "h") => {
    const value = axis === "w" ? dw : dh;
    const set = axis === "w" ? setDw : setDh;
    const committed = axis === "w" ? w : h;
    return (
      <Input
        ref={axis === "w" ? wRef : undefined}
        type="number"
        inputMode="numeric"
        min={240}
        max={3840}
        step={1}
        disabled={disabled}
        aria-label={axis === "w" ? p("ความกว้าง (px)") : p("ความสูง (px)")}
        value={value}
        onChange={(e) => set(e.currentTarget.value)}
        onBlur={(e) => commit(axis, e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit(axis, e.currentTarget.value);
          } else if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            set(String(committed));
          }
        }}
        className="h-7 w-16 px-1.5 text-xs tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
    );
  };

  return (
    <span className="flex items-center gap-1">
      {field("w")}
      <span className="text-xs text-muted-foreground" aria-hidden>
        ×
      </span>
      {field("h")}
    </span>
  );
}

/**
 * Open page name (read-only), so Preview shows which page a page link opened.
 * String selector: re-renders only when the open page or its name changes.
 */
function OpenPageName({ compact }: { compact: boolean }) {
  const p = usePhrase();
  const name = useProjectsStore((s) => {
    const d = s.openDocument;
    if (!d) return null;
    const pages = d.pages;
    if (!pages || pages.length === 0) return "__home__";
    return (pages.find((p) => p.root === d.root) ?? pages[0]).name;
  });
  if (!name) return null;
  const shown = name === "__home__" ? p("หน้าแรก") : name;
  return (
    <span
      className={cn(
        "shrink-0 truncate text-xs text-muted-foreground",
        compact ? "max-w-24" : "max-w-40",
      )}
      title={shown}
    >
      <span className="sr-only">{p("หน้า")} </span>
      {shown}
    </span>
  );
}

function ZoomReadout() {
  const scale = usePreviewScale((s) => s.scale);
  return (
    <span className="w-9 text-right text-xs text-muted-foreground tabular-nums" aria-live="off">
      {Math.round(scale * 100)}%
    </span>
  );
}

/**
 * Preview device controls (DEVICE-PREVIEW-SPEC §5), shown in the top bar in
 * Preview only. Disabled (not hidden) while Preview is loading, failed or
 * empty. `compact` (narrow top bar) moves zoom, hinge and multi-view into the
 * ตัวเลือกตัวอย่าง menu.
 */
export function DeviceToolbar({ compact }: { compact: boolean }) {
  const p = usePhrase();
  const preset = usePreviewDeviceStore((s) => s.preset);
  const landscape = usePreviewDeviceStore((s) => s.landscape);
  const customW = usePreviewDeviceStore((s) => s.custom.w);
  const customH = usePreviewDeviceStore((s) => s.custom.h);
  const zoom = usePreviewDeviceStore((s) => s.zoom);
  const hinge = usePreviewDeviceStore((s) => s.hinge);
  const multi = usePreviewDeviceStore((s) => s.multi);
  const multiSet = usePreviewDeviceStore((s) => s.multiSet);
  const setPreset = usePreviewDeviceStore((s) => s.setPreset);
  const toggleLandscape = usePreviewDeviceStore((s) => s.toggleLandscape);
  const startCustom = usePreviewDeviceStore((s) => s.startCustom);
  const swapCustom = usePreviewDeviceStore((s) => s.swapCustom);
  const setZoom = usePreviewDeviceStore((s) => s.setZoom);
  const setHinge = usePreviewDeviceStore((s) => s.setHinge);
  const setMulti = usePreviewDeviceStore((s) => s.setMulti);
  const toggleMultiDevice = usePreviewDeviceStore((s) => s.toggleMultiDevice);

  const previewStatus = useEditorStore((s) => s.previewStatus);
  const pagePerfToolbar = useEditorStore((s) => s.pagePerfToolbar);
  const empty = useProjectsStore((s) => !s.openDocument || isDocumentEmpty(s.openDocument));
  const disabled = previewStatus !== "ready" || empty;

  const dev = deviceById(preset);
  const isCustom = !multi && preset === "custom";
  const fill = !multi && preset === "fill";
  const size = effectiveSize(preset, landscape, { w: customW, h: customH });

  const rotatable = multi ? multiSet.some((id) => deviceById(id).rotatable) : dev.rotatable;
  const rotated = isCustom ? customW > customH : landscape;
  const showHinge = multi
    ? multiSet.some((id) => deviceById(id).foldable)
    : dev.foldable;

  const wRef = useRef<HTMLInputElement | null>(null);
  const focusW = useRef(false);
  useEffect(() => {
    if (focusW.current && preset === "custom") {
      focusW.current = false;
      wRef.current?.focus();
      wRef.current?.select();
    }
  }, [preset]);

  const rotate = () => {
    if (!rotatable || disabled) return;
    if (isCustom) swapCustom();
    else toggleLandscape();
  };

  const onZoom = (v: string) => v && setZoom(v as PreviewZoom);

  return (
    <>
    <OpenPageName compact={compact} />
    {pagePerfToolbar ? (
      <span
        data-page-perf-toolbar
        className="max-w-[10rem] truncate text-[11px] text-amber-700 dark:text-amber-400"
        title={displayPerfWarning(pagePerfToolbar)}
      >
        {displayPerfWarning(pagePerfToolbar)}
      </span>
    ) : null}
    <div className="flex shrink-0 items-center gap-1.5" role="group" aria-label={p("อุปกรณ์ตัวอย่าง")}>
      {multi ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled}
              className="w-[150px] justify-between font-normal"
              aria-label={p("เลือกอุปกรณ์ (สูงสุด 3)")}
            >
              <span className="flex items-center gap-1.5">
                <Columns3 className="size-4 text-muted-foreground" />
                {multiSet.length} {p("อุปกรณ์")}
              </span>
              <ChevronDown className="size-4 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-56">
            <DropdownMenuLabel>
              {p("เลือกอุปกรณ์ (สูงสุด 3)").replace("3", String(MULTI_MAX))}
            </DropdownMenuLabel>
            {MULTI_DEVICES.map((d) => {
              const checked = multiSet.includes(d.id);
              const Icon = ICONS[d.icon];
              return (
                <DropdownMenuCheckboxItem
                  key={d.id}
                  checked={checked}
                  disabled={checked && multiSet.length === 1}
                  onCheckedChange={() => {
                    if (!checked && multiSet.length >= MULTI_MAX) {
                      useEditorStore.getState().announce(p("แสดงได้สูงสุด 3 อุปกรณ์พร้อมกัน"));
                      return;
                    }
                    toggleMultiDevice(d.id);
                  }}
                  onSelect={(e) => e.preventDefault()}
                >
                  <Icon className="size-4 text-muted-foreground" />
                  {p(d.label)}
                  <span className="ml-auto pl-3 text-xs text-muted-foreground tabular-nums">
                    {d.w}×{d.h}
                  </span>
                </DropdownMenuCheckboxItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <Select value={preset} onValueChange={(v) => setPreset(v as DeviceId)} disabled={disabled}>
          <SelectTrigger size="sm" className="w-[150px]" aria-label={p("อุปกรณ์")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {GROUPS.map((g, gi) => {
              const items = DEVICES.filter((d) => d.group === g.id && !d.hidden);
              return (
                <SelectGroup key={g.id}>
                  {g.id === "custom" && gi > 0 ? <SelectSeparator /> : null}
                  {g.label ? <SelectLabel>{p(g.label)}</SelectLabel> : null}
                  {items.map((d) => (
                    <DeviceItem key={d.id} dev={d} />
                  ))}
                </SelectGroup>
              );
            })}
          </SelectContent>
        </Select>
      )}

      {isCustom ? (
        <CustomSizeInputs disabled={disabled} wRef={wRef} />
      ) : !multi && size ? (
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            focusW.current = true;
            startCustom(size);
          }}
          className="rounded-sm px-1 text-xs text-muted-foreground tabular-nums outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          aria-label={`${p("ขนาด")} ${size.w} × ${size.h} — ${p("กำหนดเอง")}`}
        >
          {size.w} × {size.h}
        </button>
      ) : null}

      <IconTip label={rotatable ? (rotated ? p("แนวตั้ง") : p("แนวนอน")) : p(ROTATE_HINT)}>
        <Toggle
          size="sm"
          aria-label={p("หมุนจอ")}
          pressed={rotatable && rotated}
          onPressedChange={rotate}
          disabled={disabled}
          aria-disabled={!rotatable || undefined}
          className="aria-disabled:cursor-not-allowed aria-disabled:opacity-50 aria-disabled:hover:bg-transparent"
        >
          <RotateCw className="size-4" />
        </Toggle>
      </IconTip>

      {compact ? (
        <>
        {/* Zoom % stays visible in the compact bar (the controls move into the menu). */}
        <ZoomReadout />
        <DropdownMenu>
          <IconTip label={p("ตัวเลือกตัวอย่าง")}>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="ghost" size="icon-sm" disabled={disabled} aria-label={p("ตัวเลือกตัวอย่าง")}>
                <SlidersHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
          </IconTip>
          <DropdownMenuContent align="end" className="min-w-48">
            <DropdownMenuLabel>{p("การย่อขยาย")}</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={zoom} onValueChange={onZoom}>
              <DropdownMenuRadioItem value="fit" disabled={fill}>
                {p("พอดี")}
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="100" disabled={fill}>
                100%
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
            <DropdownMenuSeparator />
            {showHinge ? (
              <DropdownMenuCheckboxItem checked={hinge} onCheckedChange={(c) => setHinge(c === true)}>
                {p("แสดงแนวพับ")}
              </DropdownMenuCheckboxItem>
            ) : null}
            <DropdownMenuCheckboxItem checked={multi} onCheckedChange={(c) => setMulti(c === true)}>
              {p("หลายอุปกรณ์")}
            </DropdownMenuCheckboxItem>
          </DropdownMenuContent>
        </DropdownMenu>
        </>
      ) : (
        <>
          <ToggleGroup
            type="single"
            size="sm"
            spacing={0}
            value={zoom}
            onValueChange={onZoom}
            disabled={disabled || fill}
            aria-label={p("การย่อขยาย")}
            className="rounded-lg bg-muted p-0.5"
          >
            {(["fit", "100"] as const).map((z) => (
              <ToggleGroupItem
                key={z}
                value={z}
                className="h-6 rounded-md! px-2 text-xs text-muted-foreground hover:bg-transparent hover:text-foreground focus-visible:ring-2 data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-sm"
              >
                {z === "fit" ? p("พอดี") : "100%"}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <ZoomReadout />
          {showHinge ? (
            <IconTip label={p("แสดงแนวพับ")}>
              <Toggle
                size="sm"
                aria-label={p("แสดงแนวพับ")}
                pressed={hinge}
                onPressedChange={setHinge}
                disabled={disabled}
              >
                <SeparatorVertical className="size-4" />
              </Toggle>
            </IconTip>
          ) : null}
          <IconTip label={p("หลายอุปกรณ์")}>
            <Toggle
              size="sm"
              aria-label={p("หลายอุปกรณ์")}
              pressed={multi}
              onPressedChange={setMulti}
              disabled={disabled}
            >
              <Columns3 className="size-4" />
            </Toggle>
          </IconTip>
        </>
      )}
      <ViteRunButton />
    </div>
    </>
  );
}

