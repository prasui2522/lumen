import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { RenderNode } from "@/lib/render-node";
import { sitePages } from "@/lib/site-routes";
import type { SiteDocument, SitePage as Page } from "@/lib/site-types";
import { guardAdminPath, auth } from "@/lib/wb-db-runtime";
import { setExportedDbModel } from "@/lib/wb-db-client";
import { PREVIEW_FLAG } from "@/lib/render-node";

function resolvePage(doc: SiteDocument, pagePath: string): Page {
  const pages = sitePages(doc);
  return pages.find((p) => p.path === pagePath) ?? pages[0]!;
}

function inPreview(): boolean {
  return (globalThis as Record<string, unknown>)[PREVIEW_FLAG] === true;
}

export function SitePage({ doc, pagePath }: { doc: SiteDocument; pagePath: string }) {
  const page = resolvePage(doc, pagePath);
  const title = doc.meta?.title ? `${page.name} · ${doc.meta.title}` : page.name;
  const loc = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (typeof document !== "undefined") document.title = title;
  }, [title]);

  useEffect(() => {
    setExportedDbModel(doc.dbModel);
  }, [doc.dbModel]);

  useEffect(() => {
    if (inPreview()) return;
    if (!guardAdminPath(loc.pathname)) return;
  }, [loc.pathname]);

  useEffect(() => {
    if (inPreview()) return;
    const onClick = (e: MouseEvent) => {
      const t = e.target as Element | null;
      const btn = t?.closest?.('[data-wb-action="dbSubmit"]') as HTMLElement | null;
      if (!btn) {
        // Logout: button labeled ออกจากระบบ without dbSubmit
        const plain = t?.closest?.("button");
        if (plain && plain.textContent?.includes("ออกจากระบบ")) {
          e.preventDefault();
          void auth.signOut().then(() => navigate("/login"));
        }
        return;
      }
      e.preventDefault();
      const nodeEl = btn.closest("[data-node-id], [data-wb-node-id]");
      const buttonId =
        nodeEl?.getAttribute("data-node-id") ??
        nodeEl?.getAttribute("data-wb-node-id") ??
        btn.getAttribute("data-wb-node-id") ??
        "";
      if (!buttonId) return;
      void import("@/lib/wb-db-submit").then(async ({ runExportDbSubmit }) => {
        const r = await runExportDbSubmit({
          buttonId,
          nodes: page.nodes,
          rootEl: document,
        });
        if (r.ok) {
          if (loc.pathname === "/login" || loc.pathname === "/signup") navigate("/admin");
          else window.alert("บันทึกแล้ว");
        } else {
          window.alert(r.error ?? "บันทึกไม่สำเร็จ");
        }
      });
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [page.nodes, loc.pathname, navigate]);

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
