# Worker A — EXTENSION: make the interlocking detector read a layout instead of hardcoding paths

Umbrella: afokapu/atdd#1595. You are in a worktree of `afokapu/atdd-extensions` (branch
`feat/interlocking-layout-config`, based on origin/main). **Surgical, reuse-first. No new schema,
no new file type, no new convention. One implementation file + its test + re-vendor.**

## The single file
`official/atdd.extension.train-interlocking-enforcement/implementations/interlocking-binding/src/interlocking_binding.py`

Today it hardcodes the consumer game-app layout in 5 places:
- `_INTERLOCKING_GLOBS` (~L77), `_E2E_GLOB` (~L81), `_TRAIN_DIR` (~L82) — module constants
- `find_runtime_files()` (~L312) → `root/python/trains`
- `_app_file()` (~L319) → `root/python/app.py`

## The contract (FIXED — core worker B codes to the same thing)
Resolve each surface from named selectors with precedence:
1. **per-repo override**: env var `ATDD_INTERLOCKING_LAYOUT` = JSON `{selector_id: [globs]}` (set by core). If present, use it.
2. else the extension's own `scopes/interlocking-targets.scope.yaml` selector `include` globs.
3. else today's hardcoded constants (built-in DEFAULTS).

Selector ids → surfaces (exact names, do not rename):
`interlocking_yaml`→`_INTERLOCKING_GLOBS`; `train_yaml`→`_TRAIN_DIR`;
`python_runtime`→`find_runtime_files`; `station_master`→`_app_file`; `e2e_tests`→`_E2E_GLOB`.

## Do exactly this
1. Add `_resolve_layout(root: Path) -> dict[str, list[str]]` (~25 lines): read+JSON-parse
   `ATDD_INTERLOCKING_LAYOUT` (os.environ) → else load `scopes/interlocking-targets.scope.yaml`
   (the `yaml` module is already imported) and map each selector `id`→its `include` list → else the
   current constants. Locate the scope file relative to this package; fall back to defaults if absent.
2. Thread the resolved layout into the 5 walk sites. Keep every public function signature
   (`scan_root`, `detect`, `find_runtime_files`, `_app_file`, …) unchanged — resolve layout once at
   the top of `scan_root(root)` and pass what each helper needs, or read a module-level resolved
   default. Prefer passing through `scan_root` (no import-time env reads).
3. **Fail-closed teeth** (this is the point of the change): in `scan_root`, if the repo declares an
   interlocking route space (`records` non-empty) but the resolved `python_runtime` globs match NO
   file AND the resolved `station_master` globs match NO file, emit ONE violation under the same
   `RULE_BILATERAL` rule_id with a NEW direction token `layout_unresolved` (add it to
   `ALL_DIRECTIONS`) — evidence: "interlocking declared but no runtime/Station Master found at
   configured layout <globs>". This replaces today's silent no-op.
4. **Behavior-preserving:** with no env var and the shipped scope file, resolved globs MUST equal
   today's constants — existing game-app fixtures stay green. Verify by running the impl's tests.
5. **Re-vendor** per the #58 pattern so the source and any vendored copy agree (search the repo for
   how #58 synced the vendored copy; replicate). If unclear, leave a NOTE in the PR and skip — do
   NOT invent a vendoring mechanism.

## Test (`tests/test_interlocking_binding.py`, extend — don't rewrite)
- fixture with `ATDD_INTERLOCKING_LAYOUT` pointing `python_runtime` at `src/**/runtime/interlocking/`
  → a runtime file there is now read (a hidden-route literal there is caught).
- fixture: interlockings declared + runtime/station globs resolve to nothing → `layout_unresolved`
  violation emitted (fail-closed proven).
- existing tests still pass (defaults preserved).

## Done =
`pytest` green in the impl dir; commit on THIS branch with a conventional message
(`refactor(train-interlocking): resolve scan layout from selectors, fail-closed`); push; then STOP and
report back to the orchestrator: summarize the diff + the exact `ATDD_INTERLOCKING_LAYOUT` key name
and JSON shape you implemented (the orchestrator cross-checks it against core worker B).
Do not open a PR yet. Do not touch any other extension or core.
