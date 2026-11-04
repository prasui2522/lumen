import { describe, expect, test } from "bun:test";
import { nameSubmit } from "./new-project";

describe("new-project submit", () => {
  test("submits the trimmed name", () => {
    expect(nameSubmit("  ร้านกาแฟ ", false)).toEqual({ kind: "submit", name: "ร้านกาแฟ" });
  });
  test("whitespace is invalid (no fallback to หน้าใหม่)", () => {
    expect(nameSubmit("   ", false)).toEqual({ kind: "invalid" });
  });
  test("a second submit while busy is ignored", () => {
    expect(nameSubmit("หน้าใหม่", true)).toEqual({ kind: "ignore" });
    expect(nameSubmit("   ", true)).toEqual({ kind: "ignore" });
  });
  test("Enter x3 in one burst: only the first submits (in-flight flag set synchronously)", () => {
    let pending = false;
    const sent: string[] = [];
    for (let i = 0; i < 3; i++) {
      const r = nameSubmit("หน้าใหม่", false || pending);
      if (r.kind === "submit") {
        pending = true;
        sent.push(r.name);
      }
    }
    expect(sent).toEqual(["หน้าใหม่"]);
  });
});
