# Phase 12 — Vite Project Export

**Product:** Web Builder (Tauri desktop)
**Status:** approved by PM (2026-11-03): Vite export is the primary ส่งออก; A4 paused; HTML zip is no longer the product export target.
**Language:** English. Thai only in user-facing strings and README in the exported zip.

## 1. Goals

1. **ส่งออก** builds a **Vite + React + TypeScript** project zip the user can open with `bun install && bun run dev` / `bun run build`.
2. Multi-page documents become **React Router** routes from `pages[].path`.
3. Interactive kinds (Dialog, Tabs, Dropdown, Accordion, …) use **real React / Radix** in the exported project — not static HTML/`<details>` fakes.
4. Images land under `public/assets/`.
5. In-app **Preview** may keep `compile_preview` HTML for this phase; only the export button changes.

## 2. Non-goals (v1)

- Next.js exporter (later phase when backend/SSR is needed).
- A4 `list` / `table` / `icon` (paused).
- Replacing in-app Preview with a Vite iframe.
- Form submit / API / database.
- Converting every StyleProps value to Tailwind utilities (inline `style={{…}}` is OK in v1).
- HTML/CSS-only zip as the primary ส่งออก product.

## 3. Stack (exported project)

- Vite + `@vitejs/plugin-react`
- React 19 + TypeScript
- `react-router-dom` for pages
- Tailwind CSS v4 + a small shadcn/Radix set (Dialog, Tabs, and primitives needed by those)
- Package manager documented as **bun** (npm/pnpm also work)

## 4. Zip layout (v1)

```
package.json
vite.config.ts
tsconfig.json
tsconfig.app.json
index.html
README.md
src/main.tsx
src/App.tsx
src/index.css
src/lib/utils.ts
src/lib/style.ts
src/lib/render-node.tsx
src/components/ui/*          # dialog, tabs, button, …
src/data/site.json           # generated from PageDocument
src/pages/SitePage.tsx
public/assets/…              # copied project images
```

## 5. Acceptance

1. Export of a one-page and a two-page fixture zip contains `package.json` and `src/App.tsx`.
2. After unzip: `bun install && bun run build` exits 0.
3. At least Dialog **or** Tabs is interactive in the built app.
4. Internal page links navigate via the router.
5. A stored image appears under `public/assets/` and renders.
6. No Tauri / SQLite / `@tauri-apps/*` in the exported `package.json`.

## 6. Out of order relative to Phase 11

- Phase 11 A4 (`list` / `table` / `icon`) is **paused** until this phase’s acceptance passes.
- Phase 11 §7 “export stays HTML no JS” is **superseded for ส่งออก** by this phase; Preview HTML compiler remains until a later Preview rewrite.
