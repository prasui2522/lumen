// Entry of the real-Chromium behavioural tests (a241-n1-browser.test.ts). It is bundled by `Bun.build` inside the
// test and is NOT part of the app (nothing imports it, so vite never sees it). It mounts the REAL DesignCanvas with a
// document taken from `window.__DOC`, exactly like the editor does, and reports `window.__ready`.
import { createRoot } from "react-dom/client";
import { DesignCanvas } from "@/components/editor/DesignCanvas";
import { useEditorStore } from "@/stores/editor-store";
import { useProjectsStore } from "@/stores/projects-store";
import type { PageDocument } from "@/schema";

declare global {
  interface Window {
    __DOC: PageDocument;
    __ready?: boolean;
  }
}

useProjectsStore.setState({ openDocument: window.__DOC });
useEditorStore.setState({ selectedNodeId: null, editingNodeId: null });
createRoot(document.getElementById("root")!).render(<DesignCanvas />);
requestAnimationFrame(() => requestAnimationFrame(() => (window.__ready = true)));
