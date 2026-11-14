/**
 * Phase 11 E4: lazy `motion-panel` — entrance motion fields + replay (E5).
 */
import { Button } from "@/components/ui/button";
import { FieldRow } from "@/components/editor/style/FieldRow";
import { NumberField } from "@/components/editor/style/NumberField";
import { SelectField } from "@/components/editor/style/SelectField";
import { applyOps } from "@/components/editor/style/write";
import { displayPerfWarning } from "@/lib/announce-i18n";
import { setNodeMotion } from "@/lib/document-ops";
import { useLocale } from "@/lib/locale";
import {
  DEFAULT_MOTION_ENTRANCE,
  MOTION_EASING_OPTIONS,
  MOTION_EFFECT_LABEL,
  MOTION_PRESET_OPTIONS,
  MOTION_REPLAY,
  MOTION_REPLAY_DONE,
  MOTION_REPLAY_REDUCED,
  MOTION_TRIGGER_LABEL,
  MOTION_TRIGGER_OPTIONS,
  MOTION_VIEW_DESIGN_NOTE,
  MOTION_VIEW_FALLBACK_NOTE,
  clampMotionDelay,
  clampMotionDuration,
  isMotionPreset,
  phraseMotion,
  prefersReducedMotion,
} from "@/lib/motion";
import { evaluatePagePerf } from "@/lib/page-perf-watch";
import type {
  MotionEntrance,
  MotionTrigger,
  Node,
  TransitionEasing,
} from "@/schema";
import { MOTION_DELAY_MAX, MOTION_DURATION_MAX, MOTION_DURATION_MIN } from "@/schema";
import { useEditorStore } from "@/stores/editor-store";
import { useProjectsStore } from "@/stores/projects-store";

export type MotionPanelProps = {
  node: Node;
  locked: boolean;
};

export function MotionPanel({ node, locked }: MotionPanelProps) {
  const locale = useLocale();
  const t = (th: string) => phraseMotion(locale, th);
  const announce = useEditorStore((s) => s.announce);
  const requestMotionReplay = useEditorStore((s) => s.requestMotionReplay);
  const animatedWarn = useEditorStore((s) =>
    s.pagePerfWarnings.find((w) => w.kind === "animated"),
  );
  const entrance = node.motion?.entrance;
  const presetValue = entrance?.preset ?? "none";

  const write = (next: MotionEntrance | undefined) => {
    applyOps(
      [
        (doc) =>
          setNodeMotion(
            doc,
            node.id,
            next ? { entrance: next } : undefined,
          ),
      ],
      `motion:${node.id}`,
    );
    // E6: T117 recount after motion writes (not a style key).
    evaluatePagePerf(useProjectsStore.getState().openDocument);
  };

  const patch = (partial: Partial<MotionEntrance>) => {
    const base = entrance ?? DEFAULT_MOTION_ENTRANCE;
    write({
      ...base,
      ...partial,
      durationMs: clampMotionDuration(partial.durationMs ?? base.durationMs),
      delayMs: clampMotionDelay(partial.delayMs ?? base.delayMs),
    });
  };

  const onReplay = () => {
    if (!entrance) return;
    if (prefersReducedMotion()) {
      announce(t(MOTION_REPLAY_REDUCED));
      return;
    }
    requestMotionReplay(node.id);
    announce(t(MOTION_REPLAY_DONE));
  };

  return (
    <div className="space-y-2" data-motion-panel="">
      {animatedWarn ? (
        <p className="text-[11px] text-amber-700 dark:text-amber-400" role="status">
          {displayPerfWarning(animatedWarn.message)}
        </p>
      ) : null}
      <FieldRow id="mo-preset" label={t(MOTION_EFFECT_LABEL)} overridden={!!entrance} locked={locked}>
        <SelectField
          id="mo-preset"
          value={presetValue}
          disabled={locked}
          options={MOTION_PRESET_OPTIONS.map((o) => ({
            value: o.value,
            label: t(o.label),
          }))}
          onChange={(v) => {
            if (v === "none") {
              write(undefined);
              return;
            }
            if (!isMotionPreset(v)) return;
            write({
              ...(entrance ?? DEFAULT_MOTION_ENTRANCE),
              preset: v,
            });
          }}
        />
      </FieldRow>

      {entrance ? (
        <>
          <FieldRow id="mo-trigger" label={t(MOTION_TRIGGER_LABEL)} overridden={false} locked={locked}>
            <SelectField
              id="mo-trigger"
              value={entrance.trigger}
              disabled={locked}
              options={MOTION_TRIGGER_OPTIONS.map((o) => ({
                value: o.value,
                label: t(o.label),
              }))}
              onChange={(v) => patch({ trigger: v as MotionTrigger })}
            />
          </FieldRow>
          <FieldRow id="mo-dur" label={t("ระยะเวลา")} overridden={false} locked={locked}>
            <NumberField
              id="mo-dur"
              value={entrance.durationMs}
              min={MOTION_DURATION_MIN}
              max={MOTION_DURATION_MAX}
              suffix="ms"
              disabled={locked}
              onCommit={(durationMs) => patch({ durationMs })}
            />
          </FieldRow>
          <FieldRow id="mo-delay" label={t("หน่วงเวลา")} overridden={false} locked={locked}>
            <NumberField
              id="mo-delay"
              value={entrance.delayMs}
              min={0}
              max={MOTION_DELAY_MAX}
              suffix="ms"
              disabled={locked}
              onCommit={(delayMs) => patch({ delayMs })}
            />
          </FieldRow>
          <FieldRow id="mo-ease" label={t("จังหวะ")} overridden={false} locked={locked}>
            <SelectField
              id="mo-ease"
              value={entrance.easing}
              disabled={locked}
              options={MOTION_EASING_OPTIONS.map((o) => ({
                value: o.value,
                label: t(o.label),
              }))}
              onChange={(easing) => patch({ easing: easing as TransitionEasing })}
            />
          </FieldRow>

          {entrance.trigger === "view" ? (
            <>
              <p className="text-[11px] text-muted-foreground" role="note">
                {t(MOTION_VIEW_FALLBACK_NOTE)}
              </p>
              <p className="text-[11px] text-muted-foreground" role="note">
                {t(MOTION_VIEW_DESIGN_NOTE)}
              </p>
            </>
          ) : null}

          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full"
            disabled={locked}
            onClick={onReplay}
          >
            {t(MOTION_REPLAY)}
          </Button>
        </>
      ) : null}
    </div>
  );
}
