import { describe, expect, it, vi } from 'vitest';
import { checkRequest, runConstruct, type RunResult } from './sparql';

const ENDPOINT = 'https://example.org/sparql';
const QUERY = 'CONSTRUCT { ?s ?p ?o . } WHERE { ?s ?p ?o . }';

function respond(body: string, init: ResponseInit = {}) {
  return vi.fn<typeof fetch>(async () => new Response(body, init));
}

async function run(fetchImpl: typeof fetch, signal = new AbortController().signal): Promise<RunResult> {
  return runConstruct(ENDPOINT, QUERY, { signal, fetch: fetchImpl });
}

function triples(result: RunResult): string[] {
  if (!result.ok) throw new Error(result.error);
  return result.quads.map((q) => `${q.subject.value} ${q.predicate.value} ${q.object.value}`);
}

describe('runConstruct', () => {
  it('POSTs the query as a form body, asking for RDF, without credentials', async () => {
    const fetchImpl = respond('', { headers: { 'Content-Type': 'text/turtle' } });
    await run(fetchImpl);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe(ENDPOINT);
    expect(init?.method).toBe('POST');
    expect(init?.credentials).toBe('omit');
    expect(new URLSearchParams(init?.body as string).get('query')).toBe(QUERY);
    const headers = new Headers(init?.headers);
    expect(headers.get('Content-Type')).toBe('application/x-www-form-urlencoded');
    expect(headers.get('Accept')).toMatch(/^text\/turtle, application\/n-triples/);
    // Over 128 bytes, Accept stops being CORS-safelisted and the browser sends a preflight.
    expect(headers.get('Accept')!.length).toBeLessThanOrEqual(128);
  });

  it('reads Turtle and keeps its prefixes', async () => {
    const result = await run(
      respond('@prefix ex: <http://example.org/> .\nex:a ex:p "x" .', {
        headers: { 'Content-Type': 'text/turtle; charset=utf-8' },
      }),
    );
    expect(triples(result)).toEqual(['http://example.org/a http://example.org/p x']);
    expect(result.ok && result.prefixes).toEqual({ ex: 'http://example.org/' });
  });

  it('reads N-Triples', async () => {
    const result = await run(
      respond('<http://a/s> <http://a/p> <http://a/o> .\n', { headers: { 'Content-Type': 'application/n-triples' } }),
    );
    expect(triples(result)).toEqual(['http://a/s http://a/p http://a/o']);
  });

  it('reads N-Quads and TriG, drawing every graph together', async () => {
    const nquads = await run(
      respond('<http://a/s> <http://a/p> "1" <http://a/g1> .\n<http://a/s> <http://a/p> "2" .\n', {
        headers: { 'Content-Type': 'application/n-quads' },
      }),
    );
    expect(triples(nquads)).toEqual(['http://a/s http://a/p 1', 'http://a/s http://a/p 2']);
    expect(nquads.ok && nquads.quads.every((q) => q.graph.termType === 'DefaultGraph')).toBe(true);

    const trig = await run(
      respond('<http://a/g> { <http://a/s> <http://a/p> "1" . }', { headers: { 'Content-Type': 'application/trig' } }),
    );
    expect(triples(trig)).toEqual(['http://a/s http://a/p 1']);
  });

  it('reads a response with no Content-Type as Turtle', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => {
      const response = new Response(new Blob(['<http://a/s> <http://a/p> "x" .']));
      response.headers.delete('Content-Type');
      return response;
    });
    expect(triples(await run(fetchImpl))).toEqual(['http://a/s http://a/p x']);
  });

  it('returns an empty graph as a success', async () => {
    const result = await run(respond('', { headers: { 'Content-Type': 'text/turtle' } }));
    expect(result).toMatchObject({ ok: true, quads: [] });
  });

  it('keeps every triple of a large result', async () => {
    const body = Array.from({ length: 5000 }, (_, i) => `<http://a/s${i}> <http://a/p> "${i}" .`).join('\n');
    const result = await run(respond(body, { headers: { 'Content-Type': 'application/n-triples' } }));
    expect(triples(result)).toHaveLength(5000);
  });

  it('reports HTTP errors with the status and the start of the body', async () => {
    const result = await run(
      respond(`Parse error: ${'x'.repeat(1000)}`, { status: 400, statusText: 'Bad Request' }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/^The endpoint answered 400 Bad Request: Parse error: x+/);
    expect(result.error.length).toBeLessThan(400);
  });

  it('explains a network or CORS failure', async () => {
    const result = await run(vi.fn<typeof fetch>(async () => Promise.reject(new TypeError('Failed to fetch'))));
    expect(result).toEqual({ ok: false, error: expect.stringMatching(/Could not reach the endpoint.*Access-Control-Allow-Origin/s) });
  });

  it('tells a SELECT result apart from an unsupported graph format', async () => {
    const select = await run(respond('{"head":{}}', { headers: { 'Content-Type': 'application/sparql-results+json' } }));
    expect(select).toEqual({ ok: false, error: expect.stringMatching(/query results, not a graph.*CONSTRUCT or DESCRIBE/) });

    const rdfXml = await run(respond('<rdf:RDF/>', { headers: { 'Content-Type': 'application/rdf+xml' } }));
    expect(rdfXml).toEqual({ ok: false, error: expect.stringMatching(/application\/rdf\+xml.*cannot read.*Turtle/) });
  });

  it('reports a body that does not parse', async () => {
    const result = await run(respond('this is not turtle', { headers: { 'Content-Type': 'text/turtle' } }));
    expect(result).toEqual({ ok: false, error: expect.stringMatching(/^Could not read the response as Turtle: /) });
  });

  it('reports a cancelled request as cancelled', async () => {
    const controller = new AbortController();
    const fetchImpl = vi.fn<typeof fetch>(
      (_url, init) =>
        new Promise((_resolve, reject) =>
          init!.signal!.addEventListener('abort', () => reject(init!.signal!.reason)),
        ),
    );
    const pending = run(fetchImpl, controller.signal);
    controller.abort();
    expect(await pending).toEqual({ ok: false, error: 'Cancelled.' });
  });

  it('gives up after the timeout and says so', async () => {
    const fetchImpl = vi.fn<typeof fetch>(
      (_url, init) =>
        new Promise((_resolve, reject) =>
          init!.signal!.addEventListener('abort', () => reject(init!.signal!.reason)),
        ),
    );
    const result = await runConstruct(ENDPOINT, QUERY, {
      signal: new AbortController().signal,
      fetch: fetchImpl,
      timeoutMs: 20,
    });
    expect(result).toEqual({ ok: false, error: expect.stringMatching(/^No response after \d+ seconds/) });
  });
});

describe('checkRequest', () => {
  const page = 'https:';

  it('accepts an http(s) URL and a query', () => {
    expect(checkRequest(ENDPOINT, QUERY, page)).toBeNull();
  });

  it('asks for a missing URL or query', () => {
    expect(checkRequest('  ', QUERY, page)).toMatch(/Enter the SPARQL endpoint URL/);
    expect(checkRequest(ENDPOINT, ' \n', page)).toMatch(/Enter a query/);
  });

  it('rejects text that is not an http(s) URL', () => {
    expect(checkRequest('not a url', QUERY, page)).toMatch(/Not a valid endpoint URL/);
    expect(checkRequest('ftp://example.org/sparql', QUERY, page)).toMatch(/Not a valid endpoint URL/);
  });

  it('warns that an https page cannot call an http endpoint, except on this machine', () => {
    expect(checkRequest('http://example.org/sparql', QUERY, 'https:')).toMatch(/mixed content/);
    expect(checkRequest('http://example.org/sparql', QUERY, 'http:')).toBeNull();
    expect(checkRequest('http://localhost:3030/ds/sparql', QUERY, 'https:')).toBeNull();
    expect(checkRequest('http://127.0.0.1:3030/ds/sparql', QUERY, 'https:')).toBeNull();
  });
});
