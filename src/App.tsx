import { Suspense, useEffect } from "react";
import { createBrowserRouter, Navigate, Outlet, RouterProvider } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import { useTheme } from "@/lib/theme";
import { Loader2 } from "lucide-react";
import { lazyNamed, whenIdle } from "@/lib/lazy";
import { editorErrorElement, preloadEditorErrorPage } from "@/pages/editor-error-element";

/*
 * Route-level code splitting (startup size): the entry chunk holds only React,
 * the router, the toaster and this shell. Each page is its own chunk; both are
 * fetched at idle after first paint so opening a project stays instant.
 */
const ProjectListPage = lazyNamed(() =>
  import("@/pages/ProjectListPage").then((m) => m.ProjectListPage),
);
const EditorPage = lazyNamed(() => import("@/pages/EditorPage").then((m) => m.EditorPage));

/** Light fallback while a page chunk loads (fades in late to avoid a flash). */
function PageFallback() {
  return (
    <div className="flex h-svh items-center justify-center bg-background" aria-busy="true">
      {/* Plain lucide icon (no `cn`) keeps the shared UI chunk out of startup. */}
      <Loader2
        role="status"
        aria-label="กำลังโหลด"
        className="size-5 animate-spin text-muted-foreground opacity-0 motion-safe:animate-in motion-safe:fade-in-0 [animation-delay:200ms] [animation-fill-mode:forwards] motion-reduce:opacity-100"
      />
    </div>
  );
}

function ThemedToaster() {
  const { resolved } = useTheme();
  return <Toaster position="bottom-right" theme={resolved} />;
}

function Shell() {
  useEffect(
    () =>
      whenIdle(() => {
        void ProjectListPage.preload();
        void EditorPage.preload();
        void preloadEditorErrorPage();
      }),
    [],
  );
  return (
    <>
      <Suspense fallback={<PageFallback />}>
        <Outlet />
      </Suspense>
      <ThemedToaster />
    </>
  );
}

/**
 * Data router (not <BrowserRouter>) so EditorPage can use `useBlocker` to
 * guard every in-app navigation away from unsaved edits: the back button,
 * history back/forward, and switching to another project route.
 */
const router = createBrowserRouter([
  {
    element: <Shell />,
    children: [
      { path: "/", element: <ProjectListPage /> },
      {
        path: "/editor/:projectId",
        element: <EditorPage />,
        errorElement: editorErrorElement, // A2.5 (N5): a Thai page instead of React Router's English default
      },
      { path: "*", element: <Navigate to="/" replace /> },
    ],
  },
]);

export default function App() {
  // TooltipProvider lives in each page root (AppTooltipProvider): mounting it
  // here would pull Radix tooltip + floating-ui into the startup chunk.
  return <RouterProvider router={router} />;
}
