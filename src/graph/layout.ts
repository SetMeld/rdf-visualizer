// An app compiling this package from source sees the declaration only through this reference.
// oxlint-disable-next-line typescript/triple-slash-reference
/// <reference path="../types/cytoscape-fcose.d.ts" />
import cytoscape from 'cytoscape';
import dagre from 'cytoscape-dagre';
import fcose from 'cytoscape-fcose';

cytoscape.use(dagre);
cytoscape.use(fcose);

/** Below this many nodes the graph is laid out left to right; dagre's cost grows too fast past it. */
export const LAYERED_MAX = 500;
/** Above this, fcose's full-quality pass costs more than it improves the picture. */
const FORCE_DRAFT_FROM = 2000;

export type LayoutAlgorithm = 'layered' | 'force';

export type LayoutInput = {
  nodes: { id: string; width: number; height: number }[];
  edges: { id: string; source: string; target: string }[];
  algorithm: LayoutAlgorithm;
};

export type Positions = Record<string, { x: number; y: number }>;

export function layoutFor(nodeCount: number): LayoutAlgorithm {
  return nodeCount < LAYERED_MAX ? 'layered' : 'force';
}

/** The gap between cards packed into a grid. */
const GRID_GAP = 40;

/**
 * Model positions for every node, computed without a DOM so it can run in a worker. A layered
 * layout packs nodes with no links into a grid below the rest, since dagre stacks them in one
 * column too tall to fit on screen.
 */
export function computeLayout(input: LayoutInput): Positions {
  if (input.algorithm !== 'layered') return place(input);
  const linked = new Set<string>();
  for (const edge of input.edges) {
    if (edge.source === edge.target) continue;
    linked.add(edge.source);
    linked.add(edge.target);
  }
  const loose = input.nodes.filter((node) => !linked.has(node.id));
  if (loose.length < 2) return place(input);
  const positions = place({
    ...input,
    nodes: input.nodes.filter((node) => linked.has(node.id)),
    edges: input.edges.filter((edge) => linked.has(edge.source) && linked.has(edge.target)),
  });
  const placed = input.nodes.filter((node) => linked.has(node.id));
  const top = placed.length === 0 ? 0 : Math.max(...placed.map((node) => positions[node.id].y + node.height / 2)) + GRID_GAP * 2;
  const left = placed.length === 0 ? 0 : Math.min(...placed.map((node) => positions[node.id].x - node.width / 2));
  const cellWidth = Math.max(...loose.map((node) => node.width)) + GRID_GAP;
  const cellHeight = Math.max(...loose.map((node) => node.height)) + GRID_GAP;
  // Columns for a grid about as wide on screen as it is high.
  const columns = Math.max(1, Math.round(Math.sqrt((loose.length * cellHeight) / cellWidth)));
  loose.forEach((node, i) => {
    positions[node.id] = {
      x: left + (i % columns) * cellWidth + cellWidth / 2,
      y: top + Math.floor(i / columns) * cellHeight + cellHeight / 2,
    };
  });
  return positions;
}

/** Positions from the layout algorithm alone. */
function place({ nodes, edges, algorithm }: LayoutInput): Positions {
  const cy = cytoscape({
    headless: true,
    styleEnabled: true,
    elements: [
      ...nodes.map((data) => ({ group: 'nodes' as const, data })),
      ...edges.map((data) => ({ group: 'edges' as const, data })),
    ],
    style: [{ selector: 'node', style: { width: 'data(width)', height: 'data(height)' } }],
  });
  const options =
    algorithm === 'layered'
      ? { name: 'dagre', rankDir: 'LR', nodeSep: 50, rankSep: 140, edgeSep: 20, animate: false, fit: false }
      : {
          name: 'fcose',
          quality: nodes.length >= FORCE_DRAFT_FROM ? 'draft' : 'default',
          randomize: true,
          animate: false,
          fit: false,
          nodeSeparation: 80,
          idealEdgeLength: 220,
          nodeRepulsion: 9000,
        };
  cy.layout(options as cytoscape.LayoutOptions).run();
  const positions: Positions = {};
  cy.nodes().forEach((node) => {
    positions[node.id()] = { ...node.position() };
  });
  cy.destroy();
  return positions;
}
