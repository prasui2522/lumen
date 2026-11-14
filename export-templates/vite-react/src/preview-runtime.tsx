/**
 * Web Builder Tier 1 Preview runtime (PREVIEW-CODE-VIEW-SPEC §1 / S2).
 *
 * The same template sources as the exported site, prebuilt at app build time and
 * loaded in a sandboxed frame (`allow-scripts`, no `allow-same-origin`). The app
 * sends `site.json` + the generated CSS over `postMessage`; this file never ships
 * in the export zip (`template_files()` lists the zip explicitly).
 */
import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";
import { SiteRoutes } from "./lib/site-routes";
import { NODE_ID_ATTR, PREVIEW_FLAG } from "./lib/render-node";
import type { SiteDocument } from "./lib/site-types";
import { isSafeWbNavigatePath } from "./lib/wb-navigate";
import "./index.css";

(globalThis as Record<string, unknown>)[PREVIEW_FLAG] = true;

/** App → frame. */
type SiteMessage = {
  type: "wb:site";
  site: SiteDocument;
  siteCss: string;
  kindsCss: string;
  /** Route to show; omitted → keep the current route. */
  path?: string;
};
type NavigateMessage = { type: "wb:navigate"; path: string };
type InMessage = SiteMessage | NavigateMessage;

/** Frame → app. */
type OutMessage =
  | { type: "wb:ready" }
  | { type: "wb:height"; height: number }
  | { type: "wb:route"; path: string }
  | { type: "wb:external"; href: string }
  | { type: "wb:select"; id: string | null }
  | { type: "wb:boxes"; boxes: { id: string; x: number; y: number; w: number; h: number }[] };

function post(m: OutMessage) {
  // Opaque origin on both sides → "*" is the only valid target.
  window.parent.postMessage(m, "*");
}

function setStyle(id: string, css: string) {
  let el = document.getElementById(id) as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement("style");
    el.id = id;
    document.head.appendChild(el);
  }
  if (el.textContent !== css) el.textContent = css;
}

function isInternalPath(href: string): boolean {
  return href.startsWith("/") && !href.startsWith("//");
}

/** Router-aware shell: reports route changes and follows app navigation requests. */
function Shell({ doc, navTo }: { doc: SiteDocument; navTo: { path: string; seq: number } | null }) {
  const loc = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    post({ type: "wb:route", path: loc.pathname });
  }, [loc.pathname]);
  useEffect(() => {
    if (navTo && navTo.path !== loc.pathname) navigate(navTo.path, { replace: true });
    // Only react to a new request, not to the route catching up.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navTo?.seq]);
  return <SiteRoutes doc={doc} />;
}

function Runtime() {
  const [doc, setDoc] = useState<SiteDocument | null>(null);
  const [initialPath, setInitialPath] = useState("/");
  const [navTo, setNavTo] = useState<{ path: string; seq: number } | null>(null);

  useEffect(() => {
    const onMessage = (e: MessageEvent<InMessage>) => {
      if (e.source !== window.parent) return;
      const m = e.data;
      if (!m || typeof m !== "object") return;
      if (m.type === "wb:site") {
        setStyle("wb-kinds-css", m.kindsCss ?? "");
        setStyle("wb-site-css", m.siteCss ?? "");
        setDoc((prev) => {
          if (prev === null && m.path) setInitialPath(m.path);
          return m.site;
        });
        if (m.path) setNavTo((n) => ({ path: m.path!, seq: (n?.seq ?? 0) + 1 }));
      } else if (m.type === "wb:navigate") {
        // A3 item 1: same-site paths only (the source check above already limits this to the app).
        if (!isSafeWbNavigatePath(m.path)) return;
        setNavTo((n) => ({ path: m.path, seq: (n?.seq ?? 0) + 1 }));
      }
    };
    window.addEventListener("message", onMessage);
    post({ type: "wb:ready" });
    return () => window.removeEventListener("message", onMessage);
  }, []);

  // Height for the app's `fill` device (the frame has no same-origin access).
  useEffect(() => {
    const root = document.documentElement;
    let last = -1;
    const report = () => {
      const h = Math.ceil(root.scrollHeight);
      if (h !== last) {
        last = h;
        post({ type: "wb:height", height: h });
      }
    };
    const ro = new ResizeObserver(report);
    ro.observe(document.body);
    report();
    return () => ro.disconnect();
  }, [doc]);

  // Capture: select + keep same-site page links; block buttons/inputs/forms (Preview ≠ live site).
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const t = e.target as Element | null;
      if (!t?.closest) return;
      const a = t.closest("a[href]") as HTMLAnchorElement | null;
      if (a) {
        const href = a.getAttribute("href") ?? "";
        if (href && !isInternalPath(href) && !href.startsWith("#")) {
          e.preventDefault();
          post({ type: "wb:external", href });
        } else if (!isInternalPath(href)) {
          e.preventDefault();
        }
      } else {
        e.preventDefault();
      }
      const el = t.closest(`[${NODE_ID_ATTR}]`);
      post({ type: "wb:select", id: el?.getAttribute(NODE_ID_ATTR) ?? null });
    };
    const onSubmit = (e: Event) => e.preventDefault();
    document.addEventListener("click", onClick, true);
    document.addEventListener("submit", onSubmit, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("submit", onSubmit, true);
    };
  }, []);

  // Same box list the Vite preview script posts, so the app can draw a selection frame.
  useEffect(() => {
    let queued = false;
    const postBoxes = () => {
      const boxes: { id: string; x: number; y: number; w: number; h: number }[] = [];
      document.querySelectorAll(`[${NODE_ID_ATTR}]`).forEach((el) => {
        const id = el.getAttribute(NODE_ID_ATTR);
        if (!id) return;
        const r = el.getBoundingClientRect();
        boxes.push({ id, x: r.x, y: r.y, w: r.width, h: r.height });
      });
      post({ type: "wb:boxes", boxes });
    };
    const queue = () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        postBoxes();
      });
    };
    const ro = new ResizeObserver(queue);
    const watched = new WeakSet<Element>();
    const watch = () => {
      document.querySelectorAll(`[${NODE_ID_ATTR}]`).forEach((el) => {
        if (watched.has(el)) return;
        watched.add(el);
        ro.observe(el);
      });
    };
    const mo = new MutationObserver(() => {
      watch();
      queue();
    });
    mo.observe(document.documentElement, { subtree: true, childList: true, attributes: true, characterData: true });
    window.addEventListener("scroll", queue, true);
    window.addEventListener("resize", queue);
    document.addEventListener("transitionend", queue, true);
    document.addEventListener("animationend", queue, true);
    watch();
    queue();
    return () => {
      mo.disconnect();
      ro.disconnect();
      window.removeEventListener("scroll", queue, true);
      window.removeEventListener("resize", queue);
      document.removeEventListener("transitionend", queue, true);
      document.removeEventListener("animationend", queue, true);
    };
  }, [doc]);

  if (!doc) return null;
  return (
    <>
      <MemoryRouter initialEntries={[initialPath]}>
        <Shell doc={doc} navTo={navTo} />
      </MemoryRouter>
      <PreviewDarkToggle enabled={doc.meta?.darkMode === "auto"} />
    </>
  );
}

function PreviewDarkToggle({ enabled }: { enabled: boolean }) {
  const [pref, setPref] = useState<"system" | "light" | "dark">("system");
  useEffect(() => {
    if (!enabled) {
      document.documentElement.classList.remove("dark", "light");
      return;
    }
    const dark =
      pref === "dark" ||
      (pref === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.classList.toggle("dark", dark);
    document.documentElement.classList.toggle("light", pref === "light");
  }, [enabled, pref]);
  if (!enabled) return null;
  const label = { system: "ระบบ", light: "สว่าง", dark: "มืด" } as const;
  return (
    <div
      role="group"
      aria-label="ธีม"
      style={{
        position: "fixed",
        right: 12,
        bottom: 12,
        zIndex: 50,
        display: "flex",
        gap: 4,
        padding: 4,
        borderRadius: 8,
        background: "var(--background)",
        color: "var(--foreground)",
        border: "1px solid var(--border)",
        font: "12px ui-sans-serif, system-ui, sans-serif",
      }}
    >
      {(["system", "light", "dark"] as const).map((v) => (
        <button key={v} type="button" onClick={() => setPref(v)}>
          {label[v]}
        </button>
      ))}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Runtime />
  </StrictMode>,
);
