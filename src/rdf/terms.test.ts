import { describe, expect, it } from 'vitest';
import { colorFor, compactIri, PALETTE, paintTypes } from './terms';

describe('compactIri', () => {
  it('shortens gist, the ontology SetMeld maps to, without a declared prefix', () => {
    expect(compactIri('https://w3id.org/semanticarts/ns/ontology/gist/Person', {})).toBe('gist:Person');
  });

  it('prefers the document’s own prefix', () => {
    expect(compactIri('https://w3id.org/semanticarts/ns/ontology/gist/Person', { g: 'https://w3id.org/semanticarts/ns/ontology/gist/' })).toBe('g:Person');
  });
});

describe('colorFor and paintTypes', () => {
  const palette = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)'];

  it('draws a predicate in the palette it is given, and in the built-in one by default', () => {
    expect(palette).toContain(colorFor('http://xmlns.com/foaf/0.1/knows', palette));
    expect(PALETTE).toContain(colorFor('http://xmlns.com/foaf/0.1/knows'));
  });

  it('gives the most common types the first colors of the palette, repeating it past the end', () => {
    const painted = paintTypes({ a: '#1', b: '#2', c: '#3', d: '#4' }, palette);
    expect(painted).toEqual({ a: palette[0], b: palette[1], c: palette[2], d: palette[0] });
  });
});
