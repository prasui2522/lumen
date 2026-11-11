import type { NodeType } from "@/schema";
import { NODE_TYPE_LABEL } from "@/lib/document-ops";
import { kindLabel } from "@/lib/kind-label";
import { useLocale, type Locale } from "@/lib/locale";
import { phrase } from "@/lib/phrases";
import { useCallback } from "react";

/**
 * What the Layers list (and page list) should show for a stored label.
 * Kind fallbacks follow the UI locale. Known Thai defaults from blocks /
 * templates are translated for display only — the document is not rewritten.
 */
export function displayLayerLabel(label: string, type: NodeType | null, locale: Locale): string {
  if (type && label === NODE_TYPE_LABEL[type]) return kindLabel(type, locale);
  return phrase(locale, label);
}

export function useDisplayLayerLabel(): (label: string, type?: NodeType | null) => string {
  const locale = useLocale();
  return useCallback(
    (label, type = null) => displayLayerLabel(label, type, locale),
    [locale],
  );
}
