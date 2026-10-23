import { expect, test, type Locator, type Page } from '@playwright/test';
import { LARGE, MEDIUM, startFixtureEndpoint } from './fixtureEndpoint.ts';

const SUPPLIED_QUERY = 'CONSTRUCT { ?s ?p ?o . }\nWHERE { ?s ?p ?o . }\n';
const FX = 'http://fixture.example/';
const FOAF = 'http://xmlns.com/foaf/0.1/';
const SCHEMA = 'https://schema.org/';

let endpoint: Awaited<ReturnType<typeof startFixtureEndpoint>>;

test.beforeAll(async () => {
  endpoint = await startFixtureEndpoint();
});

test.afterAll(async () => {
  await endpoint.close();
});

test.beforeEach(() => {
  endpoint.requests.length = 0;
});

async function openSparql(page: Page) {
  await page.goto('./');
  await page.getByRole('tab', { name: 'SPARQL' }).click();
}

function endpointInput(page: Page) {
  return page.getByLabel('Endpoint', { exact: true });
}

function queryInput(page: Page) {
  return page.getByLabel('Query', { exact: true });
}

async function run(page: Page, url: string, query?: string) {
  await endpointInput(page).fill(url);
  if (query !== undefined) await queryInput(page).fill(query);
  await page.getByRole('button', { name: 'Run' }).click();
}

function status(page: Page): Locator {
  return page.getByLabel('SPARQL query').getByRole('status');
}

function card(page: Page, id: string): Locator {
  return page.locator(`.card[data-id="${id}"]`);
}

/** Kept beside the test's results as evidence of what the user saw. */
async function snapshot(page: Page, name: string) {
  await page.screenshot({ path: test.info().outputPath(`${name}.png`) });
}

/** The graph pane once its layout has finished and the cards are where they will stay. */
function placedGraph(page: Page): Locator {
  return page.locator('.graph[data-pending="false"]');
}

/** Cards pass pointer events through to the canvas, which is what handles the click. */
async function clickCard(page: Page, id: string) {
  await expect(placedGraph(page)).toBeVisible();
  await expect(card(page, id)).toBeVisible();
  const box = (await card(page, id).boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

async function expectFullFixture(page: Page) {
  await expect(status(page)).toHaveText('Turtle · 12 triples · 4 nodes · 2 links');
  await expect(page.locator('.card')).toHaveCount(4);
  await expect(card(page, `${FX}alice`)).toContainText('Alice Fixture');
  await expect(card(page, `${FX}bob`)).toContainText('Bob Fixture');
  await expect(card(page, `${FX}bob`)).toContainText('41');
  await expect(card(page, `${FX}book1`)).toContainText('Fixture Book One');
  await expect(card(page, `${FX}book2`)).toContainText('Fixture Book Two');
  await expect(card(page, `${FX}book2`)).toContainText('978-1-2345-6789-7');
}

test('B1: the supplied CONSTRUCT query draws the endpoint graph without pasting RDF', async ({ page }) => {
  await openSparql(page);
  await expect(queryInput(page)).toHaveValue(SUPPLIED_QUERY);

  await run(page, `${endpoint.origin}/sparql`);
  await expectFullFixture(page);
  await expect(placedGraph(page)).toHaveAttribute('data-layout', 'layered');
  await snapshot(page, 'b1-loaded');
  // Nothing from the Turtle editor's example is on screen.
  await expect(page.getByText('Alice Johnson')).toHaveCount(0);

  expect(endpoint.requests).toEqual([
    {
      path: '/sparql',
      method: 'POST',
      query: SUPPLIED_QUERY,
      accept: expect.stringMatching(/^text\/turtle/),
      contentType: 'application/x-www-form-urlencoded',
    },
  ]);

  // Links: alice knows bob, and book1's author is alice.
  await clickCard(page, `${FX}alice`);
  const details = page.getByRole('complementary', { name: 'Selection details' });
  await expect(details.getByRole('heading', { name: 'Alice Fixture' })).toBeVisible();
  const out = details.locator('section', { hasText: 'Links out (1)' });
  await expect(out.locator(`button[title="${FOAF}knows"]`)).toBeVisible();
  await expect(out).toContainText('Bob Fixture');
  const into = details.locator('section', { hasText: 'Links in (1)' });
  await expect(into.locator(`button[title="${SCHEMA}author"]`)).toBeVisible();
  await expect(into).toContainText('Fixture Book One');
  await snapshot(page, 'b1-details');

  // Existing interactions work on fetched data: the type filter narrows to one type.
  await page.keyboard.press('Escape');
  await page.getByRole('navigation', { name: 'Types' }).getByText(`${SCHEMA}Book`, { exact: true }).click();
  await expect(page.getByText('Showing 2 of 4 nodes')).toBeVisible();
});

test('B2: an edited query draws its own result, not the previous dataset', async ({ page }) => {
  await openSparql(page);
  await run(page, `${endpoint.origin}/sparql`);
  await expectFullFixture(page);

  const booksOnly = `PREFIX schema: <${SCHEMA}>\nCONSTRUCT { ?s ?p ?o . } WHERE { ?s a schema:Book ; ?p ?o . }`;
  await run(page, `${endpoint.origin}/sparql`, booksOnly);
  await expect(status(page)).toHaveText('Turtle · 6 triples · 3 nodes · 1 links');
  expect(endpoint.requests.at(-1)!.query).toBe(booksOnly);

  await expect(card(page, `${FX}book1`)).toContainText('Fixture Book One');
  await expect(card(page, `${FX}book2`)).toContainText('Fixture Book Two');
  // The people's triples are not in the result: bob is gone, alice is only book1's author.
  await expect(card(page, `${FX}bob`)).toHaveCount(0);
  await expect(page.getByText('Bob Fixture')).toHaveCount(0);
  await expect(page.getByText('Alice Fixture')).toHaveCount(0);
  await expect(page.getByText(`${FOAF}Person`)).toHaveCount(0);
  await snapshot(page, 'b2-books-only');
});

test('B3: an empty result says so and does not show the previous graph', async ({ page }) => {
  await openSparql(page);
  await run(page, `${endpoint.origin}/sparql`);
  await expectFullFixture(page);

  await run(page, `${endpoint.origin}/sparql`, `CONSTRUCT { ?s ?p ?o . } WHERE { ?s a <${FX}Nothing> ; ?p ?o . }`);
  await expect(status(page)).toHaveText('The query returned no triples.');
  await expect(page.locator('.viewer .empty')).toHaveText('The query returned no triples.');
  await expect(page.locator('.card')).toHaveCount(0);
  await expect(page.getByText('Alice Fixture')).toHaveCount(0);
  await snapshot(page, 'b3-empty');
});

test.describe('B4: failures are reported and a corrected run recovers', () => {
  test('missing and invalid URLs are caught before any request', async ({ page }) => {
    await openSparql(page);
    await run(page, '');
    await expect(status(page)).toHaveText('Enter the SPARQL endpoint URL.');
    await run(page, 'not a url');
    await expect(status(page)).toHaveText(/^Not a valid endpoint URL/);
    expect(endpoint.requests).toHaveLength(0);

    await run(page, `${endpoint.origin}/sparql`);
    await expectFullFixture(page);
  });

  test('an HTTP error shows the status and body, and replaces the previous graph', async ({ page }) => {
    await openSparql(page);
    await run(page, `${endpoint.origin}/sparql`);
    await expectFullFixture(page);

    await run(page, `${endpoint.origin}/fail/sparql`);
    await expect(status(page)).toHaveText('The endpoint answered 500 Internal Server Error: store unavailable');
    await expect(page.locator('.card')).toHaveCount(0);
    await expect(page.locator('.viewer .empty')).toHaveText(/The query failed/);
    await snapshot(page, 'b4-http-error');

    await run(page, `${endpoint.origin}/sparql`);
    await expectFullFixture(page);
  });

  test('an unreachable endpoint explains reachability and CORS', async ({ page }) => {
    await openSparql(page);
    // Port 9 (discard) is closed on the test machine.
    await run(page, 'http://127.0.0.1:9/sparql');
    await expect(status(page)).toHaveText(/^Could not reach the endpoint.*Access-Control-Allow-Origin/s);

    await run(page, `${endpoint.origin}/sparql`);
    await expectFullFixture(page);
  });

  test('an endpoint without CORS headers is reported, though it answered', async ({ page }) => {
    await openSparql(page);
    await run(page, `${endpoint.origin}/nocors/sparql`);
    await expect(status(page)).toHaveText(/^Could not reach the endpoint.*Access-Control-Allow-Origin/s);
    await expect(page.locator('.card')).toHaveCount(0);
    await snapshot(page, 'b4-cors');
    // The browser did send it; the answer was withheld from the page.
    expect(endpoint.requests.map((r) => r.path)).toEqual(['/nocors/sparql']);

    await run(page, `${endpoint.origin}/sparql`);
    await expectFullFixture(page);
  });

  test('a response that is not RDF is reported', async ({ page }) => {
    await openSparql(page);
    await run(page, `${endpoint.origin}/malformed/sparql`);
    await expect(status(page)).toHaveText(/^Could not read the response as Turtle: /);
    await expect(page.locator('.card')).toHaveCount(0);

    await run(page, `${endpoint.origin}/sparql`);
    await expectFullFixture(page);
  });

  test('a request that never answers shows progress and can be cancelled', async ({ page }) => {
    await openSparql(page);
    await run(page, `${endpoint.origin}/hang/sparql`);
    await expect(status(page)).toHaveText('Running…');
    await expect(page.locator('.viewer .empty')).toHaveText('Running query…');
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(status(page)).toHaveText('Cancelled.');

    await run(page, `${endpoint.origin}/sparql`);
    await expectFullFixture(page);
  });
});

test('B5: a result too large to draw opens on its types, stays responsive and can be explored', async ({ page }) => {
  test.setTimeout(90_000);
  const nodes = LARGE.episodes + LARGE.series;
  const triples = LARGE.series * 2 + LARGE.episodes * 3;
  const TYPE = 'urn:rdf-visualizer:type:';
  await openSparql(page);
  await run(page, `${endpoint.origin}/large/sparql`);

  // Every triple is loaded and counted; none is dropped to make it fit.
  await expect(status(page)).toHaveText(`Turtle · ${triples} triples · ${nodes} nodes · ${LARGE.episodes} links`, {
    timeout: 30_000,
  });

  // The overview: one card per type, with its member count, instead of a blank pane.
  await expect(page.getByText(`${nodes.toLocaleString('en')} nodes in 2 types`)).toBeVisible();
  await expect(placedGraph(page)).toBeVisible();
  await expect(page.locator('.card')).toHaveCount(2);
  await expect(card(page, `${TYPE}${SCHEMA}Episode`)).toContainText(`${LARGE.episodes}`);
  await expect(card(page, `${TYPE}${SCHEMA}TVSeries`)).toContainText(`${LARGE.series}`);
  await snapshot(page, 'b5-overview');

  // Still responsive.
  const started = Date.now();
  await page.evaluate(() => 1);
  expect(Date.now() - started).toBeLessThan(1_000);

  // Clicking a type that can be drawn draws its members.
  await clickCard(page, `${TYPE}${SCHEMA}TVSeries`);
  await expect(placedGraph(page)).toBeVisible();
  await expect(page.locator('.card')).toHaveCount(LARGE.series);
  await expect(card(page, `${FX}series45`)).toContainText('Series 45');

  // Back to the overview; a type with more members than can be drawn says so.
  await page.keyboard.press('Escape');
  await expect(page.locator('.card')).toHaveCount(2);
  await clickCard(page, `${TYPE}${SCHEMA}Episode`);
  const message = page.locator('.viewer .empty');
  await expect(message).toHaveText(new RegExp(`^This view has ${LARGE.episodes.toLocaleString('en')} nodes`));

  // Searching and opening one node draws its neighbourhood: the episode and its series.
  const types = page.getByRole('navigation', { name: 'Types' });
  await types.getByLabel('Search types and nodes').fill('Episode 12345');
  await types.getByRole('button', { name: 'Episode 12345', exact: true }).click();
  await expect(card(page, `${FX}episode12345`)).toContainText('Episode 12345');
  await expect(card(page, `${FX}series45`)).toContainText('Series 45');
  await expect(page.locator('.card')).toHaveCount(2);
  await snapshot(page, 'b5-neighbourhood');
});

test('B6: a graph of 500 or more nodes is laid out by force, off the main thread', async ({ page }) => {
  test.setTimeout(90_000);
  const nodes = MEDIUM.episodes + MEDIUM.series;
  await openSparql(page);
  await run(page, `${endpoint.origin}/medium/sparql`);
  await expect(status(page)).toHaveText(new RegExp(`· ${nodes} nodes ·`), { timeout: 30_000 });

  // While it is laid out the page answers, and says what it is doing.
  const graph = page.locator('.graph');
  await expect(graph).toHaveAttribute('data-layout', 'force');
  const started = Date.now();
  await page.evaluate(() => 1);
  expect(Date.now() - started).toBeLessThan(1_000);

  await expect(placedGraph(page)).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('.card')).toHaveCount(nodes);
  await expect(card(page, `${FX}series7`)).toBeVisible();
  await snapshot(page, 'b6-force');
});

test.describe('B7: Ctrl-Enter (Cmd-Enter on macOS) runs the query from anywhere in the app', () => {
  const books = `PREFIX schema: <${SCHEMA}>\nCONSTRUCT { ?s ?p ?o . } WHERE { ?s a schema:Book ; ?p ?o . }`;

  async function prepare(page: Page) {
    await openSparql(page);
    await endpointInput(page).fill(`${endpoint.origin}/sparql`);
    await queryInput(page).fill(books);
  }

  async function expectRanOnce(page: Page) {
    await expect(status(page)).toHaveText('Turtle · 6 triples · 3 nodes · 1 links');
    await expect(card(page, `${FX}book2`)).toContainText('Fixture Book Two');
    expect(endpoint.requests.map((r) => r.query)).toEqual([books]);
  }

  for (const [where, focus] of [
    ['the query editor', (page: Page) => queryInput(page).focus()],
    ['the endpoint field', (page: Page) => endpointInput(page).focus()],
    ['the type search', (page: Page) => page.getByLabel('Search types and nodes').focus()],
    ['nothing in particular', (page: Page) => page.locator('body').click({ position: { x: 5, y: 5 } })],
  ] as const) {
    test(`with focus on ${where}`, async ({ page }) => {
      await prepare(page);
      await focus(page);
      await page.keyboard.press('ControlOrMeta+Enter');
      await expectRanOnce(page);
    });
  }

  test('with the editor collapsed', async ({ page }) => {
    await prepare(page);
    await page.getByRole('button', { name: 'Hide editor' }).click();
    await expect(queryInput(page)).toHaveCount(0);
    await page.keyboard.press('ControlOrMeta+Enter');
    await expect(page.locator('.card')).toHaveCount(3);
    await expect(card(page, `${FX}book2`)).toContainText('Fixture Book Two');
    expect(endpoint.requests.map((r) => r.query)).toEqual([books]);
  });

  test('both Ctrl-Enter and Cmd-Enter', async ({ page }) => {
    await prepare(page);
    await page.keyboard.press('Control+Enter');
    await expectRanOnce(page);
    await page.keyboard.press('Meta+Enter');
    await expect.poll(() => endpoint.requests.length).toBe(2);
  });

  test('not while a run is in flight, and not from the Turtle tab', async ({ page }) => {
    await openSparql(page);
    await endpointInput(page).fill(`${endpoint.origin}/hang/sparql`);
    await page.keyboard.press('ControlOrMeta+Enter');
    await expect(status(page)).toHaveText('Running…');
    await page.keyboard.press('ControlOrMeta+Enter');
    await page.getByRole('button', { name: 'Cancel' }).click();
    await page.getByRole('tab', { name: 'Turtle' }).click();
    await page.keyboard.press('ControlOrMeta+Enter');
    await page.waitForTimeout(300);
    expect(endpoint.requests.map((r) => r.path)).toEqual(['/hang/sparql']);
  });
});

test('pasting Turtle still draws it', async ({ page }) => {
  await page.goto('./');
  await page.getByLabel('Turtle input').locator('textarea').fill(`<${FX}pasted> <${FOAF}name> "Pasted Node" .`);
  await expect(card(page, `${FX}pasted`)).toContainText('Pasted Node');
  await expect(page.getByLabel('Turtle input').getByRole('status')).toHaveText('1 triples · 1 nodes · 0 links');
});

test('endpoint and query are remembered across reloads', async ({ page }) => {
  await openSparql(page);
  await run(page, `${endpoint.origin}/sparql`, 'CONSTRUCT { ?s ?p ?o } WHERE { ?s ?p ?o } LIMIT 1');
  await page.reload();
  await expect(page.getByRole('tab', { name: 'SPARQL' })).toHaveAttribute('aria-selected', 'true');
  await expect(endpointInput(page)).toHaveValue(`${endpoint.origin}/sparql`);
  await expect(queryInput(page)).toHaveValue('CONSTRUCT { ?s ?p ?o } WHERE { ?s ?p ?o } LIMIT 1');
  // Nothing is sent until the user runs it.
  await expect(page.locator('.viewer .empty')).toHaveText('Run a query to see the graph.');
  expect(endpoint.requests).toHaveLength(1);
});
