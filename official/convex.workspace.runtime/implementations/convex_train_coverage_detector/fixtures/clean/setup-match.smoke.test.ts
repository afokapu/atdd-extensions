// URN: test:train:3003-checkout:E2E-001-setup-match-smoke
// Train: train:3003-checkout
// Phase: SMOKE
// Layer: assembly
import { runSetupMatch } from '@setup-match/wagon'
import { test, expect } from 'vitest'

test('setup-match composition root', () => {
  expect(runSetupMatch({})).toBeDefined()
})
