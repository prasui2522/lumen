import { describe, expect, test } from "bun:test";
import {
  HREF_MISSING_PAGE,
  HREF_SCHEME_ERROR,
  checkButtonHref,
  findPageForHref,
  hrefScheme,
  missingPageWarning,
  type LinkPage,
} from "./link-target";

const pages: LinkPage[] = [
  { id: "home", name: "หน้าแรก", path: "/" },
  { id: "login", name: "Login", path: "/login" },
  { id: "signup", name: "สมัคร", path: "/signup" },
];

describe("hrefScheme mirrors safe_href", () => {
  test("schemes and relative forms", () => {
    expect(hrefScheme("https://x.y")).toBe("https");
    expect(hrefScheme(" JavaScript:alert(1)")).toBe("javascript");
    expect(hrefScheme("java\nscript:alert(1)")).toBe("javascript");
    expect(hrefScheme("jav ascript:x")).toBe("javascript");
    expect(hrefScheme("/a:b")).toBeNull();
    expect(hrefScheme("?q=a:b")).toBeNull();
    expect(hrefScheme("#x:y")).toBeNull();
    expect(hrefScheme("./x")).toBeNull();
    expect(hrefScheme("login.html")).toBeNull();
  });
});

describe("findPageForHref (page matching)", () => {
  test("/login, /login/, login.html and friends resolve to the same page", () => {
    for (const h of ["/login", "/login/", "login.html", "./login.html", "/login?x#y", "/login/#top", "login.html?a=1"]) {
      expect(findPageForHref(h, pages)?.id).toBe("login");
    }
  });
  test("trims before matching (stored hrefs with stray spaces)", () => {
    for (const h of ["  /login  ", "\t/login/\n", " login.html ", " /login?x#y", "/login//"]) {
      expect(findPageForHref(h, pages)?.id).toBe("login");
    }
    expect(findPageForHref("  /  ", pages)?.id).toBe("home");
    expect(findPageForHref("  /pricing ", pages)).toBeNull();
  });
  test("home forms", () => {
    for (const h of ["/", "index.html", "./index.html", "/?q", "/#top"]) {
      expect(findPageForHref(h, pages)?.id).toBe("home");
    }
  });
  test("no match", () => {
    for (const h of ["", "/pricing", "pricing.html", "/Login", "#top", "?q", "./x", "//login", "https://site/login", "/login/extra", "a/login.html", "/login.html", "/index.html"]) {
      expect(findPageForHref(h, pages)).toBeNull();
    }
  });
});

describe("checkButtonHref (spec §3 table)", () => {
  test("empty clears", () => {
    expect(checkButtonHref("", pages)).toEqual({ kind: "clear" });
    expect(checkButtonHref("   ", pages)).toEqual({ kind: "clear" });
  });
  test("page paths apply without a message", () => {
    for (const h of ["/login", "/login/", "/login?x#y"]) {
      expect(checkButtonHref(h, pages)).toEqual({ kind: "apply", href: h, warning: null });
    }
    expect(checkButtonHref("  /signup  ", pages)).toEqual({ kind: "apply", href: "/signup", warning: null });
  });
  test("missing page path applies with a warning; other relative forms are silent", () => {
    expect(checkButtonHref("/pricing", pages)).toEqual({ kind: "apply", href: "/pricing", warning: HREF_MISSING_PAGE });
    for (const h of ["./x", "#top", "?q"]) {
      expect(checkButtonHref(h, pages)).toEqual({ kind: "apply", href: h, warning: null });
    }
  });
  test("allowed schemes apply", () => {
    for (const h of ["http://a.b", "https://a.b/c", "mailto:a@b.c", "tel:+6621234567", "HTTPS://A.B"]) {
      expect(checkButtonHref(h, pages)).toEqual({ kind: "apply", href: h, warning: null });
    }
  });
  test("other schemes are rejected", () => {
    for (const h of ["javascript:alert(1)", "data:text/html,x", "file:///etc/passwd", "ftp://x", "java\tscript:x", "vbscript:x"]) {
      expect(checkButtonHref(h, pages)).toEqual({ kind: "reject", error: HREF_SCHEME_ERROR });
    }
  });
});

describe("missingPageWarning (dangling after path change / delete)", () => {
  test("only for /… paths with no page", () => {
    expect(missingPageWarning("/login", pages)).toBeNull();
    expect(missingPageWarning("/old-login", pages)).toBe(HREF_MISSING_PAGE);
    expect(missingPageWarning("//cdn.example/x", pages)).toBeNull();
    expect(missingPageWarning("https://x", pages)).toBeNull();
    expect(missingPageWarning("pricing.html", pages)).toBeNull();
    expect(missingPageWarning("/login.html", pages)).toBe(HREF_MISSING_PAGE);
    // Trimmed first: spaces neither hide a match nor hide the warning.
    expect(missingPageWarning("  /login  ", pages)).toBeNull();
    expect(missingPageWarning("  /pricing  ", pages)).toBe(HREF_MISSING_PAGE);
    expect(missingPageWarning(" //cdn.example/x", pages)).toBeNull();
    const renamed = pages.map((p) => (p.id === "login" ? { ...p, path: "/sign-in" } : p));
    expect(missingPageWarning("/login", renamed)).toBe(HREF_MISSING_PAGE);
  });
});
