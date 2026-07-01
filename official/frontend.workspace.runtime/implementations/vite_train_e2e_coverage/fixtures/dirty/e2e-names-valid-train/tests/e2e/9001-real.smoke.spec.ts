// URN: test:train:9001-real:E2E-001-smoke
// Train: train:9001-real
// Phase: SMOKE
// Layer: assembly
// Runtime: vite
// Smoke: true
// Purpose: journey smoke fixture for 9001-real
import { test, expect } from '@playwright/test'

test('E2E-001 smoke', async ({ page }) => {
  await page.goto('/play')
  await expect(page.locator('#root')).not.toBeEmpty()
})
