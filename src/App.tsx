import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { DetailsPanel } from './DetailsPanel';
import { EXAMPLE_TURTLE } from './example';
import { RdfGraph, type RdfGraphHandle, type Selection, type ViewRequest } from './graph/RdfGraph';
import { buildGraph, parseTurtle, type RdfGraph as RdfGraphModel } from './rdf/buildGraph';
import {
  close,
  expand,
  filterByTypes,
  groupByType,
  hiddenNeighborCount,
  indexNeighbors,
  visibleGraph,
  type Focus,
} from './rdf/focus';
import { checkRequest, DEFAULT_QUERY, runConstruct, type RunResult } from './rdf/sparql';
import { SparqlPanel, type SparqlStatus } from './SparqlPanel';
import { TypeNav } from './TypeNav';
import './App.css';

const STORAGE_KEY = 'rdf-visualizer:turtle';
const SOURCE_KEY = 'rdf-visualizer:source';
const ENDPOINT_KEY = 'rdf-visualizer:sparql-endpoint';
const QUERY_KEY = 'rdf-visualizer:sparql-query';

/** Where the graph comes from: the Turtle editor, or the last SPARQL query run. */
type Source = 'turtle' | 'sparql';

type SparqlRun = { kind: 'idle' } | { kind: 'running' } | RunResult;
const PARSE_DELAY_MS = 300;
/** Layout time grows faster than the node count; past this, drawing stalls the page for many seconds. */
const MAX_DRAWN_NODES = 500;

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
  const [focus, setFocus] = useState<Focus>(null);
  const [selection, setSelection] = useState<Selection>(null);
  const [editorOpen, setEditorOpen] = useState(true);
  const [view, setView] = useState<ViewRequest>({ fitKey: 0 });
  const graphRef = useRef<RdfGraphHandle>(null);

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
  const neighbors = useMemo(() => (graph ? indexNeighbors(graph) : new Map()), [graph]);
  const typeGroups = useMemo(() => (graph ? groupByType(graph) : []), [graph]);
  const shown = useMemo(() => (graph ? visibleGraph(graph, focus) : null), [graph, focus]);

  // An edit can remove everything that was in focus; fall back to the whole graph rather than nothing.
  const focusLost = focus !== null && shown !== null && shown.resources.length === 0;
  const activeFocus = focusLost ? null : focus;
  const shownGraph = focusLost ? graph : shown;
  const tooLarge = shownGraph !== null && shownGraph.resources.length > MAX_DRAWN_NODES;
  const activeSelection = selection && shownGraph && selectionExists(shownGraph, selection) ? selection : null;

  // A different set of things on screen altogether, so it is fitted rather than lined up with the last.
  const refit = () => setView((previous) => ({ fitKey: previous.fitKey + 1 }));

  const clearView = () => {
    refit();
    setFocus(null);
    setSelection(null);
  };

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

  const nodeCount = shownGraph?.resources.length.toLocaleString('en');
  const emptyMessage = tooLarge
    ? `${activeFocus ? `This view has ${nodeCount} nodes,` : `${nodeCount} nodes are`} too many to draw at once ` +
      `(the limit is ${MAX_DRAWN_NODES}). Search on the left and click a node to draw its neighbourhood` +
      (source === 'sparql' ? ', or narrow the query.' : '.')
    : source === 'turtle'
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

  const reset = () => {
    if (activeFocus) refit();
    setFocus(null);
    setSelection(null);
  };

  const openResource = (id: string) => {
    setSelection({ kind: 'resource', id });
    // A view too large to draw is replaced by the neighbourhood rather than grown.
    const base = tooLarge ? null : activeFocus;
    const next = expand(base, id, neighbors);
    if (next !== activeFocus) {
      // Stays where it was clicked, at the same zoom; out of the whole graph, close enough to read.
      setView((previous) => ({ fitKey: previous.fitKey, anchorId: id, readable: !base }));
      setFocus(next);
    } else {
      // Nothing new to show, so no re-layout will bring it into view.
      graphRef.current?.focus(id);
    }
  };

  const closeResource = (id: string) => {
    const next = close(activeFocus, id);
    if (next) {
      const anchorId = selection?.kind === 'resource' && selection.id !== id ? selection.id : undefined;
      setView((previous) => ({ fitKey: previous.fitKey, anchorId }));
    } else {
      refit();
    }
    setFocus(next);
    if (selection?.id === id) setSelection(null);
  };

  const filterType = (key: string, additive: boolean) => {
    const current = activeFocus?.types ?? [];
    const types = additive
      ? current.includes(key)
        ? current.filter((type) => type !== key)
        : [...current, key]
      : current.length === 1 && current[0] === key
        ? [] // Clicking the only active type again turns the filter off.
        : [key];
    refit();
    setFocus(filterByTypes(types, typeGroups));
    setSelection(null);
  };

  const navigate = (next: NonNullable<Selection>) => {
    if (next.kind === 'resource') {
      openResource(next.id);
      return;
    }
    setSelection(next);
    const link = graph?.links.find((candidate) => candidate.id === next.id);
    if (activeFocus && link && !(activeFocus.visible.has(link.source) && activeFocus.visible.has(link.target))) {
      setView((previous) => ({ fitKey: previous.fitKey, anchorId: selection?.id }));
      setFocus({ ...activeFocus, visible: new Set([...activeFocus.visible, link.source, link.target]) });
    } else {
      graphRef.current?.focus(next.id);
    }
  };

  // The key listener is bound once, so it reaches the current `reset` through a ref.
  const resetRef = useRef(reset);
  useEffect(() => {
    resetRef.current = reset;
  });

  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      const target = event.target as HTMLElement;
      if (target.closest('textarea, input')) return;
      resetRef.current();
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
                onEditorKeyDown={insertTab}
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

        <section className="viewer" aria-label="Graph">
          <div className="toolbar">
            <button type="button" onClick={reset} disabled={!activeFocus}>
              ⟲ Whole graph
            </button>
            {graph && shownGraph && (
              <span className="toolbar__summary">
                {activeFocus
                  ? `Showing ${shownGraph.resources.length} of ${graph.resources.length} nodes`
                  : `${graph.resources.length} nodes`}
              </span>
            )}
            {error && graph && <span className="toolbar__stale">Showing last valid graph</span>}
            <label className="toggle">
              <input type="checkbox" checked={typesAsLinks} onChange={(e) => setTypesAsLinks(e.target.checked)} />
              Draw <code>rdf:type</code> as links
            </label>
          </div>
          <div className="viewer__body">
            <TypeNav
              groups={typeGroups}
              typeColors={graph?.typeColors ?? {}}
              activeTypes={activeFocus?.types ?? []}
              selectedId={activeSelection?.kind === 'resource' ? activeSelection.id : undefined}
              onFilterType={filterType}
              onOpenResource={openResource}
            />
            <div className="viewer__stage">
              {shownGraph && shownGraph.resources.length > 0 && !tooLarge ? (
                <RdfGraph
                  ref={graphRef}
                  graph={shownGraph}
                  selection={activeSelection}
                  onSelect={setSelection}
                  onOpenResource={openResource}
                  onCloseResource={activeFocus ? closeResource : undefined}
                  onReset={reset}
                  hiddenNeighbors={(id) => hiddenNeighborCount(id, activeFocus, neighbors)}
                  view={view}
                />
              ) : (
                <div className="empty">{emptyMessage}</div>
              )}
              {shownGraph && activeSelection && (
                <DetailsPanel
                  // The whole graph, so links to resources that are off screen are listed too.
                  graph={graph!}
                  selection={activeSelection}
                  onNavigate={navigate}
                  onClose={() => setSelection(null)}
                />
              )}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

const SOURCE_NAMES: Record<Source, string> = { turtle: 'Turtle', sparql: 'SPARQL' };

function summarize(graph: RdfGraphModel): string {
  return `${graph.tripleCount} triples · ${graph.resources.length} nodes · ${graph.links.length} links`;
}

function selectionExists(graph: RdfGraphModel, selection: NonNullable<Selection>): boolean {
  return selection.kind === 'resource'
    ? graph.resources.some((resource) => resource.id === selection.id)
    : graph.links.some((link) => link.id === selection.id);
}

/** Tab indents instead of leaving the editor, as it would in any code editor. */
function insertTab(event: KeyboardEvent<HTMLTextAreaElement>) {
  if (event.key !== 'Tab' || event.shiftKey || event.metaKey || event.ctrlKey || event.altKey) return;
  event.preventDefault();
  // execCommand keeps the edit on the browser's undo stack, which setting the value would not.
  document.execCommand('insertText', false, '    ');
}
