import { Suspense, memo, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { toast } from "@/lib/toast";
import { ChevronDown, ChevronRight, EyeOff, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  NODE_TYPE_LABEL,
  breakpointKeySet,
  isContentLocked,
  nodeDisplayName,
  type StyleKey,
} from "@/lib/document-ops";
import { effectiveSize, type DeviceId } from "@/lib/devices";
import {
  FONT_PRESETS,
  STYLE_SECTIONS,
  WEIGHT_OPTIONS,
  fieldEffective,
  fieldsFor,
  hasLayoutProps,
  isFieldOverridden,
  layoutDirection,
  overflowSegmentValue,
  type FieldDef,
  type SectionId,
} from "@/lib/style-fields";
import {
  ASPECT_RATIOS,
  isVisible,
  resolvedStyle,
  STATE_PAINT_KEYS,
  type BoxSpacing,
  type Node,
  type NodeStateName,
  type StatePaintKey,
  type StyleBreakpoint,
  type StyleProps,
} from "@/schema";
import {
  CLEAR_THIS_STATE_LABEL,
  STATE_LOCKS_BREAKPOINT_MSG,
  STATE_PAINT_ONLY_HINT,
  STATE_SWITCH_OPTIONS,
  nodeOffersFocusState,
} from "@/lib/node-state-ui";
import { nodeTypeHasPresets } from "@/lib/presets-registry";
import { cn } from "@/lib/utils";
import { lazyNamed, useMountedOnce, whenIdle } from "@/lib/lazy";
import { useEditorStore } from "@/stores/editor-store";
import { usePreviewDeviceStore } from "@/stores/preview-device-store";
import { useProjectsStore } from "@/stores/projects-store";
import { FieldRow, fieldLabelId } from "@/components/editor/style/FieldRow";
import { Phase6bProps } from "@/components/editor/phase6b-props";
import { isPhase6bType } from "@/schema";
import { NumberField } from "@/components/editor/style/NumberField";
import { UnitField } from "@/components/editor/style/UnitField";
import { useBoxSpacing } from "@/components/editor/style/BoxSpacingField";
import { BorderExtras } from "@/components/editor/style/BorderExtras";
import { useColorField } from "@/components/editor/style/ColorField";
import { SegmentedField } from "@/components/editor/style/SegmentedField";
import { SelectField } from "@/components/editor/style/SelectField";
import { OpacityField } from "@/components/editor/style/OpacityField";
import { TextPropField } from "@/components/editor/style/TextPropField";
import { formatSelectOptions, parseSelectOptions } from "@/lib/select-options";
import { formatListItems, parseListItems } from "@/lib/list-items";
import { A2_TEXTS } from "@/lib/a2-looks";
import type { ListMarker } from "@/schema";

// Button link field + page picker (cmdk): its own chunk, preloaded on idle.
const ButtonLinkField = lazyNamed(() =>
  import("@/components/editor/style/ButtonLinkField").then((m) => m.ButtonLinkField),
);
// Phase 11 A4.3: table grid editor (own chunk; no whenIdle preload per §5).
const TableEditor = lazyNamed(() =>
  import("@/components/editor/table-editor").then((m) => m.TableEditor),
);
// Phase 11 A4.4/A4.5: curated Lucide paths + picker (own chunk; no whenIdle preload per §5).
const IconPathsChunk = lazyNamed(() =>
  import("@/components/editor/icon-paths").then((m) => {
    void m.getIconPaths;
    return m.IconPathsLazyAnchor;
  }),
);
const IconPicker = lazyNamed(() =>
  import("@/components/editor/icon-paths").then((m) => m.IconPicker),
);
// Phase 11 A5.3: chart SVG renderer (own chunk; no whenIdle preload per §5).
const ChartRenderChunk = lazyNamed(() =>
  import("@/components/editor/chart-render").then((m) => {
    void m.renderChartSvg;
    return m.ChartRenderLazyAnchor;
  }),
);
// Phase 11 A5.4: chart data editor (own chunk; no whenIdle preload per §5).
const ChartEditor = lazyNamed(() =>
  import("@/components/editor/chart-editor").then((m) => m.ChartEditor),
);
// Phase 11 A5.5: calendar month grid renderer (own chunk; no whenIdle preload per §5).
const CalendarRenderChunk = lazyNamed(() =>
  import("@/components/editor/calendar-render").then((m) => {
    void m.renderCalendarHtml;
    return m.CalendarRenderLazyAnchor;
  }),
);

/** B2.2 / B3.2: lazy effects editors — must NOT land in the initial JS chunk. */
const ShadowSubGroup = lazyNamed(() =>
  import("@/components/editor/effects-panels").then((m) => m.ShadowSubGroup),
);
const GradientSubGroup = lazyNamed(() =>
  import("@/components/editor/effects-panels").then((m) => m.GradientSubGroup),
);
const TransformSubGroup = lazyNamed(() =>
  import("@/components/editor/effects-panels").then((m) => m.TransformSubGroup),
);
const TransitionSubGroup = lazyNamed(() =>
  import("@/components/editor/effects-panels").then((m) => m.TransitionSubGroup),
);
const FilterSubGroup = lazyNamed(() =>
  import("@/components/editor/effects-panels").then((m) => m.FilterSubGroup),
);
// Phase 11 C3: preset picker (own chunk; no whenIdle preload per §5).
const PresetPicker = lazyNamed(() =>
  import("@/components/editor/preset-picker").then((m) => m.PresetPicker),
);
import {
  applyOps,
  propOp,
  styleOp,
  writeClearNodeState,
  writeInputSuggestions,
  writeListItems,
  writeProp,
  writeStyle,
} from "@/components/editor/style/write";

/**
 * Style panel (docs/STYLE-PANEL-SPEC.md). Driven by the field table in
 * `lib/style-fields.ts`; all writes go through setNodeStyle / setNodeProp.
 */
type StyleSegment = "desktop" | StyleBreakpoint;

const STYLE_SEGMENTS: { value: StyleSegment; label: string }[] = [
  { value: "desktop", label: "เดสก์ท็อป" },
  { value: "tablet", label: "แท็บเล็ต" },
  { value: "phone", label: "โทรศัพท์" },
  { value: "foldOpen", label: "จอพับ" },
];

const SEGMENT_LABEL: Record<"desktop" | "tablet" | "phone", string> = {
  desktop: "เดสก์ท็อป",
  tablet: "แท็บเล็ต",
  phone: "โทรศัพท์",
};

/** Width query the current preview frame would match. Not a device change. */
function widthSegment(w: number): "desktop" | "tablet" | "phone" {
  if (w <= 719) return "phone";
  if (w <= 1024) return "tablet";
  return "desktop";
}

function frameNote(
  preset: DeviceId,
  landscape: boolean,
  customW: number,
  multi: boolean,
): string {
  if (multi) return "หลายเฟรม — แต่ละเฟรมใช้ความกว้างของตัวเอง";
  if (preset === "fill") return "เต็มพื้นที่ใช้ความกว้างของเวที ไม่ใช่จุดพักที่เลือก";
  const size = effectiveSize(preset, landscape, { w: customW, h: 768 });
  if (!size) return "เต็มพื้นที่ใช้ความกว้างของเวที ไม่ใช่จุดพักที่เลือก";
  if (preset === "fold-open" || preset === "pixel-fold-open") {
    return `เฟรมนี้กว้าง ${size.w}px ใช้กฎแท็บเล็ต — จอพับยังไม่ถูกใช้ในพรีวิว`;
  }
  return `เฟรมปัจจุบันใช้${SEGMENT_LABEL[widthSegment(size.w)]}`;
}

export function StylePanel() {
  // A4.4: keep the icon-paths lazy binding live so Rollup emits the chunk; A4.5 preloads/renders.
  void IconPathsChunk;
  void ChartRenderChunk;
  void CalendarRenderChunk;
  const selectedNodeId = useEditorStore((s) => s.selectedNodeId);
  // Survives selection changes. Does not switch the preview device.
  const [segment, setSegment] = useState<StyleSegment>("desktop");
  const setSelectedNodeId = useEditorStore((s) => s.setSelectedNodeId);
  // Subscribe to the selected node only — edits elsewhere keep this reference.
  const node = useProjectsStore((s) =>
    selectedNodeId ? s.openDocument?.nodes[selectedNodeId] : undefined,
  );
  const isRoot = useProjectsStore(
    (s) => !!selectedNodeId && s.openDocument?.root === selectedNodeId,
  );
  useEffect(() => whenIdle(() => void ButtonLinkField.preload()), []);

  // Selected node deleted → fall back to None.
  useEffect(() => {
    if (selectedNodeId && !node && useProjectsStore.getState().openDocument) {
      setSelectedNodeId(null);
    }
  }, [selectedNodeId, node, setSelectedNodeId]);

  return (
    <aside className="flex h-full w-full min-w-0 flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex h-10 shrink-0 items-center px-3">
        <span className="text-[11px] font-medium text-muted-foreground">
          สไตล์
        </span>
      </div>
      {!node ? (
        <div className="flex flex-1 items-center justify-center px-4">
          <p className="text-center text-sm text-muted-foreground">
            เลือกองค์ประกอบเพื่อแก้ไข
          </p>
        </div>
      ) : (
        // key = node id → switching selection remounts and drops half-typed input.
        <PanelBody
          key={node.id}
          node={node}
          isRoot={isRoot}
          segment={segment}
          onSegment={setSegment}
        />
      )}
    </aside>
  );
}

function PanelBody({
  node,
  isRoot,
  segment,
  onSegment,
}: {
  node: Node;
  isRoot: boolean;
  segment: StyleSegment;
  onSegment: (segment: StyleSegment) => void;
}) {
  const doc = useProjectsStore((s) => s.openDocument);
  const eff = useMemo(() => resolvedStyle(node), [node]);
  const locked = !!doc && isContentLocked(doc, node);
  const typeLabel = NODE_TYPE_LABEL[node.type];
  const preset = usePreviewDeviceStore((s) => s.preset);
  const landscape = usePreviewDeviceStore((s) => s.landscape);
  const customW = usePreviewDeviceStore((s) => s.custom.w);
  const multi = usePreviewDeviceStore((s) => s.multi);
  const editState = useEditorStore((s) => s.forceDisplayState);
  const setForceDisplayState = useEditorStore((s) => s.setForceDisplayState);
  const announce = useEditorStore((s) => s.announce);
  const offersFocus = nodeOffersFocusState(node);
  const stateOptions = STATE_SWITCH_OPTIONS.filter(
    (o) => o.value !== "focusVisible" || offersFocus,
  );
  const onState = editState !== null;

  const chooseState = (raw: string) => {
    if (raw === "normal") {
      setForceDisplayState(null);
      return;
    }
    const name = raw as NodeStateName;
    if (name === "focusVisible" && !offersFocus) return;
    setForceDisplayState(name);
    if (segment !== "desktop") {
      onSegment("desktop");
      announce(STATE_LOCKS_BREAKPOINT_MSG);
    }
  };

  return (
    <div className="scrollbar-thin flex-1 overflow-auto px-3 pb-4">
      {locked ? (
        <div className="mb-3 flex min-w-0 items-start gap-1.5 rounded-md border border-border bg-muted/60 px-2 py-1.5 text-xs text-muted-foreground">
          <Lock className="mt-0.5 size-3 shrink-0" aria-hidden />
          <span className="min-w-0 break-words">องค์ประกอบถูกล็อก ปลดล็อกจากเมนูเลเยอร์หรือเมนูหน้าเพื่อแก้ไข</span>
        </div>
      ) : null}

      {nodeTypeHasPresets(node.type) ? (
        <div className="mb-3">
          <Suspense fallback={null}>
            <PresetPicker node={node} locked={locked} />
          </Suspense>
        </div>
      ) : null}

      <div className="mb-3 space-y-1">
        <SegmentedField
          id="sf-breakpoint"
          label="จุดพักสไตล์"
          fill
          disabled={locked || onState}
          value={onState ? "desktop" : segment}
          options={STYLE_SEGMENTS}
          className="h-7 p-0"
          itemClassName="h-7 px-0.5 text-[11px] leading-4"
          onChange={(v) => onSegment(v as StyleSegment)}
        />
        <SegmentedField
          id="sf-state"
          label="สถานะ"
          fill
          disabled={locked}
          value={editState ?? "normal"}
          options={stateOptions.map((o) => ({
            value: o.value,
            label: o.label,
          }))}
          className="h-7 p-0"
          itemClassName="h-7 px-0.5 text-[11px] leading-4"
          onChange={chooseState}
        />
        {onState ? (
          <p className="text-[11px] text-muted-foreground" role="note">
            {STATE_PAINT_ONLY_HINT}
          </p>
        ) : (
          <p className="text-[11px] text-muted-foreground">
            {frameNote(preset, landscape, customW, multi)}
          </p>
        )}
        {onState && editState && node.states?.[editState] && !locked ? (
          <Button
            type="button"
            variant="ghost"
            size="xs"
            className="h-7 px-1.5 text-[11px]"
            onClick={() => writeClearNodeState(node.id, editState)}
          >
            {CLEAR_THIS_STATE_LABEL}
          </Button>
        ) : null}
        {!offersFocus ? (
          <p className="text-[11px] text-muted-foreground" role="note">
            โฟกัสด้วยคีย์บอร์ดใช้ได้กับปุ่มที่มีลิงก์ ลิงก์ และช่องกรอกเท่านั้น
          </p>
        ) : null}
      </div>

      <section className="space-y-2 pb-3">
        <h3 className="text-xs font-medium text-muted-foreground">องค์ประกอบ</h3>
        <div>
          <p className="truncate text-sm font-medium">
            {isRoot ? "หน้า" : nodeDisplayName(node)}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {typeLabel}
            {node.props.type === "heading" ? ` · ${typeLabel} H${node.props.level}` : ""}
          </p>
        </div>
        {isRoot ? (
          <p className="text-xs text-muted-foreground">สไตล์ของหน้าจะใช้กับทั้งหน้า</p>
        ) : null}
        {!isVisible(node) ? (
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <EyeOff className="size-3" aria-hidden /> ซ่อนอยู่บนผืนผ้าใบ
          </p>
        ) : null}
        {node.props.type === "heading" ? (
          <FieldRow id="sf-level" label="ระดับหัวข้อ" overridden={false} locked={locked} group stacked>
            <SegmentedField
              id="sf-level"
              label="ระดับหัวข้อ"
              labelledBy={fieldLabelId("sf-level")}
              fill
              disabled={locked}
              value={String(node.props.level)}
              options={[1, 2, 3, 4, 5, 6].map((l) => ({
                value: String(l),
                label: `H${l}`,
              }))}
              onChange={(v) => writeProp(node.id, "level", Number(v))}
            />
          </FieldRow>
        ) : null}
      </section>

      {onState ? null : <NodePropsSection node={node} locked={locked} />}

      {STYLE_SECTIONS.map((sec) => {
        if (sec.id === "effects") {
          return (
            <EffectsSection
              key={sec.id}
              node={node}
              locked={locked}
              segment={onState ? "desktop" : segment}
              editState={editState}
            />
          );
        }
        let fields = fieldsFor(sec.id, node.type);
        if (onState) {
          fields = fields.filter(
            (f) =>
              f.target === "style" &&
              (STATE_PAINT_KEYS as readonly string[]).includes(f.key),
          );
        }
        if (fields.length === 0) return null; // hide section entirely (§1)
        return (
          <StyleSection
            key={sec.id}
            id={sec.id}
            label={sec.label}
            fields={fields}
            node={node}
            eff={eff}
            locked={locked}
            segment={onState ? "desktop" : segment}
            editState={editState}
          />
        );
      })}
    </div>
  );
}

/**
 * คุณสมบัติ — non-style props: link href/openInNewTab, image src, and the
 * input/switch rows, button link (href + action, PHASE-9-SPEC §3). Text
 * content is inline.
 */

/** Phase 11 A3.5 T23: multiline suggestions; blur / Ctrl|Cmd+Enter commits. */
function SuggestionsLinesRow({
  nodeId,
  suggestions,
  locked,
}: {
  nodeId: string;
  suggestions: readonly string[];
  locked: boolean;
}) {
  const value = formatSelectOptions(suggestions);
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft !== null) writeInputSuggestions(nodeId, parseSelectOptions(draft));
    setDraft(null);
  };
  return (
    <FieldRow id="pf-suggestions" label="ตัวเลือกคำแนะนำ" overridden={false} locked={locked} stacked>
      <textarea
        id="pf-suggestions"
        value={draft ?? value}
        disabled={locked}
        spellCheck={false}
        rows={Math.min(8, Math.max(3, suggestions.length + 1))}
        className="min-h-[4.5rem] w-full min-w-0 resize-y rounded-md border bg-transparent px-2 py-1.5 text-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring disabled:opacity-50"
        onChange={(e) => setDraft(e.currentTarget.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            setDraft(null);
          } else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            (e.currentTarget as HTMLTextAreaElement).blur();
          }
        }}
      />
    </FieldRow>
  );
}

function errText(e: unknown): string {
  if (typeof e === "string" && e.trim()) return e;
  if (e instanceof Error && e.message.trim()) return e.message;
  return "นำเข้ารูปไม่สำเร็จ";
}

/** Pick a local image. Cancel does not write. A successful pick is one `srcId` write. */
function ImageFileButton({
  nodeId,
  assetId,
  locked,
}: {
  nodeId: string;
  assetId: string;
  locked: boolean;
}) {
  const projectId = useProjectsStore((s) => s.openId);
  const [busy, setBusy] = useState(false);
  const hasFile = assetId.trim() !== "";
  return (
    <FieldRow id="pf-src" label="รูป" overridden={false} locked={locked}>
      <Button
        id="pf-src"
        type="button"
        variant="outline"
        size="sm"
        className="h-7 w-full text-[11px]"
        disabled={locked || busy || !projectId}
        aria-busy={busy}
        onClick={() => {
          if (locked || busy || !projectId) return;
          setBusy(true);
          void (async () => {
            try {
              const picked = await open({
                title: hasFile ? "เปลี่ยนรูป" : "เลือกรูป",
                multiple: false,
                filters: [{ name: "รูป", extensions: ["jpg", "jpeg", "png", "gif", "webp"] }],
              });
              // Cancel, or a multi-select we did not ask for: do not dirty.
              if (picked == null || Array.isArray(picked)) return;
              const imported = await invoke<{ id: string }>("import_image", {
                projectId,
                path: picked,
              });
              writeProp(nodeId, "srcId", imported.id);
            } catch (e) {
              toast.error(errText(e));
            } finally {
              setBusy(false);
            }
          })();
        }}
      >
        {hasFile ? "เปลี่ยนรูป" : "เลือกรูป"}
      </Button>
    </FieldRow>
  );
}

function NodePropsSection({ node, locked }: { node: Node; locked: boolean }) {
  if (isPhase6bType(node.type)) return <Phase6bProps node={node} locked={locked} />;
  const p = node.props;
  if (
    p.type === "badge" || p.type === "separator" || p.type === "spinner" || p.type === "aspectRatio" || p.type === "scrollArea"
  ) {
    return <A2Props node={node} locked={locked} />;
  }
  if (p.type === "carousel") {
    return <CarouselPropsEditor nodeId={node.id} slidesPerView={p.slidesPerView ?? 1} locked={locked} />;
  }
  if (p.type === "chart") {
    return (
      <section className="space-y-2 border-t border-sidebar-border py-2">
        <h3 className="text-xs font-medium text-muted-foreground">คุณสมบัติ</h3>
        <ChartPropsEditor
          nodeId={node.id}
          kind={p.kind}
          categories={p.categories}
          series={p.series}
          caption={p.caption}
          locked={locked}
        />
      </section>
    );
  }
  if (p.type === "calendar") {
    return (
      <CalendarPropsEditor
        nodeId={node.id}
        year={p.year}
        month={p.month}
        selectedDay={p.selectedDay}
        weekStart={p.weekStart}
        era={p.era}
        locked={locked}
      />
    );
  }
  if (
    p.type !== "button" &&
    p.type !== "link" &&
    p.type !== "image" &&
    p.type !== "input" &&
    p.type !== "switch" &&
    p.type !== "checkbox" &&
    p.type !== "field" &&
    p.type !== "list" &&
    p.type !== "table" &&
    p.type !== "icon"
  ) {
    return null;
  }
  return (
    <section className="space-y-2 border-t border-sidebar-border py-2">
      <h3 className="text-xs font-medium text-muted-foreground">คุณสมบัติ</h3>
      {p.type === "button" ? (
        <Suspense fallback={<div className="h-7" />}>
          <ButtonLinkField
            nodeId={node.id}
            // Same "is a link" rule as the compiler: action not none + non-blank href.
            value={p.action !== "none" && p.href?.trim() ? p.href : ""}
            disabled={locked}
          />
        </Suspense>
      ) : p.type === "link" ? (
        <>
          {/* Same URL / เลือกหน้า control as button (HrefField via ButtonLinkField chunk). */}
          <Suspense fallback={<div className="h-7" />}>
            <ButtonLinkField nodeId={node.id} value={p.href} disabled={locked} />
          </Suspense>
          <FieldRow id="pf-newtab" label="เปิดแท็บใหม่" overridden={false} locked={locked}>
            <Switch
              id="pf-newtab"
              size="lg"
              checked={p.openInNewTab === true}
              disabled={locked}
              onCheckedChange={(c) => {
                // One write per real change (Radix only fires on toggle).
                if (c !== (p.openInNewTab === true)) writeProp(node.id, "openInNewTab", c);
              }}
            />
          </FieldRow>
        </>
      ) : p.type === "image" ? (
        <>
          <ImageFileButton nodeId={node.id} assetId={p.src.id} locked={locked} />
          <FieldRow id="pf-alt" label="ข้อความแทนรูป" overridden={false} locked={locked}>
            <TextPropField
              id="pf-alt"
              value={p.src.alt ?? ""}
              placeholder="—"
              disabled={locked}
              onCommit={(v) => writeProp(node.id, "srcAlt", v)}
            />
          </FieldRow>
        </>
      ) : p.type === "input" ? (
        <>
          <FieldRow id="pf-input-label" label="ป้ายกำกับ" overridden={false} locked={locked}>
            <TextPropField
              id="pf-input-label"
              value={p.label}
              placeholder="—"
              disabled={locked}
              onCommit={(v) => writeProp(node.id, "label", v)}
            />
          </FieldRow>
          <FieldRow id="pf-placeholder" label="ข้อความตัวอย่าง" overridden={false} locked={locked}>
            <TextPropField
              id="pf-placeholder"
              value={p.placeholder}
              placeholder="พิมพ์ที่นี่"
              disabled={locked}
              onCommit={(v) => writeProp(node.id, "placeholder", v)}
            />
          </FieldRow>
          {/* Phase 11 A3.5 T23: one suggestion per line → native <datalist> on export. */}
          <SuggestionsLinesRow
            nodeId={node.id}
            suggestions={p.suggestions ?? []}
            locked={locked}
          />
        </>
      ) : p.type === "checkbox" ? (
        <>
          {/* Phase 11 A3.1: T21 ป้ายกำกับ, T20 ติ๊กอยู่ (the saved state; the canvas never toggles). */}
          <FieldRow id="pf-checkbox-label" label="ป้ายกำกับ" overridden={false} locked={locked}>
            <TextPropField
              id="pf-checkbox-label"
              value={p.label}
              placeholder="—"
              disabled={locked}
              onCommit={(v) => writeProp(node.id, "label", v)}
            />
          </FieldRow>
          <FieldRow id="pf-checkbox-checked" label="ติ๊กอยู่" overridden={false} locked={locked}>
            <Switch
              id="pf-checkbox-checked"
              size="lg"
              checked={p.checked}
              disabled={locked}
              onCheckedChange={(c) => {
                if (c !== p.checked) writeProp(node.id, "checked", c);
              }}
            />
          </FieldRow>
        </>
      ) : p.type === "field" ? (
        <>
          {/* Phase 11 A3.3: T21 ป้ายกำกับ; description / error (no dedicated T-keys — for Designer). */}
          <FieldRow id="pf-field-label" label="ป้ายกำกับ" overridden={false} locked={locked}>
            <TextPropField
              id="pf-field-label"
              value={p.label}
              placeholder="—"
              disabled={locked}
              onCommit={(v) => writeProp(node.id, "label", v)}
            />
          </FieldRow>
          <FieldRow id="pf-field-description" label="คำอธิบาย" overridden={false} locked={locked}>
            <TextPropField
              id="pf-field-description"
              value={p.description ?? ""}
              placeholder="—"
              disabled={locked}
              onCommit={(v) => writeProp(node.id, "description", v)}
            />
          </FieldRow>
          <FieldRow id="pf-field-error" label="ข้อผิดพลาด" overridden={false} locked={locked}>
            <TextPropField
              id="pf-field-error"
              value={p.error ?? ""}
              placeholder="—"
              disabled={locked}
              onCommit={(v) => writeProp(node.id, "error", v)}
            />
          </FieldRow>
        </>
      ) : p.type === "list" ? (
        <ListPropsEditor nodeId={node.id} items={p.items} ordered={p.ordered} marker={p.marker} locked={locked} />
      ) : p.type === "table" ? (
        <TablePropsEditor
          nodeId={node.id}
          columns={p.columns}
          rows={p.rows}
          caption={p.caption}
          headerRow={p.headerRow}
          striped={p.striped}
          locked={locked}
        />
      ) : p.type === "icon" ? (
        <IconPropsEditor
          nodeId={node.id}
          name={p.name}
          label={p.label}
          locked={locked}
        />
      ) : (
        <>
          <FieldRow id="pf-switch-label" label="ป้ายกำกับ" overridden={false} locked={locked}>
            <TextPropField
              id="pf-switch-label"
              value={p.label}
              placeholder="—"
              disabled={locked}
              onCommit={(v) => writeProp(node.id, "label", v)}
            />
          </FieldRow>
          <FieldRow id="pf-checked" label="เปิด" overridden={false} locked={locked}>
            <Switch
              id="pf-checked"
              size="lg"
              checked={p.checked}
              disabled={locked}
              onCheckedChange={(c) => {
                if (c !== p.checked) writeProp(node.id, "checked", c);
              }}
            />
          </FieldRow>
        </>
      )}
    </section>
  );
}

const RATIO_OPTIONS = ASPECT_RATIOS.map((r) => ({ value: r, label: r.replace("/", ":") }));
const ORIENT_H_V = [
  { value: "horizontal", label: "แนวนอน" }, // T73
  { value: "vertical", label: "แนวตั้ง" }, // T74
] as const;
const ORIENT_SCROLL = [
  { value: "vertical", label: "แนวตั้ง" }, // T74
  { value: "horizontal", label: "แนวนอน" }, // T73
  { value: "both", label: "ทั้งสองแนว" }, // T12
] as const;

const LIST_MARKER_OPTS = [
  { value: "disc", label: "จุด" }, // T27
  { value: "decimal", label: "ตัวเลข" },
  { value: "check", label: "ติ๊กถูก" }, // T28
  { value: "none", label: "ไม่มี" },
] as const;

const listLinesCls =
  "min-h-[4.5rem] w-full min-w-0 resize-y rounded-md border bg-transparent px-2 py-1.5 text-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring disabled:opacity-50";

/** Phase 11 A4.1: T24 items + T25 ordered + T26–T28 marker. */
function ListPropsEditor({
  nodeId,
  items,
  ordered,
  marker,
  locked,
}: {
  nodeId: string;
  items: readonly string[];
  ordered: boolean;
  marker: ListMarker;
  locked: boolean;
}) {
  const value = formatListItems(items);
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft !== null) writeListItems(nodeId, parseListItems(draft));
    setDraft(null);
  };
  return (
    <>
      <FieldRow id="pf-list-items" label="รายการ (หนึ่งบรรทัดต่อหนึ่งข้อ)" overridden={false} locked={locked} stacked>
        <textarea
          id="pf-list-items"
          value={draft ?? value}
          disabled={locked}
          spellCheck={false}
          rows={Math.min(8, Math.max(3, items.length + 1))}
          className={listLinesCls}
          onChange={(e) => setDraft(e.currentTarget.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              setDraft(null);
            } else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              e.currentTarget.blur();
            }
          }}
        />
      </FieldRow>
      <FieldRow id="pf-list-ordered" label="เรียงลำดับ" overridden={false} locked={locked}>
        <Switch
          id="pf-list-ordered"
          size="lg"
          checked={ordered}
          disabled={locked}
          onCheckedChange={(c) => {
            if (c !== ordered) writeProp(nodeId, "ordered", c);
          }}
        />
      </FieldRow>
      <FieldRow id="pf-list-marker" label="เครื่องหมายนำหน้า" overridden={false} locked={locked} group>
        <SegmentedField
          id="pf-list-marker"
          label="เครื่องหมายนำหน้า"
          labelledBy={fieldLabelId("pf-list-marker")}
          fill
          disabled={locked}
          value={marker}
          options={LIST_MARKER_OPTS}
          onChange={(v) => writeProp(nodeId, "marker", v)}
        />
      </FieldRow>
    </>
  );
}

/** Phase 11 A4.5: icon name picker (T36) + optional label (T38b); size/stroke via FIELDS. */
function IconPropsEditor({
  nodeId,
  name,
  label,
  locked,
}: {
  nodeId: string;
  name: string;
  label?: string;
  locked: boolean;
}) {
  return (
    <>
      <FieldRow id="pf-icon-name" label="ชื่อไอคอน" overridden={false} locked={locked} stacked>
        <Suspense fallback={<p className="text-[11px] text-muted-foreground">กำลังโหลดไอคอน…</p>}>
          <IconPicker
            value={name}
            disabled={locked}
            onPick={(n) => writeProp(nodeId, "name", n)}
          />
        </Suspense>
      </FieldRow>
      <FieldRow id="pf-icon-label" label="คำอธิบายไอคอน (เว้นว่างถ้าเป็นของตกแต่ง)" overridden={false} locked={locked}>
        <TextPropField
          id="pf-icon-label"
          value={label ?? ""}
          placeholder="—"
          disabled={locked}
          onCommit={(v) => writeProp(nodeId, "label", v)}
        />
      </FieldRow>
    </>
  );
}

/** Phase 11 A4.3: open lazy table-editor dialog (T29); options T29a–c live in the dialog. */
function TablePropsEditor({
  nodeId,
  columns,
  rows,
  caption,
  headerRow,
  striped,
  locked,
}: {
  nodeId: string;
  columns: readonly string[];
  rows: readonly (readonly string[])[];
  caption?: string;
  headerRow: boolean;
  striped: boolean;
  locked: boolean;
}) {
  const [open, setOpen] = useState(false);
  const mounted = useMountedOnce(open);
  const tableEditBtn = useRef<HTMLButtonElement>(null);
  return (
    <>
      <FieldRow id="pf-table-edit" label="ตาราง" overridden={false} locked={locked}>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="w-full"
          disabled={locked}
          ref={tableEditBtn}
          onClick={() => setOpen(true)}
        >
          แก้ไขตาราง
        </Button>
      </FieldRow>
      <p className="text-[11px] text-muted-foreground">
        {columns.length} คอลัมน์ · {rows.length} แถว
        {headerRow ? " · มีหัวตาราง" : ""}
        {striped ? " · สลับสี" : ""}
        {caption?.trim() ? ` · ${caption.trim()}` : ""}
      </p>
      {mounted ? (
        <Suspense fallback={null}>
          <TableEditor
            open={open}
            onOpenChange={setOpen}
            returnFocusRef={tableEditBtn}
            nodeId={nodeId}
            columns={columns}
            rows={rows}
            caption={caption}
            headerRow={headerRow}
            striped={striped}
            locked={locked}
          />
        </Suspense>
      ) : null}
    </>
  );
}

/** Phase 11 A5.4: open lazy chart-editor dialog (T41–T48). */
function ChartPropsEditor({
  nodeId,
  kind,
  categories,
  series,
  caption,
  locked,
}: {
  nodeId: string;
  kind: import("@/schema").ChartKind;
  categories: readonly string[];
  series: readonly import("@/schema").ChartSeries[];
  caption?: string;
  locked: boolean;
}) {
  const [open, setOpen] = useState(false);
  const mounted = useMountedOnce(open);
  const kindLabel = kind === "line" ? "เส้น" : kind === "area" ? "พื้นที่" : "แท่ง";
  return (
    <>
      <FieldRow id="pf-chart-edit" label="กราฟ" overridden={false} locked={locked}>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="w-full"
          disabled={locked}
          onClick={() => setOpen(true)}
        >
          ข้อมูลกราฟ
        </Button>
      </FieldRow>
      <p className="text-[11px] text-muted-foreground">
        {kindLabel} · {categories.length} หมวด · {series.length} ชุด
        {caption?.trim() ? ` · ${caption.trim()}` : ""}
      </p>
      {mounted ? (
        <Suspense fallback={null}>
          <ChartEditor
            open={open}
            onOpenChange={setOpen}
            nodeId={nodeId}
            kind={kind}
            categories={categories}
            series={series}
            caption={caption}
            locked={locked}
          />
        </Suspense>
      ) : null}
    </>
  );
}

/** Phase 11 A5.5: calendar props T49–T54 (inline; no nav). */
function CalendarPropsEditor({
  nodeId,
  year,
  month,
  selectedDay,
  weekStart,
  era,
  locked,
}: {
  nodeId: string;
  year: number;
  month: number;
  selectedDay?: number;
  weekStart: 0 | 1;
  era: "be" | "ce";
  locked: boolean;
}) {
  return (
    <section className="space-y-2 border-t border-sidebar-border py-2">
      <h3 className="text-xs font-medium text-muted-foreground">คุณสมบัติ</h3>
      <FieldRow id="pf-cal-era" label="ปี พ.ศ." overridden={false} locked={locked}>
        <SegmentedField
          id="pf-cal-era"
          label="ปี พ.ศ."
          labelledBy={fieldLabelId("pf-cal-era")}
          value={era}
          options={[
            { value: "be", label: "พ.ศ." },
            { value: "ce", label: "ค.ศ." },
          ]}
          disabled={locked}
          fill
          onChange={(v) => writeProp(nodeId, "era", v)}
        />
      </FieldRow>
      <FieldRow id="pf-cal-year" label="ปี" overridden={false} locked={locked}>
        <NumberField
          id="pf-cal-year"
          value={year}
          min={era === "be" ? 2400 : 1900}
          max={era === "be" ? 2700 : 2100}
          disabled={locked}
          onCommit={(n) => writeProp(nodeId, "year", n)}
        />
      </FieldRow>
      <FieldRow id="pf-cal-month" label="เดือน" overridden={false} locked={locked}>
        <NumberField
          id="pf-cal-month"
          value={month}
          min={1}
          max={12}
          disabled={locked}
          onCommit={(n) => writeProp(nodeId, "month", n)}
        />
      </FieldRow>
      <FieldRow id="pf-cal-day" label="วันที่เลือก" overridden={false} locked={locked}>
        <NumberField
          id="pf-cal-day"
          value={selectedDay ?? 0}
          min={0}
          max={31}
          disabled={locked}
          onCommit={(n) => writeProp(nodeId, "selectedDay", n < 1 ? undefined : n)}
        />
      </FieldRow>
      <FieldRow id="pf-cal-week" label="เริ่มสัปดาห์วัน" overridden={false} locked={locked}>
        <SegmentedField
          id="pf-cal-week"
          label="เริ่มสัปดาห์วัน"
          labelledBy={fieldLabelId("pf-cal-week")}
          value={String(weekStart)}
          options={[
            { value: "0", label: "อาทิตย์" },
            { value: "1", label: "จันทร์" },
          ]}
          disabled={locked}
          fill
          onChange={(v) => writeProp(nodeId, "weekStart", v === "1" ? 1 : 0)}
        />
      </FieldRow>
    </section>
  );
}

/** Phase 11 A5.1: carousel props — T39 note + T40 slidesPerView. */
function CarouselPropsEditor({
  nodeId,
  slidesPerView,
  locked,
}: {
  nodeId: string;
  slidesPerView: number;
  locked: boolean;
}) {
  return (
    <section className="space-y-2 border-t border-sidebar-border py-2">
      <h3 className="text-xs font-medium text-muted-foreground">คุณสมบัติ</h3>
      <p className="text-[11px] text-muted-foreground">
        เลื่อนด้วยการปัดหรือปุ่มลูกศร ไม่มีปุ่มถัดไปหรือเล่นอัตโนมัติ
      </p>
      <FieldRow id="pf-slides-per-view" label="จำนวนสไลด์ต่อหน้า" overridden={false} locked={locked}>
        <NumberField
          id="pf-slides-per-view"
          value={slidesPerView}
          min={1}
          max={4}
          disabled={locked}
          onCommit={(n) => writeProp(nodeId, "slidesPerView", n)}
        />
      </FieldRow>
    </section>
  );
}

/** Phase 11 A2.5: the non-style props of badge / separator / spinner / aspectRatio / scrollArea (T10, T11, T12, T73, T74). */
function A2Props({ node, locked }: { node: Node; locked: boolean }) {
  const p = node.props;
  return (
    <section className="space-y-2 border-t border-sidebar-border py-2">
      <h3 className="text-xs font-medium text-muted-foreground">คุณสมบัติ</h3>
      {p.type === "badge" ? (
        <FieldRow id="pf-badge-label" label="ข้อความ" overridden={false} locked={locked}>
          <TextPropField
            id="pf-badge-label"
            value={p.label}
            placeholder="ป้าย"
            disabled={locked}
            onCommit={(v) => writeProp(node.id, "label", v)}
          />
        </FieldRow>
      ) : p.type === "separator" ? (
        <FieldRow id="pf-orientation" label="ทิศทาง" overridden={false} locked={locked} group>
          <SegmentedField
            id="pf-orientation"
            label="ทิศทาง"
            labelledBy={fieldLabelId("pf-orientation")}
            fill
            disabled={locked}
            value={p.orientation}
            options={ORIENT_H_V}
            onChange={(v) => writeProp(node.id, "orientation", v)}
          />
        </FieldRow>
      ) : p.type === "spinner" ? (
        <FieldRow id="pf-spinner-name" label="ชื่อสำหรับโปรแกรมอ่านหน้าจอ" overridden={false} locked={locked} stacked>
          <TextPropField
            id="pf-spinner-name"
            value={node.name ?? ""}
            placeholder={A2_TEXTS.spinnerLabel}
            disabled={locked}
            onCommit={(v) => writeProp(node.id, "name", v)}
          />
        </FieldRow>
      ) : p.type === "aspectRatio" ? (
        <FieldRow id="pf-ratio" label="อัตราส่วน" overridden={false} locked={locked}>
          <SelectField
            id="pf-ratio"
            value={p.ratio}
            disabled={locked}
            options={RATIO_OPTIONS}
            onChange={(v) => writeProp(node.id, "ratio", v)}
          />
        </FieldRow>
      ) : p.type === "scrollArea" ? (
        <>
          <FieldRow id="pf-scroll-orientation" label="แนวเลื่อน" overridden={false} locked={locked} group stacked>
            <SegmentedField
              id="pf-scroll-orientation"
              label="แนวเลื่อน"
              labelledBy={fieldLabelId("pf-scroll-orientation")}
              fill
              disabled={locked}
              value={p.orientation}
              options={ORIENT_SCROLL}
              onChange={(v) => writeProp(node.id, "orientation", v)}
            />
          </FieldRow>
          <FieldRow id="pf-scroll-label" label="ชื่อสำหรับโปรแกรมอ่านหน้าจอ" overridden={false} locked={locked} stacked>
            <TextPropField
              id="pf-scroll-label"
              value={p.label ?? ""}
              placeholder="—"
              disabled={locked}
              onCommit={(v) => writeProp(node.id, "label", v)}
            />
          </FieldRow>
          {node.style.height === undefined && node.style.minHeight === undefined ? (
            <p className="text-[11px] text-muted-foreground">ตั้งความสูงเพื่อให้เลื่อนได้</p>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

type SectionProps = {
  id: SectionId;
  label: string;
  fields: FieldDef[];
  node: Node;
  eff: StyleProps;
  locked: boolean;
  segment: StyleSegment;
  /** B8.1: editing `states[name]` instead of base / breakpoint. */
  editState?: NodeStateName | null;
};


/** B2.2 / B3.2: เอฟเฟกต์ — เงา + ไล่สี (lazy effects-panels). */
const EffectsSection = memo(function EffectsSection({
  node,
  locked,
  segment,
  editState = null,
}: {
  node: Node;
  locked: boolean;
  segment: StyleSegment;
  editState?: NodeStateName | null;
}) {
  const collapsed = useEditorStore((s) => !!s.collapsedStyleSections["effects"]);
  const toggle = useEditorStore((s) => s.toggleStyleSection);
  const bp = editState || segment === "desktop" ? undefined : segment;
  const onBreakpoint = !editState && segment !== "desktop";
  const statePaint = editState ? node.states?.[editState] : undefined;

  const shadowOverridden = editState
    ? statePaint?.boxShadow !== undefined
    : onBreakpoint
      ? breakpointKeySet(node, segment, "boxShadow")
      : node.style?.boxShadow !== undefined;
  const bgGradOverridden = editState
    ? statePaint?.backgroundGradient !== undefined
    : onBreakpoint
      ? breakpointKeySet(node, segment, "backgroundGradient")
      : node.style?.backgroundGradient !== undefined;
  const textGradOverridden = editState
    ? statePaint?.textGradient !== undefined
    : onBreakpoint
      ? breakpointKeySet(node, segment, "textGradient")
      : node.style?.textGradient !== undefined;
  const gradientOverridden = bgGradOverridden || textGradOverridden;
  const transformOverridden = editState
    ? statePaint?.transform !== undefined
    : onBreakpoint
      ? breakpointKeySet(node, segment, "transform")
      : node.style?.transform !== undefined;
  const transitionOverridden = editState
    ? false
    : onBreakpoint
      ? breakpointKeySet(node, segment, "transition")
      : node.style?.transition !== undefined;
  const filterOverridden = editState
    ? statePaint?.filter !== undefined || statePaint?.backdropFilter !== undefined
    : onBreakpoint
      ? breakpointKeySet(node, segment, "filter") ||
        breakpointKeySet(node, segment, "backdropFilter")
      : node.style?.filter !== undefined || node.style?.backdropFilter !== undefined;
  const overridden =
    shadowOverridden ||
    gradientOverridden ||
    transformOverridden ||
    transitionOverridden ||
    filterOverridden;

  const layers = editState
    ? statePaint?.boxShadow
    : onBreakpoint
      ? shadowOverridden
        ? node.styleBreakpoints?.[segment]?.boxShadow
        : node.style?.boxShadow
      : node.style?.boxShadow;

  const backgroundGradient = editState
    ? statePaint?.backgroundGradient
    : onBreakpoint
      ? bgGradOverridden
        ? node.styleBreakpoints?.[segment]?.backgroundGradient
        : node.style?.backgroundGradient
      : node.style?.backgroundGradient;
  const textGradient = editState
    ? statePaint?.textGradient
    : onBreakpoint
      ? textGradOverridden
        ? node.styleBreakpoints?.[segment]?.textGradient
        : node.style?.textGradient
      : node.style?.textGradient;
  const transform = editState
    ? statePaint?.transform
    : onBreakpoint
      ? transformOverridden
        ? node.styleBreakpoints?.[segment]?.transform
        : node.style?.transform
      : node.style?.transform;
  const transition = editState
    ? undefined
    : onBreakpoint
      ? transitionOverridden
        ? node.styleBreakpoints?.[segment]?.transition
        : node.style?.transition
      : node.style?.transition;
  const filter = editState
    ? statePaint?.filter
    : onBreakpoint
      ? breakpointKeySet(node, segment, "filter")
        ? node.styleBreakpoints?.[segment]?.filter
        : node.style?.filter
      : node.style?.filter;
  const backdropFilter = editState
    ? statePaint?.backdropFilter
    : onBreakpoint
      ? breakpointKeySet(node, segment, "backdropFilter")
        ? node.styleBreakpoints?.[segment]?.backdropFilter
        : node.style?.backdropFilter
      : node.style?.backdropFilter;
  const effDisplay = resolvedStyle(node).display;
  const inlineHint = effDisplay === "inline";

  const bodyId = "sf-sec-effects";
  const resetShadow = () => writeStyle(node.id, "boxShadow", undefined, bp, editState);
  const resetGradient = () =>
    applyOps(
      [
        styleOp(node.id, "backgroundGradient", undefined, bp, editState),
        styleOp(node.id, "textGradient", undefined, bp, editState),
      ],
      editState
        ? `state:${node.id}:${editState}:gradient`
        : bp
          ? `style:${node.id}:${bp}:gradient`
          : `style:${node.id}:gradient`,
    );
  const resetTransform = () => writeStyle(node.id, "transform", undefined, bp, editState);
  const resetTransition = () => writeStyle(node.id, "transition", undefined, bp);
  const resetFilter = () =>
    applyOps(
      [
        styleOp(node.id, "filter", undefined, bp, editState),
        styleOp(node.id, "backdropFilter", undefined, bp, editState),
      ],
      editState
        ? `state:${node.id}:${editState}:filter`
        : bp
          ? `style:${node.id}:${bp}:filter`
          : `style:${node.id}:filter`,
      { heavyStyleKeys: ["filter", "backdropFilter"] },
    );
  const resetSection = () => {
    const ops = [
      styleOp(node.id, "boxShadow", undefined, bp, editState),
      styleOp(node.id, "backgroundGradient", undefined, bp, editState),
      styleOp(node.id, "textGradient", undefined, bp, editState),
      styleOp(node.id, "transform", undefined, bp, editState),
      styleOp(node.id, "filter", undefined, bp, editState),
      styleOp(node.id, "backdropFilter", undefined, bp, editState),
    ];
    if (!editState) {
      ops.push(styleOp(node.id, "transition", undefined, bp));
    }
    applyOps(
      ops,
      editState
        ? `state:${node.id}:${editState}:effects`
        : bp
          ? `style:${node.id}:${bp}:effects`
          : `style:${node.id}:effects`,
      { heavyStyleKeys: ["boxShadow", "filter", "backdropFilter", "transition"] },
    );
  };

  return (
    <section className="border-t border-sidebar-border py-2">
      <div className="flex h-8 items-center justify-between">
        <button
          type="button"
          className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
          aria-expanded={!collapsed}
          aria-controls={bodyId}
          onClick={() => toggle("effects")}
        >
          {collapsed ? <ChevronRight className="size-3.5" /> : <ChevronDown className="size-3.5" />}
          <span
            aria-hidden
            className={
              overridden
                ? "size-1.5 shrink-0 rounded-full bg-primary"
                : "size-1.5 shrink-0 rounded-full bg-transparent"
            }
          />
          เอฟเฟกต์
        </button>
        {overridden && !locked ? (
          <Button type="button" variant="ghost" size="xs" onClick={resetSection}>
            {onBreakpoint ? "ใช้ค่าหลัก" : "รีเซ็ต"}
          </Button>
        ) : null}
      </div>
      {collapsed ? null : (
        <div id={bodyId} className="mt-1 space-y-2">
          <Suspense fallback={<p className="text-[11px] text-muted-foreground">กำลังโหลด…</p>}>
            <ShadowSubGroup
              nodeId={node.id}
              layers={layers}
              locked={locked}
              bp={bp}
              state={editState}
              overridden={shadowOverridden}
              onReset={resetShadow}
              resetLabel={onBreakpoint ? "ใช้ค่าหลัก" : "คืนค่าเริ่มต้น"}
            />
            <GradientSubGroup
              nodeId={node.id}
              background={backgroundGradient}
              text={textGradient}
              locked={locked}
              bp={bp}
              state={editState}
              overridden={gradientOverridden}
              onReset={resetGradient}
              resetLabel={onBreakpoint ? "ใช้ค่าหลัก" : "คืนค่าเริ่มต้น"}
            />
            <TransformSubGroup
              nodeId={node.id}
              value={transform}
              locked={locked}
              bp={bp}
              state={editState}
              overridden={transformOverridden}
              onReset={resetTransform}
              resetLabel={onBreakpoint ? "ใช้ค่าหลัก" : "คืนค่าเริ่มต้น"}
              inlineHint={inlineHint}
            />
            {editState ? null : (
              <TransitionSubGroup
                nodeId={node.id}
                value={transition}
                locked={locked}
                bp={bp}
                overridden={transitionOverridden}
                onReset={resetTransition}
                resetLabel={onBreakpoint ? "ใช้ค่าหลัก" : "คืนค่าเริ่มต้น"}
              />
            )}
            <FilterSubGroup
              nodeId={node.id}
              filter={filter}
              backdrop={backdropFilter}
              locked={locked}
              bp={bp}
              state={editState}
              overridden={filterOverridden}
              onReset={resetFilter}
              resetLabel={onBreakpoint ? "ใช้ค่าหลัก" : "คืนค่าเริ่มต้น"}
            />
          </Suspense>
        </div>
      )}
    </section>
  );
});

const StyleSection = memo(function StyleSection({
  id,
  label,
  fields,
  node,
  eff,
  locked,
  segment,
  editState = null,
}: SectionProps) {
  const collapsed = useEditorStore((s) => !!s.collapsedStyleSections[id]);
  const toggle = useEditorStore((s) => s.toggleStyleSection);
  const bp = editState || segment === "desktop" ? undefined : segment;
  const overridden = fields.filter((f) => {
    if (editState) {
      return (
        f.target === "style" &&
        node.states?.[editState]?.[f.key as StatePaintKey] !== undefined
      );
    }
    return bp
      ? f.target === "style" && breakpointKeySet(node, bp, f.key as StyleKey)
      : isFieldOverridden(f, node);
  });
  const bodyId = `sf-sec-${id}`;

  const resetSection = () =>
    applyOps(
      overridden.map((f) =>
        f.target === "style"
          ? styleOp(node.id, f.key, undefined, bp, editState)
          : propOp(node.id, f.key, undefined),
      ),
    );

  const inherits =
    id === "typography" &&
    (node.type === "page" || node.type === "section" || hasLayoutProps(node.type));
  const shownBorder = shownStyleKey(node, segment, "borderStyle", eff);
  const borderOn =
    shownBorder === "solid" || shownBorder === "dashed" || shownBorder === "dotted";
  const borderOff = id === "border" && !borderOn;
  const sides = bp
    ? breakpointKeySet(node, bp, "borderSides")
      ? node.styleBreakpoints?.[bp]?.borderSides
      : node.style?.borderSides
    : node.style?.borderSides;
  const corners = bp
    ? breakpointKeySet(node, bp, "borderRadiusCorners")
      ? node.styleBreakpoints?.[bp]?.borderRadiusCorners
      : node.style?.borderRadiusCorners
    : node.style?.borderRadiusCorners;
  const extrasOverridden =
    id === "border" &&
    (bp
      ? breakpointKeySet(node, bp, "borderSides") ||
        breakpointKeySet(node, bp, "borderRadiusCorners")
      : node.style?.borderSides !== undefined ||
        node.style?.borderRadiusCorners !== undefined);

  const resetBorderAll = () => {
    applyOps([
      ...overridden.map((f) =>
        f.target === "style"
          ? styleOp(node.id, f.key, undefined, bp)
          : propOp(node.id, f.key, undefined),
      ),
      styleOp(node.id, "borderSides", undefined, bp),
      styleOp(node.id, "borderRadiusCorners", undefined, bp),
    ]);
  };

  return (
    <section className="border-t border-sidebar-border py-2">
      <div className="flex h-8 items-center justify-between">
        <button
          type="button"
          className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
          aria-expanded={!collapsed}
          aria-controls={bodyId}
          onClick={() => toggle(id)}
        >
          {collapsed ? <ChevronRight className="size-3.5" /> : <ChevronDown className="size-3.5" />}
          {label}
        </button>
        {(overridden.length > 0 || extrasOverridden) && !locked ? (
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={id === "border" ? resetBorderAll : resetSection}
          >
            รีเซ็ต
          </Button>
        ) : null}
      </div>
      {collapsed ? null : (
        <div id={bodyId} className="mt-1 space-y-2">
          {fields.map((f) => (
            <FieldControl
              key={f.id}
              field={f}
              node={node}
              eff={eff}
              locked={locked}
              segment={segment}
              editState={editState}
              dependentDisabled={
                borderOff && (f.key === "borderWidth" || f.key === "borderColor")
              }
            />
          ))}
          {borderOff ? (
            <p className="text-[11px] text-muted-foreground">
              เลือกเส้นทึบ เส้นประ หรือจุด เพื่อแสดงเส้นขอบ
            </p>
          ) : null}
          {id === "border" && !editState ? (
            <BorderExtras
              nodeId={node.id}
              sides={sides}
              corners={corners}
              locked={locked}
              bp={bp}
            />
          ) : null}
          {inherits ? (
            <p className="text-[11px] text-muted-foreground">
              ค่าที่ตั้งจะส่งต่อให้องค์ประกอบด้านใน
            </p>
          ) : null}
        </div>
      )}
    </section>
  );
});

type FieldProps = {
  field: FieldDef;
  node: Node;
  eff: StyleProps;
  locked: boolean;
  segment: StyleSegment;
  editState?: NodeStateName | null;
  dependentDisabled?: boolean;
};

/** Override if this breakpoint stores the key, otherwise the desktop base. */
function shownStyleKey<K extends StyleKey>(
  node: Node,
  segment: StyleSegment,
  key: K,
  eff: StyleProps,
  editState?: NodeStateName | null,
): StyleProps[K] | undefined {
  if (editState) {
    const v = node.states?.[editState]?.[key as StatePaintKey];
    if (v !== undefined) return v as StyleProps[K];
    return eff[key];
  }
  if (segment !== "desktop" && breakpointKeySet(node, segment, key)) {
    return node.styleBreakpoints?.[segment]?.[key] as StyleProps[K] | undefined;
  }
  return eff[key];
}

function write(
  field: FieldDef,
  nodeId: string,
  value: unknown,
  segment: StyleSegment,
  editState?: NodeStateName | null,
) {
  if (field.target === "style") {
    writeStyle(
      nodeId,
      field.key,
      value as StyleProps[typeof field.key],
      editState ? undefined : segment === "desktop" ? undefined : segment,
      editState,
    );
  } else {
    writeProp(nodeId, field.key, value as string | number | undefined);
  }
}

function FieldControl(props: FieldProps) {
  const { field } = props;
  if (field.control === "box") return <BoxRow {...props} />;
  if (field.control === "color") return <ColorRow {...props} />;
  return <SimpleRow {...props} />;
}

function rowCommon({
  field,
  node,
  eff,
  locked,
  dependentDisabled,
  segment,
  editState,
}: FieldProps) {
  const id = `sf-${field.id}`;
  const onState = !!editState && field.target === "style";
  const onBreakpoint = !editState && field.target === "style" && segment !== "desktop";
  const overridden = onState
    ? node.states?.[editState!]?.[field.key as StatePaintKey] !== undefined
    : onBreakpoint
      ? breakpointKeySet(node, segment, field.key as StyleKey)
      : isFieldOverridden(field, node);
  const value = onState
    ? overridden
      ? node.states?.[editState!]?.[field.key as StatePaintKey]
      : fieldEffective(field, node, eff)
    : onBreakpoint
      ? overridden
        ? node.styleBreakpoints?.[segment]?.[field.key as StyleKey]
        : fieldEffective(field, node, eff)
      : fieldEffective(field, node, eff);
  const disabled = locked || !!dependentDisabled;
  const onReset = () => write(field, node.id, undefined, segment, editState);
  const resetLabel = onBreakpoint ? "ใช้ค่าหลัก" : onState ? "ล้าง" : undefined;
  return { id, overridden, value, disabled, onReset, resetLabel };
}

function SimpleRow(props: FieldProps) {
  const { field, node } = props;
  const { id, overridden, value, disabled, onReset, resetLabel } = rowCommon(props);
  const muted = !overridden;
  let control: React.ReactNode = null;

  switch (field.control) {
    case "number":
      control = (
        <NumberField
          id={id}
          value={typeof value === "number" ? value : undefined}
          min={field.min}
          max={field.max}
          step={field.step}
          suffix={field.suffix}
          disabled={disabled}
          muted={muted}
          onCommit={(n) => write(field, node.id, n, props.segment, props.editState)}
        />
      );
      break;
    case "unit":
      control = (
        <UnitField
          id={id}
          label={field.label}
          value={value as number | string | undefined}
          disabled={disabled}
          muted={muted}
          onCommit={(v) => write(field, node.id, v, props.segment, props.editState)}
        />
      );
      break;
    case "unitless":
      control =
        typeof value === "string" ? (
          <input
            id={id}
            readOnly
            value={value}
            className="h-7 min-w-0 flex-1 rounded-lg border border-input bg-transparent px-2 text-xs"
          />
        ) : (
          <NumberField
            id={id}
            value={value as number | undefined}
            min={field.min}
            max={field.max}
            step={field.step}
            disabled={disabled}
            muted={muted}
            onCommit={(n) => write(field, node.id, n, props.segment, props.editState)}
          />
        );
      break;
    case "segmented": {
      const column = layoutDirection(node) === "column";
      const isBorderStyle = field.target === "style" && field.key === "borderStyle";
      const borderStyleValue =
        value === "solid" || value === "dashed" || value === "dotted" || value === "none"
          ? (value as string)
          : "none";
      control = (
        <SegmentedField
          id={id}
          label={field.label}
          options={field.options ?? []}
          value={
            isBorderStyle
              ? borderStyleValue
              : field.target === "style" && field.key === "overflow"
                ? overflowSegmentValue(value) // N7: stored `scroll` selects "เลื่อน" like `auto`
                : (value as string | undefined)
          }
          column={column}
          labelledBy={fieldLabelId(id)}
          disabled={disabled}
          onChange={(v) => {
            if (isBorderStyle && (v === "solid" || v === "dashed" || v === "dotted")) {
              // Avoid an invisible border: give it 1px if width is unset/0.
              const bp = props.segment === "desktop" ? undefined : props.segment;
              const w = shownStyleKey(node, props.segment, "borderWidth", props.eff);
              applyOps([
                styleOp(node.id, "borderStyle", v, bp),
                ...(w === undefined || w === 0
                  ? [styleOp(node.id, "borderWidth", 1, bp)]
                  : []),
              ]);
            } else {
              write(field, node.id, v, props.segment, props.editState);
            }
          }}
        />
      );
      break;
    }
    case "font": {
      const own =
        props.segment !== "desktop" && breakpointKeySet(node, props.segment, "fontFamily")
          ? (node.styleBreakpoints?.[props.segment]?.fontFamily as string | undefined)
          : node.style.fontFamily;
      const preset = FONT_PRESETS.find((p) => p.value === own);
      const sel = own === undefined ? "" : preset ? preset.value : "__custom";
      control = (
        <SelectField
          id={id}
          value={sel}
          disabled={disabled}
          muted={muted}
          title={sel === "__custom" ? own : undefined}
          fontPreview
          options={[
            { value: "", label: "ระบบ (ค่าเริ่มต้น)" },
            ...FONT_PRESETS.map((p) => ({ value: p.value, label: p.label })),
            ...(sel === "__custom"
              ? [{ value: "__custom", label: "กำหนดเอง", title: own, disabled: true }]
              : []),
          ]}
          onChange={(v) => write(field, node.id, v === "" ? undefined : v, props.segment, props.editState)}
        />
      );
      break;
    }
    case "weight": {
      const w =
        value === "normal" ? 400 : value === "bold" ? 700 : (value as number | undefined);
      const opts = WEIGHT_OPTIONS.map((o) => ({ value: String(o.value), label: o.label }));
      if (w !== undefined && !WEIGHT_OPTIONS.some((o) => o.value === w)) {
        opts.push({ value: String(w), label: String(w) });
      }
      control = (
        <SelectField
          id={id}
          value={w === undefined ? "" : String(w)}
          disabled={disabled}
          muted={muted}
          options={[
            ...(w === undefined
              ? [{ value: "", label: "—", disabled: true }]
              : []),
            ...opts,
          ]}
          onChange={(v) => v && write(field, node.id, Number(v), props.segment, props.editState)}
        />
      );
      break;
    }
    case "opacity":
      control = (
        <OpacityField
          id={id}
          nodeId={node.id}
          label={field.label}
          value={value as number | undefined}
          disabled={disabled}
          muted={muted}
          onCommit={(n) => write(field, node.id, n, props.segment, props.editState)}
        />
      );
      break;
  }

  return (
    <FieldRow
      id={id}
      label={field.label}
      overridden={overridden}
      locked={props.locked}
      onReset={onReset}
      resetLabel={resetLabel}
      group={field.control === "segmented"}
    >
      <div className={cn("flex min-w-0 flex-1 items-center gap-1")}>{control}</div>
    </FieldRow>
  );
}

function BoxRow(props: FieldProps) {
  const { field, node } = props;
  const { id, overridden, value, disabled, onReset, resetLabel } = rowCommon(props);
  const { control, footer, linked } = useBoxSpacing({
    id,
    label: field.label,
    labelledBy: fieldLabelId(id),
    value: value as BoxSpacing | undefined,
    min: field.min ?? 0,
    max: field.max ?? 400,
    disabled,
    muted: !overridden,
    onCommit: (v) => write(field, node.id, v, props.segment, props.editState),
  });
  return (
    <FieldRow
      id={id}
      label={field.label}
      overridden={overridden}
      locked={props.locked}
      onReset={onReset}
      resetLabel={resetLabel}
      footer={footer}
      group={!linked}
    >
      {control}
    </FieldRow>
  );
}

function ColorRow(props: FieldProps) {
  const { field, node } = props;
  const { id, overridden, value, disabled, onReset, resetLabel } = rowCommon(props);
  const { control, footer } = useColorField({
    id,
    label: field.label,
    value: value as string | undefined,
    allowTransparentToggle: field.target === "style" && field.key === "backgroundColor",
    disabled,
    muted: !overridden,
    onCommit: (v) => write(field, node.id, v, props.segment, props.editState),
  });
  return (
    <FieldRow
      id={id}
      label={field.label}
      overridden={overridden}
      locked={props.locked}
      onReset={onReset}
      resetLabel={resetLabel}
      footer={footer}
    >
      {control}
    </FieldRow>
  );
}
