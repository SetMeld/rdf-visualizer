import { describe, expect, it } from 'vitest';
import { parseTurtle, type RdfGraph } from './buildGraph';

const TTL = `
@prefix ex: <http://example.org/> .
@prefix foaf: <http://xmlns.com/foaf/0.1/> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

ex:alice a foaf:Person ;
  foaf:name "Alice" ;
  foaf:age 42 ;
  foaf:nick "Ali"@en ;
  foaf:knows ex:bob, [ foaf:name "Carol" ] .

ex:bob foaf:name "Bob" .
`;

function parse(text: string, typesAsLinks = false): RdfGraph {
  const result = parseTurtle(text, { typesAsLinks });
  if (!result.ok) throw new Error(result.error);
  return result.graph;
}

describe('parseTurtle', () => {
  it('groups literals onto their subject', () => {
    const alice = parse(TTL).resources.find((r) => r.id === 'http://example.org/alice')!;
    expect(alice.name).toBe('ex:alice');
    expect(alice.displayLabel).toBe('Alice');
    expect(alice.literals).toEqual([
      { predicate: { iri: 'http://xmlns.com/foaf/0.1/name', label: 'foaf:name' }, value: 'Alice' },
      {
        predicate: { iri: 'http://xmlns.com/foaf/0.1/age', label: 'foaf:age' },
        value: '42',
        datatype: { iri: 'http://www.w3.org/2001/XMLSchema#integer', label: 'xsd:integer' },
      },
      { predicate: { iri: 'http://xmlns.com/foaf/0.1/nick', label: 'foaf:nick' }, value: 'Ali', language: 'en' },
    ]);
  });

  it('links to named and blank nodes', () => {
    const graph = parse(TTL);
    expect(graph.links.map((l) => [l.source, l.predicate.label, l.target])).toEqual([
      ['http://example.org/alice', 'foaf:knows', 'http://example.org/bob'],
      ['http://example.org/alice', 'foaf:knows', expect.stringMatching(/^_:/)],
    ]);
    const blank = graph.resources.find((r) => r.kind === 'blank')!;
    expect(blank.literals[0].value).toBe('Carol');
  });

  it('shows rdf:type on the card by default, or as a link when asked', () => {
    const asChips = parse(TTL);
    expect(asChips.resources.find((r) => r.name === 'ex:alice')!.types.map((t) => t.label)).toEqual(['foaf:Person']);
    expect(asChips.resources.some((r) => r.name === 'foaf:Person')).toBe(false);

    const asLinks = parse(TTL, true);
    expect(asLinks.resources.find((r) => r.name === 'ex:alice')!.types).toEqual([]);
    expect(asLinks.links.some((l) => l.predicate.label === 'rdf:type' && l.target.endsWith('Person'))).toBe(true);
  });

  it('collapses repeated triples into one link', () => {
    const graph = parse('<a:x> <a:p> <a:y> . <a:x> <a:p> <a:y> .');
    expect(graph.links).toHaveLength(1);
  });

  it('reports syntax errors', () => {
    const result = parseTurtle('@prefix ex: <http://example.org/> .\nex:a ex:b .');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/line 2/);
  });
});
