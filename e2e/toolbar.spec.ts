import { expect, test } from '@playwright/test';

const FX = 'http://fixture.example/';
const FOAF = 'http://xmlns.com/foaf/0.1/';

test('the toolbar stays on one line however narrow the pane, with its controls whole', async ({ page }) => {
  await page.goto('./');
  await page
    .getByLabel('Turtle input')
    .locator('textarea')
    .fill(`<${FX}a> a <${FOAF}Person> ; <${FOAF}knows> <${FX}b> .\n<${FX}b> a <${FOAF}Person> .`);
  // The editor's text replaces the example graph after a short delay.
  await expect(page.locator('section[aria-label="Graph"] .toolbar__summary')).toHaveText('2 nodes');
  await expect(page.locator('.graph[data-pending="false"]')).toBeVisible();

  const toolbar = page.locator('section[aria-label="Graph"] .toolbar');
  const wide = (await toolbar.boundingBox())!;
  await page.setViewportSize({ width: 420, height: 800 });
  const narrow = (await toolbar.boundingBox())!;
  expect(narrow.height).toBe(wide.height);

  const button = (await toolbar.getByRole('button', { name: '⟲ Whole graph' }).boundingBox())!;
  const toggle = (await toolbar.getByLabel(/Draw/).boundingBox())!;
  for (const box of [button, toggle]) {
    expect(box.x).toBeGreaterThanOrEqual(narrow.x);
    expect(box.x + box.width).toBeLessThanOrEqual(narrow.x + narrow.width);
  }

  // What does not fit ends in an ellipsis and reads whole on hover.
  const summary = toolbar.locator('.toolbar__summary');
  await expect(summary).toHaveAttribute('title', '2 nodes');
});
