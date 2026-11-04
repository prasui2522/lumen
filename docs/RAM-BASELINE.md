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

## Reference decision (PM, 2026-10-18)

- RAM targets for a mode or feature are measured from the state **just before entering it** (here: the editor open, before `ฐานข้อมูล`), not from app startup. On that basis Phase 10 targets (b) ≤ +40 MB and (c) ≤ +20 MB pass (+9.9 / +12.3 PSS).
- Phase 10 target (a) (startup ≤ pre-Phase-10 + 2 MB) is accepted as not verifiable: no pre-Phase-10 figure was recorded with this method and no pristine pre-Phase-10 tree exists. Indirect evidence: no DB code in the startup chunk (initial JS 112.05 kB gz) and no test-file fd at startup.
- Raw logs: `/home/webdev/agent-tools/p10/step8-ram/`.
