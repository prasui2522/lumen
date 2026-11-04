/**
 * Preview device presets (DEVICE-PREVIEW-SPEC §1). App-side only: never stored
 * in the document. Sizes are CSS px (layout viewport); handhelds are portrait.
 */
export type DeviceId =
  | "fill"
  | "desktop"
  | "laptop"
  | "tablet"
  | "phone"
  | "phone-sm"
  | "fold-closed"
  | "fold-open"
  | "pixel-fold-open"
  | "custom";

export type DeviceGroup = "general" | "handheld" | "fold" | "custom";
export type DeviceIcon = "fill" | "desktop" | "laptop" | "tablet" | "phone" | "fold" | "custom";

export type DevicePreset = {
  id: DeviceId;
  label: string;
  w: number;
  h: number;
  group: DeviceGroup;
  icon: DeviceIcon;
  /** Rotate toggle applies (handhelds, foldables, custom). */
  rotatable: boolean;
  /** Draw the optional hinge line (foldable open). */
  foldable: boolean;
  /** Handheld bezel (rounded, padded) vs desktop frame. */
  handheld: boolean;
  /** Hidden from the picker unless PM enables it (§1 row 8). */
  hidden?: boolean;
};

export const DEVICES: readonly DevicePreset[] = [
  { id: "fill", label: "เต็มพื้นที่", w: 0, h: 0, group: "general", icon: "fill", rotatable: false, foldable: false, handheld: false },
  { id: "desktop", label: "เดสก์ท็อป", w: 1920, h: 1080, group: "general", icon: "desktop", rotatable: false, foldable: false, handheld: false },
  { id: "laptop", label: "แล็ปท็อป", w: 1366, h: 768, group: "general", icon: "laptop", rotatable: false, foldable: false, handheld: false },
  { id: "tablet", label: "แท็บเล็ต", w: 820, h: 1180, group: "handheld", icon: "tablet", rotatable: true, foldable: false, handheld: true },
  { id: "phone", label: "มือถือ", w: 393, h: 852, group: "handheld", icon: "phone", rotatable: true, foldable: false, handheld: true },
  { id: "phone-sm", label: "มือถือเล็ก", w: 360, h: 800, group: "handheld", icon: "phone", rotatable: true, foldable: false, handheld: true },
  { id: "fold-closed", label: "จอพับ (พับ)", w: 412, h: 960, group: "fold", icon: "fold", rotatable: true, foldable: false, handheld: true },
  { id: "fold-open", label: "จอพับ (กาง)", w: 750, h: 832, group: "fold", icon: "fold", rotatable: true, foldable: true, handheld: true },
  { id: "pixel-fold-open", label: "Pixel Fold (กาง)", w: 836, h: 842, group: "fold", icon: "fold", rotatable: true, foldable: true, handheld: true, hidden: true },
  { id: "custom", label: "กำหนดเอง", w: 0, h: 0, group: "custom", icon: "custom", rotatable: true, foldable: false, handheld: true },
];

const BY_ID = new Map(DEVICES.map((d) => [d.id, d]));
export const deviceById = (id: DeviceId): DevicePreset => BY_ID.get(id) ?? DEVICES[0];
export const isDeviceId = (v: unknown): v is DeviceId =>
  typeof v === "string" && BY_ID.has(v as DeviceId);

/** Presets offered in multi-view (no fill/custom, no hidden). */
export const MULTI_DEVICES = DEVICES.filter((d) => d.id !== "fill" && d.id !== "custom" && !d.hidden);
export const MULTI_MAX = 3;

export const CUSTOM_MIN = 240;
export const CUSTOM_MAX = 3840;
export const clampCustom = (n: number) =>
  Math.min(CUSTOM_MAX, Math.max(CUSTOM_MIN, Math.round(Number.isFinite(n) ? n : CUSTOM_MIN)));

export type Size = { w: number; h: number };

/**
 * Effective CSS size of a preset. `fill` has no fixed size (null). Custom uses
 * its stored values as-is (rotating custom swaps the stored values instead).
 */
export function effectiveSize(id: DeviceId, landscape: boolean, custom: Size): Size | null {
  const d = deviceById(id);
  if (d.id === "fill") return null;
  if (d.id === "custom") return { w: custom.w, h: custom.h };
  return landscape && d.rotatable ? { w: d.h, h: d.w } : { w: d.w, h: d.h };
}
