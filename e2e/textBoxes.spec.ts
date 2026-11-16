import { expect, test } from '@playwright/test';

test('the type search box has 8px corners', async ({ page }) => {
  await page.goto('./');
  const search = page.getByPlaceholder('Search types and nodes');
  await expect(search).toBeVisible();
  await expect(search).toHaveCSS('border-top-left-radius', '8px');
  await expect(search).toHaveCSS('border-bottom-right-radius', '8px');
});
