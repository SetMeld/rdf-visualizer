import { describe, expect, it } from 'vitest';
import { compactIri } from './terms';

describe('compactIri', () => {
  it('shortens gist, the ontology SetMeld maps to, without a declared prefix', () => {
    expect(compactIri('https://w3id.org/semanticarts/ns/ontology/gist/Person', {})).toBe('gist:Person');
  });

  it('prefers the document’s own prefix', () => {
    expect(compactIri('https://w3id.org/semanticarts/ns/ontology/gist/Person', { g: 'https://w3id.org/semanticarts/ns/ontology/gist/' })).toBe('g:Person');
  });
});
