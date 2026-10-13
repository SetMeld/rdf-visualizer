'use client';

import { useEffect, useRef } from 'react';
import cytoscape, { type Core, type LayoutOptions, type ElementDefinition } from 'cytoscape';
import dagre from 'cytoscape-dagre';
import type { GlobalSchemaModel, GlobalSchemaNodeShape, GlobalSchemaPropertyShape } from './types';
import styles from './GlobalSchemaGraph.module.css';
import { extractDatasourceIds, generateStripeGradient } from './utils';
import { generateNodeHTML, createNodeTooltipData } from './GsgNode';
import { createEdgeTooltipData } from './GsgNamedNodeProperty';
import { generatePopupHTML, createTooltipContent } from './GsgPopup';

declare module 'cytoscape' {
  interface Core {
    nodeHtmlLabel(options: unknown[]): void;
  }
}

cytoscape.use(dagre);

const BASE_LAYOUT: LayoutOptions = {
  name: 'dagre',
};

/** Life size. A schema too small to fill the pane is shown small rather than magnified. */
const MAX_ZOOM_ON_FIT = 1;

/** How wide a box is drawn, and how wide the popup's own markup is. */
const NODE_WIDTH = 250;
const POPUP_WIDTH = 400;

/**
 * How far to the right of what it describes a popup opens.
 *
 * Half of each, plus a gap: a popup placed by a fixed nudge lands on top of the box whose contents
 * it is explaining, which is exactly when a person needs to see both.
 */
const POPUP_OFFSET_X = NODE_WIDTH / 2 + POPUP_WIDTH / 2 + 24;

/**
 * Which side of a thing its popup opens on.
 *
 * Whichever side has room. Always opening rightwards puts the popup off the edge of the pane for
 * anything in the right-hand half of it, which is how a box near the edge got a panel whose values
 * were all cut off.
 */
function popupSideFor(cy: Core, modelX: number): 1 | -1 {
  const renderedX = modelX * cy.zoom() + cy.pan().x;
  return renderedX > cy.width() / 2 ? -1 : 1;
}

type CytoscapeStyleParam = Parameters<typeof cytoscape>[0] extends { style?: infer S } ? S : never;

const BASE_STYLES: Array<Record<string, unknown>> = [
  {
    selector: 'node[!tooltip]',
    style: {
      'background-opacity': 0,
      'border-opacity': 0,
      'shape': 'roundrectangle',
      'width': 250,
      'height': 'data(nodeHeight)',
    },
  },
  {
    selector: 'node[tooltip]',
    style: {
      'background-color': '#27272a',
      'border-color': '#ffffff',
      'border-width': 2,
      'shape': 'roundrectangle',
      'width': POPUP_WIDTH,
      'height': 'data(tooltipHeight)',
      'z-index': 999,
    },
  },
  {
    selector: 'edge',
    style: {
      'width': 3,
      'curve-style': 'bezier',
      // The edge's own colour, not white: an arrowhead the colour of the page is drawn and
      // invisible, and a relationship without a visible arrow does not say which way it points.
      // Selecting one used to be the only way to see the direction, since :selected recolours it.
      'target-arrow-color': (ele: cytoscape.EdgeSingular) => ele.data('arrowColor'),
      'target-arrow-shape': 'triangle',
      'label': 'data(label)',
      'text-rotation': 'autorotate',
      'font-size': 12,
      'color': '#ffffff',
      'text-outline-width': 2,
      'text-outline-color': '#000000',
      'line-fill': 'linear-gradient',
      'line-gradient-stop-colors': (ele: cytoscape.EdgeSingular) => ele.data('gradientColors'),
      'line-gradient-stop-positions': (ele: cytoscape.EdgeSingular) => ele.data('gradientPositions'),
    },
  },
  // Never a tooltip: a popup is drawn as a node so that it moves with the graph, which also made
  // it selectable — clicking the thing you just opened turned it salmon.
  {
    selector: 'node[!tooltip]:selected, edge:selected',
    style: {
      'background-color': '#ff6b6b',
      'line-color': '#ff6b6b',
      'target-arrow-color': '#ff6b6b',
      'source-arrow-color': '#ff6b6b',
    },
  },
];

let nodeHtmlLabelRegistered = false;

async function ensureNodeHtmlLabelRegistered() {
  if (nodeHtmlLabelRegistered || typeof window === 'undefined') {
    return;
  }
  // @ts-expect-error - package lacks types
  const nodeHtmlLabelModule = await import('cytoscape-node-html-label');
  const register = (nodeHtmlLabelModule as { default?: (cy: typeof cytoscape) => void }).default;
  if (register) {
    register(cytoscape);
    nodeHtmlLabelRegistered = true;
  }
}

interface GlobalSchemaGraphProps {
  schema: GlobalSchemaModel;
  getDatasourceColor?: (datasourceId: string) => string;
}

const DEFAULT_COLORS = ['#3b82f6', '#22c55e', '#8b5cf6', '#f59e0b', '#ec4899', '#06b6d4'];

function fallbackDatasourceColor(datasourceId: string) {
  let hash = 0;
  for (let i = 0; i < datasourceId.length; i += 1) {
    hash = (hash * 31 + datasourceId.charCodeAt(i)) >>> 0;
  }
  return DEFAULT_COLORS[hash % DEFAULT_COLORS.length];
}

export default function GlobalSchemaGraph({
  schema,
  getDatasourceColor = fallbackDatasourceColor,
}: GlobalSchemaGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    if (container) {
      container.style.visibility = 'hidden';
      container.style.opacity = '0';
    }

    let cy: Core | null = null;
    let cleanupInteractions: (() => void) | null = null;
    let cleanupZoom: (() => void) | null = null;
    // Whether a later run of this effect has replaced this one. Resuming after cleanup would build
    // a second graph in the container that nothing holds a reference to, and so nothing destroys.
    let superseded = false;

    const init = async () => {
      await ensureNodeHtmlLabelRegistered();
      if (superseded) return;

      const elements = buildGraphElements(schema, getDatasourceColor);
      cy = cytoscape({
        container,
        elements,
        // Cast to accommodate Cytoscape's broader runtime style support.
        style: BASE_STYLES as CytoscapeStyleParam,
        layout: { name: 'preset' },
        wheelSensitivity: 0.2,
      });

      applyNodeHtmlLabels(cy, getDatasourceColor);

      requestAnimationFrame(() => {
        if (!cy || cy.destroyed()) return;
        measureNodeHeights(cy);
        runLayout(cy, () => {
          if (container) {
            container.style.visibility = 'visible';
            container.style.opacity = '1';
          }
        });
      });

      cleanupInteractions = setupInteractions(cy, container, schema, getDatasourceColor);
      cleanupZoom = createZoomControls(container, cy);
    };

    init();

    return () => {
      superseded = true;
      cleanupInteractions?.();
      cleanupZoom?.();
      if (cy && !cy.destroyed()) {
        cy.destroy();
      }
      if (container) {
        container.style.visibility = '';
        container.style.opacity = '';
      }
      cy = null;
    };
  }, [schema, getDatasourceColor]);

  return (
    <div className={styles.graphContainer}>
      <div ref={containerRef} className={styles.cytoscapeContainer} />
    </div>
  );
}

function buildGraphElements(
  schema: GlobalSchemaModel,
  getColor: (datasourceId: string) => string
) {
  const nodeShapes = schema.nodeShapes ?? [];
  const propertyShapes = schema.propertyShapes ?? [];

  const propertyIdToSource = new Map<string, string>();
  nodeShapes.forEach((nodeShape) => {
    const nodeId = getNodeId(nodeShape);
    nodeShape.property?.forEach((propRef) => {
      if (propRef['@id']) {
        propertyIdToSource.set(propRef['@id'], nodeId);
      }
    });
  });

  const literalPropertiesById = new Map<string, GlobalSchemaPropertyShape>();
  propertyShapes.forEach((property) => {
    if (isLiteralProperty(property) && property['@id']) {
      literalPropertiesById.set(property['@id'], property);
    }
  });

  const nodes = nodeShapes.map((nodeShape) => {
    const nodeId = getNodeId(nodeShape);
    const literalPropertyShapes =
      nodeShape.property
        ?.map((propRef) => (propRef['@id'] ? literalPropertiesById.get(propRef['@id']) : undefined))
        .filter((prop): prop is GlobalSchemaPropertyShape => Boolean(prop)) ?? [];

    return {
      group: 'nodes' as const,
      data: {
        id: nodeId,
        label: getNodeLabel(nodeShape),
        nodeShape,
        literalPropertyShapes,
        nodeHeight: 100,
      },
    };
  });

  const edges = propertyShapes
    .filter(isEntityProperty)
    .map((propertyShape) => {
      const propertyId = propertyShape['@id'];
      const source = propertyId ? propertyIdToSource.get(propertyId) : undefined;
      const target = propertyShape.node?.['@id'];
      if (!propertyId || !source || !target) {
        return null;
      }

      const datasourceIds = extractDatasourceIds(propertyShape.datasourceRepresentations);
      const colors = datasourceIds.length > 0
        ? datasourceIds.map((id) => getColor(id))
        : ['#6b7280'];
      const gradient = generateStripeGradient(colors, 4);
      const gradientColors = gradient.colors || `${colors[0]} ${colors[0]}`;
      const gradientPositions = gradient.positions || '0% 100%';

      return {
        group: 'edges' as const,
        data: {
          id: propertyId,
          source,
          target,
          label: getEdgeLabel(propertyShape),
          propertyShape,
          gradientColors,
          gradientPositions,
          // A line may be striped across several datasources; an arrowhead cannot be, so it takes
          // the first of them. One colour that belongs to the edge beats one that belongs to nothing.
          arrowColor: colors[0],
        },
      };
    })
    .filter((edge): edge is NonNullable<typeof edge> => Boolean(edge));

  return [...nodes, ...edges] as ElementDefinition[];
}

function applyNodeHtmlLabels(cy: Core, getColor: (id: string) => string) {
  cy.nodeHtmlLabel([
    {
      query: 'node[!tooltip]',
      halign: 'center',
      valign: 'center',
      halignBox: 'center',
      valignBox: 'center',
      tpl: (data: { nodeShape: GlobalSchemaNodeShape; literalPropertyShapes: GlobalSchemaPropertyShape[] }) =>
        generateNodeHTML({
          nodeShape: data.nodeShape,
          literalPropertyShapes: data.literalPropertyShapes,
          getColor,
        }),
    },
    {
      query: 'node[tooltip]',
      halign: 'center',
      valign: 'center',
      halignBox: 'center',
      valignBox: 'center',
      tpl: (data: { tooltipType: string; tooltipTitle?: string; tooltipData: [string, unknown][] }) =>
        generatePopupHTML({
          type: data.tooltipType as 'node' | 'property',
          data: data.tooltipData || [],
          title: data.tooltipTitle,
        }),
    },
  ]);
}

function measureNodeHeights(cy: Core) {
  cy.nodes('[!tooltip]').forEach((node) => {
    const labelElement = getLabelElementByNodeId(node.id());
    if (labelElement) {
      node.style('height', labelElement.offsetHeight);
    }
  });
}

function runLayout(cy: Core, onComplete?: () => void) {
  const layout = cy.layout({
    ...BASE_LAYOUT,
    rankDir: 'LR',
    nodeSep: 120,
    rankSep: 180,
    padding: 50,
    fit: false,
    animate: false,
  } as unknown as LayoutOptions);

  const handleLayoutStop = () => {
    cy.off('layoutstop', handleLayoutStop);
    cy.fit();
    // Fitting alone would blow a schema with one entity up to fill the pane, which reads as a
    // rendering fault rather than as a small schema. Nothing is ever drawn larger than life size.
    if (cy.zoom() > MAX_ZOOM_ON_FIT) {
      cy.zoom(MAX_ZOOM_ON_FIT);
      cy.center();
    }
    onComplete?.();
  };

  cy.on('layoutstop', handleLayoutStop);
  layout.run();
}

function setupInteractions(
  cy: Core,
  container: HTMLDivElement,
  schema: GlobalSchemaModel,
  getColor: (datasourceId: string) => string
) {
  const removeTooltipNodes = () => {
    if (!cy.destroyed()) {
      cy.nodes('[tooltip]').remove();
    }
  };

  const createTooltipNode = (
    data: Record<string, unknown> | GlobalSchemaNodeShape | GlobalSchemaPropertyShape,
    position: { x: number; y: number },
    tooltipType: 'node' | 'property'
  ) => {
    if (cy.destroyed()) return;
    removeTooltipNodes();

    let tooltipNodeData;
    if (tooltipType === 'node' && '@id' in data && 'datasourceRepresentations' in data) {
      tooltipNodeData = createNodeTooltipData(data as GlobalSchemaNodeShape, position);
    } else if (tooltipType === 'property' && '@id' in data && 'datasourceRepresentations' in data) {
      tooltipNodeData = createEdgeTooltipData(data as GlobalSchemaPropertyShape, position);
    } else {
      const tooltipContent = createTooltipContent(
        data as GlobalSchemaNodeShape | GlobalSchemaPropertyShape | Record<string, unknown>
      );
      const estimatedHeight = Math.max(200, 40 + tooltipContent.length * 18 + 24);
      tooltipNodeData = {
        id: `tooltip-${Date.now()}`,
        tooltip: 'true',
        tooltipType,
        tooltipTitle: tooltipType === 'node' ? 'Entity' : 'Property',
        tooltipData: tooltipContent,
        tooltipHeight: estimatedHeight,
        position,
      };
    }

    cy.add({
      group: 'nodes',
      data: tooltipNodeData,
      position: tooltipNodeData.position,
      // Neither selectable nor draggable: it is a panel that happens to be drawn as a node, and
      // both of those are how a node behaves rather than how a panel should.
      selectable: false,
      grabbable: false,
    });

    applyNodeHtmlLabels(cy, getColor);
  };

  const handleEdgeTap = (evt: cytoscape.EventObject) => {
    evt.preventDefault();
    evt.stopPropagation();
    const propertyShape = (evt.target as cytoscape.EdgeSingular).data('propertyShape') as GlobalSchemaPropertyShape | undefined;
    if (!propertyShape) return;
    const midpoint = (evt.target as cytoscape.EdgeSingular).midpoint();
    createTooltipNode(
      propertyShape,
      { x: midpoint.x + popupSideFor(cy, midpoint.x) * POPUP_OFFSET_X, y: midpoint.y },
      'property'
    );
  };

  const handleBackgroundTap = (evt: cytoscape.EventObject) => {
    if (evt.target === cy) {
      removeTooltipNodes();
    }
  };

  cy.on('tap', 'edge', handleEdgeTap);
  cy.on('tap', handleBackgroundTap);

  const mouseDownHandler = (event: Event) => {
    const target = event.target as HTMLElement;
    if (target.closest('.info-btn')) {
      event.stopPropagation();
      event.preventDefault();
    }
  };

  const clickHandler = (event: Event) => {
    const target = event.target as HTMLElement;
    const button = target.closest('.info-btn');
    if (!button) return;

    event.stopPropagation();
    event.preventDefault();

    const nodeId = button.getAttribute('data-node-id');
    if (!nodeId) return;

    const node = cy.getElementById(nodeId);
    if (!node || node.empty()) return;

    if (button.classList.contains('entity-info-btn')) {
      const nodeShape = schema.nodeShapes?.find((shape) => (shape['@id'] || '') === nodeId);
      if (!nodeShape) return;
      const position = node.position();
      createTooltipNode(
        nodeShape,
        { x: position.x + popupSideFor(cy, position.x) * POPUP_OFFSET_X, y: position.y + 20 },
        'node'
      );
      return;
    }

    if (button.classList.contains('literal-info-btn')) {
      const literalIndex = Number(button.getAttribute('data-literal-idx'));
      const literalPropertyShapes = node.data('literalPropertyShapes') as GlobalSchemaPropertyShape[] | undefined;
      const propertyShape = literalPropertyShapes?.[literalIndex];
      if (!propertyShape) return;
      const position = node.position();
      createTooltipNode(
        propertyShape,
        {
          x: position.x + popupSideFor(cy, position.x) * POPUP_OFFSET_X,
          y: position.y + 20 + literalIndex * 24,
        },
        'property'
      );
    }
  };

  container.addEventListener('mousedown', mouseDownHandler, true);
  container.addEventListener('click', clickHandler, true);

  return () => {
    cy.off('tap', 'edge', handleEdgeTap);
    cy.off('tap', handleBackgroundTap);
    container.removeEventListener('mousedown', mouseDownHandler, true);
    container.removeEventListener('click', clickHandler, true);
    removeTooltipNodes();
  };
}

function createZoomControls(container: HTMLDivElement, cy: Core) {
  const zoomIn = document.createElement('button');
  zoomIn.textContent = '+';
  zoomIn.className = styles.zoomButton;
  zoomIn.style.top = '10px';
  zoomIn.style.right = '10px';
  zoomIn.onclick = () => cy.zoom(cy.zoom() * 1.2);

  const zoomOut = document.createElement('button');
  zoomOut.textContent = '-';
  zoomOut.className = styles.zoomButton;
  zoomOut.style.top = '40px';
  zoomOut.style.right = '10px';
  zoomOut.onclick = () => cy.zoom(cy.zoom() * 0.8);

  const resetZoom = document.createElement('button');
  resetZoom.textContent = '⌂';
  resetZoom.className = styles.zoomButton;
  resetZoom.style.top = '70px';
  resetZoom.style.right = '10px';
  resetZoom.onclick = () => cy.fit();

  container.appendChild(zoomIn);
  container.appendChild(zoomOut);
  container.appendChild(resetZoom);

  return () => {
    if (zoomIn.parentNode) zoomIn.parentNode.removeChild(zoomIn);
    if (zoomOut.parentNode) zoomOut.parentNode.removeChild(zoomOut);
    if (resetZoom.parentNode) resetZoom.parentNode.removeChild(resetZoom);
  };
}

function getNodeId(nodeShape: GlobalSchemaNodeShape): string {
  return nodeShape['@id'] ?? `node-${Math.random().toString(36).slice(2)}`;
}

function getNodeLabel(nodeShape: GlobalSchemaNodeShape): string {
  return (
    nodeShape.datasourceRepresentations?.[0]?.primaryLabel?.[0] ||
    nodeShape['@id'] ||
    'Node'
  );
}

function isLiteralProperty(propertyShape: GlobalSchemaPropertyShape): boolean {
  return Boolean(propertyShape.datatype && !propertyShape.node);
}

function isEntityProperty(propertyShape: GlobalSchemaPropertyShape): boolean {
  return Boolean(propertyShape.node && propertyShape.node['@id']);
}

function getEdgeLabel(propertyShape: GlobalSchemaPropertyShape): string {
  const name = propertyShape.datasourceRepresentations?.[0]?.primaryLabel?.[0] ?? '';
  const min = propertyShape.minCount ?? 0;
  const max = propertyShape.maxCount === null ? '∞' : propertyShape.maxCount ?? '∞';
  const cardinality = `[${min}-${max}]`;
  return name ? `${name} ${cardinality}` : cardinality;
}

function getLabelElementByNodeId(nodeId: string): HTMLElement | null {
  if (typeof document === 'undefined') {
    return null;
  }
  const escapeSelector = (value: string) => {
    if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
      return CSS.escape(value);
    }
    return value.replace(/([\\:.[\],#])/g, '\\$1');
  };
  return document.querySelector<HTMLElement>(`.custom-node-label[data-node-id="${escapeSelector(nodeId)}"]`);
}

