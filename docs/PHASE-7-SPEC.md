# Phase 7 — Login and Signup

**Status:** Spec only. DEV does not start until the user says so. Do not edit `schema.ts`, `defaults.rs`, or `compiler.rs`. No new node kind. No schema change. No new package. No new version number, and no change to the version writers.

Checked on 2026-10-05. `insertTemplate` is one `updateOpenDocument`. `applyTemplate` inserts one page child at `templateInsertIndex`: the end of the page, or just after the selected page-level section. The Thai templates use a section for that child. These two do not.

`applyTemplate` cannot place the listed nodes as separate page children, so the page child is one `container`, the same single-root insert the blocks already use. No extra section. The nodes below are that container's children, in order.

## Version

The existing rule still applies. `documentForSave` and `normalize_saved_document` are not changed. A tree that contains an `input` or a `switch` saves as version `3`, or `4` if it also contains a Phase 6b kind. This phase does not add a version and does not force the document back to `1`. A page with neither stays `1`, or `2` if a breakpoint override remains.

## Where they appear

English names `Login` and `Signup`. The command palette already groups items under a heading, so these two get a group `Pages`. Not inside `Text`, `Choices`, or `Disclosure`. Not inside `เทมเพลต` or `บล็อก`. The Add menu uses the same `Pages` label as its own dropdown, next to those two menus. Do not rename the Thai templates or the six Thai blocks. User-typed text may be Thai.

## Insert

One place is one undo. Focus after insert is the heading. Do not emit a `form` element. Buttons get no `action` and no `href`. A canvas click selects, same as today. A canvas click on the switch selects and does not flip `checked`.

Editing is the existing path. No new property row. Heading and text use content. An input uses `ป้ายกำกับ` and `ข้อความตัวอย่าง`. A button and a link use the label. The link href is the existing `ลิงก์ปลายทาง` row. Do not add a href row to the button.

Heading level stays the `createNode("heading")` default, `2`. An input whose placeholder is not named below keeps `พิมพ์ที่นี่`. Password is the existing text input. There is no password type.

### Login

1. heading, content `Log in`
2. text, content `A short line`
3. input, label `Email`, placeholder `you@example.com`
4. input, label `Password`, placeholder `Password`
5. switch, label `Remember me`, checked `false`
6. button, label `Log in`
7. link, label `Sign up`, href `/signup`

### Signup

1. heading, content `Sign up`
2. text, content `A short line`
3. input, label `Name`
4. input, label `Email`
5. input, label `Password`
6. switch, label `I agree`, checked `false`
7. button, label `Create account`
8. link, label `Log in`, href `/login`

## Out of scope

Site database, Vite export, backend, table, chart, ecommerce, animation, API security, mobile, and the eight unbuilt blocks in `docs/PHASE-6-SPEC.md`. No validation, no error text, no auth. No submit, no API call, no database write.

## Acceptance

- `Login` and `Signup` appear under `Pages` in the Add menu and the command palette.
- One undo removes the whole tree. The page child is a container, not a section. Focus is the heading.
- The children match the lists above.
- Saving a page that contains one is version `3` because of the input and the switch, not because of a new version. It is `4` only if a Phase 6b kind is also present.
- `schema.ts`, `defaults.rs`, and the version writers are not edited.
