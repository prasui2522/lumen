/**
 * Phase 11 A5.4 — lazy chart data editor (T41–T48).
 * Draft locally; Commit applies kind/categories/series/caption in one undo step.
 */
import {
  useEffect,
  useId,
  useLayoutEffect,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FieldRow, fieldLabelId } from "@/components/editor/style/FieldRow";
import { TextPropField } from "@/components/editor/style/TextPropField";
import { SegmentedField } from "@/components/editor/style/SegmentedField";
import { writeChartEditorCommit } from "@/components/editor/style/write";
import type { ChartKind, ChartSeries } from "@/schema";
import { CHART_MAX_CATEGORIES, CHART_MAX_SERIES } from "@/schema";
import {
  CHART_DEFAULT_COLORS,
  cloneChartModel,
  formatChartValue,
  parseChartValue,
  type ChartEditorModel,
} from "@/lib/chart-model";

export type ChartEditorProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  nodeId: string;
  kind: ChartKind;
  categories: readonly string[];
  series: readonly ChartSeries[];
  caption?: string;
  locked?: boolean;
};

const KIND_OPTIONS = [
  { value: "bar", label: "แท่ง" },
  { value: "line", label: "เส้น" },
  { value: "area", label: "พื้นที่" },
] as const;

function focusId(prefix: string, kind: "cat" | "name" | "val" | "color", si: number, ci = 0) {
  return `${prefix}-${kind}-${si}-${ci}`;
}

export function ChartEditor({
  open,
  onOpenChange,
  nodeId,
  kind,
  categories,
  series,
  caption,
  locked = false,
}: ChartEditorProps) {
  const uid = useId();
  const [draft, setDraft] = useState<ChartEditorModel>(() =>
    cloneChartModel({ kind, categories, series, caption }),
  );
  const [focusKey, setFocusKey] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setDraft(cloneChartModel({ kind, categories, series, caption }));
    setFocusKey(focusId(uid, "cat", 0, 0));
  }, [open, kind, categories, series, caption, uid]);

  useLayoutEffect(() => {
    if (!open || !focusKey) return;
    const el = document.getElementById(focusKey) as HTMLInputElement | null;
    if (el) {
      el.focus();
      el.select();
    }
  }, [open, focusKey, draft.categories.length, draft.series.length]);

  const n = draft.categories.length;

  const setKind = (v: string) => {
    if (v === "bar" || v === "line" || v === "area") {
      setDraft((d) => ({ ...d, kind: v }));
    }
  };

  const setCategory = (ci: number, value: string) => {
    setDraft((d) => {
      const categories = [...d.categories];
      categories[ci] = value;
      return { ...d, categories };
    });
  };

  const addCategory = () => {
    setDraft((d) => {
      if (d.categories.length >= CHART_MAX_CATEGORIES) return d;
      const categories = [...d.categories, ""];
      const series = d.series.map((s) => ({ ...s, values: [...s.values, null] }));
      return { ...d, categories, series };
    });
    setFocusKey(focusId(uid, "cat", 0, n));
  };

  const removeCategory = (ci: number) => {
    setDraft((d) => {
      if (d.categories.length <= 1) return d;
      const categories = d.categories.filter((_, i) => i !== ci);
      const series = d.series.map((s) => ({
        ...s,
        values: s.values.filter((_, i) => i !== ci),
      }));
      return { ...d, categories, series };
    });
  };

  const setSeriesName = (si: number, value: string) => {
    setDraft((d) => {
      const series = d.series.map((s, i) => (i === si ? { ...s, name: value } : s));
      return { ...d, series };
    });
  };

  const setSeriesColor = (si: number, value: string) => {
    setDraft((d) => {
      const series = d.series.map((s, i) => (i === si ? { ...s, color: value } : s));
      return { ...d, series };
    });
  };

  const setSeriesValue = (si: number, ci: number, raw: string) => {
    const parsed = parseChartValue(raw);
    setDraft((d) => {
      const series = d.series.map((s, i) => {
        if (i !== si) return s;
        const values = [...s.values];
        while (values.length < n) values.push(null);
        values[ci] = parsed;
        return { ...s, values };
      });
      return { ...d, series };
    });
  };

  const addSeries = () => {
    setDraft((d) => {
      if (d.series.length >= CHART_MAX_SERIES) return d;
      const si = d.series.length;
      const color = CHART_DEFAULT_COLORS[si % CHART_DEFAULT_COLORS.length]!;
      const values = d.categories.map(() => null as number | null);
      return {
        ...d,
        series: [...d.series, { name: `ชุดที่ ${si + 1}`, values, color }],
      };
    });
  };

  const removeSeries = (si: number) => {
    setDraft((d) => {
      if (d.series.length <= 1) return d;
      return { ...d, series: d.series.filter((_, i) => i !== si) };
    });
  };

  const onValKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>, si: number, ci: number) => {
    if (e.key === "Enter" && !e.nativeEvent.isComposing) {
      e.preventDefault();
      if (ci + 1 < n) setFocusKey(focusId(uid, "val", si, ci + 1));
      else if (si + 1 < draft.series.length) setFocusKey(focusId(uid, "val", si + 1, 0));
    }
  };

  const commit = () => {
    if (!locked) {
      writeChartEditorCommit(nodeId, {
        kind: draft.kind,
        categories: draft.categories,
        series: draft.series,
        caption: draft.caption,
      });
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex max-h-[min(90vh,40rem)] w-[min(100%-2rem,40rem)] max-w-none flex-col gap-3 sm:max-w-none"
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          setFocusKey(focusId(uid, "cat", 0, 0));
        }}
      >
        <DialogHeader>
          <DialogTitle>ข้อมูลกราฟ</DialogTitle>
          <DialogDescription>
            สูงสุด {CHART_MAX_CATEGORIES} หมวด × {CHART_MAX_SERIES} ชุดข้อมูล — Tab เลื่อนช่อง, Enter ไปค่าถัดไป
          </DialogDescription>
        </DialogHeader>

        <FieldRow id={`${uid}-kind`} label="ชนิดกราฟ" overridden={false} locked={locked}>
          <SegmentedField
            id={`${uid}-kind`}
            label="ชนิดกราฟ"
            labelledBy={fieldLabelId(`${uid}-kind`)}
            value={draft.kind}
            options={[...KIND_OPTIONS]}
            disabled={locked}
            fill
            onChange={setKind}
          />
        </FieldRow>

        <FieldRow id={`${uid}-caption`} label="คำอธิบายกราฟ (สำหรับผู้ใช้โปรแกรมอ่านหน้าจอ)" overridden={false} locked={locked}>
          <TextPropField
            id={`${uid}-caption`}
            value={draft.caption}
            placeholder="—"
            disabled={locked}
            onCommit={(v) => setDraft((d) => ({ ...d, caption: v }))}
          />
        </FieldRow>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium text-muted-foreground">ชื่อหมวด</p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={locked || draft.categories.length >= CHART_MAX_CATEGORIES}
              onClick={addCategory}
            >
              เพิ่มหมวด
            </Button>
          </div>
          <div className="space-y-1">
            {draft.categories.map((cat, ci) => (
              <div key={ci} className="flex items-center gap-1">
                <input
                  id={focusId(uid, "cat", 0, ci)}
                  className="min-w-0 flex-1 rounded border bg-transparent px-1.5 py-1 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={cat}
                  disabled={locked}
                  aria-label={`ชื่อหมวด ${ci + 1}`}
                  onChange={(e) => setCategory(ci, e.currentTarget.value)}
                  onFocus={() => setFocusKey(focusId(uid, "cat", 0, ci))}
                />
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  disabled={locked || draft.categories.length <= 1}
                  aria-label={`ลบหมวด ${ci + 1}`}
                  onClick={() => removeCategory(ci)}
                >
                  ×
                </Button>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium text-muted-foreground">ชุดข้อมูล</p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={locked || draft.series.length >= CHART_MAX_SERIES}
              onClick={addSeries}
            >
              เพิ่มชุดข้อมูล
            </Button>
          </div>
          {draft.series.map((s, si) => (
            <div key={si} className="space-y-1 rounded-lg border p-2">
              <div className="flex items-center gap-1">
                <input
                  id={focusId(uid, "name", si)}
                  className="min-w-0 flex-1 rounded border bg-transparent px-1.5 py-1 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={s.name}
                  disabled={locked}
                  aria-label={`ชื่อชุดข้อมูล ${si + 1}`}
                  aria-labelledby={fieldLabelId(`${uid}-series-${si}`)}
                  onChange={(e) => setSeriesName(si, e.currentTarget.value)}
                  onFocus={() => setFocusKey(focusId(uid, "name", si))}
                />
                <input
                  id={focusId(uid, "color", si)}
                  type="color"
                  className="h-8 w-10 shrink-0 cursor-pointer rounded border bg-transparent p-0.5"
                  value={/^#[0-9a-fA-F]{6}$/.test(s.color) ? s.color : CHART_DEFAULT_COLORS[si % 3]!}
                  disabled={locked}
                  aria-label={`สีชุดข้อมูล ${si + 1}`}
                  onChange={(e) => setSeriesColor(si, e.currentTarget.value)}
                />
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  disabled={locked || draft.series.length <= 1}
                  aria-label={`ลบชุดข้อมูล ${si + 1}`}
                  onClick={() => removeSeries(si)}
                >
                  ×
                </Button>
              </div>
              <div className="flex flex-wrap gap-1">
                {draft.categories.map((cat, ci) => (
                  <label key={ci} className="flex min-w-[4.5rem] flex-1 flex-col gap-0.5">
                    <span className="truncate text-[10px] text-muted-foreground">
                      {cat.trim() || `หมวด ${ci + 1}`} · ค่า
                    </span>
                    <input
                      id={focusId(uid, "val", si, ci)}
                      inputMode="decimal"
                      className="rounded border bg-transparent px-1.5 py-1 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      value={formatChartValue(s.values[ci] ?? null)}
                      disabled={locked}
                      aria-label={`ค่า ${s.name || `ชุด ${si + 1}`} หมวด ${ci + 1}`}
                      onChange={(e) => setSeriesValue(si, ci, e.currentTarget.value)}
                      onFocus={() => setFocusKey(focusId(uid, "val", si, ci))}
                      onKeyDown={(e) => onValKeyDown(e, si, ci)}
                    />
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            ยกเลิก
          </Button>
          <Button type="button" disabled={locked} onClick={commit}>
            บันทึก
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
