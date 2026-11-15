/**
 * Ensure the per-project test SQLite is open before Preview Form↔DB ops.
 */
import type { DbModel } from "@/lib/db-model";
import { useDbModelStore } from "@/lib/db-model-store";
import { useTestDataStore } from "@/lib/db-testdata";
import { useProjectsStore } from "@/stores/projects-store";

export async function ensureTestDbOpen(): Promise<{ ok: boolean; model: DbModel; error?: string }> {
  const projectId = useProjectsStore.getState().openId;
  if (!projectId) return { ok: false, model: { version: 1, tables: [] }, error: "ไม่มีโปรเจกต์เปิด" };

  let model = useDbModelStore.getState().model;
  if (useDbModelStore.getState().status !== "ready" || useDbModelStore.getState().projectId !== projectId) {
    await useDbModelStore.getState().ensureLoaded(projectId);
    model = useDbModelStore.getState().model;
  }
  if (useDbModelStore.getState().status === "error") {
    return { ok: false, model, error: useDbModelStore.getState().error ?? "โหลดโมเดลไม่สำเร็จ" };
  }

  const test = useTestDataStore.getState();
  if (test.status !== "ready" || test.projectId !== projectId) {
    await useTestDataStore.getState().open(projectId, model);
  }
  const after = useTestDataStore.getState();
  if (after.status !== "ready") {
    return {
      ok: false,
      model,
      error: after.error ?? `ฐานข้อมูลทดสอบไม่พร้อม (${after.status})`,
    };
  }
  return { ok: true, model };
}
