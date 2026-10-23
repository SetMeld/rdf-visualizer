import { DataFactory, Parser, type Quad } from 'n3';
import type { Prefixes } from './terms';

/** Shown on first visit: everything the endpoint holds. */
export const DEFAULT_QUERY = `CONSTRUCT { ?s ?p ?o . }
WHERE { ?s ?p ?o . }
`;

export const TIMEOUT_MS = 120_000;

/** Safelisted for CORS as long as it stays under 128 bytes, so the browser sends no preflight. */
const ACCEPT = 'text/turtle, application/n-triples;q=0.9, application/n-quads;q=0.8, application/trig;q=0.8';
const BODY_EXCERPT = 300;

/** Media types `n3` can read, and the name used for each in messages. */
const FORMATS: Record<string, string> = {
  'text/turtle': 'Turtle',
  'application/x-turtle': 'Turtle',
  'application/n-triples': 'N-Triples',
  'application/n-quads': 'N-Quads',
  'application/trig': 'TriG',
  'text/n3': 'N3',
};
/** Sent by endpoints that don't label their output; read as Turtle, which N-Triples also is. */
const UNLABELLED = new Set(['', 'text/plain', 'application/octet-stream']);

export type RunResult =
  | { ok: true; quads: Quad[]; prefixes: Prefixes; format: string }
  | { ok: false; error: string };

export type RunOptions = {
  signal: AbortSignal;
  fetch?: typeof fetch;
  timeoutMs?: number;
};

/** The problem with an endpoint and query, before anything is sent, or null if there is none. */
export function checkRequest(endpoint: string, query: string, pageProtocol: string): string | null {
  const text = endpoint.trim();
  if (!text) return 'Enter the SPARQL endpoint URL.';
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return 'Not a valid endpoint URL; expected http(s)://…';
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return 'Not a valid endpoint URL; expected http(s)://…';
  if (pageProtocol === 'https:' && url.protocol === 'http:' && !isLocal(url.hostname)) {
    return 'Browsers block http:// endpoints from this https:// page (mixed content). Use an https:// endpoint.';
  }
  if (!query.trim()) return 'Enter a query.';
  return null;
}

/** Runs a CONSTRUCT or DESCRIBE query with the SPARQL 1.1 Protocol and parses the RDF it returns. Never throws. */
export async function runConstruct(endpoint: string, query: string, options: RunOptions): Promise<RunResult> {
  const timeoutMs = options.timeoutMs ?? TIMEOUT_MS;
  const signal = AbortSignal.any([options.signal, AbortSignal.timeout(timeoutMs)]);

  let response: Response;
  let body: string;
  try {
    response = await (options.fetch ?? fetch)(endpoint.trim(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: ACCEPT },
      body: new URLSearchParams({ query }).toString(),
      credentials: 'omit',
      signal,
    });
    body = await response.text();
  } catch (error) {
    if (signal.aborted) {
      return signal.reason instanceof DOMException && signal.reason.name === 'TimeoutError'
        ? { ok: false, error: `No response after ${Math.round(timeoutMs / 1000)} seconds.` }
        : { ok: false, error: 'Cancelled.' };
    }
    return {
      ok: false,
      error:
        `Could not reach the endpoint (${error instanceof Error ? error.message : String(error)}). ` +
        'It may be down, the URL may be wrong, or it may not allow requests from this page: it must send ' +
        'Access-Control-Allow-Origin. The browser does not say which.',
    };
  }

  if (!response.ok) {
    const excerpt = body.trim().slice(0, BODY_EXCERPT);
    const status = `${response.status} ${response.statusText}`.trim();
    return { ok: false, error: `The endpoint answered ${status}${excerpt ? `: ${excerpt}` : '.'}` };
  }

  const mediaType = (response.headers.get('Content-Type') ?? '').split(';')[0].trim().toLowerCase();
  if (mediaType.startsWith('application/sparql-results') || mediaType === 'application/json') {
    return { ok: false, error: 'The endpoint returned query results, not a graph. Use CONSTRUCT or DESCRIBE.' };
  }
  const parserFormat = UNLABELLED.has(mediaType) ? 'text/turtle' : mediaType;
  const format = FORMATS[parserFormat];
  if (!format) {
    return {
      ok: false,
      error: `The endpoint returned ${mediaType}, which this viewer cannot read. Supported: Turtle, N-Triples, N-Quads, TriG.`,
    };
  }

  const prefixes: Prefixes = {};
  let quads: Quad[];
  try {
    quads = new Parser({ format: parserFormat }).parse(body, null, (prefix, node) => {
      prefixes[prefix] = node.value;
    });
  } catch (error) {
    return {
      ok: false,
      error: `Could not read the response as ${format}: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
  // Named graphs are not drawn apart, so their triples join the default graph.
  quads = quads.map((q) =>
    q.graph.termType === 'DefaultGraph' ? q : DataFactory.quad(q.subject, q.predicate, q.object),
  );
  return { ok: true, quads, prefixes, format };
}

function isLocal(hostname: string): boolean {
  return hostname === 'localhost' || hostname.endsWith('.localhost') || hostname === '127.0.0.1' || hostname === '[::1]';
}
