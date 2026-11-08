/**
 * B8.1 (§9.B): Style-panel state switcher helpers (T61–T68).
 */
import type { Node, NodeStateName } from "@/schema";

export const STATE_SWITCH_OPTIONS: {
  value: "normal" | NodeStateName;
  label: string;
  /** Full name for aria-label when the visible label is short (T65). */
  ariaLabel?: string;
}[] = [
  { value: "normal", label: "ปกติ" },
  { value: "hover", label: "ชี้เมาส์" },
  { value: "active", label: "กดค้าง" },
  { value: "focusVisible", label: "โฟกัส", ariaLabel: "โฟกัสด้วยคีย์บอร์ด" },
];

/** T66 — announced when a non-normal state locks the breakpoint to desktop. */
export const STATE_LOCKS_BREAKPOINT_MSG =
  "สถานะใช้กับทุกขนาดหน้าจอ จึงล็อกจุดพักที่เดสก์ท็อป";

/** T67 — hint under the switcher while editing a state. */
export const STATE_PAINT_ONLY_HINT =
  "สถานะนี้เปลี่ยนได้เฉพาะสี เงา ความทึบ ฟิลเตอร์ และการเคลื่อนย้าย";

/** T118 — clear the entire current state object (not an empty `{}`). */
export const CLEAR_THIS_STATE_LABEL = "ล้างสถานะนี้";

/**
 * Kinds that can offer focusVisible in the panel (T68 / §7.3).
 * Matches compiler focusable output: linked button, link, input, textarea, select, checkbox, switch.
 */
export function nodeOffersFocusState(node: Node): boolean {
  const p = node.props;
  switch (p.type) {
    case "button": {
      const href = "href" in p ? p.href : undefined;
      const action = "action" in p ? p.action : undefined;
      return action !== "none" && typeof href === "string" && href.trim().length > 0;
    }
    case "link":
    case "input":
    case "textarea":
    case "select":
    case "checkbox":
    case "switch":
      return true;
    default:
      return false;
  }
}
