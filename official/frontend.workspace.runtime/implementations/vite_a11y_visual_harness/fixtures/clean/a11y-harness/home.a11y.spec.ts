import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

test('a11y home', async ({ page }) => {
  await page.goto('/')
  const results = await new AxeBuilder({ page }).analyze()
  const critical = results.violations.filter((v) => v.impact === 'critical')
  expect(critical.length).toBeLessThanOrEqual(0)
})
