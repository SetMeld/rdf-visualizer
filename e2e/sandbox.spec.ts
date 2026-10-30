import { expect, test } from '@playwright/test';

const FX = 'http://fixture.example/';
const FOAF = 'http://xmlns.com/foaf/0.1/';

// An MCP App host's sandbox may refuse workers; the graph is then laid out on the page instead.
test('with workers refused by the content security policy, the graph is still laid out and drawn', async ({
  page,
}) => {
  const refused: string[] = [];
  page.on('console', (message) => {
    if (/worker/i.test(message.text())) refused.push(message.text());
  });
  await page.route('**/rdf-visualizer/', async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      response,
      headers: { ...response.headers(), 'content-security-policy': "worker-src 'none'" },
    });
  });
  await page.goto('./');
  await page
    .getByLabel('Turtle input')
    .locator('textarea')
    .fill(`<${FX}a> <${FOAF}name> "Node A" ; <${FOAF}knows> <${FX}b> .\n<${FX}b> <${FOAF}name> "Node B" .`);

  await expect(page.locator('.graph[data-pending="false"]')).toBeVisible();
  await expect(page.locator('.graph__notice--error')).toHaveCount(0);
  const a = await page.locator(`.card[data-id="${FX}a"]`).boundingBox();
  const b = await page.locator(`.card[data-id="${FX}b"]`).boundingBox();
  // Laid out left to right rather than piled at the origin.
  expect(b!.x).toBeGreaterThan(a!.x + a!.width);
  expect(refused.length).toBeGreaterThan(0);
});
