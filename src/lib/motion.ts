/**
 * Phase 11 E: entrance motion helpers (panel + canvas replay).
 */
import type {
  MotionEntrance,
  MotionEntrancePreset,
  MotionTrigger,
  TransitionEasing,
} from "@/schema";
import {
  MOTION_DELAY_MAX,
  MOTION_DELAY_MIN,
  MOTION_DURATION_MAX,
  MOTION_DURATION_MIN,
  MOTION_ENTRANCE_PRESETS,
  TRANSITION_SPRING_BEZIER,
} from "@/schema";
import { transitionEasingCss } from "@/lib/style-css";

/** T171–T178 */
export const MOTION_PRESET_OPTIONS: {
  value: MotionEntrancePreset | "none";
  label: string;
}[] = [
  { value: "none", label: "ไม่มี" },
  { value: "fade", label: "ค่อย ๆ ปรากฏ" },
  { value: "slideUp", label: "เลื่อนขึ้น" },
  { value: "slideDown", label: "เลื่อนลง" },
  { value: "slideLeft", label: "เลื่อนจากซ้าย" },
  { value: "slideRight", label: "เลื่อนจากขวา" },
  { value: "scaleIn", label: "ขยายเข้า" },
];

/** T180–T181 */
export const MOTION_TRIGGER_OPTIONS: { value: MotionTrigger; label: string }[] = [
  { value: "load", label: "โหลดหน้า" },
  { value: "view", label: "เลื่อนมาถึง" },
];

export const MOTION_EASING_OPTIONS: { value: TransitionEasing; label: string }[] = [
  { value: "ease", label: "ค่าเริ่มต้น" },
  { value: "ease-in", label: "เร่งเข้า" },
  { value: "ease-out", label: "เร่งออก" },
  { value: "ease-in-out", label: "เร่งเข้า-ออก" },
  { value: "linear", label: "คงที่" },
  { value: "spring", label: "เด้ง" },
];

export const MOTION_SECTION = "การเคลื่อนไหว";
export const MOTION_EFFECT_LABEL = "เอฟเฟกต์ตอนเข้า";
export const MOTION_TRIGGER_LABEL = "เริ่มเมื่อ";
export const MOTION_REPLAY = "เล่นตัวอย่าง";
export const MOTION_REPLAY_DONE = "เล่นตัวอย่างแล้ว";
export const MOTION_REPLAY_REDUCED =
  "ระบบตั้งค่าลดการเคลื่อนไหวไว้ จึงไม่เล่นตัวอย่าง";
export const MOTION_VIEW_FALLBACK_NOTE =
  "เบราว์เซอร์ที่ไม่รองรับจะแสดงเนื้อหาปกติโดยไม่มีแอนิเมชัน";
export const MOTION_VIEW_DESIGN_NOTE =
  "ตัวอย่างการเลื่อนมาถึงดูได้ในโหมดตัวอย่างเท่านั้น";

export const DEFAULT_MOTION_ENTRANCE: MotionEntrance = {
  preset: "fade",
  trigger: "load",
  durationMs: 300,
  delayMs: 0,
  easing: "ease-out",
};

export function isMotionPreset(v: string): v is MotionEntrancePreset {
  return (MOTION_ENTRANCE_PRESETS as readonly string[]).includes(v);
}

export function clampMotionDuration(n: number): number {
  if (!Number.isFinite(n)) return MOTION_DURATION_MIN;
  return Math.max(MOTION_DURATION_MIN, Math.min(MOTION_DURATION_MAX, Math.round(n)));
}

export function clampMotionDelay(n: number): number {
  if (!Number.isFinite(n)) return MOTION_DELAY_MIN;
  return Math.max(MOTION_DELAY_MIN, Math.min(MOTION_DELAY_MAX, Math.round(n)));
}

const KF_STYLE_ID = "wb-motion-replay-keyframes";

const KF_BODIES: Record<MotionEntrancePreset, string> = {
  fade: "from{opacity:0}to{opacity:1}",
  slideUp: "from{opacity:0;transform:translateY(24px)}to{opacity:1;transform:translateY(0)}",
  slideDown: "from{opacity:0;transform:translateY(-24px)}to{opacity:1;transform:translateY(0)}",
  slideLeft: "from{opacity:0;transform:translateX(24px)}to{opacity:1;transform:translateX(0)}",
  slideRight: "from{opacity:0;transform:translateX(-24px)}to{opacity:1;transform:translateX(0)}",
  scaleIn: "from{opacity:0;transform:scale(0.96)}to{opacity:1;transform:scale(1)}",
};

function ensureReplayKeyframes(): void {
  if (typeof document === "undefined") return;
  if (document.getElementById(KF_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = KF_STYLE_ID;
  style.textContent = MOTION_ENTRANCE_PRESETS.map(
    (p) => `@keyframes wb-replay-${p}{${KF_BODIES[p]}}`,
  ).join("");
  document.head.appendChild(style);
}

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * E5: play entrance once on a canvas element. Clears inline animation after end.
 * Concurrent calls on the same element cancel the previous run.
 */
export function playEntranceReplay(
  el: HTMLElement,
  entrance: MotionEntrance,
): Promise<void> {
  ensureReplayKeyframes();
  const ease =
    transitionEasingCss(entrance.easing) ??
    (entrance.easing === "spring" ? TRANSITION_SPRING_BEZIER : "ease-out");
  const dur = clampMotionDuration(entrance.durationMs);
  const delay = clampMotionDelay(entrance.delayMs);
  const name = `wb-replay-${entrance.preset}`;

  return new Promise((resolve) => {
    const cleanup = () => {
      el.style.removeProperty("animation");
      el.removeEventListener("animationend", onEnd);
      resolve();
    };
    const onEnd = (ev: AnimationEvent) => {
      if (ev.target !== el) return;
      cleanup();
    };
    el.style.animation = "none";
    // Force reflow so a second replay restarts.
    void el.offsetWidth;
    el.style.animation = `${name} ${dur}ms ${ease} ${delay}ms backwards`;
    el.addEventListener("animationend", onEnd);
  });
}
