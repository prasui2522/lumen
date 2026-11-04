import { describe, expect, test } from "bun:test";
import type { LinkPage } from "./link-target";
import {
  PAGE_MARKER_PREFIX,
  pageMarkerHref,
  parsePageMarker,
  previewPageMarkers,
  previewPagePaths,
  resolvePageMarker,
} from "./preview-links";

const pages: LinkPage[] = [
  { id: "home", name: "หน้าแรก", path: "/" },
  { id: "login", name: "เข้าสู่ระบบ", path: "/login" },
  { id: "faq", name: "คำถาม", path: "/faq-2" },
];

describe("marker build / parse round-trip", () => {
  test("encodes with encodeURIComponent and decodes back", () => {
    expect(pageMarkerHref("/login")).toBe("about:blank#wb-page=%2Flogin");
    expect(pageMarkerHref("/")).toBe("about:blank#wb-page=%2F");
    for (const p of ["/", "/login", "/faq-2", "/หน้าแรก", "/a b?c#d&e=f", "/100%", "/it's(1)!"]) {
      const href = pageMarkerHref(p);
      expect(href.startsWith(PAGE_MARKER_PREFIX)).toBe(true);
      // Only encodeURIComponent's unreserved set and %XX escapes remain.
      expect(href.slice(PAGE_MARKER_PREFIX.length)).toMatch(/^(?:[A-Za-z0-9\-_.!~*'()]|%[0-9A-F]{2})*$/);
      expect(parsePageMarker(href)).toBe(p);
    }
    expect(pageMarkerHref("/หน้า")).toBe("about:blank#wb-page=%2F%E0%B8%AB%E0%B8%99%E0%B9%89%E0%B8%B2");
  });
  test("already-encoded payloads decode once", () => {
    expect(parsePageMarker("about:blank#wb-page=%2F%E0%B8%AB%E0%B8%99%E0%B9%89%E0%B8%B2")).toBe("/หน้า");
    expect(parsePageMarker("about:blank#wb-page=%252Flogin")).toBe("%2Flogin");
  });
  test("non-markers and broken encodings → null", () => {
    for (const h of ["about:srcdoc", "about:blank", "about:blank#top", "about:blank#wb-page", "http://localhost/#wb-page=%2Flogin", "about:blank#wb-page=%E0%B8"]) {
      expect(parsePageMarker(h)).toBeNull();
    }
    expect(parsePageMarker("about:blank#wb-page=")).toBe("");
  });
});

describe("resolvePageMarker", () => {
  test("payload forms resolve like authored hrefs (trimmed)", () => {
    for (const p of ["/login", "/login/", "login.html", "./login.html", "/login?x#y", " /login "]) {
      expect(resolvePageMarker(pageMarkerHref(p), pages, "home")?.id).toBe("login");
    }
    expect(resolvePageMarker(pageMarkerHref("index.html"), pages, "login")?.id).toBe("home");
  });
  test("current page, missing page and non-markers → null", () => {
    expect(resolvePageMarker(pageMarkerHref("/login"), pages, "login")).toBeNull();
    expect(resolvePageMarker(pageMarkerHref("/pricing"), pages, "home")).toBeNull();
    expect(resolvePageMarker(pageMarkerHref(""), pages, "home")).toBeNull();
    expect(resolvePageMarker("about:srcdoc", pages, "home")).toBeNull();
  });
});

describe("compile_preview maps", () => {
  test("current page gets no marker; others do", () => {
    expect(previewPageMarkers(pages, "login")).toEqual({
      "index.html": "about:blank#wb-page=%2F",
      "faq-2.html": "about:blank#wb-page=%2Ffaq-2",
    });
    expect(previewPageMarkers(pages, "home")["index.html"]).toBeUndefined();
    expect(Object.keys(previewPageMarkers(pages, null))).toHaveLength(3);
  });
  test("page paths include file forms", () => {
    expect(previewPagePaths(pages)).toEqual({
      "/": "index.html",
      "index.html": "index.html",
      "./index.html": "index.html",
      "/login": "login.html",
      "/login/": "login.html",
      "login.html": "login.html",
      "./login.html": "login.html",
      "/faq-2": "faq-2.html",
      "/faq-2/": "faq-2.html",
      "faq-2.html": "faq-2.html",
      "./faq-2.html": "faq-2.html",
    });
  });
});
