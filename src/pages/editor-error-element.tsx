import { Suspense } from "react";
import { lazyNamed } from "@/lib/lazy";

// A2.5 (N5): the editor route's `errorElement`. The Thai page is its own lazy chunk (fetched at idle, see `preloadEditorErrorPage`),
// so the startup bundle only holds this few-line wrapper.
const EditorErrorPage = lazyNamed(() => import("@/pages/EditorErrorPage").then((m) => m.EditorErrorPage));

export const preloadEditorErrorPage = () => EditorErrorPage.preload();

export const editorErrorElement = (
  <Suspense fallback={<div aria-busy="true" />}>
    <EditorErrorPage />
  </Suspense>
);
