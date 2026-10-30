import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { DetailsPanel } from './DetailsPanel';
import { RdfGraph, type RdfGraphHandle, type Selection, type ViewRequest } from './graph/RdfGraph';
import type { CreateLayoutWorker } from './graph/layoutClient';
import type { RdfGraph as RdfGraphModel } from './rdf/buildGraph';
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
import { overviewTypeKey, typeOverview } from './rdf/overview';
import { TypeNav } from './TypeNav';

/** Past this, laying out and drawing a card per node takes longer than anyone will wait. */
export const MAX_DRAWN_NODES = 5000;

export type GraphExplorerProps = {
  /** The graph to explore. A new graph keeps the focus and selection wherever they still exist. */
  graph: RdfGraphModel | null;
  /** Shown in place of the graph when there is nothing to draw. */
  emptyMessage: string;
  /** Ends the message for a view too large to draw, after "click a node to draw its neighbourhood". */
  tooLargeHint?: string;
  /** Shown in the toolbar after the node count. */
  notice?: ReactNode;
  typesAsLinks: boolean;
  onTypesAsLinksChange: (typesAsLinks: boolean) => void;
  /** Changed to return to the whole graph, fitted to the screen, as when a different graph is loaded. */
  resetKey?: unknown;
  createLayoutWorker?: CreateLayoutWorker;
};

/**
 * The graph pane: the type list, the graph and the details of what is selected, with the focus,
 * selection and view that clicking through them builds up. It reads nothing but the graph it is given.
 */
export function GraphExplorer({
  graph,
  emptyMessage: idleMessage,
  tooLargeHint = '.',
  notice,
  typesAsLinks,
  onTypesAsLinksChange,
  resetKey,
  createLayoutWorker,
}: GraphExplorerProps) {
  const [focus, setFocus] = useState<Focus>(null);
  const [selection, setSelection] = useState<Selection>(null);
  const [view, setView] = useState<ViewRequest>({ fitKey: 0 });
  const graphRef = useRef<RdfGraphHandle>(null);

  const neighbors = useMemo(() => (graph ? indexNeighbors(graph) : new Map()), [graph]);
  const typeGroups = useMemo(() => (graph ? groupByType(graph) : []), [graph]);
  const shown = useMemo(() => (graph ? visibleGraph(graph, focus) : null), [graph, focus]);

  // An edit can remove everything that was in focus; fall back to the whole graph rather than nothing.
  const focusLost = focus !== null && shown !== null && shown.resources.length === 0;
  const activeFocus = focusLost ? null : focus;
  const shownGraph = focusLost ? graph : shown;
  const tooLarge = shownGraph !== null && shownGraph.resources.length > MAX_DRAWN_NODES;
  // A whole graph too large to draw opens on its types instead.
  const showOverview = tooLarge && !activeFocus;
  const overview = useMemo(
    () => (showOverview && graph ? typeOverview(graph, typeGroups) : null),
    [showOverview, graph, typeGroups],
  );
  const activeSelection = selection && shownGraph && selectionExists(shownGraph, selection) ? selection : null;

  // A different set of things on screen altogether, so it is fitted rather than lined up with the last.
  const refit = () => setView((previous) => ({ fitKey: previous.fitKey + 1 }));

  const lastResetKey = useRef(resetKey);
  useEffect(() => {
    if (Object.is(lastResetKey.current, resetKey)) return;
    lastResetKey.current = resetKey;
    refit();
    setFocus(null);
    setSelection(null);
  }, [resetKey]);

  const nodeCount = shownGraph?.resources.length.toLocaleString('en');
  const emptyMessage = tooLarge
    ? `${activeFocus ? `This view has ${nodeCount} nodes,` : `${nodeCount} nodes are`} too many to draw at once ` +
      `(the limit is ${MAX_DRAWN_NODES}). Search on the left and click a node to draw its neighbourhood` +
      tooLargeHint
    : idleMessage;

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

  // The key listener is bound once, so it reaches the current handler through a ref.
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
    <section className="viewer rdf-theme" aria-label="Graph">
      <div className="toolbar">
        <button type="button" onClick={reset} disabled={!activeFocus}>
          ⟲ Whole graph
        </button>
        {graph && shownGraph && (
          <span className="toolbar__summary">
            {overview
              ? `${graph.resources.length.toLocaleString('en')} nodes in ${overview.resources.length} types · click a type to show its members`
              : activeFocus
                ? `Showing ${shownGraph.resources.length} of ${graph.resources.length} nodes`
                : `${graph.resources.length} nodes`}
          </span>
        )}
        {notice}
        <label className="toggle">
          <input type="checkbox" checked={typesAsLinks} onChange={(e) => onTypesAsLinksChange(e.target.checked)} />
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
          {overview ? (
            <RdfGraph
              key="overview"
              graph={overview}
              selection={null}
              onSelect={() => {}}
              onOpenResource={(id) => filterType(overviewTypeKey(id), false)}
              onReset={reset}
              hiddenNeighbors={() => 0}
              view={view}
              createLayoutWorker={createLayoutWorker}
            />
          ) : shownGraph && shownGraph.resources.length > 0 && !tooLarge ? (
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
              createLayoutWorker={createLayoutWorker}
            />
          ) : (
            <div className="empty">{emptyMessage}</div>
          )}
          {shownGraph && activeSelection && !overview && (
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
  );
}

function selectionExists(graph: RdfGraphModel, selection: NonNullable<Selection>): boolean {
  return selection.kind === 'resource'
    ? graph.resources.some((resource) => resource.id === selection.id)
    : graph.links.some((link) => link.id === selection.id);
}
