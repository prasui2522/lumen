/**
 * AuthAdapter stub for Preview / static export.
 * Production deploy should replace with Supabase or custom JWT — never hard-code vendor in page nodes.
 */
import type { AuthAdapter, AuthSession } from "@/lib/form-db/types";

const SESSION_KEY = "wb.auth.session";
const USERS_KEY = "wb.auth.users";

type StoredUser = { identity: string; passwordHash: string };

function readUsers(): StoredUser[] {
  try {
    const raw = sessionStorage.getItem(USERS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as StoredUser[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeUsers(users: StoredUser[]) {
  sessionStorage.setItem(USERS_KEY, JSON.stringify(users));
}

/**
 * Lightweight placeholder hash for environments without argon2 WASM.
 * Preview prefers Tauri `hash_password` when available (see preview bridge).
 * NOT for production — AuthAdapter must be swapped on deploy.
 */
export async function stubHashPassword(plain: string): Promise<string> {
  const data = new TextEncoder().encode(`wb:argon2id-stub:${plain}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `$wb$v1$stub$${hex}`;
}

export async function stubVerifyPassword(plain: string, hash: string): Promise<boolean> {
  if (!hash.startsWith("$wb$")) return false;
  const again = await stubHashPassword(plain);
  return again === hash;
}

function readSession(): AuthSession | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AuthSession;
    return parsed?.identity ? parsed : null;
  } catch {
    return null;
  }
}

/** Default Preview / export stub adapter. */
export function createStubAuthAdapter(
  hashPassword: (plain: string) => Promise<string> = stubHashPassword,
  verifyPassword: (plain: string, hash: string) => Promise<boolean> = stubVerifyPassword,
): AuthAdapter {
  return {
    hashPassword,
    verifyPassword,
    async signIn(identity, password) {
      const users = readUsers();
      const user = users.find((u) => u.identity === identity);
      if (!user) return { ok: false, error: "ไม่พบผู้ใช้" };
      const ok = await verifyPassword(password, user.passwordHash);
      if (!ok) return { ok: false, error: "รหัสผ่านไม่ถูกต้อง" };
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({ identity } satisfies AuthSession));
      return { ok: true };
    },
    async signOut() {
      sessionStorage.removeItem(SESSION_KEY);
    },
    session: readSession,
    requireSession() {
      return readSession() !== null;
    },
  };
}

/** Register a user in the stub store (after hashing). */
export function stubRegisterUser(identity: string, passwordHash: string) {
  const users = readUsers().filter((u) => u.identity !== identity);
  users.push({ identity, passwordHash });
  writeUsers(users);
}

let active: AuthAdapter = createStubAuthAdapter();

export function getAuthAdapter(): AuthAdapter {
  return active;
}

/** Swap adapter for production (e.g. Supabase) without changing page nodes. */
export function setAuthAdapter(adapter: AuthAdapter) {
  active = adapter;
}
