// URN: test:burn-timebank:burn-time:E001-UNIT-001-timebank
// Acceptance: acc:burn-timebank:E001-UNIT-001
// WMBT: wmbt:burn-timebank:E001
// Phase: GREEN
// Layer: domain
// Runtime: convex
// Purpose: CLEAN — a *.test.ts file whose declared runtime is in the TypeScript
//          family (convex); path and runtime agree.
import { describe, test, expect } from 'vitest'
import { decrement } from './timebank'

describe('E001-UNIT-001 timebank', () => {
  test('timebank decrements', () => {
    expect(decrement(10, 3)).toBe(7)
  })
})
