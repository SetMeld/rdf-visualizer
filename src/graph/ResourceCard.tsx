import type { Resource } from '../rdf/buildGraph';
import { colorFor, stripes } from '../rdf/terms';

export const CARD_WIDTH = 260;

type Props = {
  resource: Resource;
  selected: boolean;
};

/**
 * One subject drawn as a box: its name in the header, then every literal said about it.
 *
 * Positioned by RdfGraph, which moves it to wherever Cytoscape has put the node underneath.
 */
export function ResourceCard({ resource, selected }: Props) {
  const headerColors = resource.types.length > 0 ? resource.types.map((type) => colorFor(type.iri)) : undefined;
  const hasBody = resource.types.length > 0 || resource.literals.length > 0;

  return (
    <div
      data-id={resource.id}
      className={[
        'card',
        `card--${resource.kind}`,
        hasBody ? '' : 'card--bare',
        selected ? 'card--selected' : '',
      ].join(' ')}
      style={{ width: CARD_WIDTH }}
    >
      <div className="card__header" style={headerColors ? { background: stripes(headerColors) } : undefined}>
        <div className="card__title">
          {resource.displayLabel ? (
            <>
              <span className="card__label">{resource.displayLabel}</span>
              <span className="card__name">{resource.name}</span>
            </>
          ) : resource.kind === 'blank' ? (
            <>
              <span className="card__label card__label--blank">blank node</span>
              <span className="card__name">{resource.name}</span>
            </>
          ) : (
            <span className="card__label card__label--iri">{resource.name}</span>
          )}
        </div>
      </div>
      {hasBody && (
        <div className="card__body">
          {resource.types.length > 0 && (
            <div className="card__types">
              {resource.types.map((type) => (
                <span key={type.iri} className="chip" style={{ borderColor: colorFor(type.iri) }}>
                  {type.label}
                </span>
              ))}
            </div>
          )}
          {resource.literals.map((row, i) => (
            <div key={i} className="literal">
              <div className="literal__predicate">{row.predicate.label}</div>
              <div className="literal__value">{row.value}</div>
              {(row.language || row.datatype) && (
                <div className="literal__tag">{row.language ? `@${row.language}` : row.datatype!.label}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
