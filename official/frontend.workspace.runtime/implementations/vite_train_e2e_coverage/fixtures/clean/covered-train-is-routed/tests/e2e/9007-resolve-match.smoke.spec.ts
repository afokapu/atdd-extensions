// URN: test:train:9007-resolve-match:E2E-001-renders
// Train: train:9007-resolve-match
// Phase: SMOKE
// Layer: assembly
// Runtime: vite
// Smoke: true
// Purpose: journey smoke — the resolve-match route renders its declared train
import { test, expect } from '@playwright/test'

test('E2E-001 renders 9007-resolve-match', async ({ page }) => {
  await page.goto('/match/resolve')
  await expect(page.locator('[data-train-id]')).toHaveAttribute('data-train-id', '9007-resolve-match')
})
