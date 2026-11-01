import { describe, expect, it } from 'vitest';
import { computeLayout, LAYERED_MAX, layoutFor, type LayoutInput } from './layout';

function chain(n: number): LayoutInput {
  const nodes = Array.from({ length: n }, (_, i) => ({ id: `n${i}`, width: 260, height: 80 }));
  const edges = Array.from({ length: n - 1 }, (_, i) => ({ id: `e${i}`, source: `n${i}`, target: `n${i + 1}` }));
  return { nodes, edges, algorithm: layoutFor(n) };
}

describe('layoutFor', () => {
  it('lays out fewer than 500 nodes left to right, and more with a force-directed layout', () => {
    expect(LAYERED_MAX).toBe(500);
    expect(layoutFor(1)).toBe('layered');
    expect(layoutFor(499)).toBe('layered');
    expect(layoutFor(500)).toBe('force');
    expect(layoutFor(5000)).toBe('force');
  });
});

describe('computeLayout', () => {
  it('places every node, in rank order left to right when layered', () => {
    const positions = computeLayout(chain(5));
    expect(Object.keys(positions)).toHaveLength(5);
    const xs = [0, 1, 2, 3, 4].map((i) => positions[`n${i}`].x);
    expect(xs).toEqual([...xs].sort((a, b) => a - b));
  });

  it('places every node of a force-directed layout without stacking them', () => {
    const input = chain(600);
    const positions = computeLayout(input);
    expect(Object.keys(positions)).toHaveLength(600);
    const distinct = new Set(Object.values(positions).map(({ x, y }) => `${Math.round(x)},${Math.round(y)}`));
    expect(distinct.size).toBeGreaterThan(590);
  });

  it('packs nodes with no links into a grid beside the linked ones, not one tall column', () => {
    const linked = chain(3);
    const loose = Array.from({ length: 100 }, (_, i) => ({ id: `loose${i}`, width: 260, height: 80 }));
    const positions = computeLayout({ ...linked, nodes: [...linked.nodes, ...loose] });
    expect(Object.keys(positions)).toHaveLength(103);
    const box = (ids: string[]) => {
      const xs = ids.map((id) => positions[id].x), ys = ids.map((id) => positions[id].y);
      return { left: Math.min(...xs), right: Math.max(...xs), top: Math.min(...ys), bottom: Math.max(...ys) };
    };
    const grid = box(loose.map((node) => node.id));
    // A column of 100 cards is over 10,000 high; a grid of them is roughly as wide as it is high.
    expect(grid.bottom - grid.top).toBeLessThan(3 * (grid.right - grid.left));
    const distinct = new Set(loose.map((node) => `${positions[node.id].x},${positions[node.id].y}`));
    expect(distinct.size).toBe(100);
    // Still laid out in rank order, and clear of the grid.
    expect(positions.n0.x).toBeLessThan(positions.n1.x);
    const chainBox = box(['n0', 'n1', 'n2']);
    expect(grid.top > chainBox.bottom || grid.left > chainBox.right).toBe(true);
  });

  it('packs separate linked groups side by side rather than stacking them in one column', () => {
    const pairs = Array.from({ length: 40 }, (_, i) => i);
    const positions = computeLayout({
      nodes: pairs.flatMap((i) => [{ id: `a${i}`, width: 260, height: 80 }, { id: `b${i}`, width: 260, height: 80 }]),
      edges: pairs.map((i) => ({ id: `e${i}`, source: `a${i}`, target: `b${i}` })),
      algorithm: 'layered',
    });
    const ys = Object.values(positions).map((p) => p.y), xs = Object.values(positions).map((p) => p.x);
    const height = Math.max(...ys) - Math.min(...ys), width = Math.max(...xs) - Math.min(...xs);
    // Forty pairs stacked are over 5,000 high and 400 wide; packed, the whole is no taller than wide.
    expect(height).toBeLessThan(width);
    // Each pair keeps its own left-to-right order and its two cards stay together.
    for (const i of pairs) {
      expect(positions[`a${i}`].x).toBeLessThan(positions[`b${i}`].x);
      expect(Math.abs(positions[`a${i}`].y - positions[`b${i}`].y)).toBeLessThan(200);
    }
    const distinct = new Set(Object.values(positions).map(({ x, y }) => `${Math.round(x)},${Math.round(y)}`));
    expect(distinct.size).toBe(80);
  });

  it('places a node whose only link is to itself in the grid, and a graph with nothing linked', () => {
    const loops = [0, 1, 2].map((i) => ({ id: `self${i}`, width: 260, height: 80 }));
    const positions = computeLayout({
      nodes: loops,
      edges: [{ id: 'loop', source: 'self0', target: 'self0' }],
      algorithm: 'layered',
    });
    expect(Object.keys(positions).sort()).toEqual(['self0', 'self1', 'self2']);
  });

  it('lays out 2,000 nodes by force in a few seconds', () => {
    const started = performance.now();
    computeLayout(chain(2000));
    expect(performance.now() - started).toBeLessThan(10_000);
  });
});
