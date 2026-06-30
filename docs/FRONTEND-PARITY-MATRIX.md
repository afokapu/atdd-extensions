# Front-end ↔ Core Parity Matrix (Vite/React + Astro)

Completes Core parity for the **front-end** surface deferred from the Convex wave.
Two stacks in frg-app: **Vite/React** (`apps/game/src`) and **Astro** (`apps/web`).
Each node is atomic, full Core-fidelity, with its own validator. Same pipeline as
the Convex wave: workers hand-author at full fidelity → orchestrator re-authors via
`atdd author` (normalized to schema 1.1.0) → `atdd validate package` gate.

Packages (publisher `frontend`, non-reserved so `atdd author` works natively):
- `frontend.workspace.runtime` — JS/node detector runtime (reuses the proven adapter).
- `frontend.extension.vite-coder` — the 10 Core front-end rules (Vite/React).
- `frontend.extension.astro-coder` — native Astro rules (no Core equivalent).

## A. Vite/React — the 10 deferred Core front-end rules (MIRROR)
| Core rule (source to adapt) | Front-end node | sev | disp | Validator detects | Worker |
|---|---|---|---|---|---|
| boundaries.http-client | `coder.vite.boundaries-http-client` | 3 | strict | `fetch(`/`axios` calls outside a centralized client module (e.g. in components) | WV1 |
| design.orphan-ui | `coder.vite.design-orphan-ui` | 2 | strict | exported React component (`*.tsx`) never imported/rendered anywhere | WV1 |
| design.primitives | `coder.vite.design-primitives` | 2 | strict | raw HTML element used where a design-system primitive exists | WV1 |
| design.token-color | `coder.vite.design-token-color` | 2 | strict | color set via non-token value instead of the design-token API | WV1 |
| design.token-hardcoded | `coder.vite.design-token-hardcoded` | 2 | strict | hardcoded hex/rgb color or magic spacing literal in `*.tsx`/`*.css` | WV1 |
| presentation.gsap-commons | `coder.vite.presentation-gsap-commons` | 3 | strict | GSAP imported/used outside the shared animation commons | WV2 |
| presentation.gsap-layer | `coder.vite.presentation-gsap-layer` | 3 | strict | GSAP used outside the presentation layer (domain/application must not animate) | WV2 |
| presentation.i18n-config | `coder.vite.presentation-i18n-config` | 3 | strict | i18n config/init missing or malformed (no provider/resources wiring) | WV2 |
| presentation.i18n-switcher | `coder.vite.presentation-i18n-switcher` | 3 | strict | language switcher hardcodes locale instead of using the i18n API | WV2 |
| refactor.coach-ratchet-pres | `coder.vite.refactor-coach-ratchet-pres` | 3 | advisory | presentation-layer ratchet smell (advisory) | WV2 |

## B. Astro — native rules grounded in apps/web (NATIVE, no Core equivalent)
| Astro node | sev | disp | Validator detects | Worker |
|---|---|---|---|---|
| `coder.astro.no-secret-in-frontmatter` | 4 | strict | secret-shaped literal in `.astro` frontmatter; require `import.meta.env` | WA |
| `coder.astro.client-directive-explicit` | 2 | suppress-and-clean | interactive island (`on*` handler / framework component) without a `client:` directive | WA |
| `coder.astro.i18n-no-hardcoded-ui-string` | 2 | documentation-only | user-facing text hardcoded in `.astro` instead of the `i18n/ui.ts` table | WA |
| `coder.astro.no-hardcoded-color` | 2 | strict | hardcoded hex/rgb color in `.astro`/`styles` instead of a token | WA |
| `coder.astro.component-frontmatter-fence` | 1 | advisory | component logic in an inline `<script>` that belongs in the `---` frontmatter fence | WA |

## C. Worker partition (3 workers)
| Worker | Theme | Nodes |
|---|---|---|
| **WV1** | Vite design/tokens/boundaries | http-client, orphan-ui, primitives, token-color, token-hardcoded |
| **WV2** | Vite presentation/i18n/gsap | gsap-commons, gsap-layer, i18n-config, i18n-switcher, coach-ratchet-pres |
| **WA** | Astro native | no-secret-in-frontmatter, client-directive-explicit, i18n-no-hardcoded-ui-string, no-hardcoded-color, component-frontmatter-fence |

**Totals:** 15 new front-end nodes (10 MIRROR + 5 NATIVE). Combined with the 34
Convex nodes → **49 nodes** governing the full frg-app TS surface (Convex backend +
Vite/React + Astro), at Core parity plus stack-native additions.

> SECURITY NOTE for the secret-detector authors: use placeholder secrets WITHOUT a
> real provider sub-format (no `sk_live_`/`sk_test_`/full AKIA) — GitHub push
> protection blocks those even in fixtures. `sk_REDACTED_PLACEHOLDER_VALUE` style.
