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

test("the node count takes the room a host's long figures leave, which keep 2rem to hover over", async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 800 });
  await page.goto('./');
  await page
    .getByLabel('Turtle input')
    .locator('textarea')
    .fill(`<${FX}a> a <${FOAF}Person> ; <${FOAF}knows> <${FX}b> .\n<${FX}b> a <${FOAF}Person> .`);
  const toolbar = page.locator('section[aria-label="Graph"] .toolbar');
  const summary = toolbar.locator('.toolbar__summary');
  await expect(summary).toHaveText('2 nodes');

  // The host's figures, as SetMeld puts them in the explorer's `notice` slot.
  await toolbar.evaluate((row) => {
    const notice = row.ownerDocument.createElement('div');
    notice.className = 'toolbar__notice';
    const figures = row.ownerDocument.createElement('div');
    figures.style.cssText = 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
    figures.textContent = 'a long run of statement figures, '.repeat(20);
    notice.append(figures);
    row.insertBefore(notice, row.querySelector('.toggle'));
  });

  // A row with room for the controls, 2rem of figures and 30px of the node count, which is wider than that.
  const need = await toolbar.evaluate((row) => {
    const view = row.ownerDocument.defaultView!;
    const style = view.getComputedStyle(row);
    const rem = parseFloat(view.getComputedStyle(row.ownerDocument.documentElement).fontSize);
    const kids = [...row.children];
    const others = kids.filter((kid) => !kid.matches('.toolbar__summary, .toolbar__notice'));
    const used = others.reduce((sum, kid) => sum + kid.getBoundingClientRect().width, 0);
    const gaps = parseFloat(style.columnGap) * (kids.length - 1);
    const padding = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
    return used + gaps + padding + 2 * rem + 30;
  });
  await toolbar.evaluate((row, width) => {
    row.style.boxSizing = 'border-box';
    row.style.flex = 'none';
    row.style.width = `${width}px`;
  }, need);

  const widths = await toolbar.evaluate((row) => ({
    summary: row.querySelector('.toolbar__summary')!.getBoundingClientRect().width,
    notice: row.querySelector('.toolbar__notice')!.getBoundingClientRect().width,
    rem: parseFloat(row.ownerDocument.defaultView!.getComputedStyle(row.ownerDocument.documentElement).fontSize),
  }));
  // The figures keep 2rem to hover over and the node count takes everything else.
  expect(widths.notice).toBeGreaterThanOrEqual(2 * widths.rem - 1);
  expect(widths.summary).toBeGreaterThanOrEqual(29);
});

test('a graph is drawn with one color lookup per palette entry, not one per link', async ({ page }) => {
  // Counts the canvases read back for a color: `canvasColor` is the only code that asks for `willReadFrequently`.
  await page.addInitScript(`
    window.probes = 0;
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (kind, options) {
      if (options && options.willReadFrequently) window.probes += 1;
      return getContext.call(this, kind, options);
    };
  `);
  await page.goto('./');
  const links = 300;
  const turtle = Array.from({ length: links }, (_, i) => `<${FX}n${i}> <${FOAF}knows> <${FX}n${i + 1}> .`).join('\n');
  await page.getByLabel('Turtle input').locator('textarea').fill(turtle);
  await expect(page.locator('section[aria-label="Graph"] .toolbar__summary')).toHaveText(`${links + 1} nodes`);
  await expect(page.locator('.graph[data-pending="false"]')).toBeVisible();
  const probes = () => page.evaluate<number>('window.probes');
  expect(await probes()).toBeLessThan(links / 3);

  // A theme change reads the colors again, still once per palette entry.
  const before = await probes();
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.waitForFunction(`window.probes > ${before}`);
  expect((await probes()) - before).toBeLessThan(links / 3);
});
