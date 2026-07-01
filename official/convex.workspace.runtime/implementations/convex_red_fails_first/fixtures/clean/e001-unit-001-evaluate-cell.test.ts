// URN: test:score-grid:evaluate:E001-UNIT-001-evaluate-cell
// Acceptance: acc:score-grid:E001-UNIT-001-evaluate-cell
// WMBT: wmbt:score-grid:E001
// Phase: RED
// Layer: domain
// Runtime: convex
// Purpose: CLEAN — a RED-phase test with a guaranteed-fail RED marker.
import { describe, test, expect } from 'vitest'
import { evaluateCell } from './evaluate'

describe('test:score-grid:evaluate:E001-UNIT-001-evaluate-cell', () => {
  test('evaluates a cell', () => {
    // RED marker: the subject is not implemented yet, so this fails first.
    throw new Error('Not implemented: acc:score-grid:E001-UNIT-001-evaluate-cell')
    expect(evaluateCell({ row: 0, col: 0 })).toBe(42)
  })
})
