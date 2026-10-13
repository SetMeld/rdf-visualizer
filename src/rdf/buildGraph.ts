import { Parser, type Quad, type Term } from 'n3';
import { compactIri, type Prefixes } from './terms';

const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
const XSD_STRING = 'http://www.w3.org/2001/XMLSchema#string';
const RDF_LANG_STRING = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#langString';

/** Predicates whose literal value names the resource better than its IRI does, best first. */
const LABEL_PREDICATES = [
  'http://www.w3.org/2004/02/skos/core#prefLabel',
  'http://www.w3.org/2000/01/rdf-schema#label',
  'http://schema.org/name',
  'https://schema.org/name',
  'http://xmlns.com/foaf/0.1/name',
  'http://purl.org/dc/terms/title',
  'http://purl.org/dc/elements/1.1/title',
];

export type IriRef = {
  iri: string;
  /** The IRI shortened with the document's prefixes, e.g. `foaf:name`. */
  label: string;
};

/** One `predicate "literal"` pair, drawn as a row inside its subject's card. */
export type LiteralRow = {
  predicate: IriRef;
  value: string;
  /** Omitted for plain strings, which are the overwhelmingly common case and not worth a tag. */
  datatype?: IriRef;
  language?: string;
};

/** A named or blank node: one card on the graph. */
export type Resource = {
  /** The IRI, or `_:id` for a blank node. Doubles as the Cytoscape element id. */
  id: string;
  kind: 'iri' | 'blank';
  /** The compacted IRI or blank node id. */
  name: string;
  /** A human label taken from rdfs:label, skos:prefLabel, schema:name and the like, if it has one. */
  displayLabel?: string;
  /** rdf:type objects shown on the card rather than drawn as links. */
  types: IriRef[];
  literals: LiteralRow[];
};

/** A triple whose object is a named or blank node: one edge on the graph. */
export type Link = {
  id: string;
  source: string;
  target: string;
  predicate: IriRef;
};

export type RdfGraph = {
  resources: Resource[];
  links: Link[];
  prefixes: Prefixes;
  tripleCount: number;
};

export type BuildOptions = {
  /** Draw rdf:type as an edge to a class node instead of as a chip on the card. */
  typesAsLinks?: boolean;
};

export type ParseResult = { ok: true; graph: RdfGraph } | { ok: false; error: string };

export function parseTurtle(text: string, options: BuildOptions = {}): ParseResult {
  const prefixes: Prefixes = {};
  let quads: Quad[];
  try {
    quads = new Parser({ format: 'text/turtle' }).parse(text, null, (prefix, node) => {
      prefixes[prefix] = node.value;
    });
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
  return { ok: true, graph: buildGraph(quads, prefixes, options) };
}

export function buildGraph(quads: Quad[], prefixes: Prefixes, options: BuildOptions = {}): RdfGraph {
  const typesAsLinks = options.typesAsLinks ?? false;
  const iriRef = (iri: string): IriRef => ({ iri, label: compactIri(iri, prefixes) });

  const resources = new Map<string, Resource>();
  const links: Link[] = [];
  const linkIds = new Set<string>();

  const resourceFor = (term: Term): Resource => {
    const id = termId(term);
    let resource = resources.get(id);
    if (!resource) {
      const kind = term.termType === 'BlankNode' ? 'blank' : 'iri';
      resource = {
        id,
        kind,
        name: kind === 'blank' ? id : compactIri(term.value, prefixes),
        types: [],
        literals: [],
      };
      resources.set(id, resource);
    }
    return resource;
  };

  for (const { subject, predicate, object } of quads) {
    // Quoted triples (RDF-star) and variables have no sensible card of their own.
    if (subject.termType !== 'NamedNode' && subject.termType !== 'BlankNode') continue;
    const resource = resourceFor(subject);

    if (object.termType === 'Literal') {
      const datatype = object.datatype.value;
      resource.literals.push({
        predicate: iriRef(predicate.value),
        value: object.value,
        language: object.language || undefined,
        datatype: datatype === XSD_STRING || datatype === RDF_LANG_STRING ? undefined : iriRef(datatype),
      });
      continue;
    }

    if (object.termType !== 'NamedNode' && object.termType !== 'BlankNode') continue;

    if (predicate.value === RDF_TYPE && !typesAsLinks && object.termType === 'NamedNode') {
      if (!resource.types.some((type) => type.iri === object.value)) {
        resource.types.push(iriRef(object.value));
      }
      continue;
    }

    const target = resourceFor(object);
    const id = `${resource.id} ${predicate.value} ${target.id}`;
    // A Turtle document may state the same triple twice; RDF treats it as one.
    if (linkIds.has(id)) continue;
    linkIds.add(id);
    links.push({ id, source: resource.id, target: target.id, predicate: iriRef(predicate.value) });
  }

  for (const resource of resources.values()) {
    resource.displayLabel = pickDisplayLabel(resource.literals);
  }

  return { resources: [...resources.values()], links, prefixes, tripleCount: quads.length };
}

function termId(term: Term): string {
  return term.termType === 'BlankNode' ? `_:${term.value}` : term.value;
}

function pickDisplayLabel(literals: LiteralRow[]): string | undefined {
  for (const predicate of LABEL_PREDICATES) {
    const matches = literals.filter((row) => row.predicate.iri === predicate);
    const preferred = matches.find((row) => !row.language || row.language.startsWith('en')) ?? matches[0];
    if (preferred) return preferred.value;
  }
  return undefined;
}
