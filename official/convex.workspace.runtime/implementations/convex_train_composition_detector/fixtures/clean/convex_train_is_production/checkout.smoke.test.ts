// URN: test:train:3003-checkout:E2E-001-checkout-journey
// Train: train:3003-checkout
// Phase: SMOKE
// Layer: assembly
// Journey smoke test — IMPORTS and exercises the production runner (no definition here).
import { TrainRunner } from './trains/checkout-train'
import { test, expect } from 'vitest'

test('checkout journey', () => {
  const runner = new TrainRunner('3003-checkout')
  expect(runner.execute({}).success).toBe(true)
})
