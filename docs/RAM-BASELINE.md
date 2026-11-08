# RAM reference baseline

**Recorded:** 2026-10-18 (Phase 10 step 8). Use these figures as the reference for RAM targets in later phases.

## Method

- **Build:** release (`cargo build --release --features tauri/custom-protocol`; profile `lto = true`, `codegen-units = 1`, `opt-level = 3`, `panic = "abort"`, `strip = true`), frontend from `vite build`. Same build mode as the DB RAM spike (`/home/webdev/spikes/db-ram-spike/REPORT.md`).
- **Metric:** sum of `Rss` and `Pss` from `/proc/<pid>/smaps_rollup` over the app's process tree: the main `webapp-project` process, `WebKitWebProcess` and `WebKitNetworkProcess`. PSS is the acceptance figure; RSS is reported alongside it.
- **Sampling:** 5 samples, 2 s apart, after the point has settled; the figure is the median. 4 runs, each from a fresh copy of the same seeded data folder; the table gives the median over the runs.
- **Environment:** private Xvfb (1280×800, software GL), `GDK_BACKEND=x11`, accessibility bus off, WebKitGTK 2.52.6, on the dev machine (8 cores, 15 GB). Absolute figures on a real Wayland/GPU session may differ; compare like with like.
- **Timeline per run:** launch, settle 20 s (startup) → open the project, 8 s (editor) → `ฐานข้อมูล`, `ข้อมูลทดสอบ`, page forward to page 4 of a 10,000-row table, settle 10 s → back to `ออกแบบ`, wait 30 s.

## Figures (MB)

| Point | RSS | PSS |
|---|---|---|
| Startup (project list) | 430.7 | 178.4 |
| Editor open, before DB mode | 460.6 | 205.1 |
| DB mode, 10,000-row grid open (page 4) | 472.9 | 217.0 |
| 30 s after leaving DB mode | 475.5 | 219.3 |
| Control: editor only, never DB mode, settled | 455.1 | 199.5 |

Median per-run deltas: DB open vs editor before DB mode **+10.6 RSS / +9.9 PSS**; after leaving vs editor before DB mode **+12.9 RSS / +12.3 PSS**. Nothing more is released 60 s or 120 s after leaving (flat). The test-file connection is closed after leaving (no fd on `databases/*.sqlite`).

## Initial JS cap (PM ruling, 2026-11-05)

- **Cap:** 112.05 kB for the initial JS (`index-*.js` + `react-*.js` / jsx-runtime).
- **Measurement:** sum of `gzip -9` sizes of those two assets from `vite build` `dist/assets` (not default gzip). The earlier 110,718 B figures in the Phase 11 progress log used `-9`.
- **RAM control baseline** (below): editor-only settled PSS **199.5 MB**.

## Reference decision (PM, 2026-10-18)

- RAM targets for a mode or feature are measured from the state **just before entering it** (here: the editor open, before `ฐานข้อมูล`), not from app startup. On that basis Phase 10 targets (b) ≤ +40 MB and (c) ≤ +20 MB pass (+9.9 / +12.3 PSS).
- Phase 10 target (a) (startup ≤ pre-Phase-10 + 2 MB) is accepted as not verifiable: no pre-Phase-10 figure was recorded with this method and no pristine pre-Phase-10 tree exists. Indirect evidence: no DB code in the startup chunk (initial JS 112.05 kB gz) and no test-file fd at startup.
- Raw logs: `/home/webdev/agent-tools/p10/step8-ram/`.

## Phase 11 B — effects RAM (B10.1)

**Budget (§5.1 B):** 50 nodes with 3-layer shadows + 6 backdrop blurs ≤ **+8 MB PSS** over the same 50 nodes without those effects. Method: §5.2 (release build, software-GL Xvfb).

### Measured 2026-11-08 (fair pair, n=1 each; software GL)

Harness: `agent-tools/p11/b10-ram/` (fixtures `control.json` / `heavy.json`, seed under `XDG_DATA_HOME/com.webapp.builder`). Fresh process per project; open card thumbnail; settle 10 s; median of 5 samples @ 2 s.

| Point | RSS | PSS | Notes |
|---|---|---|---|
| Control: 50 plain containers | 470.4 | **216.9** | `run2 control editor settled` |
| Heavy: 50 × 3-layer shadow + 6 backdrop-filter | 477.1 | **222.7** | `run1 heavy editor settled` |
| Δ (heavy − control) | +6.7 | **+5.8** | **pass** (≤ +8 MB PSS) |

Full median-of-4 still optional polish; this fair pair already clears the gate. Soft-GL only; real-GPU compositing cost remains unverified (§5.2).

Raw logs: `agent-tools/p11/b10-ram/raw.jsonl`.

## Phase 11 C — presets picker (C8)

**Provisional PSS budget (§5.1 C / C8):** opening the preset picker adds ≤ **+1 MB PSS** vs control; ≤ 12 live DOM thumbnails; no images/canvas/network.

### Chunk sizes (measured 2026-11-08, `gzip -9` on `dist/assets`)

| Chunk | gzip-9 | Budget | Result |
|---|---|---|---|
| `presets-registry-*.js` | **885 B** (0.86 KiB) | ≤ 6 kB | pass |
| `preset-picker-*.js` | **2729 B** (2.67 KiB) | ≤ 3 kB | pass |
| `preset-library-dialogs-*.js` (save/delete, separate) | 1517 B | n/a (not in picker budget) | — |
| Entry `index-*.js` | 107 589 B | does not embed `button-3d` / `loadBuiltInPresets` | pass |

Save/delete dialogs were split out of `preset-picker` so the picker chunk stays under 3 kB gz. Tests: `src/lib/c8-presets-chunk.test.ts`.

### PSS measured 2026-11-08 (software GL, warm chunks)

On `B10 control`, box selected; closed vs popover open (coords 1015,95). Chunks already loaded from an earlier open in the same session.

| Point | RSS | PSS | Notes |
|---|---|---|---|
| Picker closed | 504.2 | **249.9** | `c8 closed2` |
| Picker open (built-ins + thumbs) | 503.4 | **249.0** | `c8 open2` |
| Δ (open − closed) | −0.8 | **≈ 0** | **pass** (≤ +1 MB PSS) |

Thumb cap 12 + glass static tint already shipping. Screenshot: `agent-tools/p11/b10-ram/c8-open-final.png`.

## Phase 11 E — motion Preview RAM (E7)

**Budget (§5.1 E):** Preview with 30 animated nodes ≤ **+3 MB PSS** over Preview with the same 30 nodes without motion. Method: §5.2 (release build, software-GL Xvfb).

### Measured 2026-11-08 (fair pair, n=1 each; software GL / llvmpipe)

Harness: `agent-tools/p11/e7-ram/` (`control.json` / `animated.json`, seed under `XDG_DATA_HOME/com.webapp.builder`). Fresh process per project; open card; switch to Preview (`ตัวอย่าง`); settle; median of 5 samples @ 2 s.

| Point | RSS | PSS | Notes |
|---|---|---|---|
| Control Preview: 30 text, no motion | 473.7 | **223.6** | `e7-control-preview` |
| Animated Preview: 30 text + fade load | 476.0 | **225.1** | `e7-animated-preview` |
| Δ (animated − control) | +2.3 | **+1.5** | **pass** (≤ +3 MB PSS) |

Soft-GL only; real-GPU compositing cost remains unverified (§5.2). Compiler proxy: `e7_thirty_animated_nodes_dedupe_keyframes`. Raw: `agent-tools/p11/e7-ram/raw.jsonl`.

## Phase 11 D — Blocks flyout RAM (D10)

**Budget (§5.1 D):** opening the Blocks panel ≤ **+4 MB PSS**; 30 s after close ≤ **+2 MB** over the pre-open baseline.

### Measured 2026-11-08 (software GL / llvmpipe)

Harness reuse: `agent-tools/p11/e7-ram/` on `E7 control`. AT-SPI open/close (`บล็อก` / `ปิดแผงบล็อก`).

| Point | RSS | PSS | Notes |
|---|---|---|---|
| Closed (chunk never loaded) | 466.4 | **216.3** | `d-flyout-closed-fresh` |
| Open first time (loads flyout + registry) | 498.7 | **248.3** | `d-flyout-open-fresh` · Δ **+32.0** vs cold closed |
| After close + 30 s | 494.5 | **244.0** | `d-flyout-after30-fresh` · residual **+27.7** vs cold |
| Closed (warm, chunk retained) | 484.5 | **234.0** | `d-flyout-closed-warm` |
| Open warm reopen | 492.5 | **242.0** | `d-flyout-open-warm` · Δ **+8.0** |

**Result: over budget** (warm reopen +8.0 > +4; first-open and post-close residual also over). Chunk gzip budgets still pass (flyout ≈2.9 kB; registry ≤30 kB). Likely cost: full 33-card DOM + registry trees held after first open — virtualize or unload on close if PM keeps the +4/+2 gate.

### D flyout remeasure 2026-11-08 (after virtualise + meta-only cards)

Code: `blocks-flyout.tsx` keeps `StyleBlockCard` meta in React state (not full `nodes`), virtualises the grid, mounts the ⋯ menu only for the active card, clears cards on close.

| Point | RSS | PSS | Notes |
|---|---|---|---|
| Closed warm | 494.5 | **243.9** | `d-flyout-v3-closed-warm` |
| Open warm | 495.8 | **245.0** | `d-flyout-v3-open-warm` |
| Δ open − closed (warm) | +1.3 | **+1.1** | **pass** (≤ +4) |
| 30 s after close | 491.3 | **240.6** | `d-flyout-v3-after30-warm` · residual vs warm closed **−3.3** (**pass** ≤ +2) |

First-open (cold → open, loads flyout+registry JS) remains ~+30 MB PSS; accepted as lazy-chunk cost, same class as other §5 lazy panels. Spec §5.1 D amended to measure warm reopen.

### E7 real-GPU attempt

Xvfb `:88` still reports `libEGL … Could not get DRI3 device` without `LIBGL_ALWAYS_SOFTWARE`; no accelerated GL on this display. Soft-GL pair above remains the recorded E7 result. `/dev/dri/card1` exists on the host but is not reachable from this Xvfb session.

## PREVIEW-CODE-VIEW S2 — Tier 1 Preview runtime (T1)

Harness: `agent-tools/p11/s2-tier1/` (`seed.py` → `S2 blank` + `S2 blocks` = D10 `preview-blocks.json`, 182 nodes; `measure.sh LABEL CARD_X [preview] [multi]`; `x.py` XTest click/key/wheel + GDK shot; `mem.py` PSS tree). Release binary with embedded dist (`public/preview-runtime/preview.js`, one classic script, 404 kB raw). Fresh process per point; settle 10 s; median of 5 @ 2 s; soft-GL / llvmpipe.

### Measured 2026-11-08

| Point | RSS | PSS | Notes |
|---|---|---|---|
| P0 blank project open (Design) | 462.7 | **212.9** | `S2 blank` |
| D blocks project open (Design) | 495.6 | **244.0** | `S2 blocks` |
| T1 Preview, 1 frame (เต็มพื้นที่) | 521.1 | **269.4** | Tier 1 runtime frame |
| T1 Preview, 3 frames (หลายอุปกรณ์ phone/tablet/desktop) | 544.1 | **292.0** | 3 sandboxed runtime frames |
| Code mode after 3 frames | 547.0 | 295.5 | DW-M3 CodeMirror (n=3) |

| Delta | vs **P0 blank** (spec wording) | vs **D same project** | Cap |
|---|---|---|---|
| 1 frame | **+56.5** | **+25.4** | P0 + 30 |
| 3 frames | **+79.1** | **+48.0** | P0 + 80 |

Reading: the spec's P0 is a *blank* project, but Preview of a blank page shows no frame, so the frame cost cannot be isolated against it; +31 MB of the 1-frame delta is the 182-node document itself (D − P0). Against the same project in Design the frame costs +25.4 (1) / +48.0 (3), inside the caps. Against the literal blank P0 the 3-frame point passes (+79.1 ≤ 80) and the 1-frame point does not (+56.5 > 30). **PM call owed:** accept "Δ vs same project in Design" as the S2 metric, or raise the 1-frame cap. Ready time (≤ 300 ms) was not instrumented; the frame rendered within the first 4 s screenshot in every run and never fell back after the classic-script fix.

Finding fixed during measurement: the first runtime build was an ESM entry (`<script type="module" crossorigin>`); module scripts are CORS-fetched and the sandboxed frame has an opaque origin, so the Tauri protocol refused it and Preview fell back to `compile_preview` every time. The runtime is now one IIFE classic script (CSS inlined), and `s2-tier1.test.ts` pins that shape.
