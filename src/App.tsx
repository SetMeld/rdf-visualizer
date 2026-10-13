import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { DetailsPanel } from './DetailsPanel';
import { EXAMPLE_TURTLE } from './example';
import { RdfGraph, type RdfGraphHandle, type Selection, type ViewRequest } from './graph/RdfGraph';
import { parseTurtle, type RdfGraph as RdfGraphModel } from './rdf/buildGraph';
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
import { TypeNav } from './TypeNav';
import './App.css';

const STORAGE_KEY = 'rdf-visualizer:turtle';
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

function loadText(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? EXAMPLE_TURTLE;
  } catch {
    return EXAMPLE_TURTLE;
  }
}

export default function App() {
  const [text, setText] = useState(loadText);
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

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, text);
    } catch {
      // Storage is a convenience; without it the text just isn't remembered.
    }
  }, [text]);

  const { graph, error } = parsed;
  const neighbors = useMemo(() => (graph ? indexNeighbors(graph) : new Map()), [graph]);
  const typeGroups = useMemo(() => (graph ? groupByType(graph) : []), [graph]);
  const shown = useMemo(() => (graph ? visibleGraph(graph, focus) : null), [graph, focus]);

  // An edit can remove everything that was in focus; fall back to the whole graph rather than nothing.
  const focusLost = focus !== null && shown !== null && shown.resources.length === 0;
  const activeFocus = focusLost ? null : focus;
  const shownGraph = focusLost ? graph : shown;
  const activeSelection = selection && shownGraph && selectionExists(shownGraph, selection) ? selection : null;

  // A different set of things on screen altogether, so it is fitted rather than lined up with the last.
  const refit = () => setView((previous) => ({ fitKey: previous.fitKey + 1 }));

  const reset = () => {
    if (activeFocus) refit();
    setFocus(null);
    setSelection(null);
  };

  const openResource = (id: string) => {
    setSelection({ kind: 'resource', id });
    const next = expand(activeFocus, id, neighbors);
    if (next !== activeFocus) {
      // Stays where it was clicked, at the same zoom; out of the whole graph, close enough to read.
      setView((previous) => ({ fitKey: previous.fitKey, anchorId: id, readable: !activeFocus }));
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
    setFocus(filterByTypes(types, typeGroups, neighbors));
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
          <section className="editor" aria-label="Turtle input">
            <div className="toolbar">
              <span className="toolbar__title">Turtle</span>
              <button type="button" onClick={() => setText(EXAMPLE_TURTLE)}>
                Example
              </button>
              <button type="button" onClick={() => setText('')}>
                Clear
              </button>
              <button type="button" onClick={() => setEditorOpen(false)} title="Hide editor" aria-label="Hide editor">
                ‹
              </button>
            </div>
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
              {error
                ? error
                : graph
                  ? `${graph.tripleCount} triples · ${graph.resources.length} nodes · ${graph.links.length} links`
                  : ''}
            </div>
          </section>
        ) : (
          <button type="button" className="editor-rail" onClick={() => setEditorOpen(true)} aria-label="Show editor">
            <span>Turtle ›</span>
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
              {shownGraph && shownGraph.resources.length > 0 ? (
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
                <div className="empty">{error ? 'Fix the error to see the graph.' : 'Nothing to show yet.'}</div>
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
