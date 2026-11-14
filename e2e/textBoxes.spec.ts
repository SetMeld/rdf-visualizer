import { expect, test } from '@playwright/test';

test('every text box the site draws has 8px corners', async ({ page }) => {
  await page.goto('./');
  const search = page.getByPlaceholder('Search types and nodes');
  await expect(search).toBeVisible();
  await expect(search).toHaveCSS('border-top-left-radius', '8px');
  await expect(search).toHaveCSS('border-bottom-right-radius', '8px');

  await page.getByRole('tab', { name: 'SPARQL' }).click();
  for (const box of [page.getByLabel('Endpoint', { exact: true }), page.getByLabel('Query', { exact: true })]) {
    await expect(box).toHaveCSS('border-top-left-radius', '8px');
    await expect(box).toHaveCSS('border-bottom-right-radius', '8px');
  }
});
