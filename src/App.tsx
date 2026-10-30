import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { EXAMPLE_TURTLE } from './example';
import { GraphExplorer } from './GraphExplorer';
import { buildGraph, parseTurtle, type RdfGraph as RdfGraphModel } from './rdf/buildGraph';
import { checkRequest, DEFAULT_QUERY, runConstruct, type RunResult } from './rdf/sparql';
import { SparqlPanel, type SparqlStatus } from './SparqlPanel';

const STORAGE_KEY = 'rdf-visualizer:turtle';
const SOURCE_KEY = 'rdf-visualizer:source';
const ENDPOINT_KEY = 'rdf-visualizer:sparql-endpoint';
const QUERY_KEY = 'rdf-visualizer:sparql-query';

/** Where the graph comes from: the Turtle editor, or the last SPARQL query run. */
type Source = 'turtle' | 'sparql';

type SparqlRun = { kind: 'idle' } | { kind: 'running' } | RunResult;
const PARSE_DELAY_MS = 300;

type Parsed = {
  /** The last graph that parsed, kept on screen while the text is mid-edit and invalid. */
  graph: RdfGraphModel | null;
  error: string | null;
};

function parse(text: string, typesAsLinks: boolean, previous: RdfGraphModel | null): Parsed {
  const result = parseTurtle(text, { typesAsLinks });
  return result.ok ? { graph: result.graph, error: null } : { graph: previous, error: result.error };
}

function load(key: string, fallback: string): string {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

function store(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage is a convenience; without it the text just isn't remembered.
  }
}

export default function App() {
  const [text, setText] = useState(() => load(STORAGE_KEY, EXAMPLE_TURTLE));
  const [source, setSource] = useState<Source>(() => (load(SOURCE_KEY, 'turtle') === 'sparql' ? 'sparql' : 'turtle'));
  const [endpoint, setEndpoint] = useState(() => load(ENDPOINT_KEY, ''));
  const [query, setQuery] = useState(() => load(QUERY_KEY, DEFAULT_QUERY));
  const [sparqlRun, setSparqlRun] = useState<SparqlRun>({ kind: 'idle' });
  const runController = useRef<AbortController | null>(null);
  const [typesAsLinks, setTypesAsLinks] = useState(false);
  const [parsed, setParsed] = useState<Parsed>(() => parse(text, typesAsLinks, null));
  const [editorOpen, setEditorOpen] = useState(true);
  const [resetKey, setResetKey] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => {
      setParsed((previous) => parse(text, typesAsLinks, previous.graph));
    }, PARSE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [text, typesAsLinks]);

  useEffect(() => store(STORAGE_KEY, text), [text]);
  useEffect(() => store(SOURCE_KEY, source), [source]);
  useEffect(() => store(ENDPOINT_KEY, endpoint), [endpoint]);
  useEffect(() => store(QUERY_KEY, query), [query]);
  useEffect(() => () => runController.current?.abort(), []);

  const sparqlGraph = useMemo(
    () =>
      'ok' in sparqlRun && sparqlRun.ok ? buildGraph(sparqlRun.quads, sparqlRun.prefixes, { typesAsLinks }) : null,
    [sparqlRun, typesAsLinks],
  );

  const graph = source === 'turtle' ? parsed.graph : sparqlGraph;
  // Only the Turtle editor keeps its last good graph on screen beside an error.
  const error = source === 'turtle' ? parsed.error : null;
  // A different graph altogether, so the explorer returns to the whole of it.
  const clearView = () => setResetKey((key) => key + 1);

  const switchSource = (next: Source) => {
    if (next === source) return;
    setSource(next);
    clearView();
  };

  const runQuery = async () => {
    runController.current?.abort();
    runController.current = null;
    const problem = checkRequest(endpoint, query, window.location.protocol);
    if (problem) {
      setSparqlRun({ ok: false, error: problem });
      return;
    }
    const controller = new AbortController();
    runController.current = controller;
    // The previous result is cleared rather than left on screen to be mistaken for this one.
    setSparqlRun({ kind: 'running' });
    clearView();
    const result = await runConstruct(endpoint, query, { signal: controller.signal });
    if (runController.current !== controller) return;
    runController.current = null;
    setSparqlRun(result);
    clearView();
  };

  const cancelQuery = () => runController.current?.abort();

  const sparqlStatus: SparqlStatus =
    'kind' in sparqlRun
      ? sparqlRun
      : !sparqlRun.ok
        ? { kind: 'error', error: sparqlRun.error }
        : sparqlRun.quads.length === 0
          ? { kind: 'done', summary: 'The query returned no triples.', empty: true }
          : { kind: 'done', summary: `${sparqlRun.format} · ${summarize(sparqlGraph!)}`, empty: false };

  const emptyMessage =
    source === 'turtle'
      ? error
        ? 'Fix the error to see the graph.'
        : 'Nothing to show yet.'
      : sparqlStatus.kind === 'running'
        ? 'Running query…'
        : sparqlStatus.kind === 'error'
          ? 'The query failed; see the error beside the query.'
          : sparqlStatus.kind === 'done' && sparqlStatus.empty
            ? 'The query returned no triples.'
            : 'Run a query to see the graph.';

  // The key listener is bound once, so it reaches the current handler through a ref.
  const runShortcutRef = useRef(() => {});
  useEffect(() => {
    runShortcutRef.current = () => {
      if (source === 'sparql' && sparqlStatus.kind !== 'running') void runQuery();
    };
  });

  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        runShortcutRef.current();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <div className="app">
      <header className="topbar">
        <h1>RDF Visualizer</h1>
        <span className="topbar__hint">
          Click a node to focus on it · click again to expand · Esc or double-click the background to reset
        </span>
      </header>

      <main className={`workspace ${editorOpen ? '' : 'workspace--editor-closed'}`}>
        {editorOpen ? (
          <section className="editor" aria-label={source === 'turtle' ? 'Turtle input' : 'SPARQL query'}>
            <div className="toolbar">
              <div className="tabs" role="tablist" aria-label="Source">
                {(['turtle', 'sparql'] as const).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    role="tab"
                    aria-selected={source === tab}
                    className={`tabs__tab ${source === tab ? 'tabs__tab--active' : ''}`}
                    onClick={() => switchSource(tab)}
                  >
                    {SOURCE_NAMES[tab]}
                  </button>
                ))}
              </div>
              {source === 'turtle' && (
                <>
                  <button type="button" onClick={() => setText(EXAMPLE_TURTLE)}>
                    Example
                  </button>
                  <button type="button" onClick={() => setText('')}>
                    Clear
                  </button>
                </>
              )}
              <button type="button" onClick={() => setEditorOpen(false)} title="Hide editor" aria-label="Hide editor">
                ‹
              </button>
            </div>
            {source === 'sparql' ? (
              <SparqlPanel
                endpoint={endpoint}
                query={query}
                status={sparqlStatus}
                onEndpointChange={setEndpoint}
                onQueryChange={setQuery}
                onRun={runQuery}
                onCancel={cancelQuery}
                onQueryKeyDown={insertTab}
              />
            ) : (
              <>
                <textarea
                  className="editor__input"
                  value={text}
                  onChange={(event) => setText(event.target.value)}
                  onKeyDown={insertTab}
                  spellCheck={false}
                  autoCapitalize="off"
                  autoComplete="off"
                  placeholder="@prefix ex: <http://example.org/> .&#10;&#10;ex:alice ex:knows ex:bob ."
                />
                <div className={`editor__status ${error ? 'editor__status--error' : ''}`} role="status">
                  {error ? error : graph ? summarize(graph) : ''}
                </div>
              </>
            )}
          </section>
        ) : (
          <button type="button" className="editor-rail" onClick={() => setEditorOpen(true)} aria-label="Show editor">
            <span>{SOURCE_NAMES[source]} ›</span>
          </button>
        )}

        <GraphExplorer
          graph={graph}
          emptyMessage={emptyMessage}
          tooLargeHint={source === 'sparql' ? ', or narrow the query.' : '.'}
          notice={error && graph && <span className="toolbar__stale">Showing last valid graph</span>}
          typesAsLinks={typesAsLinks}
          onTypesAsLinksChange={setTypesAsLinks}
          resetKey={resetKey}
        />
      </main>
    </div>
  );
}

const SOURCE_NAMES: Record<Source, string> = { turtle: 'Turtle', sparql: 'SPARQL' };

function summarize(graph: RdfGraphModel): string {
  return `${graph.tripleCount} triples · ${graph.resources.length} nodes · ${graph.links.length} links`;
}

/** Tab indents instead of leaving the editor, as it would in any code editor. */
function insertTab(event: KeyboardEvent<HTMLTextAreaElement>) {
  if (event.key !== 'Tab' || event.shiftKey || event.metaKey || event.ctrlKey || event.altKey) return;
  event.preventDefault();
  // execCommand keeps the edit on the browser's undo stack, which setting the value would not.
  document.execCommand('insertText', false, '    ');
}
