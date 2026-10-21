import { describe, expect, it } from 'vitest';
import { parseTurtle, type RdfGraph } from './buildGraph';
import { groupByType, UNTYPED } from './focus';
import { overviewTypeKey, typeOverview } from './overview';

const TTL = `
@prefix ex: <http://example.org/> .
ex:a1 a ex:Author ; ex:name "A1" ; ex:wrote ex:b1, ex:b2 .
ex:a2 a ex:Author ; ex:wrote ex:b3 .
ex:b1 a ex:Book ; ex:about ex:topic .
ex:b2 a ex:Book .
ex:b3 a ex:Book, ex:Edition .
ex:loose ex:wrote ex:b1 .
`;

function parse(text: string, typesAsLinks = false): RdfGraph {
  const result = parseTurtle(text, { typesAsLinks });
  if (!result.ok) throw new Error(result.error);
  return result.graph;
}

function overview(graph: RdfGraph) {
  return typeOverview(graph, groupByType(graph));
}

describe('typeOverview', () => {
  it('has one node per type, with its member count, and one for untyped resources', () => {
    const view = overview(parse(TTL));
    const nodes = view.resources.map((r) => [overviewTypeKey(r.id), r.displayLabel, r.literals[0].value]);
    expect(nodes).toEqual([
      ['http://example.org/Book', 'ex:Book', '3'],
      ['http://example.org/Author', 'ex:Author', '2'],
      ['http://example.org/Edition', 'ex:Edition', '1'],
      [UNTYPED, 'Untyped', '2'],
    ]);
  });

  it('aggregates links between types by predicate, with counts', () => {
    const view = overview(parse(TTL));
    const links = view.links.map((l) => [overviewTypeKey(l.source), l.predicate.label, overviewTypeKey(l.target)]);
    expect(links).toEqual(
      expect.arrayContaining([
        ['http://example.org/Author', 'ex:wrote ×3', 'http://example.org/Book'],
        ['http://example.org/Author', 'ex:wrote ×1', 'http://example.org/Edition'],
        ['http://example.org/Book', 'ex:about ×1', UNTYPED],
        [UNTYPED, 'ex:wrote ×1', 'http://example.org/Book'],
      ]),
    );
    expect(links).toHaveLength(4);
  });

  it('leaves out rdf:type links when types are drawn as links', () => {
    const view = overview(parse(TTL, true));
    expect(view.links.some((l) => l.predicate.iri.endsWith('#type'))).toBe(false);
  });

  it('colours each type node with its type colour', () => {
    const graph = parse(TTL);
    const book = overview(graph).resources.find((r) => overviewTypeKey(r.id) === 'http://example.org/Book')!;
    expect(book.types.map((t) => t.iri)).toEqual(['http://example.org/Book']);
    expect(overview(graph).typeColors).toBe(graph.typeColors);
  });
});
