import { Navigate, Route, Routes } from "react-router-dom";
import { SitePage } from "@/pages/SitePage";
import type { SiteDocument, SitePage as Page } from "@/lib/site-types";

/** Pages of a document; a single-page document becomes one `/` page. */
export function sitePages(doc: SiteDocument): Page[] {
  return doc.pages?.length
    ? doc.pages
    : [
        {
          id: "home",
          name: doc.meta?.title ?? "หน้าแรก",
          path: "/",
          root: doc.root,
          nodes: doc.nodes,
        },
      ];
}

/**
 * Route table shared by the exported site (`App.tsx`, static `site.json`) and the
 * Web Builder Tier 1 Preview runtime (same document over `postMessage`).
 */
export function SiteRoutes({ doc }: { doc: SiteDocument }) {
  return (
    <Routes>
      {sitePages(doc).map((p) => (
        <Route key={p.id} path={p.path === "/" ? "/" : `/${p.path.replace(/^\//, "")}`} element={<SitePage doc={doc} pagePath={p.path} />} />
      ))}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
