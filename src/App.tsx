import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { DetailsPanel } from './DetailsPanel';
import { EXAMPLE_TURTLE } from './example';
import { RdfGraph, type RdfGraphHandle, type Selection } from './graph/RdfGraph';
import { parseTurtle, type RdfGraph as RdfGraphModel } from './rdf/buildGraph';
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
  const [selection, setSelection] = useState<Selection>(null);
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
  const activeSelection = selection && graph && selectionExists(graph, selection) ? selection : null;

  const navigate = (next: NonNullable<Selection>) => {
    setSelection(next);
    graphRef.current?.focus(next.id);
  };

  return (
    <div className="app">
      <header className="topbar">
        <h1>RDF Visualizer</h1>
        <span className="topbar__hint">Paste Turtle on the left to see it as a graph</span>
      </header>

      <main className="workspace">
        <section className="editor" aria-label="Turtle input">
          <div className="toolbar">
            <span className="toolbar__title">Turtle</span>
            <button type="button" onClick={() => setText(EXAMPLE_TURTLE)}>
              Example
            </button>
            <button type="button" onClick={() => setText('')}>
              Clear
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

        <section className="viewer" aria-label="Graph">
          <div className="toolbar">
            <label className="toggle">
              <input type="checkbox" checked={typesAsLinks} onChange={(e) => setTypesAsLinks(e.target.checked)} />
              Draw <code>rdf:type</code> as links
            </label>
            {error && graph && <span className="toolbar__stale">Showing last valid graph</span>}
          </div>
          <div className="viewer__stage">
            {graph && graph.resources.length > 0 ? (
              <RdfGraph ref={graphRef} graph={graph} selection={activeSelection} onSelect={setSelection} />
            ) : (
              <div className="empty">{error ? 'Fix the error to see the graph.' : 'Nothing to show yet.'}</div>
            )}
            {graph && activeSelection && (
              <DetailsPanel
                graph={graph}
                selection={activeSelection}
                onNavigate={navigate}
                onClose={() => setSelection(null)}
              />
            )}
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
