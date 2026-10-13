/**
 * GsgNode - Handles rendering the overall node as well as popup information for the node.
 * Also renders the list of GsgLiteralProperty
 */

import type { GlobalSchemaNodeShape, GlobalSchemaPropertyShape } from './types';
import { generateStripeGradientCSS, extractDatasourceIds, escapeHtml } from './utils';
import { generateLiteralPropertyHTML } from './GsgLiteralProperty';
import { createTooltipContent } from './GsgPopup';

interface GsgNodeProps {
  nodeShape: GlobalSchemaNodeShape;
  literalPropertyShapes: GlobalSchemaPropertyShape[];
  getColor: (datasourceId: string) => string;
}

/**
 * Generates HTML for a node label
 */
export function generateNodeHTML({ nodeShape, literalPropertyShapes, getColor }: GsgNodeProps): string {
  const nodeDatasourceIds = extractDatasourceIds(nodeShape.datasourceRepresentations);
  const nodeColors = nodeDatasourceIds.length > 0
    ? nodeDatasourceIds.map(id => getColor(id))
    : ['#000000']; // Default to black if no datasources

  const headerStripeCSS = generateStripeGradientCSS(nodeColors, 8, 45);

  const nodeLabel = escapeHtml(
    nodeShape.datasourceRepresentations?.[0]?.primaryLabel?.[0] || nodeShape['@id'] || 'unknown'
  );
  const nodeId = escapeHtml(nodeShape['@id'] || 'unknown');

  let html = `
    <div class="custom-node-label" data-node-id="${nodeId}">
      <div class="node-header">
        <div class="header-stripes" style="background: ${headerStripeCSS};"></div>
        <span>${nodeLabel}</span>
        <button class="info-btn entity-info-btn" data-node-id="${nodeId}" title="More info">⋯</button>
      </div>
  `;

  if (literalPropertyShapes && literalPropertyShapes.length > 0) {
    html += '<div class="node-literals">';
    literalPropertyShapes.forEach((propertyShape, idx) => {
      html += generateLiteralPropertyHTML({
        propertyShape,
        index: idx,
        nodeId,
        getColor,
      });
    });
    html += '</div>';
  }

  html += '</div>';
  return html;
}

/**
 * Creates tooltip node data for a node
 */
export function createNodeTooltipData(
  nodeShape: GlobalSchemaNodeShape,
  position: { x: number; y: number }
): {
  id: string;
  tooltip: string;
  tooltipType: 'node';
  tooltipTitle: string;
  tooltipData: [string, unknown][];
  tooltipHeight: number;
  position: { x: number; y: number };
} {
  const tooltipContent = createTooltipContent(nodeShape);
  const estimatedHeight = Math.max(200, 40 + (tooltipContent.length * 18) + 24);

  return {
    id: `tooltip-${Date.now()}`,
    tooltip: 'true',
    tooltipType: 'node',
    tooltipTitle:
      nodeShape.datasourceRepresentations?.[0]?.primaryLabel?.[0] || nodeShape['@id'] || 'Entity',
    tooltipData: tooltipContent,
    tooltipHeight: estimatedHeight,
    position,
  };
}

