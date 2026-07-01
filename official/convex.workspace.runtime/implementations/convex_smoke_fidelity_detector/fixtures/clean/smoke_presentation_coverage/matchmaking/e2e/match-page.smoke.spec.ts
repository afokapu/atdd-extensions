// URN: test:train:3007-matchmaking:E2E-003-match-page-smoke
// Train: train:3007-matchmaking
// Phase: SMOKE
// Layer: assembly
// Runtime: vite
// Smoke: true
// Purpose: Smoke coverage for the matchmaking MatchPage presentation component.
import { test, expect } from '@playwright/test'

test('E2E-003 match page renders non-empty content', async ({ page }) => {
  await page.goto('/match/m1')
  await expect(page.getByRole('heading', { name: /Match/ })).toBeVisible()
})
