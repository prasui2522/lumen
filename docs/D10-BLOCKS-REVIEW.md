# D10 blocks review (automated pass)
**Date:** 2026-11-08 (Asia/Bangkok)
**Reviewer role:** agent checklist pass (formal human ≠ author sign-off still required for merge policy §2).
**Blocks:** 33 · **with issues:** 0

| id | cat | scope | source | nodes | root contrast | phone BP | result |
|---|---|---|---|---:|---:|---|---|
| `elements-card` | elements | page | original | 3 | — | none | ok |
| `elements-alert` | elements | page | original | 3 | — | none | ok |
| `elements-buttons` | elements | page | original | 3 | — | none | ok |
| `elements-badge` | elements | page | original | 1 | — | none | ok |
| `elements-divider` | elements | page | original | 1 | — | none | ok |
| `elements-list` | elements | page | original | 4 | — | none | ok |
| `template-hero` | hero | page | original | 4 | — | none | ok |
| `template-split` | features | page | original | 7 | — | none | ok |
| `template-cta` | cta | page | original | 4 | — | none | ok |
| `template-features` | features | page | original | 12 | — | none | ok |
| `template-footer` | footer | page | original | 6 | — | none | ok |
| `header-bar` | header | page | original | 7 | 17.06 | yes | ok |
| `header-stacked` | header | page | original | 7 | 17.06 | yes | ok |
| `hero-centered` | hero | page | original | 7 | 17.06 | yes | ok |
| `hero-split` | hero | page | original | 7 | 17.06 | yes | ok |
| `footer-simple` | footer | page | original | 7 | 17.06 | yes | ok |
| `footer-columns` | footer | page | original | 15 | 17.06 | yes | ok |
| `cta-banner` | cta | page | original | 5 | 17.06 | yes | ok |
| `cta-split` | cta | page | original | 6 | 17.06 | yes | ok |
| `features-three` | features | page | original | 15 | 17.06 | yes | ok |
| `features-list` | features | page | original | 5 | 17.85 | yes | ok |
| `pricing-two` | pricing | page | original | 15 | 17.06 | yes | ok |
| `pricing-single` | pricing | page | original | 7 | 17.06 | yes | ok |
| `faq-accordion` | faq | page | original | 4 | 17.06 | yes | ok |
| `faq-compact` | faq | page | original | 5 | 17.85 | yes | ok |
| `testimonials-cards` | testimonials | page | original | 12 | 17.06 | yes | ok |
| `testimonials-quote` | testimonials | page | original | 4 | 17.06 | yes | ok |
| `contact-split` | contact | page | original | 12 | 17.06 | yes | ok |
| `contact-simple` | contact | page | original | 5 | 17.06 | yes | ok |
| `logo-cloud-row` | logoCloud | page | original | 7 | 17.06 | yes | ok |
| `logo-cloud-grid` | logoCloud | page | original | 9 | 17.85 | yes | ok |
| `stats-row` | stats | page | original | 11 | 17.06 | yes | ok |
| `stats-cards` | stats | page | original | 9 | 17.06 | yes | ok |

## Checklist mapping
- authored/mit + source.ref: covered (`source` / `mit-fields`)
- no network URLs: covered (`url`)
- root literal colours + ≥4.5:1 on authored: covered (`contrast`)
- h1 only in hero: covered
- node count ≤60 soft: covered
- responsive overrides: `phoneBp` column (presence); width proxy in `d-blocks-viewport.test.ts`
- touch targets ≥24 / Thai copy / no paid composition: **needs human eyes**

## Verdict
All 33 blocks pass automated D10 gates in this pass.
