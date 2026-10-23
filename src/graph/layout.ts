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

/** Model positions for every node, computed without a DOM so it can run in a worker. */
export function computeLayout({ nodes, edges, algorithm }: LayoutInput): Positions {
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
