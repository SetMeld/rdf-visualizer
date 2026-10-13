/**
 * GsgNamedNodeProperty - Handles rendering the properties that make up the edges on the graph
 * as well as the popup of metadata for the edges
 */

import type { GlobalSchemaPropertyShape } from './types';
import { createTooltipContent } from './GsgPopup';

/**
 * Creates tooltip node data for a named node property (edge)
 */
export function createEdgeTooltipData(
  propertyShape: GlobalSchemaPropertyShape,
  position: { x: number; y: number }
): {
  id: string;
  tooltip: string;
  tooltipType: 'property';
  tooltipTitle: string;
  tooltipData: [string, unknown][];
  tooltipHeight: number;
  position: { x: number; y: number };
} {
  const tooltipContent = createTooltipContent(propertyShape);
  const estimatedHeight = Math.max(200, 40 + (tooltipContent.length * 18) + 24);

  return {
    id: `tooltip-${Date.now()}`,
    tooltip: 'true',
    tooltipType: 'property',
    tooltipTitle:
      propertyShape.datasourceRepresentations?.[0]?.primaryLabel?.[0] ||
      propertyShape['@id'] ||
      'Property',
    tooltipData: tooltipContent,
    tooltipHeight: estimatedHeight,
    position,
  };
}

