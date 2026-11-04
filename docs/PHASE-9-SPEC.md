# Phase 9 — Button link field and Preview page switching

**Status:** Spec only. DEV does not start until the user reviews it. Do not ask DEV to start from this file alone.

Checked on 2026-10-06 against `schema.ts`, `defaults.rs` (`NodeProps::Button`, `ButtonAction`, `normalize_saved_document`), `compiler.rs` (`safe_href`, `rewrite_page_href`, Button/Link/Breadcrumb arms, `PREVIEW_BUTTON_FEEDBACK`, preview CSP meta), `commands.rs` (`compile_preview` reads `pagePaths`), `breakpoints.ts` (`documentForPreview`), `PreviewStage.tsx`, `DeviceStage.tsx` (`sandbox="allow-same-origin"`, `srcDoc`, parent reads `contentDocument` for fill height), `tauri.conf.json` (`csp: null`), `StylePanel.tsx` (`NodePropsSection`), `TextPropField.tsx`, `document-ops.ts` (`setNodeProp`), `project-pages.ts`, `PagesPanel.tsx` (`switchPage` uses `restoreDocument`), `projects-store.ts`.

## 1. Goal

(A) A button can link to a project page or an external URL from the properties panel. (B) In Preview, clicking or pressing Enter on a link or button that points to a project page opens that page in the editor and in Preview. External links still do nothing in Preview. Sandbox and CSP stay as they are.

## 2. Schema and version — no change

`ButtonProps` already has `href?: string` and `action?: "link" | "none"` (Rust: `href: Option<String>`, `action: Option<ButtonAction>`), present since schema v1.1. New buttons are created with `action: "none"`. The compiler already treats a button as a link when `action` is not `none` and `href` is non-blank.

- No new field, no new version. The version rule is untouched (it depends on node kinds and breakpoint overrides, not on these props). Opening never rewrites.
- Write rule: non-blank href → `href` = trimmed value, `action: "link"`. Cleared → remove `href`, `action: "none"`. One `setNodeProp` call, one undo step.
- There is no `target` / `openInNewTab` on buttons, so there is **no new-tab checkbox** in this phase (see §4 and Q1).

## 3. (A) The field

Where: `คุณสมบัติ` section in the Style panel. `NodePropsSection` gains a `button` case (today it returns `null` for buttons). Row label `ลิงก์ปลายทาง` (same as the link row), placeholder `/หน้า หรือ https://…`, mono. Text label stays inline-edited on the canvas as today.

Input: the `TextPropField` pattern plus a small trigger button at the end of the row (`เลือกหน้า`, icon-only with `aria-label`). It opens the existing `Popover` + cmdk `Command` list (no new package): one item per page, `name` then path in muted mono (`หน้าแรก  /`, `Login  /login`). Picking an item commits that page's path right away and returns focus to the input.

Commit: blur or Enter commits once if the trimmed draft changed (one undo step). Esc discards the draft (no write, no history). Same value → no write.

Validation (inline Thai text under the field, same style as the page path error; invalid input is not applied):

| Input | Result |
|------|--------|
| empty | clears the link (`action: "none"`) |
| `/login`, `/login/`, `/login?x#y` matching a page | applied; no message |
| `/pricing` (no such page), `./x`, `#top`, `?q` | applied; warning `ไม่มีหน้านี้ในโปรเจกต์` for a `/…` path with no page; exported as written |
| `http:`, `https:`, `mailto:`, `tel:` | applied; no message |
| any other scheme (`javascript:`, `data:`, `file:`, `ftp:` …) | rejected: `ใช้ได้เฉพาะ http, https, mailto, tel หรือเส้นทางหน้า` |

Scheme detection mirrors `safe_href` (text before `:` when no `/`, `?` or `#` comes first, whitespace/control removed, lowercase). `safe_href` stays as the compile-time guard for hand-edited files.

Locked: on a locked page or locked node (existing `isContentLocked`), the input and trigger are disabled and `setNodeProp` returns `null` as today.

## 4. Export

| Button state | Export HTML |
|------|------|
| no link (today's default) | `<span class="t-button nN">label</span>` — **unchanged** |
| page path | `<a class="t-button nN" href="login.html">` via `rewrite_page_href` (`/` → `index.html`, `?`/`#` kept) |
| external / other relative | `<a class="t-button nN" href="…">` through `safe_href`; same tab, no `target` |

Note: today an unlinked button exports as `<span>`, not `<button>`. Keep it: a focusable `<button>` that does nothing is worse than an honest span, and it avoids changing every existing export (Q2).

`.t-button` on `<a>` (no CSS change needed): the type rule and `nN` classes select by class, so display (`inline-block`), padding, background, color, radius, and border are identical. Preflight `a{color:inherit;text-decoration:inherit}` loses to `.t-button{color:…}`; no node style sets text-decoration. `<a href>` gets the UA pointer cursor and the UA focus ring, which the span never had (an improvement). `:active` press stays Preview-only.

Same tab for external button links: buttons are mostly in-site calls to action, and a Link node already offers `เปิดแท็บใหม่` with `rel="noopener noreferrer"`. No schema change.

## 5. Page rename, path change, delete

- Rename (name only): no effect; hrefs hold paths.
- Path change (`ตั้งค่าเส้นทาง`): hrefs are **not** rewritten in this phase. The old path becomes a dangling link and the field shows `ไม่มีหน้านี้ในโปรเจกต์` when that button is selected (Q3).
- Delete page: same dangling warning. Undo of the delete restores the page and clears the warning.

## 6. (B) Preview page switching

Amended 2026-10-11 to match shipped code. A WebKitGTK spike showed that capture listeners the parent adds on the frame's `contentDocument` never fire in this sandbox, so the parent-listener design was dropped. The `data-wb-page` / `role="link"` / `tabindex` output is not used.

### Mechanism — inert marker href, no sandbox/CSP change

The frame stays `srcDoc` with `sandbox="allow-same-origin"` and no `allow-scripts`. The Preview CSP meta is unchanged. No script runs in the frame.

1. **Marker.** `PAGE_MARKER_PREFIX = "about:blank#wb-page="` (`compiler.rs` and `src/lib/preview-links.ts`, kept equal). `pageMarkerHref(path)` = prefix + `encodeURIComponent(path)`, for example `about:blank#wb-page=%2Flogin`.
2. **Inputs.** `documentForPreview` (`breakpoints.ts`) sends `pagePaths` from `previewPagePaths`, which covers `/login`, `/login/`, `login.html` and `./login.html` (home: `/`, `index.html`, `./index.html`). It also sends `pageMarkers` from `previewPageMarkers`: page file → marker for **every page except the open one**. Export never gets markers (Preview-only `CompileOptions.page_markers`; values without the prefix are ignored).
3. **Compiler (Preview only), `preview_page_marker`.** The marker is used as the real `href` when an href resolves to another page.
   - Linked button: `<a class="t-button nN" href="about:blank#wb-page=…">`; otherwise the usual `<span class="t-button">`.
   - Link: `<a … href=marker title="…">`; otherwise `<a title="…">` with no href (inert, as before).
   - Breadcrumb / NavigationMenu items: `<a href=marker>`; otherwise `<span>`. This fixes the old real-`href` navigation in Preview.
   - A link to the **current page**, and external, `mailto:`, `tel:`, unknown or blank hrefs: no href, inert.
4. **Activation.** A click or Enter on a marker link navigates only that frame to the blank marker page. Modified and middle clicks do the same (the sandbox has no `allow-popups`, so no new window opens). Nothing loads from the network.
5. **Parent, `DeviceStage` `onFrameLoad`** (runs on every frame `load`, single and multi-view). It reads the frame's `location.href` (`frameHref`).
   - Not a marker (`parsePageMarker` → `null`; for example `about:srcdoc`): measure `fill`, and if this frame is the one switching, focus it. Nothing loops, because setting `srcdoc` loads `about:srcdoc`.
   - A marker: `openPageFromMarker` → `resolvePageMarker` (payload matched like an authored href via `findPageForHref`) → `switchToPage` + `setOpenPageId` + clear selection and inline edit + `restoreDocument`. If the page is current or missing, the frame gets the current HTML back right away.
6. **Recompile.** `PreviewStage` sees the open root change and compiles at once (no 200 ms debounce). The frame shows the blank marker page briefly (about 150 ms). Safety net: `MARKER_RESTORE_MS = 1500`. If the frame is still on a marker by then (compile failed or was dropped), the last HTML is restored, so the frame is never left blank.

### State

Same as `PagesPanel.switchPage`. **No undo step. No dirty change** (`isProjectDirty` ignores which page is open). Mode, device, zoom and orientation are unchanged. Multi-view: every frame shows the new page after the recompile. The toolbar's `OpenPageName` (`DeviceToolbar.tsx`, sr-only prefix `หน้า `) shows the open page.

### Focus and announcement

After the new `srcdoc` loads, the frame that switched gets `focus()`, so the next Tab reaches the first focusable item of the new page. `useEditorStore.announce` with `เปิดหน้า {name}` writes to the single sr-only `role="status"` `aria-live="polite"` region in `EditorPage` (the same region as `บันทึกแล้ว`).

### Acceptance (§6; supersedes the Preview bullets in §9)

GUI mock (invoke mocked to return HTML containing marker hrefs):
- Click and Enter on a marker link switch the page. No undo entry, dirty unchanged, `เปิดหน้า …` announced, frame focused, toolbar name updated.
- A current-page marker restores the HTML with no switch. A frame left on a marker is restored after about 1500 ms.

Unit tests: `preview-links.test.ts` (marker round-trip including Thai paths and bad encodings, `resolvePageMarker`, `previewPageMarkers` skipping the open page, `previewPagePaths`).

Real Tauri / cargo:
- Compiler: markers only in Preview, never in export. No href for current-page, external, mailto, tel or unknown targets. Breadcrumb/Nav non-page items become `<span>`.
- WebKitGTK follows the marker in the sandboxed frame and fires the parent `load` event. The blank lasts about 150 ms. Sandbox and CSP are unchanged.

## 7. Out of scope

Back/forward history in Preview, fragment scrolling, opening external links from Preview, new-tab for buttons, auto-updating hrefs on path change, form submit, database, auth, nested paths, and the deferred Phase 8 items (offer to create Login/Signup pages).

## 8. Open questions for the user

1. Should buttons get `เปิดในแท็บใหม่`? That needs an optional `openInNewTab` on `ButtonProps` (additive; version rule unchanged; an older app build would drop it on resave).
2. Keep unlinked buttons as `<span>` in export, or switch to `<button type="button">`? Switching changes every existing export.
3. When a page path changes, should matching hrefs on all pages update in the same undo step? Locked pages complicate this (lock freezes their nodes).
4. In Preview the page list is hidden. Show the open page name in the Preview toolbar?

## 9. Acceptance

GUI mock (Vite + headless Chromium, invoke mocked):
- Button shows `ลิงก์ปลายทาง`; page picker lists every page as name + path; picking commits and focus returns to the input.
- Blur/Enter = one undo step; Esc reverts with no history; same value = no write; clearing sets `action: "none"`.
- `javascript:` rejected inline; `/pricing` applied with warning; disabled on a locked page.
- With mocked Preview HTML containing `data-wb-page`: click and Enter switch the page; modified and middle clicks do nothing; no undo entry; dirty unchanged; focus on the iframe; `เปิดหน้า …` announced.

Needs real Tauri / cargo (the mock cannot prove these):
- Compiler output: `<a class="t-button" href="login.html">`, unlinked button stays `<span>`, Preview `data-wb-page` and no `href`, Breadcrumb/Nav inert in Preview, export unchanged otherwise (`compiler_tests.rs`).
- WebKitGTK delivers parent capture listeners in the sandboxed frame; sandbox and CSP unchanged.
- Zip export link targets open the right files.
