/**
 * What the graph draws.
 *
 * A SHACL-shaped view of a schema: node shapes are the boxes, property shapes are either rows
 * inside a box (when they carry a datatype) or edges between boxes (when they point at a node).
 *
 * Deliberately structural rather than tied to any one producer. A mapping run is turned into this
 * shape by `mapped-schema-to-graph`; a global schema assembled from several datasources would be
 * turned into the same shape by its own adapter, and the graph would not know the difference.
 */

/**
 * One line of what a popup says about a box, a value or a link.
 *
 * Supplied by whoever built the shape rather than worked out by the graph. The graph can only
 * reflect over the fields it happens to hold, which is how a person clicking a customer table came
 * to be told "Node Type: GlobalSchemaNodeShape" — true, and about the drawing rather than about
 * their data. What is worth saying depends on where the schema came from, so it is said there.
 */
export type PopupDetail = {
  label: string;
  value: string;
};

/** Where one part of the schema came from in a datasource, and what that datasource calls it. */
export type DatasourceRepresentation = {
  "@id": string;
  "@type": string;
  datasource?: string | { "@id": string };
  primaryLabel?: string[];
  secondaryLabel?: string[];
  [key: string]: unknown;
};

/** How the rows behind a node are decided to be the same thing. */
export type EntityResolutionStrategy = {
  "@id": string;
  "@type": string;
  properties?: unknown[];
  [key: string]: unknown;
};

/** One box: a kind of thing the schema describes. */
export type GlobalSchemaNodeShape = {
  "@id": string;
  "@type": "GlobalSchemaNodeShape";
  datasourceRepresentations: DatasourceRepresentation[];
  property?: Array<{ "@id": string; [key: string]: unknown }>;
  entityResolutionStrategy?: EntityResolutionStrategy;
  /** What to say about this box when somebody opens it. */
  details?: PopupDetail[];
  [key: string]: unknown;
};

/**
 * One thing said about a node.
 *
 * `datatype` and `node` are what tell the two kinds apart: a property with a datatype is a value
 * the node carries and is drawn inside its box; a property with a node is a link to another box
 * and is drawn as an edge.
 */
export type GlobalSchemaPropertyShape = {
  "@id": string;
  "@type": "GlobalSchemaPropertyShape";
  datasourceRepresentations: DatasourceRepresentation[];
  path?: string;
  datatype?: string;
  minCount?: number;
  maxCount?: number | null;
  node?: { "@id": string };
  /** What to say about this value or link when somebody opens it. */
  details?: PopupDetail[];
  [key: string]: unknown;
};

/** A whole schema, as the graph reads it. */
export type GlobalSchemaModel = {
  "@id": string;
  "@type": "GlobalSchemaModel";
  "@context"?: Record<string, unknown>;
  datasources: Array<{ "@id": string; "@type": string; [key: string]: unknown }>;
  nodeShapes: GlobalSchemaNodeShape[];
  propertyShapes: GlobalSchemaPropertyShape[];
  [key: string]: unknown;
};
