import { useEffect, useImperativeHandle, useLayoutEffect, useRef, type Ref } from 'react';
import cytoscape, { type Core, type ElementDefinition, type NodeSingular } from 'cytoscape';
import dagre from 'cytoscape-dagre';
import type { RdfGraph as RdfGraphModel } from '../rdf/buildGraph';
import { colorFor } from '../rdf/terms';
import { CARD_WIDTH, ResourceCard } from './ResourceCard';
import './RdfGraph.css';

cytoscape.use(dagre);

/** Life size. A graph too small to fill the pane is shown small rather than magnified. */
const MAX_ZOOM_ON_FIT = 1;
const FIT_PADDING = 40;

export type Selection = { kind: 'resource' | 'link'; id: string } | null;

export type RdfGraphHandle = {
  /** Pan to a resource or link, e.g. when it is picked from the details panel. */
  focus(id: string): void;
};

type Props = {
  graph: RdfGraphModel;
  selection: Selection;
  onSelect: (selection: Selection) => void;
  ref?: Ref<RdfGraphHandle>;
};

/**
 * Cytoscape draws the edges and owns layout, panning, zooming and dragging; the cards are ordinary
 * React elements in a layer above the canvas, moved to match. The nodes Cytoscape knows about are
 * invisible boxes the size of their card, so edges meet the card's edge rather than its centre.
 */
export function RdfGraph({ graph, selection, onSelect, ref }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);
  const onSelectRef = useRef(onSelect);
  useEffect(() => {
    onSelectRef.current = onSelect;
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

    const cy = cytoscape({
      container,
      elements,
      style: graphStyle(container),
      layout: { name: 'preset' },
      minZoom: 0.05,
      maxZoom: 3,
      boxSelectionEnabled: false,
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

    cy.layout({
      name: 'dagre',
      rankDir: 'LR',
      nodeSep: 50,
      rankSep: 140,
      edgeSep: 20,
      fit: false,
      animate: false,
    } as cytoscape.LayoutOptions).run();
    fitView(cy);
    cy.nodes().forEach(syncNode);
    syncViewport();

    cy.on('viewport', syncViewport);
    cy.on('position', 'node', (event) => syncNode(event.target));
    cy.on('tap', 'node', (event) => onSelectRef.current({ kind: 'resource', id: event.target.id() }));
    cy.on('tap', 'edge', (event) => onSelectRef.current({ kind: 'link', id: event.target.id() }));
    cy.on('tap', (event) => {
      if (event.target === cy) onSelectRef.current(null);
    });
    cy.on('mouseover', 'node, edge', () => (container.style.cursor = 'pointer'));
    cy.on('mouseout', 'node, edge', () => (container.style.cursor = ''));

    // Edge colours are drawn on a canvas, out of reach of CSS, so they are re-read on a theme change.
    const colorScheme = window.matchMedia('(prefers-color-scheme: dark)');
    const restyle = () => cy.style(graphStyle(container));
    colorScheme.addEventListener('change', restyle);

    return () => {
      colorScheme.removeEventListener('change', restyle);
      cy.destroy();
      cyRef.current = null;
    };
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
    <div className="graph">
      <div ref={containerRef} className="graph__canvas" />
      <div ref={layerRef} className="graph__cards">
        {graph.resources.map((resource) => (
          <ResourceCard key={resource.id} resource={resource} selected={resource.id === selectedResource} />
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

function fitView(cy: Core) {
  cy.fit(undefined, FIT_PADDING);
  // Fitting alone would blow a one-node graph up to fill the pane.
  if (cy.zoom() > MAX_ZOOM_ON_FIT) {
    cy.zoom(MAX_ZOOM_ON_FIT);
    cy.center();
  }
}

function graphStyle(container: HTMLElement): cytoscape.StylesheetJson {
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
    { selector: 'edge.faded', style: { opacity: 0.2 } },
  ];
}
