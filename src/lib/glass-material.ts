/**
 * Glass thickness for container / card / section.
 * One preset starts the look; these steps move fill, blur, and edge together.
 */
import type { StyleProps } from "@/schema";

export const GLASS_LEVELS = ["ultra", "thin", "regular", "thick"] as const;
export type GlassLevel = (typeof GLASS_LEVELS)[number];

export const GLASS_LEVEL_LABEL: Record<GlassLevel, string> = {
  ultra: "บางมาก",
  thin: "บาง",
  regular: "ปกติ",
  thick: "หนา",
};

const LEVELS: Record<GlassLevel, StyleProps> = {
  ultra: {
    backgroundColor: "#ffffff14",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "#ffffff33",
    borderRadius: 16,
    backdropFilter: { blur: 8, saturate: 120 },
    color: "#0f172a",
  },
  thin: {
    backgroundColor: "#ffffff24",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "#ffffff40",
    borderRadius: 16,
    backdropFilter: { blur: 12, saturate: 130 },
    color: "#0f172a",
  },
  regular: {
    backgroundColor: "#ffffff2e",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "#ffffff4d",
    borderRadius: 16,
    backdropFilter: { blur: 16, saturate: 140 },
    color: "#0f172a",
  },
  thick: {
    backgroundColor: "#ffffff59",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "#ffffff73",
    borderRadius: 16,
    backdropFilter: { blur: 24, saturate: 160 },
    boxShadow: [{ x: 0, y: 1, blur: 0, color: "#ffffffcc", inset: true }],
    color: "#0f172a",
  },
};

export function glassStyle(level: GlassLevel): StyleProps {
  return LEVELS[level];
}

export function glassLevelOf(style: StyleProps | undefined): GlassLevel | "" {
  const blur = style?.backdropFilter?.blur;
  if (blur === 8) return "ultra";
  if (blur === 12) return "thin";
  if (blur === 16) return "regular";
  if (blur === 24) return "thick";
  return "";
}

/** Drop alpha from #RGB / #RGBA / #RRGGBB / #RRGGBBAA so reduced-transparency has a solid fill. */
export function opaqueFill(color: string | undefined): string {
  if (!color) return "#f8fafc";
  const hex = color.trim();
  if (/^#[0-9a-fA-F]{3}$/.test(hex)) {
    return `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
  }
  if (/^#[0-9a-fA-F]{4}$/.test(hex)) {
    return `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
  }
  if (/^#[0-9a-fA-F]{6}$/.test(hex)) return hex;
  if (/^#[0-9a-fA-F]{8}$/.test(hex)) return hex.slice(0, 7);
  return "#f8fafc";
}
