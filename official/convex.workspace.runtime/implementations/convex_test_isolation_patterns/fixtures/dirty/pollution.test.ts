// URN: test:git-tools:worktree:G002-UNIT-002-bare-init-polluting
//
// A test that mutates SHARED git state with no tmp isolation — the Wave 12
// contamination class. Both lines below can corrupt the live worktree's .git.
import { execFileSync, execSync } from 'node:child_process'
import { describe, expect, test } from 'vitest'

describe('bare repo helpers (polluting)', () => {
  test('inits a bare repo with an unscoped path', () => {
    // UNSCOPED bare init — target is a bare literal, not a tmp-derived path.
    execFileSync('git', ['init', '--bare', 'origin.git'])
    expect(true).toBe(true)
  })

  test('flips core.bare on the live worktree', () => {
    // UNSCOPED core.bare config — no --worktree, no -C <tmp>, no cwd option.
    execSync('git config core.bare true')
    expect(true).toBe(true)
  })
})
