// URN: test:train:3001-host-a-match:E2E-001-shell-connects
// Phase: SMOKE
// Layer: assembly
// Runtime: vite
// Purpose: dirty — no `// Train:` header line
import { test, expect } from '@playwright/test'

test('E2E-001 the shell connects', async ({ page }) => {
  await page.goto('/play')
  await expect(page.locator('#root')).not.toBeEmpty()
})
