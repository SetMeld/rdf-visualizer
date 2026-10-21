# RDF Visualizer

A client-side React app (Vite + TypeScript) with no back-end, deployed to GitHub Pages.

**Live site:** https://setmeld.github.io/rdf-visualizer/

## Using it

Paste Turtle into the editor. Each subject becomes a card listing its literal values, with arrows to
the other resources it links to.

- **Click a card** to show only it and its neighbours. Click a neighbour to bring in its neighbours
  too, and **×** on a card to hide it. A **+N** badge counts a card's neighbours still hidden.
- **The type list** on the left filters to the resources of one type, collapsed, so their
  neighbours stay hidden until you click a card (⌘/Ctrl-click to add more types). Expand a type to list its resources; click one to focus on it.
- **Esc**, double-clicking the background, or **Whole graph** returns to the full graph.

## Loading from a SPARQL endpoint

The **SPARQL** tab beside **Turtle** fetches the graph instead: enter the endpoint URL, edit the query
(it starts as `CONSTRUCT { ?s ?p ?o . } WHERE { ?s ?p ?o . }`) and press **Run** or ⌘/Ctrl-Enter.
Every triple returned is drawn; use `LIMIT` or a narrower `WHERE` for large stores. The endpoint and
query are remembered, but nothing is sent until you run it.

The request goes straight from your browser to the endpoint — there is no server in between — so the
endpoint has to allow it:

- **CORS.** The endpoint must answer with `Access-Control-Allow-Origin` covering this page's origin
  (`https://setmeld.github.io`, or `*`). The query is a SPARQL 1.1 Protocol `POST` with a form body
  and an `Accept` header, which browsers send without a preflight, so no `OPTIONS` handling is needed.
  Without the header the browser hides the response and the viewer can only say it could not reach
  the endpoint.
- **HTTPS.** From the https:// site, browsers block http:// endpoints, except on `localhost`.
- **No credentials.** Cookies and authentication are not sent; the endpoint must allow anonymous reads.

Supported responses: Turtle, N-Triples, N-Quads and TriG (named graphs are drawn together), which is
what the viewer asks for. A response with no `Content-Type` or `text/plain` is read as Turtle.
RDF/XML and JSON-LD are not read, and SELECT or ASK results are not graphs — use `CONSTRUCT` or
`DESCRIBE`.

## Development

```sh
nvm use         # Node 22 (see .nvmrc)
npm install
npm run dev       # start dev server
npm run build     # type-check and build to dist/
npm run preview   # serve the production build locally
npm run lint      # lint with oxlint
npm test          # unit tests
npm run test:e2e  # browser tests: builds, serves, and drives Chromium against a fixture SPARQL endpoint
```

`npm run test:e2e` needs Playwright's Chromium (`npx playwright install --with-deps chromium`).
Where its system libraries can't be installed, run it in Playwright's image instead:

```sh
docker run --rm --ipc=host -v "$PWD":/work -w /work mcr.microsoft.com/playwright:v1.64.1-noble npx playwright test
```

## Deployment

Every push to `main` builds the app and deploys it to GitHub Pages via
[.github/workflows/deploy.yml](.github/workflows/deploy.yml).

One-time setup: in the GitHub repo, go to **Settings → Pages** and set
**Source** to **GitHub Actions**.

The site is served under `/rdf-visualizer/`, configured by `base` in
[vite.config.ts](vite.config.ts). Update it if the repo is renamed or a custom
domain is used (set `base: '/'` for a custom domain).
