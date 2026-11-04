// Entry of the A2.5 N5 real-Chromium test (NOT part of the app). A memory router with the editor route shaped like App.tsx's:
// the route element is the REAL DesignCanvas over `window.__DOC` (an aspectRatio of 9/16 makes the canvas refuse to draw,
// as `ratioCss` throws), and `errorElement` is the app's own `editorErrorElement`.
import { createRoot } from "react-dom/client";
import { RouterProvider, createMemoryRouter } from "react-router-dom";
import { DesignCanvas } from "@/components/editor/DesignCanvas";
import { editorErrorElement } from "@/pages/editor-error-element";
import { useEditorStore } from "@/stores/editor-store";
import { useProjectsStore } from "@/stores/projects-store";
import type { PageDocument } from "@/schema";

declare global {
  interface Window {
    __DOC: PageDocument;
    __ready?: boolean;
  }
}
useProjectsStore.setState({ openId: "p-test", openDocument: window.__DOC, savedDocument: window.__DOC, dirty: false });
useEditorStore.setState({ selectedNodeId: null, editingNodeId: null });

const router = createMemoryRouter(
  [
    { path: "/", element: <p id="home">รายการโปรเจกต์</p> },
    { path: "/editor/:projectId", element: <DesignCanvas />, errorElement: editorErrorElement },
  ],
  { initialEntries: ["/editor/p-test"] },
);
createRoot(document.getElementById("root")!).render(<RouterProvider router={router} />);
requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(() => (window.__ready = true), 200)));
