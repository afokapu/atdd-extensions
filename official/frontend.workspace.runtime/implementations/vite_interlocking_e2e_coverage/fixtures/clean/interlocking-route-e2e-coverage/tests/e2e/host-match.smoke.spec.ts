// Interlocking: route:host-match
import { test, expect } from '@playwright/test';
test('smoke', async ({ page }) => { await page.goto('/'); await expect(page.getByRole('main')).toBeVisible(); });
