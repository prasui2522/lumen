import site from "@/data/site.json";
import { RenderNode } from "@/lib/render-node";
import type { SiteDocument, SitePage as Page } from "@/lib/site-types";

const doc = site as unknown as SiteDocument;

function resolvePage(pagePath: string): Page {
  if (doc.pages && doc.pages.length > 0) {
    const found = doc.pages.find((p) => p.path === pagePath) ?? doc.pages[0]!;
    return found;
  }
  return {
    id: "home",
    name: doc.meta?.title ?? "หน้าแรก",
    path: "/",
    root: doc.root,
    nodes: doc.nodes,
  };
}

export function SitePage({ pagePath }: { pagePath: string }) {
  const page = resolvePage(pagePath);
  const title = doc.meta?.title ? `${page.name} · ${doc.meta.title}` : page.name;
  if (typeof document !== "undefined") document.title = title;
  return (
    <main>
      <RenderNode id={page.root} ctx={{ nodes: page.nodes, assetFiles: doc.assetFiles, baseDefaults: doc.baseDefaults, headingFontSizes: doc.headingFontSizes, pageRoot: page.root, pageId: page.id }} />
    </main>
  );
}
