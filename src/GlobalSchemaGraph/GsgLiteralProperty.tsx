/**
 * GsgLiteralProperty - Handles rendering of Literal Properties
 * as well as the popup for information about the literal property
 */

import type { GlobalSchemaPropertyShape } from './types';
import { generateStripeGradientCSS, extractDatasourceIds, escapeHtml } from './utils';

interface GsgLiteralPropertyProps {
  propertyShape: GlobalSchemaPropertyShape;
  index: number;
  nodeId: string;
  getColor: (datasourceId: string) => string;
}

/**
 * Generates HTML for a literal property item
 */
export function generateLiteralPropertyHTML({
  propertyShape,
  index,
  nodeId,
  getColor
}: GsgLiteralPropertyProps): string {
  const literalDatasourceIds = extractDatasourceIds(propertyShape.datasourceRepresentations);
  const literalColors = literalDatasourceIds.length > 0
    ? literalDatasourceIds.map(id => getColor(id))
    : ['#000000']; // Default to black if no datasources

  const literalStripeCSS = generateStripeGradientCSS(literalColors, 4, 45);

  const datasourceRep = propertyShape.datasourceRepresentations?.[0];
  const name = escapeHtml(
    typeof datasourceRep?.keyName === 'string' ? datasourceRep.keyName : 'unknown'
  );

  const min = propertyShape.minCount || 0;
  const max = propertyShape.maxCount === null ? '∞' : (propertyShape.maxCount?.toString() || '∞');
  const cardinality = `${min}-${max}`;

  const datatype = escapeHtml(propertyShape.datatype || 'unknown');

  return `
    <div class="literal-item">
      <div class="literal-color-bar" style="background: ${literalStripeCSS};"></div>
      <div class="literal-info">
        <span class="literal-name">${name}</span>
        <span class="literal-type">${datatype}</span>
      </div>
      <span class="literal-cardinality">${cardinality}</span>
      <button class="info-btn literal-info-btn" data-node-id="${nodeId}" data-literal-idx="${index}" title="More info">⋯</button>
    </div>
  `;
}

