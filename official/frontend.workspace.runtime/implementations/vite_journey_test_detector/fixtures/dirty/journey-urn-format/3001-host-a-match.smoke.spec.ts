// URN: test:train:3001-host-a-match:BOGUS-1-x
// Train: train:3001-host-a-match
// Phase: SMOKE
// Layer: assembly
// Purpose: dirty — journey URN harness/ordinal malformed
import { test, expect } from '@playwright/test'

test('bad urn', async ({ page }) => {
  await page.goto('/play')
  await expect(page.locator('#root')).not.toBeEmpty()
})
