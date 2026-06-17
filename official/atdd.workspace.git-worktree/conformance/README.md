# Conformance — atdd.workspace.git-worktree

A workspace claiming to satisfy this provider's capability contracts (a different
isolation mechanism, or a different VCS for trailers) proves it by passing this
suite. Conformance here is **mechanism-level**, not runner-level — there is no
implementation discovery/run loop, because isolation and trailer insertion are
not executable units shipped by extensions.

## environment.isolation.v1

- Creating a unit of work yields an isolated working tree + index that shares the
  object store with the main checkout.
- Per-worktree config writes use `--worktree` scope; `core.bare`,
  `core.worktree`, and `core.hooksPath` are never written to the shared config.
- Removal is refused (or a no-op warning) while the branch's PR is unmerged.

## source-control.commit-trailers.v1

- A trailer is inserted into the commit message footer.
- Re-applying the same key/value is idempotent (no duplicate trailer).
- The mechanism is VCS = `git` (`git interpret-trailers`).
