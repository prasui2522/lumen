import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";

const ROOT = join(import.meta.dir, "../../..");
const TPL = join(ROOT, "export-templates/vite-react");

describe("Phase C Supabase export adapters", () => {
  test("wb-db-supabase exposes backend gate + auth + query helpers", () => {
    const src = readFileSync(join(TPL, "src/lib/wb-db-supabase.ts"), "utf8");
    expect(src).toContain("isSupabaseBackend");
    expect(src).toContain("createSupabaseAuthAdapter");
    expect(src).toContain("supabaseQuery");
    expect(src).toContain("supabaseSignUp");
    expect(src).toContain("/auth/v1/token");
    expect(src).toContain("/rest/v1/");
  });

  test("runtime and client switch on VITE_WB_DB_BACKEND", () => {
    const runtime = readFileSync(join(TPL, "src/lib/wb-db-runtime.ts"), "utf8");
    const client = readFileSync(join(TPL, "src/lib/wb-db-client.ts"), "utf8");
    const submit = readFileSync(join(TPL, "src/lib/wb-db-submit.ts"), "utf8");
    expect(runtime).toContain("isSupabaseBackend");
    expect(runtime).toContain("createSupabaseAuthAdapter");
    expect(client).toContain("supabaseQuery");
    expect(submit).toContain("supabaseInsert");
    expect(submit).toContain("supabaseSignUp");
  });

  test("env example and docs exist", () => {
    const env = readFileSync(join(TPL, ".env.example"), "utf8");
    expect(env).toContain("VITE_WB_DB_BACKEND");
    expect(env).toContain("VITE_SUPABASE_URL");
    expect(env).toContain("VITE_SUPABASE_ANON_KEY");
    const doc = readFileSync(join(ROOT, "docs/SUPABASE.md"), "utf8");
    expect(doc).toContain("Phase C");
    expect(doc).toContain("Clerk");
  });
});
