import { Navigate, Route, Routes } from "react-router-dom";
import site from "./data/site.json";
import { SitePage } from "./pages/SitePage";
import type { SiteDocument } from "./lib/site-types";

const doc = site as unknown as SiteDocument;

function routes() {
  const pages = doc.pages?.length
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
  return pages.map((p) => ({
    path: p.path === "/" ? "/" : p.path.replace(/^\//, ""),
    pagePath: p.path,
    pageId: p.id,
  }));
}

export default function App() {
  const rs = routes();
  return (
    <Routes>
      {rs.map((r) => (
        <Route
          key={r.pageId}
          path={r.path === "/" ? "/" : `/${r.path}`}
          element={<SitePage pagePath={r.pagePath} />}
        />
      ))}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
