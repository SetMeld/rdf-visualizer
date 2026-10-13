import type { IriRef, RdfGraph, Resource } from './buildGraph';

/** Stands in for a type IRI to mean "resources with no rdf:type". */
export const UNTYPED = '';

/**
 * Which part of the graph is on screen. `null` is the whole graph; otherwise only the resources in
 * `visible` are drawn, along with the links between them.
 */
export type Focus = {
  visible: ReadonlySet<string>;
  /** The types the view was filtered to, if it came from the type navigator. */
  types: readonly string[];
} | null;

/** Every resource's neighbours, ignoring link direction. */
export type Neighbors = ReadonlyMap<string, ReadonlySet<string>>;

export function indexNeighbors(graph: RdfGraph): Neighbors {
  const neighbors = new Map<string, Set<string>>();
  const add = (from: string, to: string) => {
    let set = neighbors.get(from);
    if (!set) neighbors.set(from, (set = new Set()));
    set.add(to);
  };
  for (const link of graph.links) {
    if (link.source === link.target) continue;
    add(link.source, link.target);
    add(link.target, link.source);
  }
  return neighbors;
}

export type TypeGroup = {
  /** The type's IRI, or UNTYPED. */
  key: string;
  type?: IriRef;
  members: Resource[];
};

/** Resources grouped by rdf:type, largest group first, with untyped resources last. */
export function groupByType(graph: RdfGraph): TypeGroup[] {
  const groups = new Map<string, TypeGroup>();
  const untyped: Resource[] = [];
  for (const resource of graph.resources) {
    if (resource.types.length === 0) untyped.push(resource);
    for (const type of resource.types) {
      let group = groups.get(type.iri);
      if (!group) groups.set(type.iri, (group = { key: type.iri, type, members: [] }));
      group.members.push(resource);
    }
  }
  const sorted = [...groups.values()].sort(
    (a, b) => b.members.length - a.members.length || a.type!.label.localeCompare(b.type!.label),
  );
  if (untyped.length > 0) sorted.push({ key: UNTYPED, members: untyped });
  for (const group of sorted) group.members.sort((a, b) => resourceName(a).localeCompare(resourceName(b)));
  return sorted;
}

export function resourceName(resource: Resource): string {
  return resource.displayLabel ?? resource.name;
}

/**
 * Show a resource and everything next to it, on top of whatever is already shown. From the whole
 * graph, that narrows the view to one neighbourhood; from a focused view, it grows it.
 */
export function expand(focus: Focus, id: string, neighbors: Neighbors): Focus {
  const visible = new Set(focus?.visible);
  const before = visible.size;
  visible.add(id);
  neighbors.get(id)?.forEach((neighbor) => visible.add(neighbor));
  // Unchanged, so the caller can skip a re-layout that would move everything for no reason.
  if (focus && visible.size === before) return focus;
  return { visible, types: focus?.types ?? [] };
}

export function close(focus: Focus, id: string): Focus {
  if (!focus) return null;
  const visible = new Set(focus.visible);
  visible.delete(id);
  return visible.size > 0 ? { visible, types: focus.types } : null;
}

/** Resources of any of `types`, and their neighbours. No types means the whole graph. */
export function filterByTypes(types: readonly string[], groups: TypeGroup[], neighbors: Neighbors): Focus {
  if (types.length === 0) return null;
  const visible = new Set<string>();
  for (const group of groups) {
    if (!types.includes(group.key)) continue;
    for (const member of group.members) {
      visible.add(member.id);
      neighbors.get(member.id)?.forEach((neighbor) => visible.add(neighbor));
    }
  }
  return { visible, types };
}

/** The part of the graph `focus` shows. The whole graph is returned as is, so it isn't re-laid out. */
export function visibleGraph(graph: RdfGraph, focus: Focus): RdfGraph {
  if (!focus) return graph;
  return {
    ...graph,
    resources: graph.resources.filter((resource) => focus.visible.has(resource.id)),
    links: graph.links.filter((link) => focus.visible.has(link.source) && focus.visible.has(link.target)),
  };
}

/** How many of a resource's neighbours are off screen: what clicking it would bring in. */
export function hiddenNeighborCount(id: string, focus: Focus, neighbors: Neighbors): number {
  if (!focus) return 0;
  let count = 0;
  neighbors.get(id)?.forEach((neighbor) => {
    if (!focus.visible.has(neighbor)) count += 1;
  });
  return count;
}
