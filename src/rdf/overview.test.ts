import { describe, expect, it } from 'vitest';
import { parseTurtle, type RdfGraph } from './buildGraph';
import { groupByType, UNTYPED } from './focus';
import { overviewTypeKey, summaryOverview, typeOverview } from './overview';

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

describe('summaryOverview', () => {
  const GIST = 'https://w3id.org/semanticarts/ns/ontology/gist/';
  const summary = {
    types: [
      { iri: `${GIST}Person`, members: 3, details: [{ label: 'IMDB', value: '2' }] },
      { iri: `${GIST}Agreement`, members: 40 },
    ],
    links: [
      { source: `${GIST}Agreement`, predicate: `${GIST}hasParty`, target: `${GIST}Person`, count: 7 },
      { source: `${GIST}Agreement`, predicate: `${GIST}hasParty`, target: 'http://example.org/Unlisted', count: 1 },
    ],
  };

  it('draws one node per counted type, carrying its count and details, as the whole-graph overview does', () => {
    const view = summaryOverview(summary);
    const nodes = view.resources.map((r) => [overviewTypeKey(r.id), r.displayLabel, r.literals.map((l) => `${l.predicate.label}=${l.value}`)]);
    expect(nodes).toEqual([
      [`${GIST}Person`, 'gist:Person', ['members=3', 'IMDB=2']],
      [`${GIST}Agreement`, 'gist:Agreement', ['members=40']],
    ]);
    const fromGraph = overview(parse(TTL)).resources[0];
    expect(view.resources[0].id.slice(0, view.resources[0].id.length - `${GIST}Person`.length)).toBe(
      fromGraph.id.slice(0, fromGraph.id.length - overviewTypeKey(fromGraph.id).length),
    );
  });

  it('draws each counted link between listed types, and none to a type it does not list', () => {
    const links = summaryOverview(summary).links.map((l) => [overviewTypeKey(l.source), l.predicate.label, overviewTypeKey(l.target)]);
    expect(links).toEqual([[`${GIST}Agreement`, 'gist:hasParty ×7', `${GIST}Person`]]);
  });

  it('gives the most populous type the first colour', () => {
    const view = summaryOverview(summary);
    expect(view.typeColors[`${GIST}Agreement`]).not.toBe(view.typeColors[`${GIST}Person`]);
    expect(view.resources.find((r) => overviewTypeKey(r.id) === `${GIST}Agreement`)!.types[0].iri).toBe(`${GIST}Agreement`);
    expect(Object.keys(view.typeColors)[0]).toBe(`${GIST}Agreement`);
  });
});
