import { test, expect } from '@playwright/test'

test('visual home', async ({ page }) => {
  await page.goto('/')
  await page.waitForLoadState('networkidle')
  await expect(page).toHaveScreenshot('home.png', { threshold: 0.2 })
})
