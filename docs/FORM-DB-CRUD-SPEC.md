# Form ↔ Database CRUD + Admin + Relationships

**Status:** Phase A–B shipped; **Phase C (Supabase)** adapters ship in the Vite export (env-switched). Binding lives on page nodes; test CRUD uses `db_test_*`. Production auth is pluggable via `AuthAdapter` (stub in Preview).

**Phase A runtime (Preview):** List / lookup / related widgets talk to the app over `wb:dbQuery` → `wb:dbResult` (parent opens the test SQLite via `ensureTestDbOpen`). Export defaults to a localStorage stub; set `VITE_WB_DB_BACKEND=supabase` for GoTrue + PostgREST (see `docs/SUPABASE.md`).

## Goals

1. Bind form widgets to `DbModel` tables/columns (`dbForm` / `dbColumn` / `dbLookup` / `dbSubmit`).
2. Analyze a table → create a form page or hint missing fields.
3. Admin pack: login, dashboard, list / new / edit per table (Auto or Guideline).
4. **Relationships (required):**
   - **List:** FK columns show related labels (not raw UUIDs); search/filter matches label text.
   - **Edit:** reverse-FK panel lists child rows; open related edit.
5. Longevity ≥ 5 years: stable contracts, AuthAdapter, no vendor hard-coding in generated pages.

## Binding (on `Node.db`)

Sparse object on any node (mirrored in Rust `Node.db`):

```ts
type NodeDb = {
  form?: { tableId: string; op: "insert" | "update" | "delete" | "load"; keyColumnId?: string };
  column?: string;           // DbColumn.id
  lookup?: { tableId: string; valueColumnId: string; labelColumnId: string };
  list?: { tableId: string; resolveFks?: boolean; search?: boolean };
  related?: { parentTableId: string; fkId: string }; // reverse FK panel
  adminSource?: string;      // e.g. "admin:products:list" — skip overwrite when customized
};
```

- **Button** `action`: `"link" | "none" | "dbSubmit"`.
- **Input** `inputKind?`: `"text" | "password" | "number" | "date" | "datetime-local" | "asset"`.
- **DbColumn.secret?**: `"argon2id"` — runtime hashes before write; never store plaintext.
- **DbType `asset`**: stores asset id string; SQL export as `text` + comment.

## Register recipe

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK default uuid | auto on insert |
| username | text unique not null | |
| password_hash | text + `secret: argon2id` | password input maps here |

## Catalog recipe

`units`, `brands`, `categories`, `products` with FKs + `products.image` as `asset`.

## Form-from-table

`analyzeTableToFormFields(table, model)` → widget map (see plan). Modes: create page, or hint / add missing fields on selected `dbForm` container.

## Relationships

### Forward FK (list + form)

- `dbLookup` on select: options from ref table (`value` = PK, `label` = name/code/title).
- List (`db.list.resolveFks`): cell display uses label; search matches label and raw value.

### Reverse FK (edit)

- `findReverseForeignKeys(model, tableId)` → FKs in other tables pointing here.
- Edit page section per reverse FK: `db.related` + list of child rows filtered by parent PK; link to `/admin/{child}/edit?id=…`.

## Admin pack

- **Auto:** create `/login`, `/signup`, `/admin`, `/admin/{table}`, `/admin/{table}/new`, `/admin/{table}/edit` (nested paths allowed).
- **Guideline only:** return recommended paths without writing pages.
- **Add tables later:** only create missing `adminSource` keys; never silently overwrite customized pages.
- Session: `AuthAdapter` stub (sessionStorage). Production: swap adapter (Supabase/JWT) — never hard-code vendor in nodes.

## AuthAdapter

```ts
interface AuthAdapter {
  hashPassword(plain: string): Promise<string>;
  verifyPassword(plain: string, hash: string): Promise<boolean>;
  signIn(identity: string, password: string): Promise<{ ok: boolean }>;
  signOut(): Promise<void>;
  session(): { identity: string } | null;
  requireSession(): boolean; // guard /admin/*
}
```

Preview/default: Argon2id via Tauri `hash_password` / in-browser fallback for export stub; session in sessionStorage.

## Phase C (Supabase)

- Export modules: `wb-db-supabase.ts` + env (`VITE_WB_DB_BACKEND`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`).
- Auth: Supabase GoTrue (email/password). Data: PostgREST. No SDK dependency (fetch).
- SQL export already enables RLS on every table (no policies — safe until you add them).
- Clerk / custom JWT: same `AuthAdapter` surface later; not shipped here.
- Full steps: `docs/SUPABASE.md`.

## Longevity

- Document + `DbModel` migrations when binding keys change.
- Quarterly dependency bumps; pin Bun + Tauri npm/crate pairs in CI.
- CVE scan before major tags.
- Asset ids only — no blobs in SQLite.

## Out of scope (v1)

OAuth/email verify UI; many-to-many galleries; role matrix; AI schema OCR; live Preview → remote Supabase; auto-generated RLS policies.
