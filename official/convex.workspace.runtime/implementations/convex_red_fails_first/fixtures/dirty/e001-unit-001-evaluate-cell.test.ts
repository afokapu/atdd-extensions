// URN: test:score-grid:evaluate:E001-UNIT-001-evaluate-cell
// Acceptance: acc:score-grid:E001-UNIT-001-evaluate-cell
// WMBT: wmbt:score-grid:E001
// Phase: RED
// Layer: domain
// Runtime: convex
// Purpose: DIRTY — a RED-phase test with a passing assertion and NO RED marker.
import { describe, test, expect } from 'vitest'

describe('test:score-grid:evaluate:E001-UNIT-001-evaluate-cell', () => {
  test('evaluates a cell', () => {
    // VIOLATION: this assertion passes today, so the RED test does not fail first.
    expect(1 + 1).toBe(2)
  })
})
