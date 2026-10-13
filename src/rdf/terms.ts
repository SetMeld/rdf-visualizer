export type Prefixes = Record<string, string>;

/** Used to shorten IRIs in vocabularies so common that documents often leave them undeclared. */
const WELL_KNOWN_PREFIXES: Prefixes = {
  rdf: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
  rdfs: 'http://www.w3.org/2000/01/rdf-schema#',
  xsd: 'http://www.w3.org/2001/XMLSchema#',
  owl: 'http://www.w3.org/2002/07/owl#',
};

/**
 * `http://xmlns.com/foaf/0.1/name` → `foaf:name`, using the longest matching namespace.
 *
 * The document's own prefixes win over the well-known ones, so a document that binds `rdf:` to
 * something unusual is shown in its own terms. An IRI no prefix covers is returned whole.
 */
export function compactIri(iri: string, prefixes: Prefixes): string {
  let best: { prefix: string; namespace: string } | undefined;
  for (const source of [prefixes, WELL_KNOWN_PREFIXES]) {
    for (const [prefix, namespace] of Object.entries(source)) {
      if (namespace && iri.startsWith(namespace) && (!best || namespace.length > best.namespace.length)) {
        best = { prefix, namespace };
      }
    }
    if (best) break;
  }
  if (!best) return iri;
  const local = iri.slice(best.namespace.length);
  return `${best.prefix}:${local}`;
}

/** Ordered so that neighbours in the list are easy to tell apart: the most common types get the first few. */
export const PALETTE = [
  '#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#8b5cf6', '#ec4899',
  '#06b6d4', '#84cc16', '#f97316', '#14b8a6', '#6366f1', '#d946ef',
];

/** A stable color for a predicate, so the same IRI looks the same everywhere it appears. */
export function colorFor(iri: string): string {
  let hash = 0;
  for (let i = 0; i < iri.length; i += 1) {
    hash = (hash * 31 + iri.charCodeAt(i)) >>> 0;
  }
  return PALETTE[hash % PALETTE.length];
}

/** Diagonal stripes, one per color: how a card with several rdf:types shows all of them. */
export function stripes(colors: string[], width = 10): string {
  if (colors.length === 1) return colors[0];
  const stops = colors.flatMap((color, i) => [`${color} ${i * width}px`, `${color} ${(i + 1) * width}px`]);
  return `repeating-linear-gradient(45deg, ${stops.join(', ')})`;
}
