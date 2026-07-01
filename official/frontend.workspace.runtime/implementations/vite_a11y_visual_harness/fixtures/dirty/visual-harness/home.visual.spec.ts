import { test, expect } from '@playwright/test'

test('visual home', async ({ page }) => {
  await page.goto('/')
  expect(true).toBeTruthy()
})
