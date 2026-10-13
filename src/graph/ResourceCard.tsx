import type { Resource } from '../rdf/buildGraph';
import { stripes } from '../rdf/terms';

export const CARD_WIDTH = 260;

type Props = {
  resource: Resource;
  typeColors: Record<string, string>;
  selected: boolean;
  /** Off when rdf:type is already drawn as links, which would say the same thing twice. */
  showTypes: boolean;
  /** Neighbours not on screen; clicking the card brings them in. */
  hiddenNeighbors: number;
  /** Given in a focused view, where a card can be taken off screen again. */
  onClose?: () => void;
};

/**
 * One subject drawn as a box: its name in the header, then every literal said about it.
 *
 * Positioned by RdfGraph, which moves it to wherever Cytoscape has put the node underneath.
 */
export function ResourceCard({ resource, typeColors, selected, showTypes, hiddenNeighbors, onClose }: Props) {
  const headerColors = resource.types.length > 0 ? resource.types.map((type) => typeColors[type.iri]) : undefined;
  const typeChips = showTypes ? resource.types : [];
  const hasBody = typeChips.length > 0 || resource.literals.length > 0;

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
        {hiddenNeighbors > 0 && (
          <span className="card__badge" title={`${hiddenNeighbors} more connected — click to show`}>
            +{hiddenNeighbors}
          </span>
        )}
        {onClose && (
          <button type="button" className="card__close" onClick={onClose} title="Hide" aria-label="Hide">
            ×
          </button>
        )}
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
          {typeChips.length > 0 && (
            <div className="card__types">
              {typeChips.map((type) => (
                <span key={type.iri} className="chip" style={{ borderColor: typeColors[type.iri] }}>
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
