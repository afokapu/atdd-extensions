// Train: train:3005-leaderboard
// Phase: SMOKE
// Layer: assembly
import { test, expect } from '@playwright/test'

test('leaderboard renders', async ({ page }) => {
  await page.goto('/leaderboard')
  await expect(page.getByRole('heading', { name: /leaderboard/i })).toBeVisible()
})
