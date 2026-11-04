import { create } from "zustand";
import {
  clampCustom,
  deviceById,
  isDeviceId,
  MULTI_DEVICES,
  MULTI_MAX,
  type DeviceId,
  type Size,
} from "@/lib/devices";

/**
 * Preview device preference (DEVICE-PREVIEW-SPEC §7). App-wide, stored in
 * localStorage only — never in the document or SQLite, and not reset by
 * editor-store.resetEditorChrome().
 */
export type PreviewZoom = "fit" | "100";

type Persisted = {
  preset: DeviceId;
  landscape: boolean;
  custom: Size;
  zoom: PreviewZoom;
  hinge: boolean;
  multi: boolean;
  multiSet: DeviceId[];
};

type PreviewDeviceState = Persisted & {
  setPreset: (id: DeviceId) => void;
  toggleLandscape: () => void;
  setCustom: (size: Size) => void;
  /** Switch to custom seeded with `size` (current effective size). */
  startCustom: (size: Size) => void;
  swapCustom: () => void;
  setZoom: (zoom: PreviewZoom) => void;
  setHinge: (on: boolean) => void;
  setMulti: (on: boolean) => void;
  toggleMultiDevice: (id: DeviceId) => void;
};

export const STORAGE_KEY = "wb.preview.device.v1";

const DEFAULTS: Persisted = {
  preset: "fill",
  landscape: false,
  custom: { w: 1024, h: 768 },
  zoom: "fit",
  hinge: true,
  multi: false,
  multiSet: ["phone", "tablet", "desktop"],
};

/** Read once at startup; anything unknown or corrupt falls back to defaults. */
function load(): Persisted {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const v = JSON.parse(raw) as Partial<Record<keyof Persisted, unknown>> | null;
    if (!v || typeof v !== "object") return DEFAULTS;
    const preset = isDeviceId(v.preset) && !deviceById(v.preset).hidden ? v.preset : "fill";
    const c = (v.custom ?? {}) as Partial<Record<"w" | "h", unknown>>;
    const multiSet = Array.isArray(v.multiSet)
      ? v.multiSet.filter(
          (id): id is DeviceId => isDeviceId(id) && MULTI_DEVICES.some((d) => d.id === id),
        ).filter((id, i, a) => a.indexOf(id) === i).slice(0, MULTI_MAX)
      : DEFAULTS.multiSet;
    return {
      preset,
      landscape: v.landscape === true,
      custom: {
        w: typeof c.w === "number" ? clampCustom(c.w) : DEFAULTS.custom.w,
        h: typeof c.h === "number" ? clampCustom(c.h) : DEFAULTS.custom.h,
      },
      zoom: v.zoom === "100" ? "100" : "fit",
      hinge: v.hinge !== false,
      multi: v.multi === true && multiSet.length > 0,
      multiSet: multiSet.length > 0 ? multiSet : DEFAULTS.multiSet,
    };
  } catch {
    return DEFAULTS;
  }
}

export const usePreviewDeviceStore = create<PreviewDeviceState>((set, get) => ({
  ...load(),
  setPreset: (preset) => set({ preset }),
  toggleLandscape: () => set((s) => ({ landscape: !s.landscape })),
  setCustom: (size) => set({ custom: { w: clampCustom(size.w), h: clampCustom(size.h) } }),
  startCustom: (size) =>
    set({ preset: "custom", custom: { w: clampCustom(size.w), h: clampCustom(size.h) } }),
  swapCustom: () => set((s) => ({ custom: { w: s.custom.h, h: s.custom.w } })),
  setZoom: (zoom) => set({ zoom }),
  setHinge: (hinge) => set({ hinge }),
  setMulti: (multi) => set({ multi: multi && get().multiSet.length > 0 }),
  toggleMultiDevice: (id) =>
    set((s) => {
      if (s.multiSet.includes(id)) {
        // Keep at least one frame.
        return s.multiSet.length > 1 ? { multiSet: s.multiSet.filter((x) => x !== id) } : {};
      }
      if (s.multiSet.length >= MULTI_MAX) return {};
      // Keep table order for a stable row.
      const next = [...s.multiSet, id];
      return { multiSet: MULTI_DEVICES.map((d) => d.id).filter((x) => next.includes(x)) };
    }),
}));

// Write on change, debounced ~250 ms (flat §7 shape).
let writeTimer: number | undefined;
usePreviewDeviceStore.subscribe((s) => {
  window.clearTimeout(writeTimer);
  writeTimer = window.setTimeout(() => {
    const data: Persisted = {
      preset: s.preset,
      landscape: s.landscape,
      custom: s.custom,
      zoom: s.zoom,
      hinge: s.hinge,
      multi: s.multi,
      multiSet: s.multiSet,
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      /* storage full/unavailable: preference just isn't remembered */
    }
  }, 250);
});

/**
 * Applied preview scale, published by DeviceStage for the toolbar readout
 * only. Kept out of the device store so a zoom tick re-renders just the
 * readout (DEVICE-PREVIEW-SPEC §4.3 / §10.6).
 */
export const usePreviewScale = create<{ scale: number }>(() => ({ scale: 1 }));
