# Preview = Export, and Code View (Dreamweaver-style)

**Product:** Web Builder (Tauri desktop) · **Status:** USER-APPROVED 2026-11-04 · **Language:** English; Thai only in UI strings.
**Grounded in:** `src-tauri/src/export.rs` (`build_site_json`, `build_zip`), `export-templates/vite-react/*`, `PreviewStage.tsx`, `preview/DeviceStage.tsx`, `ModeSwitch.tsx`, PHASE-11-SPEC §7/§9, PHASE-12-SPEC, progress.md, RAM-BASELINE.md.

## 0. Facts today and decisions

- **Export** = a fixed template (`export-templates/vite-react`, embedded with `include_bytes!`) + one generated file, `src/data/site.json` (`build_site_json`), + `public/assets/*`. All rendering lives in the template (`render-node.tsx`, `style.ts`, `chart-render.ts`, `calendar-render.ts`, `icon-paths.ts`, `components/ui/*`). Built export: 124.5 kB gz JS, 3.74 kB gz CSS.
- **Preview today** = Rust `compile_preview` HTML in `<iframe srcdoc sandbox="allow-same-origin">`, with no scripts. This is a different renderer from the export.
- **Breakpoint finding (kept):** the Vite export **ignores `styleBreakpoints`** (0 references in `render-node.tsx`/`style.ts`). Preview and the static export apply them, so responsive pages already differ in ส่งออก. **S1 fixes this in the template; S1 is covered by F2 (D8).**
- RAM (PSS, process tree, private Xvfb, RAM-BASELINE method): idle **194.3 MB**, blank project open **250.6 MB**. App initial JS **110,717 B gz**; cap **≤ 112.05 kB gz**.
- **User decisions:**
  - Preview has **two tiers**:
    - **Tier 1 (default, ships first):** option (a), a prebuilt runtime. It is the export template's own React code in an isolated frame that may run scripts, fed the same `site.json` bytes. Offline, +15–30 MB.
    - **Tier 2 (later):** the explicit button **รันด้วย Vite (Run with Vite)** starts the real vite dev server.
  - JavaScript may run in an isolated frame.
  - `data-node-id` appears in the **Preview copy only**.
  - The highlighter is CodeMirror 6, in a lazy chunk.
  - Dark mode uses `prefers-color-scheme` plus a `.dark` class with a toggle.
  - Code is read-only first.
  - At most 3 live frames.

**Source of truth:** `export.rs` is the only generator. It produces the file list `{path → bytes}`.
- ส่งออก zips that list.
- Tier 1 renders the same `site.json` with the same template sources, prebuilt at app build time from `export-templates/vite-react`.
- Tier 2 runs vite on the same file list, written to a preview workspace.
- Code view shows the zip list.
- **Parity test (CI, every fixture):** tier 1, tier 2 and the built export (`vite build` + `vite preview`) must render the same page:
  - The serialised `document.body` DOM is equal after stripping `data-node-id`.
  - A screenshot diff at 375, 768 and 1280 px shows ≤ 0.1% differing pixels (anti-aliasing tolerance).

## 1. Tiers

| | **Tier 1: prebuilt runtime (default)** | **Tier 2: รันด้วย Vite** | Rejected: esbuild-wasm |
|---|---|---|---|
| How | At app build time, `vite build` the template with entry `preview-runtime.tsx` (`site.json` received by `postMessage`, `MemoryRouter`). The output ships as an app asset in a lazy-loaded frame | Rust-managed `vite` dev server sidecar (§2) | Bundles in the browser |
| Fidelity | Same code and data; checked by the parity test | The real toolchain | Different bundler |
| PSS delta over 250.6 MB | +15–30 MB per frame | Estimated +150–300 MB; cap +300 | +60–150 MB |
| Start | ~0.2 s, offline | Button only. First install 10–60 s (needs network), then a 1–3 s cold start | 1–3 s |
| Updates | `postMessage` of the new `site.json` (debounced 150 ms) | Vite HMR from atomic file writes | — |

**Tier 1 frame:**
- The frame uses `sandbox="allow-scripts"` **without** `allow-same-origin`, loaded from the app asset protocol, so it gets an opaque origin and no Tauri IPC.
- CSP: `default-src 'none'; script-src <asset origin>; style-src <asset origin> 'unsafe-inline'; img-src asset: data:`.
- External links are intercepted in the frame and sent to the app with `postMessage`. Page links go through the router.
- Messages are accepted only from that frame's `contentWindow`.
- The runtime is cached per frame. Each of the up to 3 frames runs one React tree.

## 2. Tier 2: Vite sidecar (Rust-managed, later slice)

### 2.1 Lifecycle
- **Lazy start:** only when the user presses **รันด้วย Vite** in Preview or Split. Nothing starts at launch or on mode change. The button is always shown in Preview and Split. Pressing it again while vite is running shows "กำลังรันด้วย Vite" and [หยุด (Stop)].
- **Stop:**
  - **Activity-aware idle timer, fixed at 60 s (not a setting).** The timer resets on any activity: Preview or Split is visible, the user is editing (a document change), or HMR or HTTP requests reach the sidecar. Vite stops only after 60 s with none of these. Returning within 60 s reuses the running server.
  - When the project closes or the app quits, stop immediately: SIGTERM, then SIGKILL after 3 s, on the process group.
  - When the window is hidden or minimised, the frame stops counting as visible, so the 60 s inactivity rule applies.
- **Orphan sweep at launch:** read `$APPCACHE/preview/sidecar.json`, which holds `{pid, pgid, port, startedAt, exe, token}`. If the pid is alive and its `/proc/<pid>/cmdline` contains our `--preview-token <token>`, kill its process group, then delete the file. Never kill a pid whose cmdline doesn't match. This covers a crash, `kill -9` of the app, or a power loss.
- **One sidecar per app instance.** Up to 3 live frames, which are device views, share it. A 4th frame is refused with the hint "แสดงได้สูงสุด 3 อุปกรณ์พร้อมกัน".

### 2.2 Process and port
- **Spawn:** the app's bundled, pinned `bun` binary (about +35 MB on disk; a system bun or node is never used) runs `bun x vite --host 127.0.0.1 --port <p> --strictPort --preview-token <t>`.
  - Working directory is the preview workspace.
  - The environment is cleared down to PATH, HOME and NODE_ENV=development.
  - Vite has no `open` option and does not watch the shared `node_modules`.
- **Port:** pick a random free port in **47300–47399**, binding to 127.0.0.1 only.
  - Always excluded: 1420, 1520, 1530 and 14380–14399, which are used for development and testing.
  - On EADDRINUSE, try the next port, up to 10 attempts.
- **Isolation:**
  - Vite `server.allowedHosts=['127.0.0.1']` and `server.fs.strict=true`.
  - The iframe uses `sandbox="allow-scripts"` **without** `allow-same-origin`, so it gets an opaque origin and no Tauri IPC.
  - The frame CSP allows only `http://127.0.0.1:<p>` (script, style, connect including ws, img) plus `data:`.
  - External links are intercepted in the Preview entry and sent to the app with `postMessage`; the webview never navigates away.

### 2.3 Shared node_modules cache
- **Location:** `$APPCACHE/preview/deps/<templateHash>/node_modules`. `templateHash` is the sha256 of the template's `package.json` + `bun.lock` + the bun version. Each project's preview workspace at `$APPCACHE/preview/ws/<projectId>/` symlinks to that `node_modules`.
- **Install:**
  - `bun install --frozen-lockfile` into `deps/<hash>.tmp`, then rename it atomically to `deps/<hash>`.
  - An exclusive file lock `deps/<hash>.lock` (flock) serialises installs across app instances.
  - An integrity stamp `deps/<hash>/.ok` holds the sha256 of the lockfile. A missing or mismatched stamp means delete and reinstall.
- After the first install, Preview needs no network. Starts run `vite` with no install.
- **Cleanup:** keep the 2 newest hashes and delete older ones at launch.
- **Install errors:**

  | Code (English name) | Cause | Thai message (with button) |
  |---|---|---|
  | `PREVIEW_OFFLINE_FIRST_INSTALL` | No network on the first install | "ต้องเชื่อมต่ออินเทอร์เน็ตครั้งแรกเพื่อติดตั้งเครื่องมือแสดงตัวอย่าง (ครั้งเดียว) — ระหว่างนี้แสดงตัวอย่างแบบพื้นฐาน" [ลองอีกครั้ง] |
  | `PREVIEW_INSTALL_FAILED` | Any other install failure | "ติดตั้งเครื่องมือแสดงตัวอย่างไม่สำเร็จ" [ดูบันทึก] [ลองอีกครั้ง] |
  | `PREVIEW_DISK_FULL` | No space left on disk | "พื้นที่ดิสก์ไม่พอสำหรับเครื่องมือแสดงตัวอย่าง" |

  While any of these is shown, Preview uses the fallback in §2.5.

### 2.4 site.json, HMR and data-node-id
- **Workspace:** the generator writes the export file list once per template hash. Assets are copied into `public/assets/`.
- **Updates:** document changes are debounced **150 ms** after the last edit, and at most 4 writes per second during drags. Only `src/data/site.json` is rewritten, plus changed assets.
- **Atomic write:** write `site.json.tmp`, fsync, then rename over the old file, so Vite never reads a partial file. Skip the write when the bytes are unchanged (compare hashes).
- **HMR:** Vite's JSON HMR re-renders the tree. The router keeps the current page path, and scroll position is kept on the same page.
- **data-node-id (Preview copies only, tiers 1 and 2):**
  - Tier 2: the workspace contains one extra file, `src/preview-entry.tsx`, as the Vite entry (`index.html` is rewritten in the workspace only). It sets `globalThis.__WB_PREVIEW__ = true` and imports `main.tsx`.
  - Tier 1: the prebuilt runtime's `preview-runtime.tsx` sets the same flag.
  - `render-node.tsx` adds `data-node-id` only when that flag is true. The flag is never set in the zip, so the exported markup stays clean.
  - A test checks that the zip contains no `preview-entry` and that a built export has 0 `data-node-id` attributes.
- `postMessage` carries selection (frame ↔ app, by `data-node-id`) and external-link requests. Messages are accepted only from the frame's own `contentWindow` with origin `null`.

### 2.5 Crash, backoff, fallback and logs
- **Detection:** Rust waits on the child process. It also checks `GET /@vite/client` every 10 s while a frame is visible (2 s timeout, 2 misses means dead) and watches the frame's `error` and `load` events.
- **Thai banner:** "ตัวอย่างหยุดทำงาน" [เริ่มใหม่ (Restart)].
  - Automatic restart backs off at 1 s, 4 s and 15 s, for **3 tries**. After that only the manual button restarts it.
  - Each restart resets the counter once the server has stayed up for 5 minutes.
- **Fallback:** after 3 failed tries, or on any install error, the frame switches to **tier 1**. If tier 1 also fails, it shows the last good static snapshot. The banner says "กลับไปใช้ตัวอย่างในแอป (Fell back to built-in Preview)".
- **Logs:**
  - `$APPLOG/preview-sidecar.log` holds stdout and stderr, rotated at 1 MB with 3 files kept.
  - Each record has the error code, exit status, port, templateHash and uptime.
  - No document contents are logged.

## 3. Layout and sync
- **Modes** (extends `ModeSwitch.tsx`, aria-label โหมดแก้ไข):
  - ออกแบบ (Design)
  - แยก (Split): the canvas plus Preview or code. Split's right pane defaults to **โค้ด (Code)** and can switch to ตัวอย่าง.
  - โค้ด (Code)
  - ตัวอย่าง (Preview)
- **Code panel:**
  - A read-only file tree that lists exactly the zip entries. Binary files show as names only.
  - File tabs, line numbers, a wrap toggle, and the คัดลอกโค้ด (Copy code) and เปิดโฟลเดอร์ (Open folder) buttons (A5).
  - The default open file is `src/data/site.json`.
- **Sync:**
  - The generator emits a map `{nodeId → [start,end]}` while it serialises `site.json`. Canvas and Preview selection reveal the matching range; the cursor selects the innermost node.
  - Template files map by kind; for example, Table jumps to `case "table"`.
- **Shortcuts:** Ctrl+1–4 switch modes. F6 cycles panes. Ctrl+P is quick-open and Ctrl+F is find. Esc moves focus from the code back to the canvas selection.

## 4. Read-only first
Editing comes in a later phase and covers `site.json` only.
- An edit is validated with `parse_document` before it is applied, as one undo step.
- Template files are never editable, so there stays one generator.
- Schema changes are additive only.

## 5. Highlighting: CodeMirror 6 (read-only)
- Contents: `@codemirror/view` + `state` + `lang-json` + `lang-javascript` (tsx) + `lang-css`, with light, dark and forced-colours themes.
- It goes in a single lazy chunk, `code-view` (cap ≤ 170 kB gz), loaded the first time Code or Split opens.
- The viewport is virtualised, so RAM stays flat on large `site.json` files. Files over 2 MB open as plain text.

## 6. Dark mode in the export
- **Setting:** `meta.darkMode?: "off" | "auto"`, additive; absent means off. Default is **off**, which leaves the export bytes unchanged.
- **auto:** the template `index.css` gets `@media (prefers-color-scheme: dark)` token overrides plus an identical `.dark` block.
  - The exported site gets a small toggle with three states: ระบบ, สว่าง and มืด (System, Light, Dark). The choice is stored in `localStorage` and applied as a `.dark` or `.light` class on `<html>` before first paint.
  - Only theme tokens change: page, text, borders and control surfaces. Colours set on nodes are not changed.
- Preview gets the same toggle.

## 7. Accessibility
- **Focus order:** mode switch → canvas → right pane (file tree → tabs → editor, or the Preview frame) → style panel.
- **Labels:**
  - The code panel is `role="region"` with `aria-label="โค้ดโปรเจกต์ (Project code)"`.
  - The editor has `aria-readonly`.
  - Each frame has `title="ตัวอย่างหน้า <page>"`.
- **Contrast:** tokens and line numbers ≥ 4.5:1 in both themes. The sync highlight is ≥ 3:1 and not shown by colour alone.
- **Reduced motion:** no smooth scrolling.
- **Forced colours:** uses `Highlight`/`CanvasText`.
- **Focus ring:** 2 px solid ring, never `outline:auto` (see the F1 ruling on WebKitGTK's orange ring).
- **Live updates:** Thai banners use `role="status"`, and `role="alert"` only for crashes.

## 8. RAM measurement (per RAM-BASELINE)
- **Metric:** sum of PSS from `smaps_rollup` over the app tree (main, WebKitWebProcess and WebKitNetworkProcess), **plus the sidecar process group** (bun, vite and esbuild) for tier 2.
- **Environment:** private Xvfb, median of 5 runs.
- **Points:**
  - P0: blank project open, 250.6 MB.
  - T1: tier 1 Preview with 1 frame, then with 3 frames.
  - V0: the figure just before pressing รันด้วย Vite.
  - V1: vite ready, 30 s later.
  - V2: 90 s after stop or leave (60 s idle plus margin).
- **Caps:**
  - Tier 1: P0 + 30 MB with 1 frame, P0 + 80 MB with 3 frames.
  - Tier 2: V1 ≤ P0 + 300 MB, V2 ≤ V0 + 10 MB, and no sidecar pid or listening port remains.

## 9. Slices (each shippable; all keep initial JS ≤ 112.05 kB gz)

| # | Slice | Acceptance |
|---|---|---|
| S1 | Template breakpoints and fidelity — **covered by F2 (D8)** | Golden fixtures render the same in the Vite and static exports at 3 widths. Export CSS within ±5% of 3.74 kB gz. cargo and bun pass |
| S2 | Tier 1 runtime + frame: postMessage, MemoryRouter, link interception, CSP, `data-node-id` flag, up to 3 frames | Parity test between tier 1 and the built export: 0 DOM differences and ≤ 0.1% pixel difference. The built export has 0 `data-node-id`. PSS ≤ P0 + 30 MB (1 frame) and ≤ P0 + 80 MB (3 frames). Opens in ≤ 300 ms. No child process and no listening port |
| S3 | Code mode (read-only), CodeMirror chunk; split orientation (A1); split divider (A3); คัดลอกโค้ด and เปิดโฟลเดอร์ (A5) | `code-view` ≤ 170 kB gz, loaded only on first Code or Split, and the A1/A3/A5 UI is inside it. The tree equals the zip entries. Code open adds ≤ +25 MB PSS. Orientation and size survive a restart, come from app settings, and leave document bytes unchanged. Divider: Arrow ±2%, Shift ±10%, Enter or double-click gives 50/50, clamped to 20–80, and `aria-valuenow` updates. Copy puts the exact file bytes on the clipboard and shows คัดลอกโค้ดแล้ว. Open folder rejects paths outside the export destination, including symlink and `..` cases (Rust test), and is disabled before the first export |
| S4 | Selection sync and shortcuts | 100% of fixture nodes round-trip canvas → code → canvas and frame → canvas. No extra undo steps |
| S5 | Dark mode `auto` + toggle | With it off, export bytes are identical to before. With it on, contrast ≥ 4.5:1 in dark. The toggle works by keyboard |
| S6 | Tier 2 sidecar core: button, port range, pid file, activity-aware 60 s stop (A2), stop on quit, orphan sweep; status bar (A4) | Never binds an excluded port. Killing the app with kill -9 then relaunching leaves 0 orphans. While Preview is visible vite never stops; after hiding with no edits it stops at 60 s ±2 s; any edit resets the timer. V2 ≤ V0 + 10 MB. Status bar shows the 3 normal states, PSS within ±5 MB of the measured value, and Stop works. 0 polls when stopped. Only state changes are announced. Status bar code is lazy; initial JS ≤ 112.05 kB gz |
| S7 | Tier 2 shared deps cache: lock, stamp, offline errors | A second project does no reinstall. Offline first run shows `PREVIEW_OFFLINE_FIRST_INSTALL` and stays on tier 1. Offline after the first install works |
| S8 | Tier 2 HMR: debounce, atomic writes, preview-entry; HMR requests count as activity (A2) | An edit shows in the frame within 500 ms of the debounce. Continuous HMR traffic for 3 minutes, with Preview hidden, does not stop vite; it stops 60 s after traffic ends. V1 ≤ P0 + 300 MB. Three-way parity test (tier 1, tier 2, built export) passes |
| S9 | Tier 2 crash handling: backoff 1/4/15 s, banner, fallback to tier 1, logs; status bar ผิดพลาด (error) state (A4) | Killing vite 3 times shows the banner and tier 1 renders. The status bar shows ผิดพลาด, announced once. Logs rotate and contain no document data |
| S10 | Retire `compile_preview` (kept only for snapshots) | cargo and bun pass. Idle PSS no higher than 194.3 MB |

## 10. Final decisions (user, 2026-11-04)
- Bundle a pinned `bun` (about +35 MB on disk). The app never relies on a system bun or node.
- The **รันด้วย Vite (Run with Vite)** button is always shown.
- The idle timeout is fixed at **60 s**, not a setting.
- Split's right pane defaults to **โค้ด (Code)**.
- Three tier-1 frames may add up to **+80 MB** over P0 (confirmed).
- `data-node-id` appears only in the Preview copies (tiers 1 and 2), never in the export.
- Dark mode follows the system (`prefers-color-scheme`), plus a `.dark` class toggle in the exported site.
- CodeMirror 6 is loaded as a lazy chunk.
- Code is read-only first; editing comes in a later phase.

**Additions (user-approved 2026-11-04):**
- **A1 Split orientation:** Split toggles between left–right and top–bottom (button "สลับแนวแบ่ง (Toggle split orientation)"). The choice is remembered per user in app settings, never in the document. Slice: **S3**.
- **A2 Activity-aware Vite stop:** the fixed 60 s idle timer resets while Preview or Split is visible, while the user is editing, and while HMR requests flow. Vite stops 60 s after real inactivity (§2.1). Slices: **S6** (rules) and **S8** (HMR activity).
- **A3 Draggable split divider:**
  - `role="separator"` with `aria-orientation`, `aria-valuenow`, `aria-valuemin`/`aria-valuemax` (20/80) and `aria-label="ปรับขนาดแผงแยก (Resize split)"`.
  - Arrow keys move it 2%, Shift+Arrow 10%. Double-click or Enter resets it to 50/50.
  - The size is remembered per user in app settings, separately for each orientation.
  - Slice: **S3**.
- **A4 Vite status bar:**
  - Shows the state หยุด / กำลังเริ่ม / ทำงาน / ผิดพลาด (stopped / starting / running / error), the sidecar's PSS in MB, and a [หยุด (Stop)] button.
  - PSS is polled through a Rust command every 2 s, only while vite is starting or running; there is no timer when it is stopped.
  - `aria-live="polite"` applies to state changes only. PSS ticks are in a separate node that is not live.
  - Lazy chunk.
  - Slice: **S6**; the error state and restart come in **S9**.
- **A5 Code view buttons:**
  - **คัดลอกโค้ด (Copy code)** copies the open file, with the confirmation "คัดลอกโค้ดแล้ว" (`role="status"`, 2 s). It replaces the generic คัดลอก label.
  - **เปิดโฟลเดอร์ (Open folder)** opens the exported project folder in the system file manager via the Tauri opener plugin. The path is validated in Rust: it must be canonical and an existing directory inside the export destination the user chose, with no symlinks escaping it. Otherwise the button is disabled with the hint "ยังไม่ได้ส่งออกโปรเจกต์".
  - Slice: **S3**.

## 11. Order
1. **F2**, which covers S1 (D8).
2. **B0** (PHASE-11-SPEC §9.B B-prelude: one Rust style-CSS generator for Preview and the Vite export, plus minification survival), right after F2 closes.
3. Sub-phase B (rest of PHASE-11 §9.B).
4. S2 → S3 → S4 → S5 → S6 → S7 → S8 → S9 → S10.

*(Order changed by the user 2026-11-04: B0 and sub-phase B now come before S2–S10.)*
