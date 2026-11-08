/**
 * Phase 11 C6/C7: Tauri `library_*` wrappers for user-saved presets.
 */
import { invoke } from "@tauri-apps/api/core";
import {
  validatePreset,
  type StylePreset,
} from "@/lib/presets-registry";

export const LIBRARY_KIND_PRESET = "preset";

export type LibraryItem = {
  kind: string;
  id: string;
  name: string;
  json: string;
  createdAt: number;
};

export async function libraryList(kind: string = LIBRARY_KIND_PRESET): Promise<LibraryItem[]> {
  return invoke<LibraryItem[]>("library_list", { kind });
}

export async function libraryPut(
  id: string,
  name: string,
  json: string,
  kind: string = LIBRARY_KIND_PRESET,
): Promise<LibraryItem> {
  return invoke<LibraryItem>("library_put", { kind, id, name, json });
}

export async function libraryDelete(id: string): Promise<boolean> {
  return invoke<boolean>("library_delete", { id });
}

/** Parse + validate library JSON rows into StylePreset values (skip hostile). */
export function presetsFromLibraryItems(items: LibraryItem[]): StylePreset[] {
  const out: StylePreset[] = [];
  for (const item of items) {
    let raw: unknown;
    try {
      raw = JSON.parse(item.json);
    } catch {
      continue;
    }
    const { preset } = validatePreset(raw);
    if (preset) out.push(preset);
  }
  return out;
}
