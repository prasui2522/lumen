# R2 — Project folder is the Vite tree

The editor still keeps the open document in memory. On disk the project is a Vite folder.

## Where

`$APPDATA/sites/<project-id>/` (Tauri app data, next to `web_builder.db`).

Phase 10 databases stay in `$APPDATA/databases/<id>.sqlite`. They are not copied into the site folder.

## What is written

- First create or first open with no folder: the export template (`package.json`, `src/pages/SitePage.tsx`, …) plus generated `src/data/site.json`, `src/styles/site.css`, `src/styles/kinds.css`, and `public/assets/`.
- Later saves rewrite `site.json` (tmp, fsync, rename), `site.css`, `kinds.css`, and assets. Template `.tsx` files are not overwritten, so a later edit in Cursor survives the next save.
- SQLite `projects.document_json` is still updated on save. It is the version and the fallback if `site.json` does not parse. Open prefers `site.json` and keeps the SQLite document version (the file always says version 1).

## Open again

Open the same folder in Cursor or VS Code. `bun install && bun run dev` runs the site. The app’s next open reads `src/data/site.json`.

## Vite preview

รันด้วย Vite uses this folder when `package.json` is already there (no second copy of the tree). Preview rewrites `index.html` to the preview entry while Vite runs, and restores the template `index.html` when Vite stops, so Cursor still starts at `src/main.tsx`.

Zip export stays the way to hand the project to someone else.
