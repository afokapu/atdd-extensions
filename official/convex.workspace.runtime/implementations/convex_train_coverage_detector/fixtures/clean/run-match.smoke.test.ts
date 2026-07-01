// URN: test:train:3003-checkout:E2E-002-run-match-smoke
// Train: train:3003-checkout
// Phase: SMOKE
// Layer: assembly
import { runRunMatch } from '@run-match/wagon'
import { test, expect } from 'vitest'

test('run-match composition root', () => {
  expect(runRunMatch({})).toBeDefined()
})
