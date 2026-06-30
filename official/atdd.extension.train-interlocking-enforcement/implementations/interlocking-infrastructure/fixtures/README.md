# fixtures/ — interlocking-infrastructure

Golden consumer trees for the `coder.interlocking.runner-infrastructure` detector
(afokapu/atdd-extensions#25). Each is a miniature consumer repo rooted at
`<fixture>/python/...`, mirroring the scope selectors `python_runtime`
(`python/trains/**/*.py`) + `station_master` (`python/app.py`).

- `clean/` — a correctly wired interlocking-enabled consumer: `InterlockingRunner`
  exists with `resolve_train` + a structured `InterlockingResolution` model, the
  Station Master routes both direct and interlocking routes and delegates to
  `TrainRunner`, and no wagon execution / Cargo bleed occurs. **No violations.**
- `dirty/` — a present-but-broken `InterlockingRunner` that competes with
  TrainRunner/Cargo: bare-string resolution, direct wagon import + `run_train(...)`
  + `train.sequence` loop, Cargo mutation / `artifact_urn` storage, an unlinked +
  non-delegating Station Master, and a wagon that imports interlocking code.
  **Flags every forbidden category.**
- `dirty_missing_runner/` — interlocking route declared, but no `InterlockingRunner`
  class ships. **Flags `missing-interlocking-runner`.**
- `dirty_no_resolve_train/` — cleanly wired except the runner exposes no
  `resolve_train(...)`. **Flags `missing-resolve-train` only.**

The clean/dirty pair is the load-bearing control: the same detector returns
opposite verdicts purely on consumer wiring (see `../tests/`).
