// URN: test:git-tools:worktree:G001-UNIT-001-bare-init-isolated
//
// A test that shells out to git but keeps ALL mutation scoped to a tmp dir it
// creates and tears down — the isolation-safe rendering. Nothing touches the live
// worktree's shared .git state.
import { execFileSync, execSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'

let tmpDir: string

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'atdd-git-'))
})
afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true })
})

describe('bare repo helpers (isolated)', () => {
  test('creates a bare repo inside the tmp dir', () => {
    // Bare init target is derived from a tmpDir (mkdtempSync/tmpdir) path — scoped.
    execFileSync('git', ['init', '--bare', join(tmpDir, 'origin.git')])
    // core.bare config is scoped to the tmp dir via `git -C <tmpDir>`.
    execSync(`git -C ${tmpDir} config core.bare true`)
    const out = execSync(`git -C ${tmpDir} rev-parse --is-bare-repository`).toString()
    expect(out.trim()).toBe('true')
  })
})
