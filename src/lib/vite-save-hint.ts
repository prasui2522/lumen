/**
 * A3 item 10: what the Vite frame shows next to the saved state. Before the first save of a project with
 * content, Vite has nothing of it to serve (blank frame), so a Thai hint replaces the frame. With unsaved
 * edits the frame stays and a small badge says so.
 */
export type ViteSaveState = "unsaved" | "dirty" | "saved";

export const VITE_UNSAVED_TITLE = "บันทึกโปรเจกต์ก่อนเพื่อดูตัวอย่างด้วย Vite";
export const VITE_UNSAVED_SUB = "ตัวอย่าง Vite ใช้เวอร์ชันที่บันทึกไว้ — กดปุ่มบันทึกหรือ Ctrl+S";
export const VITE_DIRTY_BADGE = "มีการแก้ไขที่ยังไม่บันทึก";

export function viteSaveState(a: { savedEmpty: boolean; openEmpty: boolean; dirty: boolean }): ViteSaveState {
  if (a.savedEmpty && !a.openEmpty) return "unsaved";
  return a.dirty ? "dirty" : "saved";
}
