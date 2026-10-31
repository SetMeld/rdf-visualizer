import type { Link, RdfGraph, Resource } from './buildGraph';
import { UNTYPED, type TypeGroup } from './focus';
import { compactIri, PALETTE } from './terms';

const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
/** Prefixes the ids of overview nodes, so they never collide with a resource's own IRI. */
const TYPE_NODE = 'urn:rdf-visualizer:type:';
const MEMBERS = { iri: 'urn:rdf-visualizer:members', label: 'members' };
/** The predicate of a summary type's detail rows. */
const DETAIL = 'urn:rdf-visualizer:detail';

/** Counts describing a graph too large to hand over whole: each type's members and the links between types. */
export type TypeSummary = {
  types: readonly { iri: string; members: number; details?: readonly { label: string; value: string }[] }[];
  links: readonly { source: string; predicate: string; target: string; count: number }[];
};

/** The type an overview node stands for: its IRI, or UNTYPED. */
export function overviewTypeKey(id: string): string {
  return id.slice(TYPE_NODE.length);
}

/**
 * The graph summarised by type: one node per rdf:type with its member count, plus one for untyped
 * resources, and one link per (type, predicate, type) with the number of links it stands for.
 */
export function typeOverview(graph: RdfGraph, groups: TypeGroup[]): RdfGraph {
  const resources: Resource[] = groups.map((group) => {
    const label = group.type?.label ?? 'Untyped';
    return {
      id: TYPE_NODE + group.key,
      kind: 'iri',
      name: group.type?.iri ?? 'Resources with no rdf:type',
      displayLabel: label,
      types: group.type ? [group.type] : [],
      literals: [{ predicate: MEMBERS, value: String(group.members.length) }],
    };
  });

  const typesOf = new Map<string, string[]>();
  for (const resource of graph.resources) {
    typesOf.set(resource.id, resource.types.length > 0 ? resource.types.map((type) => type.iri) : [UNTYPED]);
  }

  const counts = new Map<string, { source: string; target: string; predicate: Link['predicate']; count: number }>();
  for (const link of graph.links) {
    if (link.predicate.iri === RDF_TYPE) continue;
    for (const source of typesOf.get(link.source) ?? [UNTYPED]) {
      for (const target of typesOf.get(link.target) ?? [UNTYPED]) {
        const id = `${source} ${link.predicate.iri} ${target}`;
        const entry = counts.get(id);
        if (entry) entry.count += 1;
        else counts.set(id, { source, target, predicate: link.predicate, count: 1 });
      }
    }
  }

  const links: Link[] = [...counts.entries()].map(([id, { source, target, predicate, count }]) => ({
    id: TYPE_NODE + id,
    source: TYPE_NODE + source,
    target: TYPE_NODE + target,
    predicate: { iri: predicate.iri, label: `${predicate.label} ×${count}` },
  }));

  return { ...graph, resources, links };
}

/** The overview a {@link TypeSummary} describes, drawn as {@link typeOverview} draws one from a whole graph. */
export function summaryOverview(summary: TypeSummary): RdfGraph {
  const resources: Resource[] = summary.types.map((type) => ({
    id: TYPE_NODE + type.iri,
    kind: 'iri',
    name: type.iri,
    displayLabel: compactIri(type.iri, {}),
    types: [{ iri: type.iri, label: compactIri(type.iri, {}) }],
    literals: [
      { predicate: MEMBERS, value: String(type.members) },
      ...(type.details ?? []).map((detail) => ({ predicate: { iri: DETAIL, label: detail.label }, value: detail.value })),
    ],
  }));
  const listed = new Set(summary.types.map((type) => type.iri));
  const links: Link[] = summary.links
    .filter((link) => listed.has(link.source) && listed.has(link.target))
    .map((link) => ({
      id: TYPE_NODE + `${link.source} ${link.predicate} ${link.target}`,
      source: TYPE_NODE + link.source,
      target: TYPE_NODE + link.target,
      predicate: { iri: link.predicate, label: `${compactIri(link.predicate, {})} ×${link.count}` },
    }));
  const ranked = [...summary.types].sort((a, b) => b.members - a.members || a.iri.localeCompare(b.iri));
  const typeColors = Object.fromEntries(ranked.map((type, i) => [type.iri, PALETTE[i % PALETTE.length]]));
  return { resources, links, prefixes: {}, tripleCount: 0, typesAsLinks: false, typeColors };
}
