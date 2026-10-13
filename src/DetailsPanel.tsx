import type { ReactNode } from 'react';
import type { Link, RdfGraph, Resource } from './rdf/buildGraph';
import type { Selection } from './graph/RdfGraph';

type Props = {
  graph: RdfGraph;
  selection: NonNullable<Selection>;
  onNavigate: (selection: NonNullable<Selection>) => void;
  onClose: () => void;
};

/** Everything about the selected card or edge, untruncated, with links to its neighbours. */
export function DetailsPanel({ graph, selection, onNavigate, onClose }: Props) {
  const resourcesById = new Map(graph.resources.map((resource) => [resource.id, resource]));

  const resourceButton = (id: string) => (
    <button type="button" className="ref" onClick={() => onNavigate({ kind: 'resource', id })}>
      {nameOf(resourcesById.get(id), id)}
    </button>
  );

  let body;
  if (selection.kind === 'resource') {
    const resource = resourcesById.get(selection.id);
    if (!resource) return null;
    const outgoing = graph.links.filter((link) => link.source === resource.id);
    const incoming = graph.links.filter((link) => link.target === resource.id);
    body = (
      <>
        <h2>{resource.displayLabel ?? resource.name}</h2>
        <div className="details__iri">{resource.id}</div>
        {resource.kind === 'blank' && <div className="details__note">Blank node</div>}

        {resource.types.length > 0 && (
          <Section title="Types">
            <ul className="details__list">
              {resource.types.map((type) => (
                <li key={type.iri} title={type.iri}>
                  <code>{type.label}</code>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {resource.literals.length > 0 && (
          <Section title={`Literals (${resource.literals.length})`}>
            <dl className="details__literals">
              {resource.literals.map((row, i) => (
                <div key={i}>
                  <dt title={row.predicate.iri}>{row.predicate.label}</dt>
                  <dd>
                    {row.value}
                    {(row.language || row.datatype) && (
                      <span className="details__tag" title={row.datatype?.iri}>
                        {row.language ? `@${row.language}` : row.datatype!.label}
                      </span>
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          </Section>
        )}

        {outgoing.length > 0 && (
          <Section title={`Links out (${outgoing.length})`}>
            <LinkList links={outgoing} render={(link) => resourceButton(link.target)} onNavigate={onNavigate} />
          </Section>
        )}
        {incoming.length > 0 && (
          <Section title={`Links in (${incoming.length})`}>
            <LinkList links={incoming} render={(link) => resourceButton(link.source)} onNavigate={onNavigate} />
          </Section>
        )}
      </>
    );
  } else {
    const link = graph.links.find((candidate) => candidate.id === selection.id);
    if (!link) return null;
    body = (
      <>
        <h2>{link.predicate.label}</h2>
        <div className="details__iri">{link.predicate.iri}</div>
        <Section title="From">
          {resourceButton(link.source)}
        </Section>
        <Section title="To">
          {resourceButton(link.target)}
        </Section>
      </>
    );
  }

  return (
    <aside className="details" aria-label="Selection details">
      <button type="button" className="details__close" onClick={onClose} aria-label="Close details">
        ×
      </button>
      {body}
    </aside>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="details__section">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

function LinkList({
  links,
  render,
  onNavigate,
}: {
  links: Link[];
  render: (link: Link) => ReactNode;
  onNavigate: Props['onNavigate'];
}) {
  return (
    <ul className="details__list">
      {links.map((link) => (
        <li key={link.id}>
          <button
            type="button"
            className="details__predicate"
            title={link.predicate.iri}
            onClick={() => onNavigate({ kind: 'link', id: link.id })}
          >
            {link.predicate.label}
          </button>{' '}
          {render(link)}
        </li>
      ))}
    </ul>
  );
}

function nameOf(resource: Resource | undefined, fallback: string): string {
  if (!resource) return fallback;
  return resource.displayLabel ? `${resource.displayLabel} (${resource.name})` : resource.name;
}
