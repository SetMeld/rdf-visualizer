import { describe, expect, it } from 'vitest';
import { parseTurtle, type RdfGraph } from './buildGraph';
import {
  UNTYPED,
  close,
  expand,
  filterByTypes,
  groupByType,
  hiddenNeighborCount,
  indexNeighbors,
  visibleGraph,
} from './focus';

// a → b → c → d, plus e on its own. a and c are people, b is an org.
const TTL = `
@prefix : <http://ex.org/> .
:a a :Person ; :knows :b .
:b a :Org ; :employs :c .
:c a :Person ; :likes :d .
:e :name "E" .
`;

function graph(): RdfGraph {
  const result = parseTurtle(TTL);
  if (!result.ok) throw new Error(result.error);
  return result.graph;
}

const ids = (set: ReadonlySet<string> | undefined) => [...(set ?? [])].map((id) => id.replace('http://ex.org/', '')).sort();

describe('focus', () => {
  const g = graph();
  const neighbors = indexNeighbors(g);
  const iri = (local: string) => `http://ex.org/${local}`;

  it('narrows the whole graph to a neighbourhood, then grows it', () => {
    const first = expand(null, iri('b'), neighbors);
    expect(ids(first?.visible)).toEqual(['a', 'b', 'c']);
    const second = expand(first, iri('c'), neighbors);
    expect(ids(second?.visible)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('returns the same focus when expanding adds nothing', () => {
    const focus = expand(null, iri('b'), neighbors);
    expect(expand(focus, iri('a'), neighbors)).toBe(focus);
  });

  it('closes resources, returning to the whole graph when none are left', () => {
    const focus = expand(null, iri('e'), neighbors);
    expect(ids(focus?.visible)).toEqual(['e']);
    expect(close(focus, iri('e'))).toBeNull();
  });

  it('filters to a type and its neighbours', () => {
    const groups = groupByType(g);
    expect(groups.map((group) => [group.type?.label ?? UNTYPED, group.members.length])).toEqual([
      [':Person', 2],
      [':Org', 1],
      [UNTYPED, 2],
    ]);
    expect(ids(filterByTypes([iri('Org')], groups, neighbors)?.visible)).toEqual(['a', 'b', 'c']);
    expect(filterByTypes([], groups, neighbors)).toBeNull();
  });

  it('draws only links between visible resources and counts what is hidden', () => {
    const focus = expand(null, iri('a'), neighbors);
    const visible = visibleGraph(g, focus);
    expect(visible.links.map((link) => link.predicate.iri)).toEqual([iri('knows')]);
    expect(hiddenNeighborCount(iri('b'), focus, neighbors)).toBe(1);
    expect(visibleGraph(g, null)).toBe(g);
  });
});
