// URN: test:train:onboarding:e2e-1-flow
// Train: train:0025-onboarding
// Phase: RED
// Layer: assembly
// Runtime: convex
// VIOLATION: the URN is malformed — train_id lacks its NNNN number, harness is lowercase,
// and the index is not three digits (expected test:train:{NNNN-slug}:{HARNESS}-{NNN}-{slug}).
import { test, expect } from 'vitest'

test('onboarding flow', () => {
  expect(true).toBe(true)
})
