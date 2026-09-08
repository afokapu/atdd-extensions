// StationMaster: resolve_match
// URN: test:train:3001-host-match:E2E-001-station
// Train: train:3001-host-match
// Phase: SMOKE
// Layer: assembly
// Runtime: vite
// Smoke: true
// Purpose: the station master surface renders
import { test, expect } from '@playwright/test'

test('E2E-001 the station master renders', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('#root')).not.toBeEmpty()
})
