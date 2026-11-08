/**
 * B2.2 / B3.2 lazy effects panels. Chunk name must stay `effects-panels` so the
 * initial JS bundle does not include shadow/gradient editors (PHASE-11-SPEC §9.B).
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight, ChevronUp, Plus, Trash2 } from "lucide-react";
import { Slider as SliderPrimitive } from "radix-ui";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { FieldRow, fieldLabelId } from "@/components/editor/style/FieldRow";
import { NumberField } from "@/components/editor/style/NumberField";
import { SegmentedField } from "@/components/editor/style/SegmentedField";
import { SelectField } from "@/components/editor/style/SelectField";
import { useColorField } from "@/components/editor/style/ColorField";
import { applyOps, styleOp, writeStyle } from "@/components/editor/style/write";
import {
  BOX_SHADOW_MAX_MSG,
  addShadowLayer,
  focusIndexAfterRemove,
  moveShadowLayer,
  patchShadowLayer,
  removeShadowLayer,
} from "@/lib/box-shadow-ops";
import {
  DEFAULT_GRADIENT,
  GRADIENT_EXCLUSIVE_MSG,
  activeGradientMode,
  activeGradientValue,
  addGradientStop,
  focusStopIndexAfterRemove,
  patchGradient,
  patchGradientStop,
  removeGradientStop,
} from "@/lib/gradient-ops";
import { gradientToCss } from "@/lib/style-css";
import { toast } from "@/lib/toast";
import type {
  BackdropFilterValue,
  BoxShadowLayer,
  FilterValue,
  GradientKind,
  GradientStop,
  GradientValue,
  NodeStateName,
  StyleBreakpoint,
  TransformOrigin,
  TransformValue,
  TransitionEasing,
  TransitionValue,
} from "@/schema";
import {
  GRADIENT_MAX_STOPS,
  GRADIENT_MIN_STOPS,
  TRANSFORM_ORIGINS,
  TRANSITION_EASINGS,
} from "@/schema";
import {
  isEmptyBackdropFilter,
  isEmptyFilter,
  isEmptyTransform,
  isEmptyTransition,
} from "@/lib/style-css";
import { MAX_BLUR_EFFECTS } from "@/lib/page-perf";
import { useEditorStore } from "@/stores/editor-store";
import { cn } from "@/lib/utils";

export type ShadowEditorProps = {
  nodeId: string;
  layers: readonly BoxShadowLayer[] | undefined;
  locked: boolean;
  /** Desktop = undefined; tablet/phone override. */
  bp?: StyleBreakpoint;
  /** B8.1: write into `states[name]` instead of base / breakpoint. */
  state?: NodeStateName | null;
  overridden: boolean;
  onReset?: () => void;
  resetLabel?: string;
};

function commitLayers(
  nodeId: string,
  next: BoxShadowLayer[],
  bp?: StyleBreakpoint,
  state?: NodeStateName | null,
): void {
  writeStyle(nodeId, "boxShadow", next.length === 0 ? undefined : next, bp, state);
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
  state,
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
  state?: NodeStateName | null;
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

  const write = (next: BoxShadowLayer[]) => commitLayers(nodeId, next, bp, state);
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
  state,
  overridden,
  onReset,
  resetLabel,
}: ShadowEditorProps) {
  const layers = layersProp ?? [];
  const [focusAfterRemove, setFocusAfterRemove] = useState<number | null>(null);
  const shadowWarn = useEditorStore((s) =>
    s.pagePerfWarnings.find((w) => w.kind === "shadow"),
  );

  const handleAdd = () => {
    const next = addShadowLayer(layers);
    if (!next) {
      toast.error(BOX_SHADOW_MAX_MSG);
      return;
    }
    commitLayers(nodeId, next, bp, state);
  };

  const handleRemoveAt = (index: number) => {
    const focus = focusIndexAfterRemove(layers.length, index);
    commitLayers(nodeId, removeShadowLayer(layers, index), bp, state);
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

      {shadowWarn ? (
        <p className="text-[11px] text-amber-700 dark:text-amber-400" role="status">
          {shadowWarn.message}
        </p>
      ) : null}

      {layers.map((layer, index) => (
        <ShadowLayerCard
          key={`sh-${index}`}
          nodeId={nodeId}
          index={index}
          layer={layer}
          total={layers.length}
          locked={locked}
          bp={bp}
          state={state}
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

const KIND_OPTIONS = [
  { value: "linear", label: "เส้นตรง" },
  { value: "radial", label: "วงกลม" },
  { value: "conic", label: "กรวย" },
] as const;

export type GradientEditorProps = {
  nodeId: string;
  background: GradientValue | undefined;
  text: GradientValue | undefined;
  locked: boolean;
  bp?: StyleBreakpoint;
  /** B8.1: write into states[name]. */
  state?: NodeStateName | null;
  overridden: boolean;
  onReset?: () => void;
  resetLabel?: string;
};

function commitGradient(
  nodeId: string,
  textFill: boolean,
  value: GradientValue | undefined,
  bp?: StyleBreakpoint,
  state?: NodeStateName | null,
): void {
  const historyKey = state
    ? `state:${nodeId}:${state}:gradient`
    : bp
      ? `style:${nodeId}:${bp}:gradient`
      : `style:${nodeId}:gradient`;
  applyOps(
    [
      styleOp(nodeId, "backgroundGradient", textFill ? undefined : value, bp, state),
      styleOp(nodeId, "textGradient", textFill ? value : undefined, bp, state),
    ],
    historyKey,
  );
}

function GradientStopCard({
  index,
  stop,
  total,
  locked,
  focusRequest,
  onFocused,
  onPatch,
  onRemove,
}: {
  index: number;
  stop: GradientStop;
  total: number;
  locked: boolean;
  focusRequest: number | null;
  onFocused: () => void;
  onPatch: (p: Partial<GradientStop>) => void;
  onRemove: (index: number) => void;
}) {
  const removeRef = useRef<HTMLButtonElement>(null);
  const n = index + 1;
  const title = `จุดสี ${n}`;

  useEffect(() => {
    if (focusRequest === index) {
      removeRef.current?.focus();
      onFocused();
    }
  }, [focusRequest, index, onFocused]);

  return (
    <div
      data-gradient-stop={index}
      className="space-y-1.5 rounded-md border border-sidebar-border bg-sidebar/40 p-2"
      aria-label={title}
    >
      <div className="flex h-7 items-center justify-between gap-1">
        <span className="text-[11px] font-medium text-muted-foreground">{title}</span>
        <Button
          ref={removeRef}
          type="button"
          variant="ghost"
          size="xs"
          className="size-6 px-0 text-destructive"
          disabled={locked || total <= GRADIENT_MIN_STOPS}
          aria-label="ลบจุดสี"
          onClick={() => onRemove(index)}
        >
          <Trash2 className="size-3.5" />
        </Button>
      </div>
      <FieldRow id={`fx-gr-${index}-color`} label="สี" overridden={false} locked={locked} stacked>
        <LayerColor
          id={`fx-gr-${index}-color`}
          label="สี"
          value={stop.color}
          disabled={locked}
          onCommit={(color) => onPatch({ color })}
        />
      </FieldRow>
      <FieldRow id={`fx-gr-${index}-at`} label="ตำแหน่ง" overridden={false} locked={locked}>
        <NumberField
          id={`fx-gr-${index}-at`}
          value={stop.at ?? 0}
          min={0}
          max={100}
          suffix="%"
          disabled={locked}
          onCommit={(at) => onPatch({ at })}
        />
      </FieldRow>
    </div>
  );
}

/**
 * Gradient editor (T55 / T80–T89). Mounted under เอฟเฟกต์ → ไล่สี.
 */
export function GradientEditor({
  nodeId,
  background,
  text,
  locked,
  bp,
  state,
  overridden,
  onReset,
  resetLabel,
}: GradientEditorProps) {
  const bothSet = background !== undefined && text !== undefined;
  const mode = activeGradientMode(background, text);
  const textFill = mode === "text";
  const value = activeGradientValue(background, text);
  const stops = value?.stops ?? [];
  const kind: GradientKind =
    value?.kind === "radial" || value?.kind === "conic" ? value.kind : "linear";
  const angle = value?.angle ?? (kind === "conic" ? 0 : 180);
  const [focusAfterRemove, setFocusAfterRemove] = useState<number | null>(null);

  const previewCss = gradientToCss(value ?? undefined);

  const write = (next: GradientValue | undefined, fill = textFill) => {
    commitGradient(nodeId, fill, next, bp, state);
  };

  const ensure = (): GradientValue => value ?? { ...DEFAULT_GRADIENT, stops: [...(DEFAULT_GRADIENT.stops ?? [])] };

  const handleEnable = () => {
    write({ ...DEFAULT_GRADIENT, stops: DEFAULT_GRADIENT.stops!.map((s) => ({ ...s })) }, false);
  };

  const handleKind = (raw: string) => {
    const nextKind = (raw === "radial" || raw === "conic" ? raw : "linear") as GradientKind;
    write(patchGradient(ensure(), { kind: nextKind }));
  };

  const handleAngle = (n: number) => {
    write(patchGradient(ensure(), { angle: n }));
  };

  const handleTextFill = (checked: boolean) => {
    if (bothSet) {
      toast.error(GRADIENT_EXCLUSIVE_MSG);
    }
    const base = ensure();
    write(base, checked);
  };

  const handleAdd = () => {
    const base = ensure();
    const nextStops = addGradientStop(base.stops ?? []);
    if (!nextStops) {
      toast.error(`ใช้จุดสีได้สูงสุด ${GRADIENT_MAX_STOPS} จุด`);
      return;
    }
    write(patchGradient(base, { stops: nextStops }));
  };

  const handleRemoveAt = (index: number) => {
    const base = ensure();
    const before = base.stops ?? [];
    if (before.length <= GRADIENT_MIN_STOPS) return;
    const focus = focusStopIndexAfterRemove(before.length, index);
    write(patchGradient(base, { stops: removeGradientStop(before, index) }));
    setFocusAfterRemove(focus >= 0 ? focus : null);
  };

  const handleClear = () => {
    // Always clear both keys so exclusivity residue cannot linger.
    applyOps(
      [
        styleOp(nodeId, "backgroundGradient", undefined, bp, state),
        styleOp(nodeId, "textGradient", undefined, bp, state),
      ],
      state
        ? `state:${nodeId}:${state}:gradient`
        : bp
          ? `style:${nodeId}:${bp}:gradient`
          : `style:${nodeId}:gradient`,
    );
  };

  return (
    <div className="space-y-2" data-effects-panel="gradient">
      <div className="flex items-center justify-between gap-1">
        <span className="text-[11px] text-muted-foreground">
          {value ? `${stops.length}/${GRADIENT_MAX_STOPS} จุดสี` : "ยังไม่มีไล่สี"}
        </span>
        <div className="flex items-center gap-1">
          {overridden && onReset && !locked ? (
            <Button type="button" variant="ghost" size="xs" onClick={onReset}>
              {resetLabel ?? "คืนค่าเริ่มต้น"}
            </Button>
          ) : null}
          {!value ? (
            <Button
              type="button"
              variant="outline"
              size="xs"
              disabled={locked}
              aria-label="เพิ่มไล่สี"
              onClick={handleEnable}
            >
              <Plus className="size-3.5" />
              ไล่สี
            </Button>
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="xs"
              disabled={locked}
              onClick={handleClear}
            >
              ล้าง
            </Button>
          )}
        </div>
      </div>

      {bothSet ? (
        <p className="text-[11px] text-amber-700 dark:text-amber-400" role="status">
          {GRADIENT_EXCLUSIVE_MSG}
        </p>
      ) : null}

      {value ? (
        <>
          <div
            data-gradient-preview
            className="h-7 w-full rounded-md border border-sidebar-border"
            style={previewCss ? { backgroundImage: previewCss } : undefined}
            aria-hidden
          />

          <FieldRow id="fx-gr-kind" label="ชนิด" overridden={false} locked={locked} group>
            <SegmentedField
              id="fx-gr-kind"
              label="ชนิด"
              options={KIND_OPTIONS}
              value={kind}
              disabled={locked}
              fill
              labelledBy={fieldLabelId("fx-gr-kind")}
              onChange={handleKind}
            />
          </FieldRow>

          {kind !== "radial" ? (
            <FieldRow id="fx-gr-angle" label="มุม" overridden={false} locked={locked}>
              <NumberField
                id="fx-gr-angle"
                value={angle}
                min={0}
                max={360}
                suffix="°"
                disabled={locked}
                onCommit={handleAngle}
              />
            </FieldRow>
          ) : null}

          <FieldRow
            id="fx-gr-text"
            label="ไล่สีที่ตัวอักษร"
            overridden={false}
            locked={locked}
            group
          >
            <Switch
              id="fx-gr-text"
              checked={textFill}
              disabled={locked}
              aria-labelledby={fieldLabelId("fx-gr-text")}
              onCheckedChange={handleTextFill}
            />
          </FieldRow>

          <div className="flex items-center justify-between gap-1 pt-1">
            <span className="text-[11px] text-muted-foreground">จุดสี</span>
            <Button
              type="button"
              variant="outline"
              size="xs"
              disabled={locked || stops.length >= GRADIENT_MAX_STOPS}
              aria-label="เพิ่มจุดสี"
              onClick={handleAdd}
            >
              <Plus className="size-3.5" />
              เพิ่มจุดสี
            </Button>
          </div>

          {stops.map((stop, index) => (
            <GradientStopCard
              key={`gr-${index}`}
              index={index}
              stop={stop}
              total={stops.length}
              locked={locked}
              focusRequest={focusAfterRemove}
              onFocused={() => setFocusAfterRemove(null)}
              onPatch={(p) =>
                write(
                  patchGradient(ensure(), {
                    stops: patchGradientStop(stops, index, p),
                  }),
                )
              }
              onRemove={handleRemoveAt}
            />
          ))}
        </>
      ) : null}
    </div>
  );
}

/** Collapsible ไล่สี sub-group used by StylePanel EffectsSection. */
export function GradientSubGroup(props: GradientEditorProps) {
  const [open, setOpen] = useState(false);
  const bodyId = "fx-gradient-body";
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
        ไล่สี
      </button>
      {open ? (
        <div id={bodyId} className="border-t border-sidebar-border/80 px-2 py-2">
          <GradientEditor {...props} />
        </div>
      ) : null}
    </div>
  );
}

function EffectsCollapse({
  title,
  overridden,
  bodyId,
  children,
}: {
  title: string;
  overridden: boolean;
  bodyId: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-md border border-sidebar-border/80">
      <button
        type="button"
        className={cn(
          "flex h-8 w-full items-center gap-1 px-2 text-xs font-medium",
          overridden ? "text-foreground" : "text-muted-foreground hover:text-foreground",
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
            overridden ? "bg-primary" : "bg-transparent",
          )}
        />
        {title}
      </button>
      {open ? (
        <div id={bodyId} className="border-t border-sidebar-border/80 px-2 py-2">
          {children}
        </div>
      ) : null}
    </div>
  );
}

export type TransformEditorProps = {
  nodeId: string;
  value: TransformValue | undefined;
  locked: boolean;
  bp?: StyleBreakpoint;
  /** B8.1: write into states[name]. */
  state?: NodeStateName | null;
  overridden: boolean;
  onReset?: () => void;
  resetLabel?: string;
  /** Show T105 when the node's effective display is inline. */
  inlineHint?: boolean;
};

export function TransformEditor({
  nodeId,
  value,
  locked,
  bp,
  state,
  overridden,
  onReset,
  resetLabel,
  inlineHint,
}: TransformEditorProps) {
  const v = value ?? {};
  const write = (next: TransformValue | undefined) => {
    writeStyle(
      nodeId,
      "transform",
      next && !isEmptyTransform(next) ? next : undefined,
      bp,
      state,
    );
  };
  const patch = (p: Partial<TransformValue>) => write({ ...v, ...p });

  return (
    <div className="space-y-2" data-effects-panel="transform">
      <div className="flex items-center justify-between gap-1">
        <span className="text-[11px] text-muted-foreground">การแปลง</span>
        <div className="flex items-center gap-1">
          {overridden && onReset && !locked ? (
            <Button type="button" variant="ghost" size="xs" onClick={onReset}>
              {resetLabel ?? "คืนค่าเริ่มต้น"}
            </Button>
          ) : null}
        </div>
      </div>
      {inlineHint ? (
        <p className="text-[11px] text-muted-foreground" role="note">
          องค์ประกอบแบบอินไลน์จะถูกส่งออกเป็นอินไลน์บล็อกเพื่อให้การแปลงทำงาน
        </p>
      ) : null}
      <FieldRow id="fx-tf-tx" label="เลื่อนแนวนอน" overridden={false} locked={locked}>
        <NumberField
          id="fx-tf-tx"
          value={v.translateX ?? 0}
          min={-1000}
          max={1000}
          suffix="px"
          disabled={locked}
          onCommit={(translateX) => patch({ translateX })}
        />
      </FieldRow>
      <FieldRow id="fx-tf-ty" label="เลื่อนแนวตั้ง" overridden={false} locked={locked}>
        <NumberField
          id="fx-tf-ty"
          value={v.translateY ?? 0}
          min={-1000}
          max={1000}
          suffix="px"
          disabled={locked}
          onCommit={(translateY) => patch({ translateY })}
        />
      </FieldRow>
      <FieldRow id="fx-tf-scale" label="ขยาย" overridden={false} locked={locked}>
        <NumberField
          id="fx-tf-scale"
          value={v.scale ?? 1}
          min={0}
          max={5}
          step={0.01}
          disabled={locked}
          onCommit={(scale) => patch({ scale })}
        />
      </FieldRow>
      <FieldRow id="fx-tf-rotate" label="หมุน" overridden={false} locked={locked}>
        <NumberField
          id="fx-tf-rotate"
          value={v.rotate ?? 0}
          min={-360}
          max={360}
          suffix="°"
          disabled={locked}
          onCommit={(rotate) => patch({ rotate })}
        />
      </FieldRow>
      <FieldRow id="fx-tf-sx" label="เอียงแนวนอน" overridden={false} locked={locked}>
        <NumberField
          id="fx-tf-sx"
          value={v.skewX ?? 0}
          min={-360}
          max={360}
          suffix="°"
          disabled={locked}
          onCommit={(skewX) => patch({ skewX })}
        />
      </FieldRow>
      <FieldRow id="fx-tf-sy" label="เอียงแนวตั้ง" overridden={false} locked={locked}>
        <NumberField
          id="fx-tf-sy"
          value={v.skewY ?? 0}
          min={-360}
          max={360}
          suffix="°"
          disabled={locked}
          onCommit={(skewY) => patch({ skewY })}
        />
      </FieldRow>
      <FieldRow id="fx-tf-origin" label="จุดหมุน" overridden={false} locked={locked}>
        <SelectField
          id="fx-tf-origin"
          value={v.origin ?? "center"}
          disabled={locked}
          options={TRANSFORM_ORIGINS.map((o) => ({ value: o, label: o }))}
          onChange={(origin) => patch({ origin: origin as TransformOrigin })}
        />
      </FieldRow>
    </div>
  );
}

export function TransformSubGroup(props: TransformEditorProps) {
  return (
    <EffectsCollapse title="การแปลง" overridden={props.overridden} bodyId="fx-transform-body">
      <TransformEditor {...props} />
    </EffectsCollapse>
  );
}

const EASING_OPTS: { value: TransitionEasing; label: string }[] = [
  { value: "ease", label: "ค่าเริ่มต้น" },
  { value: "ease-in", label: "เร่งเข้า" },
  { value: "ease-out", label: "เร่งออก" },
  { value: "ease-in-out", label: "เร่งเข้า-ออก" },
  { value: "linear", label: "คงที่" },
  { value: "spring", label: "เด้ง" },
];

export type TransitionEditorProps = {
  nodeId: string;
  value: TransitionValue | undefined;
  locked: boolean;
  bp?: StyleBreakpoint;
  /** B8.1: write into states[name]. */
  state?: NodeStateName | null;
  overridden: boolean;
  onReset?: () => void;
  resetLabel?: string;
};

export function TransitionEditor({
  nodeId,
  value,
  locked,
  bp,
  state,
  overridden,
  onReset,
  resetLabel,
}: TransitionEditorProps) {
  const v = value ?? { property: "paint" as const };
  const write = (next: TransitionValue | undefined) => {
    writeStyle(
      nodeId,
      "transition",
      next && !isEmptyTransition(next) ? { ...next, property: "paint" } : undefined,
      bp,
      state,
    );
  };
  const patch = (p: Partial<TransitionValue>) => write({ ...v, property: "paint", ...p });

  return (
    <div className="space-y-2" data-effects-panel="transition">
      <div className="flex items-center justify-between gap-1">
        <span className="text-[11px] text-muted-foreground">การเปลี่ยนผ่าน</span>
        {overridden && onReset && !locked ? (
          <Button type="button" variant="ghost" size="xs" onClick={onReset}>
            {resetLabel ?? "คืนค่าเริ่มต้น"}
          </Button>
        ) : null}
      </div>
      <p className="text-[11px] text-muted-foreground" role="note">
        ผู้ใช้ที่ตั้งค่าลดการเคลื่อนไหวจะไม่เห็นการเลื่อนย้ายและการเปลี่ยนผ่าน
      </p>
      <FieldRow id="fx-tr-dur" label="ระยะเวลา" overridden={false} locked={locked}>
        <NumberField
          id="fx-tr-dur"
          value={v.durationMs ?? 0}
          min={0}
          max={2000}
          suffix="ms"
          disabled={locked}
          onCommit={(durationMs) => patch({ durationMs })}
        />
      </FieldRow>
      <FieldRow id="fx-tr-delay" label="หน่วงเวลา" overridden={false} locked={locked}>
        <NumberField
          id="fx-tr-delay"
          value={v.delayMs ?? 0}
          min={0}
          max={2000}
          suffix="ms"
          disabled={locked}
          onCommit={(delayMs) => patch({ delayMs })}
        />
      </FieldRow>
      <FieldRow id="fx-tr-ease" label="จังหวะ" overridden={false} locked={locked}>
        <SelectField
          id="fx-tr-ease"
          value={(TRANSITION_EASINGS as readonly string[]).includes(v.easing ?? "")
            ? (v.easing as string)
            : "ease"}
          disabled={locked}
          options={EASING_OPTS.map((o) => ({ value: o.value, label: o.label }))}
          onChange={(easing) => patch({ easing: easing as TransitionEasing })}
        />
      </FieldRow>
    </div>
  );
}

export function TransitionSubGroup(props: TransitionEditorProps) {
  return (
    <EffectsCollapse
      title="การเปลี่ยนผ่าน"
      overridden={props.overridden}
      bodyId="fx-transition-body"
    >
      <TransitionEditor {...props} />
    </EffectsCollapse>
  );
}

export type FilterEditorProps = {
  nodeId: string;
  filter: FilterValue | undefined;
  backdrop: BackdropFilterValue | undefined;
  locked: boolean;
  bp?: StyleBreakpoint;
  /** B8.1: write into states[name]. */
  state?: NodeStateName | null;
  overridden: boolean;
  onReset?: () => void;
  resetLabel?: string;
};

export function FilterEditor({
  nodeId,
  filter,
  backdrop,
  locked,
  bp,
  state,
  overridden,
  onReset,
  resetLabel,
}: FilterEditorProps) {
  const f = filter ?? {};
  const b = backdrop ?? {};
  const writeFilter = (next: FilterValue | undefined) => {
    writeStyle(nodeId, "filter", next && !isEmptyFilter(next) ? next : undefined, bp, state);
  };
  const writeBackdrop = (next: BackdropFilterValue | undefined) => {
    writeStyle(
      nodeId,
      "backdropFilter",
      next && !isEmptyBackdropFilter(next) ? next : undefined,
      bp,
      state,
    );
  };
  const patchF = (p: Partial<FilterValue>) => writeFilter({ ...f, ...p });
  const patchB = (p: Partial<BackdropFilterValue>) => writeBackdrop({ ...b, ...p });
  const blurWarn = useEditorStore((s) => s.pagePerfWarnings.find((w) => w.kind === "blur"));
  const blurCount = useEditorStore((s) => s.pagePerfStats?.blurEffects ?? 0);

  return (
    <div className="space-y-2" data-effects-panel="filter">
      <div className="flex items-center justify-between gap-1">
        <span className="text-[11px] text-muted-foreground">ฟิลเตอร์</span>
        {overridden && onReset && !locked ? (
          <Button type="button" variant="ghost" size="xs" onClick={onReset}>
            {resetLabel ?? "คืนค่าเริ่มต้น"}
          </Button>
        ) : null}
      </div>
      {blurWarn ? (
        <p className="text-[11px] text-amber-700 dark:text-amber-400" role="status" data-perf-warn="blur">
          {blurWarn.message}
        </p>
      ) : blurCount > 0 ? (
        <p className="text-[11px] text-muted-foreground">
          เบลอในหน้านี้ {blurCount}/{MAX_BLUR_EFFECTS}
        </p>
      ) : null}
      <FieldRow id="fx-fi-bright" label="ความสว่าง" overridden={false} locked={locked}>
        <NumberField
          id="fx-fi-bright"
          value={f.brightness ?? 100}
          min={0}
          max={300}
          suffix="%"
          disabled={locked}
          onCommit={(brightness) => patchF({ brightness })}
        />
      </FieldRow>
      <FieldRow id="fx-fi-contrast" label="คอนทราสต์" overridden={false} locked={locked}>
        <NumberField
          id="fx-fi-contrast"
          value={f.contrast ?? 100}
          min={0}
          max={300}
          suffix="%"
          disabled={locked}
          onCommit={(contrast) => patchF({ contrast })}
        />
      </FieldRow>
      <FieldRow id="fx-fi-sat" label="ความอิ่มสี" overridden={false} locked={locked}>
        <NumberField
          id="fx-fi-sat"
          value={f.saturate ?? 100}
          min={0}
          max={300}
          suffix="%"
          disabled={locked}
          onCommit={(saturate) => patchF({ saturate })}
        />
      </FieldRow>
      <FieldRow id="fx-fi-gray" label="ขาวดำ" overridden={false} locked={locked}>
        <NumberField
          id="fx-fi-gray"
          value={f.grayscale ?? 0}
          min={0}
          max={100}
          suffix="%"
          disabled={locked}
          onCommit={(grayscale) => patchF({ grayscale })}
        />
      </FieldRow>
      <FieldRow id="fx-fi-blur" label="เบลอ" overridden={false} locked={locked}>
        <NumberField
          id="fx-fi-blur"
          value={f.blur ?? 0}
          min={0}
          max={40}
          suffix="px"
          disabled={locked}
          onCommit={(blur) => patchF({ blur })}
        />
      </FieldRow>
      <FieldRow id="fx-fi-hue" label="หมุนสี" overridden={false} locked={locked}>
        <NumberField
          id="fx-fi-hue"
          value={f.hueRotate ?? 0}
          min={0}
          max={360}
          suffix="°"
          disabled={locked}
          onCommit={(hueRotate) => patchF({ hueRotate })}
        />
      </FieldRow>

      <div className="border-t border-sidebar-border/80 pt-2">
        <span className="text-[11px] text-muted-foreground">เบลอฉากหลัง</span>
        <p className="mt-1 text-[11px] text-muted-foreground" role="note">
          ฉากหลังเบลอเปลืองหน่วยความจำ ใช้เท่าที่จำเป็น
        </p>
      </div>
      <FieldRow id="fx-bf-blur" label="เบลอฉากหลัง" overridden={false} locked={locked}>
        <NumberField
          id="fx-bf-blur"
          value={b.blur ?? 0}
          min={0}
          max={40}
          suffix="px"
          disabled={locked}
          onCommit={(blur) => patchB({ blur })}
        />
      </FieldRow>
      <FieldRow id="fx-bf-sat" label="ความอิ่มสี" overridden={false} locked={locked}>
        <NumberField
          id="fx-bf-sat"
          value={b.saturate ?? 100}
          min={0}
          max={300}
          suffix="%"
          disabled={locked}
          onCommit={(saturate) => patchB({ saturate })}
        />
      </FieldRow>
      <FieldRow id="fx-bf-bright" label="ความสว่าง" overridden={false} locked={locked}>
        <NumberField
          id="fx-bf-bright"
          value={b.brightness ?? 100}
          min={0}
          max={300}
          suffix="%"
          disabled={locked}
          onCommit={(brightness) => patchB({ brightness })}
        />
      </FieldRow>
    </div>
  );
}

export function FilterSubGroup(props: FilterEditorProps) {
  return (
    <EffectsCollapse title="ฟิลเตอร์" overridden={props.overridden} bodyId="fx-filter-body">
      <FilterEditor {...props} />
    </EffectsCollapse>
  );
}
