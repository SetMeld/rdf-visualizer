import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import oxigraph from 'oxigraph';

/** Two subsets the tests can tell apart: people, and books. Expected values are restated in the tests. */
export const FIXTURE_TURTLE = `
@prefix fx:     <http://fixture.example/> .
@prefix foaf:   <http://xmlns.com/foaf/0.1/> .
@prefix schema: <https://schema.org/> .

fx:alice a foaf:Person ; foaf:name "Alice Fixture" ; foaf:knows fx:bob .
fx:bob   a foaf:Person ; foaf:name "Bob Fixture" ; foaf:age 41 .
fx:book1 a schema:Book ; schema:name "Fixture Book One" ; schema:author fx:alice .
fx:book2 a schema:Book ; schema:name "Fixture Book Two" ; schema:isbn "978-1-2345-6789-7" .
`;

/** Far more nodes than the viewer draws at once: 20,000 episodes, each in one of 100 series. */
export const LARGE = { episodes: 20_000, series: 100 };
/** Enough nodes to be laid out by force rather than in columns, few enough to draw: 1,000. */
export const MEDIUM = { episodes: 950, series: 50 };

function seriesTurtle({ episodes, series }: { episodes: number; series: number }): string {
  const lines = ['@prefix fx: <http://fixture.example/> .', '@prefix schema: <https://schema.org/> .'];
  for (let s = 0; s < series; s++) lines.push(`fx:series${s} a schema:TVSeries ; schema:name "Series ${s}" .`);
  for (let e = 0; e < episodes; e++) {
    lines.push(`fx:episode${e} a schema:Episode ; schema:name "Episode ${e}" ; schema:partOfSeries fx:series${e % series} .`);
  }
  return lines.join('\n');
}

export type RecordedRequest = {
  path: string;
  method: string;
  query: string | null;
  accept: string | undefined;
  contentType: string | undefined;
};

/**
 * A SPARQL endpoint backed by Oxigraph, with a variant per failure the viewer must report:
 * `/sparql` answers with CORS, `/nocors/sparql` without, `/fail/sparql` with a 500,
 * `/malformed/sparql` with a body that is not Turtle, `/hang/sparql` never answers, and
 * `/large/sparql` and `/medium/sparql` hold the LARGE and MEDIUM graphs.
 */
export async function startFixtureEndpoint() {
  const store = new oxigraph.Store();
  store.load(FIXTURE_TURTLE, { format: 'text/turtle' });
  const large = new oxigraph.Store();
  large.load(seriesTurtle(LARGE), { format: 'text/turtle' });
  const medium = new oxigraph.Store();
  medium.load(seriesTurtle(MEDIUM), { format: 'text/turtle' });
  const stores: Record<string, oxigraph.Store> = { '/large/sparql': large, '/medium/sparql': medium };
  const requests: RecordedRequest[] = [];
  const hanging = new Set<ServerResponse>();

  const server: Server = createServer(async (req, res) => {
    const url = new URL(req.url!, 'http://fixture');
    const body = req.method === 'POST' ? await readBody(req) : '';
    const query =
      req.method === 'POST' ? new URLSearchParams(body).get('query') : url.searchParams.get('query');
    requests.push({
      path: url.pathname,
      method: req.method!,
      query,
      accept: req.headers.accept,
      contentType: req.headers['content-type'],
    });

    const cors = url.pathname.startsWith('/nocors/') ? {} : { 'Access-Control-Allow-Origin': '*' };
    if (req.method === 'OPTIONS') {
      res.writeHead(204, { ...cors, 'Access-Control-Allow-Headers': '*' }).end();
      return;
    }
    switch (url.pathname) {
      case '/sparql':
      case '/nocors/sparql':
      case '/large/sparql':
      case '/medium/sparql':
        try {
          const turtle = (stores[url.pathname] ?? store).query(query ?? '', { results_format: 'text/turtle' }) as string;
          res.writeHead(200, { ...cors, 'Content-Type': 'text/turtle; charset=utf-8' }).end(turtle);
        } catch (error) {
          res.writeHead(400, { ...cors, 'Content-Type': 'text/plain' }).end(String(error));
        }
        return;
      case '/fail/sparql':
        res.writeHead(500, { ...cors, 'Content-Type': 'text/plain' }).end('store unavailable');
        return;
      case '/malformed/sparql':
        res.writeHead(200, { ...cors, 'Content-Type': 'text/turtle' }).end('this is <not turtle');
        return;
      case '/hang/sparql':
        hanging.add(res);
        res.on('close', () => hanging.delete(res));
        return;
      default:
        res.writeHead(404, cors).end();
    }
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    origin: `http://127.0.0.1:${port}`,
    requests,
    close: () =>
      new Promise<void>((resolve) => {
        for (const res of hanging) res.destroy();
        server.close(() => resolve());
      }),
  };
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => (data += chunk));
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}
