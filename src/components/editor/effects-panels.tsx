/**
 * B2.2 lazy effects panels. Chunk name must stay `effects-panels` so the initial
 * JS bundle does not include the shadow editor (PHASE-11-SPEC §9.B B2.2).
 */
import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronRight, ChevronUp, Plus, Trash2 } from "lucide-react";
import { Slider as SliderPrimitive } from "radix-ui";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { FieldRow, fieldLabelId } from "@/components/editor/style/FieldRow";
import { NumberField } from "@/components/editor/style/NumberField";
import { useColorField } from "@/components/editor/style/ColorField";
import { writeStyle } from "@/components/editor/style/write";
import {
  BOX_SHADOW_MAX_MSG,
  addShadowLayer,
  focusIndexAfterRemove,
  moveShadowLayer,
  patchShadowLayer,
  removeShadowLayer,
} from "@/lib/box-shadow-ops";
import { toast } from "@/lib/toast";
import type { BoxShadowLayer, StyleBreakpoint } from "@/schema";
import { cn } from "@/lib/utils";

export type ShadowEditorProps = {
  nodeId: string;
  layers: readonly BoxShadowLayer[] | undefined;
  locked: boolean;
  /** Desktop = undefined; tablet/phone override. */
  bp?: StyleBreakpoint;
  overridden: boolean;
  onReset?: () => void;
  resetLabel?: string;
};

function commitLayers(
  nodeId: string,
  next: BoxShadowLayer[],
  bp?: StyleBreakpoint,
): void {
  writeStyle(nodeId, "boxShadow", next.length === 0 ? undefined : next, bp);
}

function LayerColor({
  id,
  label,
  value,
  disabled,
  onCommit,
}: {
  id: string;
  label: string;
  value: string | undefined;
  disabled: boolean;
  onCommit: (v: string) => void;
}) {
  const { control, footer } = useColorField({
    id,
    label,
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

/** Blur slider 0–100: pointer drag commits once on release (B2.2 acceptance). */
function BlurSlider({
  id,
  value,
  disabled,
  onCommit,
}: {
  id: string;
  value: number;
  disabled: boolean;
  onCommit: (n: number) => void;
}) {
  const [draft, setDraft] = useState<number | null>(null);
  const dragging = useRef(false);
  const draftRef = useRef<number | null>(null);
  const startRef = useRef<number>(0);

  const finish = () => {
    if (!dragging.current) return;
    dragging.current = false;
    const v = draftRef.current;
    draftRef.current = null;
    setDraft(null);
    if (v == null) return;
    if (v !== startRef.current) onCommit(v);
  };

  return (
    <SliderPrimitive.Root
      min={0}
      max={100}
      step={1}
      value={[draft ?? value]}
      disabled={disabled}
      data-slot="slider"
      className="relative flex h-7 min-w-0 flex-1 touch-none items-center select-none data-disabled:opacity-50"
      onPointerDown={() => {
        if (disabled || dragging.current) return;
        dragging.current = true;
        startRef.current = value;
        draftRef.current = null;
      }}
      onValueChange={([v]) => {
        setDraft(v);
        if (dragging.current) {
          draftRef.current = v;
          return;
        }
        onCommit(v);
      }}
      onValueCommit={finish}
      onPointerUp={finish}
      onPointerCancel={finish}
      onLostPointerCapture={finish}
    >
      <SliderPrimitive.Track
        data-slot="slider-track"
        className="relative h-1 w-full grow overflow-hidden rounded-full bg-muted"
      >
        <SliderPrimitive.Range data-slot="slider-range" className="absolute h-full bg-primary" />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb
        data-slot="slider-thumb"
        aria-label="เบลอ"
        id={id}
        onBlur={finish}
        className="relative block size-3 shrink-0 rounded-full border border-ring bg-white ring-ring/50 focus-visible:ring-ring transition-[color,box-shadow] select-none after:absolute after:-inset-2 hover:ring-3 focus-visible:ring-2 focus-visible:outline-hidden active:ring-3 disabled:pointer-events-none"
      />
    </SliderPrimitive.Root>
  );
}

function ShadowLayerCard({
  nodeId,
  index,
  layer,
  total,
  locked,
  bp,
  layers,
  focusRequest,
  onFocused,
  onRemove,
}: {
  nodeId: string;
  index: number;
  layer: BoxShadowLayer;
  total: number;
  locked: boolean;
  bp?: StyleBreakpoint;
  layers: readonly BoxShadowLayer[];
  focusRequest: number | null;
  onFocused: () => void;
  onRemove: (index: number) => void;
}) {
  const removeRef = useRef<HTMLButtonElement>(null);
  const n = index + 1;
  const title = `เงาชั้นที่ ${n}`;

  useEffect(() => {
    if (focusRequest === index) {
      removeRef.current?.focus();
      onFocused();
    }
  }, [focusRequest, index, onFocused]);

  const write = (next: BoxShadowLayer[]) => commitLayers(nodeId, next, bp);
  const patch = (p: Partial<BoxShadowLayer>) => write(patchShadowLayer(layers, index, p));

  return (
    <div
      data-shadow-layer={index}
      className="space-y-1.5 rounded-md border border-sidebar-border bg-sidebar/40 p-2"
      aria-label={title}
    >
      <div className="flex h-7 items-center justify-between gap-1">
        <span className="text-[11px] font-medium text-muted-foreground">{title}</span>
        <div className="flex items-center gap-0.5">
          <Button
            type="button"
            variant="ghost"
            size="xs"
            className="size-6 px-0"
            disabled={locked || index === 0}
            aria-label="เลื่อนชั้นขึ้น"
            onClick={() => write(moveShadowLayer(layers, index, -1))}
          >
            <ChevronUp className="size-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            className="size-6 px-0"
            disabled={locked || index >= total - 1}
            aria-label="เลื่อนชั้นลง"
            onClick={() => write(moveShadowLayer(layers, index, 1))}
          >
            <ChevronDown className="size-3.5" />
          </Button>
          <Button
            ref={removeRef}
            type="button"
            variant="ghost"
            size="xs"
            className="size-6 px-0 text-destructive"
            disabled={locked}
            aria-label="ลบเงา"
            onClick={() => onRemove(index)}
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      </div>

      <FieldRow id={`fx-sh-${index}-x`} label="แนวนอน" overridden={false} locked={locked}>
        <NumberField
          id={`fx-sh-${index}-x`}
          value={layer.x ?? 0}
          min={-200}
          max={200}
          suffix="px"
          disabled={locked}
          onCommit={(x) => patch({ x })}
        />
      </FieldRow>
      <FieldRow id={`fx-sh-${index}-y`} label="แนวตั้ง" overridden={false} locked={locked}>
        <NumberField
          id={`fx-sh-${index}-y`}
          value={layer.y ?? 0}
          min={-200}
          max={200}
          suffix="px"
          disabled={locked}
          onCommit={(y) => patch({ y })}
        />
      </FieldRow>
      <FieldRow id={`fx-sh-${index}-blur`} label="เบลอ" overridden={false} locked={locked}>
        <BlurSlider
          id={`fx-sh-${index}-blur`}
          value={layer.blur ?? 0}
          disabled={locked}
          onCommit={(blur) => patch({ blur })}
        />
        <NumberField
          id={`fx-sh-${index}-blur-n`}
          value={layer.blur ?? 0}
          min={0}
          max={100}
          suffix="px"
          className="w-16 flex-none"
          disabled={locked}
          onCommit={(blur) => patch({ blur })}
        />
      </FieldRow>
      <FieldRow id={`fx-sh-${index}-spread`} label="กระจาย" overridden={false} locked={locked}>
        <NumberField
          id={`fx-sh-${index}-spread`}
          value={layer.spread ?? 0}
          min={-100}
          max={100}
          suffix="px"
          disabled={locked}
          onCommit={(spread) => patch({ spread })}
        />
      </FieldRow>
      <FieldRow id={`fx-sh-${index}-color`} label="สี" overridden={false} locked={locked} stacked>
        <LayerColor
          id={`fx-sh-${index}-color`}
          label="สี"
          value={layer.color}
          disabled={locked}
          onCommit={(color) => patch({ color })}
        />
      </FieldRow>
      <FieldRow
        id={`fx-sh-${index}-inset`}
        label="เงาด้านใน"
        overridden={false}
        locked={locked}
        group
      >
        <Switch
          id={`fx-sh-${index}-inset`}
          checked={!!layer.inset}
          disabled={locked}
          aria-labelledby={fieldLabelId(`fx-sh-${index}-inset`)}
          onCheckedChange={(checked) => patch({ inset: checked || undefined })}
        />
      </FieldRow>
    </div>
  );
}

/**
 * Shadow editor (T57 / T70–T79). Mounted under the เอฟเฟกต์ → เงา sub-group.
 */
export function ShadowEditor({
  nodeId,
  layers: layersProp,
  locked,
  bp,
  overridden,
  onReset,
  resetLabel,
}: ShadowEditorProps) {
  const layers = layersProp ?? [];
  const [focusAfterRemove, setFocusAfterRemove] = useState<number | null>(null);

  const handleAdd = () => {
    const next = addShadowLayer(layers);
    if (!next) {
      toast.error(BOX_SHADOW_MAX_MSG);
      return;
    }
    commitLayers(nodeId, next, bp);
  };

  const handleRemoveAt = (index: number) => {
    const focus = focusIndexAfterRemove(layers.length, index);
    commitLayers(nodeId, removeShadowLayer(layers, index), bp);
    setFocusAfterRemove(focus >= 0 ? focus : null);
  };

  return (
    <div className="space-y-2" data-effects-panel="shadow">
      <div className="flex items-center justify-between gap-1">
        <span className="text-[11px] text-muted-foreground">
          {layers.length > 0 ? `${layers.length}/6 ชั้น` : "ยังไม่มีเงา"}
        </span>
        <div className="flex items-center gap-1">
          {overridden && onReset && !locked ? (
            <Button type="button" variant="ghost" size="xs" onClick={onReset}>
              {resetLabel ?? "คืนค่าเริ่มต้น"}
            </Button>
          ) : null}
          <Button
            type="button"
            variant="outline"
            size="xs"
            disabled={locked}
            aria-label="เพิ่มเงา"
            onClick={handleAdd}
          >
            <Plus className="size-3.5" />
            เพิ่มเงา
          </Button>
        </div>
      </div>

      {layers.map((layer, index) => (
        <ShadowLayerCard
          key={`sh-${index}`}
          nodeId={nodeId}
          index={index}
          layer={layer}
          total={layers.length}
          locked={locked}
          bp={bp}
          layers={layers}
          focusRequest={focusAfterRemove}
          onFocused={() => setFocusAfterRemove(null)}
          onRemove={handleRemoveAt}
        />
      ))}
    </div>
  );
}

/** Collapsible เงา sub-group used by StylePanel EffectsSection. */
export function ShadowSubGroup(props: ShadowEditorProps) {
  const [open, setOpen] = useState(false);
  const bodyId = "fx-shadow-body";
  return (
    <div className="rounded-md border border-sidebar-border/80">
      <button
        type="button"
        className={cn(
          "flex h-8 w-full items-center gap-1 px-2 text-xs font-medium",
          props.overridden ? "text-foreground" : "text-muted-foreground hover:text-foreground",
        )}
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => setOpen((o) => !o)}
      >
        {open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
        <span
          aria-hidden
          className={cn(
            "size-1.5 shrink-0 rounded-full",
            props.overridden ? "bg-primary" : "bg-transparent",
          )}
        />
        เงา
      </button>
      {open ? (
        <div id={bodyId} className="border-t border-sidebar-border/80 px-2 py-2">
          <ShadowEditor {...props} />
        </div>
      ) : null}
    </div>
  );
}
