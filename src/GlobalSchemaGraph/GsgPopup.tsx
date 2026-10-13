/**
 * GsgPopup - Utility component for rendering popup windows
 * Used by GsgNode, GsgLiteralProperty, and GsgNamedNodeProperty
 */

import type { GlobalSchemaNodeShape, GlobalSchemaPropertyShape, PopupDetail } from './types';
import { escapeHtml } from './utils';

interface GsgPopupProps {
  type: 'node' | 'property';
  data: [string, unknown][];
  /** What was clicked, which is more use as a heading than the kind of thing it is. */
  title?: string;
}

/**
 * Generates HTML for a popup/tooltip node
 */
export function generatePopupHTML({ type, data, title }: GsgPopupProps): string {
  const entries = data || [];
  const heading = escapeHtml(
    title || (type === 'node' ? 'Entity' : type === 'property' ? 'Property' : type)
  );

  let html = `
    <div class="tooltip-node-label" style="max-height: none; overflow: visible;">
      <div class="tooltip-header">${heading}</div>
      <div class="tooltip-content" style="max-height: none; overflow: visible;">
  `;

  entries.forEach(([key, value]) => {
    const displayValue = typeof value === 'object' && value !== null && '@id' in value
      ? (value as { '@id': string })['@id']
      : String(value);

    // Styling hooks read by the sibling stylesheet, keyed on the field's own label rather than a
    // type this function is never told.
    let dataAttributes = '';
    if (key.startsWith('Datasource ')) {
      dataAttributes = 'data-datasource="true"';
    } else if (key.includes('Entity Resolution') || key.includes('Resolution Properties')) {
      dataAttributes = 'data-entity-resolution="true"';
    } else if (key.includes('Property') || key.includes('Datatype') || key.includes('Cardinality')) {
      dataAttributes = 'data-property-info="true"';
    }

    html += `
      <div class="tooltip-field" ${dataAttributes}>
        <span class="tooltip-key">${escapeHtml(key)}:</span>
        <span class="tooltip-value">${escapeHtml(displayValue)}</span>
      </div>
    `;
  });

  html += '</div></div>';
  return html;
}

/**
 * Creates tooltip content from a node or property shape's own account of itself.
 *
 * Every shape mappedSchemaToGraph builds sets `details`, so this is the only source a tooltip reads
 * from; there is no producer left that omits it.
 */
export function createTooltipContent(
  data: GlobalSchemaNodeShape | GlobalSchemaPropertyShape | Record<string, unknown>
): [string, unknown][] {
  const details = (data as { details?: PopupDetail[] }).details ?? [];
  return details.map((detail) => [detail.label, detail.value]);
}

