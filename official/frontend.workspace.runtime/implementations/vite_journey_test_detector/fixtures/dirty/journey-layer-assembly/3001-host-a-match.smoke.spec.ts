// URN: test:train:3001-host-a-match:E2E-001-shell-connects
// Train: train:3001-host-a-match
// Phase: SMOKE
// Layer: presentation
// Purpose: dirty — Layer is not assembly
import { test, expect } from '@playwright/test'

test('E2E-001 the shell connects', async ({ page }) => {
  await page.goto('/play')
  await expect(page.locator('#root')).not.toBeEmpty()
})
