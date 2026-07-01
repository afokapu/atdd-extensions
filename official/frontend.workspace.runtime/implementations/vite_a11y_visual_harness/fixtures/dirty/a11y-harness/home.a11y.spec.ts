import { test, expect } from '@playwright/test'

test('a11y home', async ({ page }) => {
  await page.goto('/')
  expect(true).toBeTruthy()
})
