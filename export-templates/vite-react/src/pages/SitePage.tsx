import { RenderNode } from "@/lib/render-node";
import { sitePages } from "@/lib/site-routes";
import type { SiteDocument, SitePage as Page } from "@/lib/site-types";

function resolvePage(doc: SiteDocument, pagePath: string): Page {
  const pages = sitePages(doc);
  return pages.find((p) => p.path === pagePath) ?? pages[0]!;
}

export function SitePage({ doc, pagePath }: { doc: SiteDocument; pagePath: string }) {
  const page = resolvePage(doc, pagePath);
  const title = doc.meta?.title ? `${page.name} · ${doc.meta.title}` : page.name;
  if (typeof document !== "undefined") document.title = title;
  return (
    <main>
      <RenderNode
        id={page.root}
        ctx={{
          nodes: page.nodes,
          assetFiles: doc.assetFiles,
          assetUrls: doc.assetUrls,
          baseDefaults: doc.baseDefaults,
          headingFontSizes: doc.headingFontSizes,
          pageRoot: page.root,
          pageId: page.id,
        }}
      />
    </main>
  );
}
