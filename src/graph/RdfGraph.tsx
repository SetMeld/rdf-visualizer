import { useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type Ref } from 'react';
import cytoscape, { type Core, type ElementDefinition, type NodeSingular } from 'cytoscape';
import type { RdfGraph as RdfGraphModel } from '../rdf/buildGraph';
import { colorFor } from '../rdf/terms';
import { layoutFor } from './layout';
import { layoutInWorker } from './layoutClient';
import { CARD_WIDTH, ResourceCard } from './ResourceCard';
import './RdfGraph.css';

/** Life size. A graph too small to fill the pane is shown small rather than magnified. */
const MAX_ZOOM_ON_FIT = 1;
const FIT_PADDING = 40;
/** The least zoom at which a card's text can still be read. */
const READABLE_ZOOM = 0.75;

export type Selection = { kind: 'resource' | 'link'; id: string } | null;

export type RdfGraphHandle = {
  /** Pan to a resource or link, e.g. when it is picked from the details panel. */
  focus(id: string): void;
};

type Props = {
  graph: RdfGraphModel;
  selection: Selection;
  /** An edge was clicked, or the background (`null`). */
  onSelect: (selection: Selection) => void;
  /** A card was clicked. */
  onOpenResource: (id: string) => void;
  /** Given in a focused view, where cards can be taken off screen again. */
  onCloseResource?: (id: string) => void;
  /** The background was double-clicked. */
  onReset: () => void;
  hiddenNeighbors: (id: string) => number;
  view: ViewRequest;
  ref?: Ref<RdfGraphHandle>;
};

/**
 * How the next graph should be placed on screen. By default it keeps the zoom of the last one, and
 * `anchorId` stays where it was on screen, so expanding or closing a card doesn't throw the view
 * somewhere else.
 */
export type ViewRequest = {
  /** Changed to ask for the next graph to be fitted to the screen instead. */
  fitKey: number;
  anchorId?: string;
  /** Zoom in around the anchor if the cards would be too small to read, as after the whole graph. */
  readable?: boolean;
};

/** Where the last graph was on screen, for the next one to line up with. */
type ViewSnapshot = {
  zoom: number;
  rendered: Map<string, { x: number; y: number }>;
  fitKey: number;
};

/**
 * Cytoscape draws the edges and owns layout, panning, zooming and dragging; the cards are ordinary
 * React elements in a layer above the canvas, moved to match. The nodes Cytoscape knows about are
 * invisible boxes the size of their card, so edges meet the card's edge rather than its centre.
 */
export function RdfGraph({
  graph,
  selection,
  onSelect,
  onOpenResource,
  onCloseResource,
  onReset,
  hiddenNeighbors,
  view,
  ref,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);
  const lastView = useRef<ViewSnapshot | null>(null);
  /** Hidden until the worker has placed every node, so nothing is drawn piled up at the origin. */
  const [layout, setLayout] = useState<{ pending: boolean; error?: string }>({ pending: true });
  const algorithm = layoutFor(graph.resources.length);
  // Read by Cytoscape's listeners, which are bound once per graph rather than once per render.
  const handlers = useRef({ onSelect, onOpenResource, onReset });
  useEffect(() => {
    handlers.current = { onSelect, onOpenResource, onReset };
  });

  useLayoutEffect(() => {
    const container = containerRef.current!;
    const layer = layerRef.current!;

    const cards = new Map<string, HTMLElement>();
    layer.querySelectorAll<HTMLElement>('[data-id]').forEach((card) => cards.set(card.dataset.id!, card));

    const elements: ElementDefinition[] = [
      ...graph.resources.map((resource) => ({
        group: 'nodes' as const,
        data: { id: resource.id, width: CARD_WIDTH, height: cards.get(resource.id)?.offsetHeight ?? 40 },
      })),
      ...graph.links.map((link) => ({
        group: 'edges' as const,
        data: {
          id: link.id,
          source: link.source,
          target: link.target,
          label: link.predicate.label,
          color: colorFor(link.predicate.iri),
        },
      })),
    ];

    const large = algorithm === 'force';
    const cy = cytoscape({
      container,
      elements,
      style: graphStyle(container, large),
      // Positions come from the worker; fitting now would measure every element for nothing.
      layout: { name: 'preset', fit: false },
      minZoom: 0.05,
      maxZoom: 3,
      boxSelectionEnabled: false,
      // Large graphs pan and zoom as a snapshot instead of redrawing every edge each frame.
      hideEdgesOnViewport: large,
      textureOnViewport: large,
      autounselectify: true,
    });
    cyRef.current = cy;

    const syncViewport = () => {
      const { x, y } = cy.pan();
      layer.style.transform = `translate(${x}px, ${y}px) scale(${cy.zoom()})`;
    };
    const syncNode = (node: NodeSingular) => {
      const card = cards.get(node.id());
      if (!card) return;
      const { x, y } = node.position();
      card.style.transform = `translate(${x - node.data('width') / 2}px, ${y - node.data('height') / 2}px)`;
    };

    let placed = false;
    setLayout({ pending: true });
    const job = layoutInWorker({
      nodes: cy.nodes().map((node) => ({ id: node.id(), width: node.data('width'), height: node.data('height') })),
      edges: graph.links.map(({ id, source, target }) => ({ id, source, target })),
      algorithm,
    });
    job.promise.then(
      (positions) => {
        cy.nodes().positions((node) => positions[(node as NodeSingular).id()]);
        const previous = lastView.current;
        if (!previous || previous.fitKey !== view.fitKey || !keepView(cy, previous, view)) fitView(cy);
        cy.nodes().forEach(syncNode);
        syncViewport();
        cy.on('position', 'node', (event) => syncNode(event.target));
        placed = true;
        setLayout({ pending: false });
      },
      (error: Error) => setLayout({ pending: false, error: error.message }),
    );

    cy.on('viewport', syncViewport);
    cy.on('tap', 'node', (event) => handlers.current.onOpenResource(event.target.id()));
    cy.on('tap', 'edge', (event) => handlers.current.onSelect({ kind: 'link', id: event.target.id() }));
    cy.on('tap', (event) => {
      if (event.target === cy) handlers.current.onSelect(null);
    });
    cy.on('dbltap', (event) => {
      if (event.target === cy) handlers.current.onReset();
    });
    cy.on('mouseover', 'node, edge', () => (container.style.cursor = 'pointer'));
    cy.on('mouseout', 'node, edge', () => (container.style.cursor = ''));

    // Edge colours are drawn on a canvas, out of reach of CSS, so they are re-read on a theme change.
    const colorScheme = window.matchMedia('(prefers-color-scheme: dark)');
    const restyle = () => cy.style(graphStyle(container, large));
    colorScheme.addEventListener('change', restyle);

    return () => {
      job.cancel();
      colorScheme.removeEventListener('change', restyle);
      // A graph replaced before it was placed has no view worth lining the next one up with.
      if (placed) {
        lastView.current = {
          zoom: cy.zoom(),
          rendered: new Map(cy.nodes().map((node) => [node.id(), { ...node.renderedPosition() }])),
          fitKey: view.fitKey,
        };
      }
      cy.destroy();
      cyRef.current = null;
    };
    // Only a new graph rebuilds the view; `view` is read as it stands when that happens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graph]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.edges().removeClass('active faded');
    if (!selection) return;
    const selected = cy.getElementById(selection.id);
    if (selected.empty()) return;
    const active = selected.isNode() ? selected.connectedEdges() : selected;
    active.addClass('active');
    cy.edges().not(active).addClass('faded');
  }, [selection, graph]);

  useImperativeHandle(ref, () => ({
    focus(id) {
      const cy = cyRef.current;
      const element = cy?.getElementById(id);
      if (!cy || !element || element.empty()) return;
      cy.animate({ center: { eles: element }, zoom: Math.max(cy.zoom(), 0.8) }, { duration: 300 });
    },
  }));

  const zoomBy = (factor: number) => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.zoom({ level: cy.zoom() * factor, renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 } });
  };

  const selectedResource = selection?.kind === 'resource' ? selection.id : undefined;

  return (
    <div
      className={`graph ${layout.pending ? 'graph--pending' : ''}`}
      data-layout={algorithm}
      data-pending={layout.pending}
    >
      {layout.pending && (
        <div className="graph__notice" role="status">
          Laying out {graph.resources.length.toLocaleString('en')} nodes…
        </div>
      )}
      {layout.error && (
        <div className="graph__notice graph__notice--error" role="alert">
          Could not lay out the graph: {layout.error}
        </div>
      )}
      <div ref={containerRef} className="graph__canvas" />
      <div ref={layerRef} className="graph__cards">
        {graph.resources.map((resource) => (
          <ResourceCard
            key={resource.id}
            resource={resource}
            typeColors={graph.typeColors}
            selected={resource.id === selectedResource}
            showTypes={!graph.typesAsLinks}
            hiddenNeighbors={hiddenNeighbors(resource.id)}
            onClose={onCloseResource && (() => onCloseResource(resource.id))}
          />
        ))}
      </div>
      <div className="graph__controls">
        <button type="button" onClick={() => zoomBy(1.25)} title="Zoom in" aria-label="Zoom in">
          +
        </button>
        <button type="button" onClick={() => zoomBy(0.8)} title="Zoom out" aria-label="Zoom out">
          −
        </button>
        <button
          type="button"
          onClick={() => cyRef.current && fitView(cyRef.current)}
          title="Fit to screen"
          aria-label="Fit to screen"
        >
          ⤢
        </button>
      </div>
    </div>
  );
}

/**
 * Keep the previous zoom and put a node that was on screen before back where it was: the anchor if
 * it is still there, otherwise any survivor. False when nothing carried over to line up with.
 */
function keepView(cy: Core, previous: ViewSnapshot, view: ViewRequest): boolean {
  const candidates = [view.anchorId, ...previous.rendered.keys()].filter(
    (id): id is string => id !== undefined && previous.rendered.has(id),
  );
  const anchor = candidates.map((id) => cy.getElementById(id)).find((node) => node.nonempty());
  if (!anchor) return false;
  const was = previous.rendered.get(anchor.id())!;
  const now = anchor.position();
  const zoom = view.readable ? Math.max(previous.zoom, READABLE_ZOOM) : previous.zoom;
  cy.zoom(zoom);
  cy.pan({ x: was.x - now.x * zoom, y: was.y - now.y * zoom });
  if (view.readable) nudgeIntoView(cy);
  return true;
}

/**
 * Pan by as little as it takes to get the whole graph on screen, where it fits at this zoom. A
 * neighbourhood opened near the edge of the screen otherwise hangs off it.
 */
function nudgeIntoView(cy: Core) {
  const box = cy.elements().renderedBoundingBox();
  const shift = (low: number, high: number, size: number) => {
    if (high - low > size - 2 * FIT_PADDING) return 0;
    if (low < FIT_PADDING) return FIT_PADDING - low;
    if (high > size - FIT_PADDING) return size - FIT_PADDING - high;
    return 0;
  };
  cy.panBy({ x: shift(box.x1, box.x2, cy.width()), y: shift(box.y1, box.y2, cy.height()) });
}

function fitView(cy: Core) {
  // Nodes alone: measuring every edge and label as well costs seconds on a large graph.
  cy.fit(cy.nodes(), FIT_PADDING);
  // Fitting alone would blow a one-node graph up to fill the pane.
  if (cy.zoom() > MAX_ZOOM_ON_FIT) {
    cy.zoom(MAX_ZOOM_ON_FIT);
    cy.center();
  }
}

/** `large` graphs get straight, unlabelled edges, labelled only once selected; curves and labels cost seconds there. */
function graphStyle(container: HTMLElement, large: boolean): cytoscape.StylesheetJson {
  const css = getComputedStyle(container);
  const token = (name: string) => css.getPropertyValue(name).trim();

  return [
    {
      selector: 'node',
      style: {
        shape: 'round-rectangle',
        width: 'data(width)',
        height: 'data(height)',
        'background-opacity': 0,
        'border-width': 0,
        'overlay-opacity': 0,
      },
    },
    {
      selector: 'edge',
      style: {
        width: 2,
        'curve-style': 'bezier',
        'control-point-step-size': 48,
        'line-color': 'data(color)',
        'target-arrow-color': 'data(color)',
        'target-arrow-shape': 'triangle',
        'arrow-scale': 1.2,
        label: 'data(label)',
        'font-size': 11,
        'font-family': token('--font-mono'),
        color: token('--edge-label'),
        'text-rotation': 'autorotate',
        'text-background-color': token('--edge-label-bg'),
        'text-background-opacity': 0.92,
        'text-background-padding': '3px',
        'text-background-shape': 'roundrectangle',
        'overlay-opacity': 0,
        'loop-direction': '-45deg',
        'loop-sweep': '-90deg',
      },
    },
    { selector: 'edge.active', style: { width: 3.5, 'z-index': 10, 'font-weight': 'bold' } },
    ...(large
      ? [
          { selector: 'edge', style: { 'curve-style': 'straight' as const, label: '', width: 1.5, 'arrow-scale': 0.8 } },
          { selector: 'edge.active', style: { label: 'data(label)', width: 3 } },
        ]
      : []),
    { selector: 'edge.faded', style: { opacity: 0.2 } },
  ];
}
