import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import { useProjectsStore } from "@/stores/projects-store";

/**
 * Default zip name from the project name: strip characters invalid on
 * Windows/macOS/Linux, control chars, leading dots; collapse spaces; cap length.
 */
export function exportFileName(name: string | null | undefined): string {
  const stem = (name ?? "")
    // eslint-disable-next-line no-control-regex
    .replace(/[\\/:*?"<>|\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+/, "")
    .replace(/[. ]+$/, "")
    .slice(0, 80)
    .trim();
  return `${stem || "website"}.zip`;
}

function baseName(path: string): string {
  return path.split(/[\\/]/).pop() || path;
}

export type ExportResult =
  | { status: "cancelled" }
  | { status: "done"; fileName: string; includedUnsaved: boolean };

/**
 * Export the open project as a Vite + React + TypeScript zip. Uses the
 * in-memory document (unsaved edits included — the same thing Preview shows);
 * the Rust side falls back to the saved SQLite copy only when no document is
 * passed. Throws the backend's error message on failure.
 */
export async function exportOpenProject(): Promise<ExportResult> {
  const { openId, openName, openDocument, dirty } = useProjectsStore.getState();
  if (!openId || !openDocument) throw new Error("ไม่มีโปรเจกต์ที่เปิดอยู่");
  const destPath = await save({
    title: "ส่งออกเว็บไซต์",
    defaultPath: exportFileName(openName ?? openDocument.meta.title),
    filters: [{ name: "ZIP", extensions: ["zip"] }],
  });
  if (!destPath) return { status: "cancelled" };
  const written = await invoke<string>("export_project", {
    projectId: openId,
    destPath,
    document: openDocument,
  });
  return { status: "done", fileName: baseName(written), includedUnsaved: dirty };
}
