/**
 * B4.1: per-side borders (T90) and per-corner radius (T91–T95) for the เส้นขอบ section.
 */
import { useEffect, useState } from "react";
import { Link2, Unlink2 } from "lucide-react";
import { Toggle } from "@/components/ui/toggle";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { FieldRow, fieldLabelId } from "@/components/editor/style/FieldRow";
import { NumberField } from "@/components/editor/style/NumberField";
import { SegmentedField } from "@/components/editor/style/SegmentedField";
import { useColorField } from "@/components/editor/style/ColorField";
import { writeStyle } from "@/components/editor/style/write";
import {
  isEmptyBorderRadiusCorners,
  isEmptyBorderSides,
} from "@/lib/style-css";
import type {
  BorderRadiusCorners,
  BorderSide,
  BorderSides,
  BorderSideStyle,
  StyleBreakpoint,
} from "@/schema";

const SIDE_KEYS = [
  { k: "t" as const, label: "บน" },
  { k: "r" as const, label: "ขวา" },
  { k: "b" as const, label: "ล่าง" },
  { k: "l" as const, label: "ซ้าย" },
];

const CORNER_KEYS = [
  { k: "tl" as const, label: "บนซ้าย" },
  { k: "tr" as const, label: "บนขวา" },
  { k: "br" as const, label: "ล่างขวา" },
  { k: "bl" as const, label: "ล่างซ้าย" },
];

const SIDE_STYLE_OPTS = [
  { value: "solid", label: "เส้นทึบ" },
  { value: "dashed", label: "เส้นประ" },
  { value: "dotted", label: "จุด" },
  { value: "none", label: "ไม่มี" },
] as const;

function SideColor({
  id,
  value,
  disabled,
  onCommit,
}: {
  id: string;
  value: string | undefined;
  disabled: boolean;
  onCommit: (v: string) => void;
}) {
  const { control, footer } = useColorField({
    id,
    label: "สี",
    value,
    disabled,
    muted: false,
    onCommit,
  });
  return (
    <div className="space-y-1">
      <div className="flex min-w-0 items-center gap-1.5">{control}</div>
      {footer}
    </div>
  );
}

type Props = {
  nodeId: string;
  sides: BorderSides | undefined;
  corners: BorderRadiusCorners | undefined;
  locked: boolean;
  bp?: StyleBreakpoint;
};

export function BorderExtras({ nodeId, sides, corners, locked, bp }: Props) {
  const [sidesOpen, setSidesOpen] = useState(() => !isEmptyBorderSides(sides));
  const [cornersOpen, setCornersOpen] = useState(
    () => !isEmptyBorderRadiusCorners(corners),
  );

  useEffect(() => {
    if (!isEmptyBorderSides(sides)) setSidesOpen(true);
  }, [sides]);
  useEffect(() => {
    if (!isEmptyBorderRadiusCorners(corners)) setCornersOpen(true);
  }, [corners]);

  const writeSides = (next: BorderSides | undefined) => {
    writeStyle(
      nodeId,
      "borderSides",
      next && !isEmptyBorderSides(next) ? next : undefined,
      bp,
    );
  };
  const writeCorners = (next: BorderRadiusCorners | undefined) => {
    writeStyle(
      nodeId,
      "borderRadiusCorners",
      next && !isEmptyBorderRadiusCorners(next) ? next : undefined,
      bp,
    );
  };

  const patchSide = (key: keyof BorderSides, patch: Partial<BorderSide>) => {
    const cur = sides?.[key] ?? {};
    const nextSide: BorderSide = { ...cur, ...patch };
    const next: BorderSides = { ...(sides ?? {}), [key]: nextSide };
    writeSides(next);
  };

  const patchCorner = (key: keyof BorderRadiusCorners, n: number) => {
    writeCorners({ ...(corners ?? {}), [key]: n });
  };

  return (
    <div className="space-y-2" data-border-extras>
      <div className="flex h-7 items-center justify-between gap-1">
        <span className="text-[11px] text-muted-foreground">เส้นขอบแยกด้าน</span>
        <Tooltip>
          <TooltipTrigger asChild>
            <Toggle
              size="sm"
              aria-label="เส้นขอบแยกด้าน"
              pressed={sidesOpen}
              disabled={locked}
              onPressedChange={(p) => {
                setSidesOpen(p);
                if (!p) writeSides(undefined);
                else if (isEmptyBorderSides(sides)) {
                  writeSides({
                    t: { width: 1, style: "solid" },
                    r: { width: 1, style: "solid" },
                    b: { width: 1, style: "solid" },
                    l: { width: 1, style: "solid" },
                  });
                }
              }}
              className="size-7 min-w-7 shrink-0 px-0 focus-visible:ring-2"
            >
              {sidesOpen ? <Unlink2 className="size-3.5" /> : <Link2 className="size-3.5" />}
            </Toggle>
          </TooltipTrigger>
          <TooltipContent>เส้นขอบแยกด้าน</TooltipContent>
        </Tooltip>
      </div>

      {sidesOpen
        ? SIDE_KEYS.map(({ k, label }) => {
            const side = sides?.[k] ?? {};
            const id = `fx-bs-${k}`;
            return (
              <div
                key={k}
                className="space-y-1.5 rounded-md border border-sidebar-border bg-sidebar/40 p-2"
                aria-label={label}
              >
                <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
                <FieldRow id={`${id}-w`} label="ความหนา" overridden={false} locked={locked}>
                  <NumberField
                    id={`${id}-w`}
                    value={side.width ?? 0}
                    min={0}
                    max={20}
                    suffix="px"
                    disabled={locked}
                    onCommit={(width) => patchSide(k, { width })}
                  />
                </FieldRow>
                <FieldRow id={`${id}-c`} label="สี" overridden={false} locked={locked} stacked>
                  <SideColor
                    id={`${id}-c`}
                    value={side.color}
                    disabled={locked}
                    onCommit={(color) => patchSide(k, { color })}
                  />
                </FieldRow>
                <FieldRow id={`${id}-s`} label="รูปแบบ" overridden={false} locked={locked} group>
                  <SegmentedField
                    id={`${id}-s`}
                    label="รูปแบบ"
                    options={SIDE_STYLE_OPTS}
                    value={side.style ?? "solid"}
                    disabled={locked}
                    fill
                    labelledBy={fieldLabelId(`${id}-s`)}
                    onChange={(v) => patchSide(k, { style: v as BorderSideStyle })}
                  />
                </FieldRow>
              </div>
            );
          })
        : null}

      <div className="flex h-7 items-center justify-between gap-1">
        <span className="text-[11px] text-muted-foreground">มุมโค้งแยกมุม</span>
        <Tooltip>
          <TooltipTrigger asChild>
            <Toggle
              size="sm"
              aria-label="มุมโค้งแยกมุม"
              pressed={cornersOpen}
              disabled={locked}
              onPressedChange={(p) => {
                setCornersOpen(p);
                if (!p) writeCorners(undefined);
                else if (isEmptyBorderRadiusCorners(corners)) {
                  writeCorners({ tl: 0, tr: 0, br: 0, bl: 0 });
                }
              }}
              className="size-7 min-w-7 shrink-0 px-0 focus-visible:ring-2"
            >
              {cornersOpen ? <Unlink2 className="size-3.5" /> : <Link2 className="size-3.5" />}
            </Toggle>
          </TooltipTrigger>
          <TooltipContent>มุมโค้งแยกมุม</TooltipContent>
        </Tooltip>
      </div>

      {cornersOpen ? (
        <div className="grid grid-cols-2 gap-1.5" role="group" aria-label="มุมโค้งแยกมุม">
          {CORNER_KEYS.map(({ k, label }) => (
            <div key={k} className="min-w-0">
              <div className="mb-0.5 text-center text-[11px] text-muted-foreground">{label}</div>
              <NumberField
                id={`fx-bc-${k}`}
                ariaLabel={label}
                value={corners?.[k] ?? 0}
                min={0}
                max={400}
                suffix="px"
                compact
                disabled={locked}
                onCommit={(n) => patchCorner(k, n)}
              />
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
