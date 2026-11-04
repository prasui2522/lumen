// Entry of the A2.5 real-Chromium behavioural tests (a25-*-browser.test.ts). It is bundled by `Bun.build` inside the
// tests and is NOT part of the app (nothing imports it, so vite never sees it). It mounts the REAL LayersPanel (which
// holds the ElementPalette), DesignCanvas and StylePanel with a document taken from `window.__DOC`, like the editor
// does, exposes the two stores as `window.__stores`, and reports `window.__ready`.
import { createRoot } from "react-dom/client";
import { DesignCanvas } from "@/components/editor/DesignCanvas";
import { LayersPanel } from "@/components/editor/LayersPanel";
import { StylePanel } from "@/components/editor/StylePanel";
import { AppTooltipProvider } from "@/components/ui/tooltip";
import { useEditorStore } from "@/stores/editor-store";
import { useProjectsStore } from "@/stores/projects-store";
import type { PageDocument } from "@/schema";

declare global {
  interface Window {
    __DOC: PageDocument;
    __SELECT?: string | null;
    __ready?: boolean;
    __stores?: { projects: typeof useProjectsStore; editor: typeof useEditorStore };
  }
}

// `openId` + `savedDocument` make updateOpenDocument (every palette insert / panel write) take effect, like an open project.
useProjectsStore.setState({ openId: "p-test", openDocument: window.__DOC, savedDocument: window.__DOC, dirty: false });
useEditorStore.setState({ selectedNodeId: window.__SELECT ?? null, editingNodeId: null });
window.__stores = { projects: useProjectsStore, editor: useEditorStore };

createRoot(document.getElementById("layers")!).render(
  <AppTooltipProvider>
    <LayersPanel />
  </AppTooltipProvider>,
);
createRoot(document.getElementById("root")!).render(<DesignCanvas />);
createRoot(document.getElementById("style")!).render(
  <AppTooltipProvider>
    <StylePanel />
  </AppTooltipProvider>,
);
requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(() => (window.__ready = true), 100)));
