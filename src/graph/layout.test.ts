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

  it('lays out 2,000 nodes by force in a few seconds', () => {
    const started = performance.now();
    computeLayout(chain(2000));
    expect(performance.now() - started).toBeLessThan(10_000);
  });
});
