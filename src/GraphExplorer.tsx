/** @jsxRuntime automatic */
/** @jsxImportSource react */
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
import { paintTypes, type ColorScheme } from './rdf/terms';
import { overviewTypeKey, summaryOverview, typeOverview, type TypeSummary } from './rdf/overview';
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
  /** Shown at the start of the toolbar, before Whole graph. */
  leading?: ReactNode;
  /** Shown in the toolbar after the node count. */
  notice?: ReactNode;
  /** The colors for types and links, most common type first; any CSS color. Default: the built-in palette. */
  palette?: readonly string[];
  /** The theme to draw in, overriding the OS setting that applies when this is unset. */
  colorScheme?: ColorScheme;
  typesAsLinks: boolean;
  onTypesAsLinksChange: (typesAsLinks: boolean) => void;
  /** Changed to return to the whole graph, fitted to the screen, as when a different graph is loaded. */
  resetKey?: unknown;
  createLayoutWorker?: CreateLayoutWorker;
  /** Counts to draw as the type overview in place of `graph`, for a graph too large to hand over whole. */
  summary?: TypeSummary | null;
  /** A type chosen from the summary's overview or type list. */
  onOpenType?: (type: string) => void;
  /** Called by Whole graph or Esc when nothing is focused, to leave what `graph` shows. */
  onLeave?: () => void;
};

/**
 * The graph pane: the type list, the graph and the details of what is selected, with the focus,
 * selection and view that clicking through them builds up. It reads nothing but the graph it is given.
 */
export function GraphExplorer({
  graph: given,
  emptyMessage: idleMessage,
  tooLargeHint = '.',
  leading,
  notice,
  palette,
  colorScheme,
  typesAsLinks,
  onTypesAsLinksChange,
  resetKey,
  createLayoutWorker,
  summary,
  onOpenType,
  onLeave,
}: GraphExplorerProps) {
  const [focus, setFocus] = useState<Focus>(null);
  const [selection, setSelection] = useState<Selection>(null);
  const [view, setView] = useState<ViewRequest>({ fitKey: 0 });
  const graphRef = useRef<RdfGraphHandle>(null);

  const graph = useMemo(
    () => (given && palette ? { ...given, typeColors: paintTypes(given.typeColors, palette) } : given),
    [given, palette],
  );
  const neighbors = useMemo(() => (graph ? indexNeighbors(graph) : new Map()), [graph]);
  const summaryGraph = useMemo(() => {
    const overview = summary ? summaryOverview(summary) : null;
    return overview && palette ? { ...overview, typeColors: paintTypes(overview.typeColors, palette) } : overview;
  }, [summary, palette]);
  const typeGroups = useMemo(
    () =>
      summaryGraph
        ? summaryGraph.resources.map((type) => ({ key: overviewTypeKey(type.id), type: type.types[0], members: [] }))
        : graph
          ? groupByType(graph)
          : [],
    [graph, summaryGraph],
  );
  const shown = useMemo(() => (graph ? visibleGraph(graph, focus) : null), [graph, focus]);

  // An edit can remove everything that was in focus; fall back to the whole graph rather than nothing.
  const focusLost = focus !== null && shown !== null && shown.resources.length === 0;
  const activeFocus = focusLost ? null : focus;
  const shownGraph = focusLost ? graph : shown;
  const tooLarge = shownGraph !== null && shownGraph.resources.length > MAX_DRAWN_NODES;
  // A whole graph too large to draw opens on its types instead.
  const showOverview = tooLarge && !activeFocus;
  const wholeOverview = useMemo(
    () => (showOverview && graph && !summaryGraph ? typeOverview(graph, typeGroups) : null),
    [showOverview, graph, typeGroups, summaryGraph],
  );
  const overview = summaryGraph ?? wholeOverview;
  const typeCounts = useMemo(
    () => summary && Object.fromEntries(summary.types.map((type) => [type.iri, type.members])),
    [summary],
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

  const summaryText = summaryGraph
    ? `${summaryGraph.resources.length} types · click a type to show its members`
    : graph && shownGraph
      ? overview
        ? `${graph.resources.length.toLocaleString('en')} nodes in ${overview.resources.length} types · click a type to show its members`
        : activeFocus
          ? `Showing ${shownGraph.resources.length} of ${graph.resources.length} nodes`
          : `${graph.resources.length} nodes`
      : '';

  const reset = () => {
    if (!activeFocus && onLeave) {
      onLeave();
      return;
    }
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
    <section className="viewer rdf-theme" aria-label="Graph" data-color-scheme={colorScheme}>
      <div className="toolbar">
        {leading}
        <button type="button" onClick={reset} disabled={!activeFocus && !onLeave}>
          ⟲ Whole graph
        </button>
        {summaryGraph && (
          <span className="toolbar__summary" title={summaryText}>
            {summaryText}
          </span>
        )}
        {!summaryGraph && graph && shownGraph && (
          <span className="toolbar__summary" title={summaryText}>
            {summaryText}
          </span>
        )}
        {notice && <div className="toolbar__notice">{notice}</div>}
        <label className="toggle">
          <input type="checkbox" checked={typesAsLinks} onChange={(e) => onTypesAsLinksChange(e.target.checked)} />
          Draw <code>rdf:type</code> as links
        </label>
      </div>
      <div className="viewer__body">
        <TypeNav
          groups={typeGroups}
          typeColors={graph?.typeColors ?? {}}
          activeTypes={summaryGraph ? [] : (activeFocus?.types ?? [])}
          counts={typeCounts ?? undefined}
          selectedId={activeSelection?.kind === 'resource' ? activeSelection.id : undefined}
          onFilterType={summaryGraph ? (key) => onOpenType?.(key) : filterType}
          onOpenResource={openResource}
        />
        <div className="viewer__stage">
          {overview ? (
            <RdfGraph
              key="overview"
              graph={overview}
              selection={null}
              onSelect={() => {}}
              onOpenResource={(id) =>
                summaryGraph ? onOpenType?.(overviewTypeKey(id)) : filterType(overviewTypeKey(id), false)
              }
              onReset={reset}
              hiddenNeighbors={() => 0}
              view={view}
              createLayoutWorker={createLayoutWorker}
              palette={palette}
              colorScheme={colorScheme}
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
              palette={palette}
              colorScheme={colorScheme}
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
