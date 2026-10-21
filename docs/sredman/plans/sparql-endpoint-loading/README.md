# Load the graph from a SPARQL endpoint

The viewer gains a second source beside the Turtle editor: a SPARQL endpoint URL and an editable
CONSTRUCT query, run from the browser, whose RDF result is drawn with the existing graph view. It
stays a static site with no back-end, so the endpoint must be reachable from the user's browser and
must allow cross-origin requests. Graphs under 500 nodes are laid out left to right; larger ones, up
to 5,000, by force, in a worker so the page keeps answering. A result too large to draw opens on an
overview of its types. Pasting Turtle keeps working unchanged.

Issue: requested internally, with no public tracker entry; the required behaviors are restated in
full under Product behaviors.

Date Modified: 2026-10-21

## Amended by:

None

## Superseded by:

None

## Context

Today the only way to see data is to paste Turtle into the editor. The requester's data lives in a
SPARQL store and they want to fetch it with a query such as:

```sparql
CONSTRUCT { ?s ?p ?o . }
WHERE { ?s ?p ?o . }
```

Real constraints:

- The app is client-side only and deployed to GitHub Pages; there is no server to proxy through.
  Every request goes from the user's browser straight to the endpoint, so the browser's CORS and
  mixed-content rules apply and cannot be worked around from the page.
- RDF parsing is done with `n3`, which reads Turtle, TriG, N-Triples, N-Quads and N3. It does not
  read RDF/XML or JSON-LD.
- No production endpoint, credential or authentication scheme was supplied; none is invented here.

Preferences, not constraints: keeping the existing layout and the existing graph interactions.

## Goals / Non-goals

Goals:

- Enter an endpoint URL, edit a query (initially the one above) and run it without pasting RDF.
- Draw the result with the existing graph, type list, details panel and focus interactions.
- Make every failure visible and actionable, never a silent success, a stale graph presented as new,
  or a spinner that never ends; a corrected retry succeeds.
- Load every triple returned. No silent truncation.
- Keep the page usable however large the result: a graph too large to draw opens on its types and
  is explored from there instead of freezing the tab.

Non-goals:

- Authentication (basic, bearer, API keys). Endpoints needing credentials are out of scope until
  someone names the scheme.
- A proxy for endpoints that do not send CORS headers. Such an endpoint gets an error that says why.
- SELECT and ASK results. They are tables and booleans, not graphs; the user is told to use CONSTRUCT
  or DESCRIBE.
- RDF/XML and JSON-LD responses. The request does not ask for them and the user is told the format
  is unsupported.
- Named graphs. TriG and N-Quads are read, but their graph names are dropped and all triples drawn
  together.
- Paging or result limits. The query decides how much comes back.
- Drawing tens of thousands of nodes at once. That needs a GPU renderer (below).
- A class hierarchy. The overview shows the types the data uses; stores that hold instance data
  without their ontology have no `rdfs:subClassOf` to build one from.
- Removing or changing the Turtle editor.

## Product behaviors

| ID | Starting conditions | User action | Observable expected result | How it is checked |
| --- | --- | --- | --- | --- |
| B1 | Viewer open; a browser-reachable endpoint holds a small known graph | Open the SPARQL tab, enter the endpoint URL, run the supplied CONSTRUCT query; no Turtle pasted | Every subject of the fixture appears as a card with its literal values, and its links are listed with their predicate and target | Playwright drives the real built app against an Oxigraph fixture endpoint; the endpoint records the request; assertions use triples written independently in the test |
| B2 | Same endpoint holds two distinguishable subsets (people, books) | After B1, edit the query to select only the books and run it | The books are drawn with their own triples. The people's own triples (names, types, `knows`) are gone: Bob, who no book mentions, has no card, and Alice remains only as a bare node because a book's `schema:author` points at her | Playwright: endpoint request carries the edited query; book cards and literals present; no person's name, type or card other than Alice's bare author node |
| B3 | Endpoint returns a valid empty graph | After a non-empty load, run a query that matches nothing | The viewer says the query returned no triples and draws no cards from the previous result | Playwright after a successful non-empty run |
| B4 | URL missing or invalid; endpoint returns an HTTP error; endpoint unreachable; endpoint without CORS headers; response not parseable RDF; endpoint never answers | Run; then correct the input or switch to a working endpoint and run again | A visible error naming the cause and what to do, no graph presented as a result, no endless loading (a stuck request can be cancelled and times out); the corrected run succeeds | Playwright for each case, then a successful recovery run |
| B5 | Endpoint returns a graph with more than 5,000 nodes | Run the supplied query | The status gives the full triple and node counts. The graph pane shows one card per type in the data, plus Untyped if any resource has no type, each with its member count, joined by links labelled with predicate and count. The page answers throughout. Clicking a type draws its members if there are at most 5,000, or says the view is too large; searching for a node and opening it draws its neighbourhood | Playwright with a 20,100-node fixture, in Chromium and Firefox; checked by hand against a real 347,715-triple SetMeld store |
| B6 | Endpoint returns a graph to draw | Run a query returning under 500 nodes, then one returning 500 to 5,000 | Under 500 nodes the graph is laid out left to right, as before; from 500 it is laid out by force. While the layout runs the pane says "Laying out *N* nodes…" and the page keeps answering; the graph appears when the layout is done | Playwright: `data-layout` on the graph pane is `layered` for the 4-node fixture and `force` for a 1,000-node fixture, and the page answers during layout |

B5 and B6 were added once a run against a whole 104k-triple store froze the browser. The operator
then set the layouts (dagre under 500 nodes, force-directed above) and asked for the type overview in
place of an empty pane. Both add to B1–B4 and change none of them.

The existing paste workflow keeps passing its own check: the Turtle tab draws pasted Turtle as before.

## Design

### Interface

The editor pane's title becomes two tabs, **Turtle** and **SPARQL**. The graph pane always shows the
active tab's graph; switching tabs refits the view and clears focus and selection.

The SPARQL tab holds:

- **Endpoint** — a URL input.
- **Query** — a textarea, initially the CONSTRUCT above. Tab indents, as in the Turtle editor;
  ⌘/Ctrl-Enter runs.
- **Run** — becomes **Cancel** while a request is in flight. The two are separate elements: one
  element changing type mid-click would submit the form again as the cancel lands.
- A status line (`role="status"`): `Running…`, the triple/node/link counts after a result, `The query
  returned no triples.`, or the error in the error colour.

Endpoint and query are remembered in `localStorage`, as the Turtle text is. Results are not stored,
and nothing runs on page load: the user runs the query.

When a run starts the previous result is cleared, so the graph pane shows `Running query…` rather
than the old graph. A failed run leaves no graph and the pane says to see the error. A successful run
resets focus and selection and fits the new graph. An empty result shows `The query returned no
triples.` in both the status line and the graph pane.

### Request

`src/rdf/sparql.ts` exports `runConstruct(endpoint, query, { signal, fetch? })`, returning
`{ ok: true, quads, prefixes, format } | { ok: false, error }`. It never throws.

- SPARQL 1.1 Protocol query via POST, body `application/x-www-form-urlencoded` `query=…`. POST
  avoids URL length limits on long queries and, like a form GET, is a CORS simple request: with
  `Accept` as the only extra header, the browser sends no preflight, so the endpoint only has to
  return `Access-Control-Allow-Origin` on the response.
- `Accept: text/turtle, application/n-triples;q=0.9, application/n-quads;q=0.8, application/trig;q=0.8`
  — all CORS-safelisted characters, under 128 bytes.
- Credentials are not sent (`credentials: 'omit'`).
- `App` aborts the request on Cancel, on a new Run and after 120 seconds.

### Validation and errors

Checked before any request:

| Input | Message |
| --- | --- |
| Empty URL | Enter the SPARQL endpoint URL. |
| Not a URL, or not `http:`/`https:` | Not a valid endpoint URL; expected http(s)://… |
| `http:` endpoint (not localhost) from an `https:` page | Browsers block http:// endpoints from this https:// page (mixed content); use an https:// endpoint |
| Empty query | Enter a query. |

After the request:

| Outcome | Message |
| --- | --- |
| `fetch` rejects (network, DNS, refused, CORS) | Could not reach the endpoint. It may be down, the URL may be wrong, or it may not allow requests from this page: it must send `Access-Control-Allow-Origin`. The browser does not say which. |
| Non-2xx | The endpoint answered `<status> <text>`, followed by the first 300 characters of its body |
| `application/sparql-results+*` or `application/json` | The endpoint returned query results, not a graph; use CONSTRUCT or DESCRIBE |
| Other unsupported type, e.g. `application/rdf+xml`, `application/ld+json` | The endpoint returned `<type>`, which this viewer cannot read; supported: Turtle, N-Triples, N-Quads, TriG |
| Body not parseable in the declared format | Could not read the response as `<format>`: `<parser message>` |
| Timeout | No response after 120 seconds |
| Cancel | Cancelled |

A missing `Content-Type`, `text/plain` or `application/octet-stream` is read as Turtle, which also
covers N-Triples.

### Large results

Drawing time is almost all layout, which runs on the CPU. Measured on one synthetic graph with two
links per node, layout alone takes:

| Nodes | dagre (left to right) | ELK layered | fcose (force) |
| --- | --- | --- | --- |
| 500 | 8.3 s | 7.6 s | 0.5 s |
| 2,000 | not finished in 5 min | 36 s | 1.3 s |
| 5,000 | — | — | 2.7 s |

`layoutFor` picks dagre below `LAYERED_MAX` (500) nodes and fcose from there; fcose drops to its
draft quality from 2,000. `RdfGraph` hands node sizes and links to a worker (`layout.worker.ts`),
keeps the canvas and cards hidden behind "Laying out *N* nodes…" until positions come back, and
cancels the worker when the graph changes first. Graphs laid out by force are drawn with straight,
unlabelled edges, labelled once selected, and pan as a snapshot: curved labelled edges cost seconds
there. The view is fitted to the nodes alone for the same reason.

The layout no longer blocks the page, but creating Cytoscape's elements and the HTML cards still
does, once, when the graph appears. In headless Chromium, with no GPU, the slowest page response
while a graph appeared was 0.6 s at 500 nodes, 1.5 s at 1,000, 3.6 s at 2,500 and 7.3 s at 5,000,
and the graph was placed after 3.6, 9.4, 7.0 and 15.7 s. `MAX_DRAWN_NODES` is 5,000.

A view with more nodes than that is not drawn. The whole graph opens on its type overview
(`src/rdf/overview.ts`): one node per rdf:type with its member count, one for untyped resources,
and one link per (type, predicate, type) with the number of links it stands for. `rdf:type` links
are left out of it. Clicking a type filters to it, as the type list does. A type filter or expanded
hub over the limit shows "This view has *N* nodes, too many to draw at once (the limit is 5000).
Search on the left and click a node to draw its neighbourhood, or narrow the query." Every triple
is still loaded, counted in the status line, grouped in the type list and searchable. Opening a
node from a view that is too large replaces that view with the node's neighbourhood rather than
adding to it.

`gist:name` is a label predicate, beside `rdfs:label`, `schema:name` and the rest, and `gist:` is a
well-known prefix. SetMeld data names everything with gist and declares no prefixes, so without
them cards show bare IRIs and search by name finds nothing.

### State

`App` keeps the SPARQL result as `{ quads, prefixes }` and builds it with `buildGraph`, so the
`rdf:type` toggle rebuilds it without refetching. `parseTurtle` is unchanged.

## Alternatives considered

- **Write the fetched RDF into the Turtle editor.** Least code, and everything downstream works
  unchanged, but it overwrites whatever the user had pasted, puts a possibly large serialization into
  a textarea and `localStorage`, and drops TriG/N-Quads graph structure through re-serialization. Lost
  to a separate source.
- **GET with `?query=`.** Also a simple request, but long queries hit URL length limits on servers and
  proxies. POST with a form body is equally portable under SPARQL 1.1 Protocol.
- **POST `application/sparql-query`.** Not a CORS-safelisted content type, so every request would
  need a preflight the endpoint must answer; strictly worse for reachability.
- **A CORS proxy.** Would make more endpoints reachable, but it is a service someone must run and
  trust with the queries, and the issue rules out inventing one.
- **Parsing RDF/XML and JSON-LD.** Needs new parsing libraries for formats no one asked for; every
  common store can return Turtle for CONSTRUCT.
- **Keeping the previous graph on screen during a run or after a failure, marked stale** (as the
  Turtle editor does mid-edit). The editor does it because the text is being typed; a query result is
  a discrete answer, and showing the last one beside an error reads as success. Cleared instead.
- **fcose for every graph.** Fast at any size, but the left-to-right columns read better for the
  small graphs this viewer is mostly used on. Kept dagre under 500 nodes.
- **ELK's layered layout for large graphs.** Keeps the columns, but measured no faster than dagre
  (36 s for 2,000 nodes).
- **A GPU renderer** (WebGL, e.g. sigma.js), drawing nodes as points and cards only when zoomed in.
  The only way to see tens of thousands of nodes at once and to remove the remaining stall, but it
  replaces the card view this app is built around. Left for its own plan.
- **An empty pane with a message for a graph over the limit.** Shipped first; a blank screen after
  a long load gave no idea what was in the data. Replaced by the type overview.
- **Adding `LIMIT` to the query, or dropping triples past a threshold.** Fast, but it hides data
  without saying which. The issue rules out silent truncation, and the user can add `LIMIT`
  themselves.
- **Auto-running the query on page load.** Sends a request the user did not ask for to whatever
  endpoint was last used. Not done.

## Test matrix

| Feature / behavior | Scenario | Level | Where | Status |
| --- | --- | --- | --- | --- |
| B1 load from endpoint | Supplied query draws every fixture subject, literal and link; request carries the query | integration (browser) | `e2e/sparql.spec.ts` | PASS |
| B1 interactions | Clicking a fetched card lists its links in the details panel; type filter narrows to one type | integration (browser) | `e2e/sparql.spec.ts` | PASS |
| B2 edited query | Books-only query draws books; the people's own triples are absent, and Alice remains only as a book's author | integration (browser) | `e2e/sparql.spec.ts` | PASS |
| B3 empty result | After a non-empty load, an empty result says so and shows no cards | integration (browser) | `e2e/sparql.spec.ts` | PASS |
| B4 validation | Empty URL and invalid URL show errors without a request, then a corrected URL succeeds | integration (browser) | `e2e/sparql.spec.ts` | PASS |
| B4 HTTP error | 500 shows status and body excerpt, then recovery | integration (browser) | `e2e/sparql.spec.ts` | PASS |
| B4 unreachable | Closed port shows the reach/CORS error | integration (browser) | `e2e/sparql.spec.ts` | PASS |
| B4 CORS | Endpoint without `Access-Control-Allow-Origin` shows the reach/CORS error | integration (browser) | `e2e/sparql.spec.ts` | PASS |
| B4 malformed | Unparseable Turtle shows a parse error | integration (browser) | `e2e/sparql.spec.ts` | PASS |
| B4 stuck | Endpoint that never answers can be cancelled | integration (browser) | `e2e/sparql.spec.ts` | PASS |
| B5 large result | 20,100-node result: counts shown, 2-type overview with member counts, page responsive; a drawable type draws its 100 members; a type over the limit says so; searching and opening a node draws its neighbourhood | integration (browser) | `e2e/sparql.spec.ts` | PASS |
| B5 large result | Real SetMeld store: 347,715 triples, 95,574 nodes; overview of 17 types placed 8.8 s after Run; the page answers in 5 ms; gist:Person (1,262 nodes) drawn by force in 5.6 s, slowest page response 1.8 s | manual | Firefox | PASS |
| B5 overview | Type nodes, member counts, untyped group, aggregated links, no rdf:type links | unit | `src/rdf/overview.test.ts` | done |
| B6 layout | 4-node fixture laid out left to right; 1,000-node fixture by force, the page answering during layout | integration (browser) | `e2e/sparql.spec.ts` | PASS |
| B6 layout | Under 500 nodes layered, from 500 force; every node placed; 2,000 nodes by force in under 10 s | unit | `src/graph/layout.test.ts` | done |
| Prefixes | `gist:` is compacted without a declaration; the document's own prefix wins | unit | `src/rdf/terms.test.ts` | done |
| Labels | `gist:name` labels a resource | unit | `src/rdf/buildGraph.test.ts` | done |
| Paste still works | Turtle tab draws pasted Turtle | integration (browser) | `e2e/sparql.spec.ts` | PASS |
| Request shape | POST, form body, Accept header, no credentials | unit | `src/rdf/sparql.test.ts` | done |
| Formats | N-Triples, N-Quads (graph names dropped), TriG; missing Content-Type read as Turtle; prefixes kept | unit | `src/rdf/sparql.test.ts` | done |
| Wrong formats | SPARQL results JSON, RDF/XML each give their message | unit | `src/rdf/sparql.test.ts` | done |
| Validation | Empty, non-URL, non-http, mixed content, localhost exemption, empty query | unit | `src/rdf/sparql.test.ts` | done |
| Timeout | Abort after 120 s reports a timeout, not a cancel | unit | `src/rdf/sparql.test.ts` | done |
| Remembered input | Endpoint and query survive a reload; nothing runs until Run | integration (browser) | `e2e/sparql.spec.ts` | PASS |
| Large result | 5,000 triples parsed, none dropped | unit | `src/rdf/sparql.test.ts` | done |
| Large result | Time to place, and slowest page response, by node count: 499 layered 7.3 s / 0.8 s; 500 force 3.6 s / 0.6 s; 1,000 9.4 s / 1.5 s; 2,500 7.0 s / 3.6 s; 5,000 15.7 s / 7.3 s | manual | headless Chromium, no GPU | measured; sets `MAX_DRAWN_NODES` |
| Mixed content | Real https page to http endpoint | — | — | Not run in a browser: the fixture serves over http; covered by the unit check of the pre-flight rule |

## Validation plan

`npm run test:e2e` builds the app, serves it with `vite preview`, starts an Oxigraph-backed fixture
endpoint with the variants above, and drives Chromium and Firefox through every behavior. The central
check (B1) is shown to fail when the fetch-to-graph path is deliberately broken, B5 when the type
overview is switched off, and B6 when every graph is laid out left to right; all pass when restored.
Screenshots from the Chromium run are in `evidence/`: `b1-details.png`, `b2-books-only.png`,
`b3-empty.png`, `b4-cors.png`, `b5-overview.png`, `b5-neighbourhood.png` and `b6-force.png`. Rollback is reverting the merge; nothing is stored server-side and the Turtle path is untouched.

## What this change owed the list

Nothing: this repository is not the rig and has no release criteria list.

## Open questions

None blocking. Authentication and a proxy were left out deliberately (Non-goals); either becomes its
own plan once someone names an endpoint that needs it.
