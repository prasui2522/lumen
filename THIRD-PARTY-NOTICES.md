# Third-party notices

This file ships with the app (Phase 11 §2.3 / A4.4). Licence reading is not legal advice.

Further runtime dependency lines (tw-animate-css and others) are added when D10.4 audits `package.json` / `Cargo.toml`. shadcn/ui MIT text for editor chrome and adapted blocks is recorded in D1; v1 blocks are `original` until then.

---

## Lucide Icons (curated path data in the `icon-paths` chunk)

The editor embeds SVG path data for a curated subset of [Lucide](https://lucide.dev) icons (from the `lucide-react` package at authoring time). Lucide is ISC-licensed:

```
ISC License

Copyright (c) 2026 Lucide Icons and Contributors

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
```

### Curated icons (80)

arrow-down, arrow-left, arrow-right, arrow-up, arrow-down-circle, arrow-left-circle, arrow-right-circle, arrow-up-circle, chevron-down, chevron-left, chevron-right, chevron-up, chevrons-down, chevrons-up, external-link, menu, link, link-2, plus, minus, x, check, search, download, upload, copy, trash-2, pencil, settings, filter, share-2, info, alert-triangle, alert-circle, help-circle, circle-check, circle, x-circle, home, user, users, mail, phone, map-pin, calendar, clock, star, heart, bookmark, tag, image, file, folder, globe, eye, eye-off, shopping-cart, credit-card, package, truck, gift, zap, sparkles, award, trophy, target, shield, lock, unlock, bell, message-circle, send, play, camera, layout-grid, layers, sun, moon, log-in, log-out

Regenerate path data with `node scripts/gen-icon-paths.mjs` after bumping `lucide-react`.

---

## Feather-derived Lucide icons (MIT)

The following icons in the curated set are derived from the Feather project and are also under the MIT licence (Cole Bemis). Full MIT text follows.

arrow-down, arrow-left, arrow-right, arrow-up, arrow-down-circle, arrow-left-circle, arrow-right-circle, arrow-up-circle, chevron-down, chevron-left, chevron-right, chevron-up, chevrons-down, chevrons-up, external-link, link, link-2, plus, minus, x, check, search, download, upload, trash-2, info, alert-triangle, alert-circle, help-circle, circle, x-circle, calendar, clock, target, lock, moon, log-in, log-out

```
The MIT License (MIT)

Copyright (c) 2013-present Cole Bemis

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## Exported sites

When a published/exported site contains an `icon` node, the export zip includes a `THIRD-PARTY-NOTICES.txt` with the Lucide ISC text and, when any Feather-derived icon from the list above is used, the Feather MIT text (Phase 11 §2.4 / A4.6). No on-page attribution is required by this project's approved option.
