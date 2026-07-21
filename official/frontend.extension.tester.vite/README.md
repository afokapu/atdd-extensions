# frontend.extension.vite-tester

Test-surface (tester) conventions for the **Vite/React + Playwright** stack — the
frontend **E2E / journey / smoke / a11y / visual** test surface. This surface was never
built as a frontend concern, and several journey/E2E obligations were mis-scoped into
`convex.extension.tester` during the Convex wave (see
[`docs/mirror-classification/WT.md`](../../docs/mirror-classification/WT.md), section
"Relocate from convex.extension.tester").

## Two-layer model

This extension owns **conventions only** (the stack-bound obligations). Each convention's
detector — the actual check — lives in the `frontend.workspace.runtime` provider as a
zero-dependency `.mjs` on the v1.1 contract (env `ATDD_SCAN_ROOTS`/`ATDD_SCAN_EXCLUDES`
in, RAW `{rule_id,file,line,col,evidence,source_line}` report out, exit 0 regardless of
count). `owns.implementations` is intentionally empty.

## Nodes (9 conventions · 4 realizations)

| group | rule_id | realization |
|---|---|---|
| journey/E2E | `tester.vite.journey-train-header` | `vite_journey_test_detector` (family) |
| journey/E2E | `tester.vite.journey-urn-format` | `vite_journey_test_detector` |
| journey/E2E | `tester.vite.journey-layer-assembly` | `vite_journey_test_detector` |
| journey/E2E | `tester.vite.journey-no-acceptance-marker` | `vite_journey_test_detector` |
| coverage (train↔E2E) | `tester.vite.train-e2e-coverage` | `vite_train_e2e_coverage` (family) |
| coverage (train↔E2E) | `tester.vite.e2e-names-valid-train` | `vite_train_e2e_coverage` |
| smoke | `tester.vite.presentation-smoke-coverage` | `vite_presentation_smoke_coverage` (singleton) |
| a11y | `tester.vite.a11y-harness` | `vite_a11y_visual_harness` (family) |
| visual | `tester.vite.visual-harness` | `vite_a11y_visual_harness` |

## Train ↔ E2E binding

Grounded in frg-app reality (`apps/game/tests/e2e/{train_id}.smoke.spec.ts` + a
`// Train: train:{id}` header), the detectors bind a spec to a train by **any** of: the
`// Train:` header, a `{train_id}.` filename prefix, or an `e2e/{train_id}/` parent
directory — a superset of the core dir-only convention, so frg-app's flat specs actually
bind. The `train↔E2E` audit of frg-app (which trains lack E2E, which specs are orphaned)
is recorded in `WT.md`.

Astro is folded in: `apps/web` ships no `playwright.config.*` and no specs, so the
agnostic frontend test conventions are mirrored once under `tester.vite.*`.
