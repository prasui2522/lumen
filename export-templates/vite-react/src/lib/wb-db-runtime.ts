/**
 * Form↔DB AuthAdapter entry for Vite exports.
 * Default: local stub. Phase C: set VITE_WB_DB_BACKEND=supabase (+ URL/anon key).
 * Page nodes stay vendor-free — see docs/SUPABASE.md / FORM-DB-CRUD-SPEC.md.
 */
import {
  createSupabaseAuthAdapter,
  isSupabaseBackend,
  supabaseConfig,
} from "@/lib/wb-db-supabase";

const SESSION_KEY = "wb.auth.session";

export async function stubHashPassword(plain: string): Promise<string> {
  const data = new TextEncoder().encode(`wb:argon2id-stub:${plain}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `$wb$v1$stub$${hex}`;
}

export function createStubAuthAdapter() {
  return {
    hashPassword: stubHashPassword,
    async verifyPassword(plain: string, hash: string) {
      return (await stubHashPassword(plain)) === hash;
    },
    async signIn(identity: string, password: string) {
      const raw = sessionStorage.getItem("wb.auth.users");
      const users = raw ? (JSON.parse(raw) as { identity: string; passwordHash: string }[]) : [];
      const user = users.find((u) => u.identity === identity);
      if (!user) return { ok: false as const, error: "ไม่พบผู้ใช้" };
      if ((await stubHashPassword(password)) !== user.passwordHash) {
        return { ok: false as const, error: "รหัสผ่านไม่ถูกต้อง" };
      }
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({ identity }));
      return { ok: true as const };
    },
    async signOut() {
      sessionStorage.removeItem(SESSION_KEY);
    },
    session() {
      try {
        const s = JSON.parse(sessionStorage.getItem(SESSION_KEY) || "null") as { identity?: string } | null;
        return s?.identity ? { identity: s.identity } : null;
      } catch {
        return null;
      }
    },
    requireSession() {
      return this.session() !== null;
    },
  };
}

function pickAuth() {
  if (isSupabaseBackend()) {
    const cfg = supabaseConfig();
    if (cfg) return createSupabaseAuthAdapter(cfg);
  }
  return createStubAuthAdapter();
}

export const auth = pickAuth();

/** Guard /admin/* — call from a layout wrapper when wiring admin packs. */
export function guardAdminPath(pathname: string): boolean {
  if (!pathname.startsWith("/admin")) return true;
  if (auth.requireSession()) return true;
  if (typeof window !== "undefined") window.location.assign("/login");
  return false;
}
