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

/** The gap between cards packed into a grid, and between groups packed into rows. */
const GRID_GAP = 40;
/** The width to height of the packed groups and grid, about a screen's. */
const ASPECT = 1.6;

type LayoutNode = LayoutInput['nodes'][number];
type Box = { left: number; top: number; right: number; bottom: number };

/**
 * Model positions for every node, computed without a DOM so it can run in a worker. A layered
 * layout lays out each separate linked group on its own and packs the groups into rows, with the
 * nodes that have no links in a grid below them: dagre stacks both in one column, too tall to fit.
 */
export function computeLayout(input: LayoutInput): Positions {
  if (input.algorithm !== 'layered') return place(input);
  const groups = linkedGroups(input);
  const linked = new Set(groups.flat().map((node) => node.id));
  const loose = input.nodes.filter((node) => !linked.has(node.id));
  if (groups.length <= 1 && loose.length < 2) return place(input);

  const positions: Positions = {};
  const laid = groups.map((nodes) => {
    const ids = new Set(nodes.map((node) => node.id));
    const placed = place({
      ...input,
      nodes,
      edges: input.edges.filter((edge) => ids.has(edge.source) && ids.has(edge.target)),
    });
    return { nodes, placed, box: boxOf(nodes, placed) };
  });
  // Rows about a screen's shape once packed.
  const area = laid.reduce((sum, { box }) => sum + (box.right - box.left + GRID_GAP) * (box.bottom - box.top + GRID_GAP), 0);
  const rowWidth = Math.max(Math.sqrt(area * ASPECT), ...laid.map(({ box }) => box.right - box.left));
  let x = 0;
  let y = 0;
  let rowHeight = 0;
  for (const { nodes, placed, box } of [...laid].sort((a, b) => b.box.bottom - b.box.top - (a.box.bottom - a.box.top))) {
    const width = box.right - box.left;
    if (x > 0 && x + width > rowWidth) {
      x = 0;
      y += rowHeight + GRID_GAP;
      rowHeight = 0;
    }
    for (const node of nodes) {
      positions[node.id] = { x: placed[node.id].x - box.left + x, y: placed[node.id].y - box.top + y };
    }
    x += width + GRID_GAP;
    rowHeight = Math.max(rowHeight, box.bottom - box.top);
  }

  if (loose.length > 0) {
    const top = laid.length === 0 ? 0 : y + rowHeight + GRID_GAP * 2;
    const cellWidth = Math.max(...loose.map((node) => node.width)) + GRID_GAP;
    const cellHeight = Math.max(...loose.map((node) => node.height)) + GRID_GAP;
    const columns = Math.max(1, Math.round(Math.sqrt((loose.length * cellHeight * ASPECT) / cellWidth)));
    loose.forEach((node, i) => {
      positions[node.id] = {
        x: (i % columns) * cellWidth + cellWidth / 2,
        y: top + Math.floor(i / columns) * cellHeight + cellHeight / 2,
      };
    });
  }
  return positions;
}

/** The nodes linked to one another, as separate groups; a link from a node to itself links nothing. */
function linkedGroups({ nodes, edges }: LayoutInput): LayoutNode[][] {
  const parent = new Map<string, string>();
  const root = (id: string): string => {
    let at = id;
    while (parent.get(at) !== at) at = parent.get(at)!;
    parent.set(id, at);
    return at;
  };
  const byId = new Map(nodes.map((node) => [node.id, node]));
  for (const edge of edges) {
    if (edge.source === edge.target || !byId.has(edge.source) || !byId.has(edge.target)) continue;
    if (!parent.has(edge.source)) parent.set(edge.source, edge.source);
    if (!parent.has(edge.target)) parent.set(edge.target, edge.target);
    parent.set(root(edge.source), root(edge.target));
  }
  const groups = new Map<string, LayoutNode[]>();
  for (const node of nodes) {
    if (!parent.has(node.id)) continue;
    const key = root(node.id);
    groups.set(key, [...(groups.get(key) ?? []), node]);
  }
  return [...groups.values()];
}

/** The box that the cards of some nodes cover, at the given positions. */
function boxOf(nodes: LayoutNode[], positions: Positions): Box {
  return {
    left: Math.min(...nodes.map((node) => positions[node.id].x - node.width / 2)),
    top: Math.min(...nodes.map((node) => positions[node.id].y - node.height / 2)),
    right: Math.max(...nodes.map((node) => positions[node.id].x + node.width / 2)),
    bottom: Math.max(...nodes.map((node) => positions[node.id].y + node.height / 2)),
  };
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
