/** A value safe to splice into an HTML string: the four characters that would otherwise reopen a tag or an attribute are named entities instead. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** The `@id` of every datasource a node or property was read from. */
export function extractDatasourceIds(
  datasourceRepresentations: Array<{ datasource?: string | { '@id': string } }> | undefined
): string[] {
  if (!datasourceRepresentations || datasourceRepresentations.length === 0) {
    return [];
  }

  return datasourceRepresentations
    .map((rep) => {
      const datasource = rep.datasource;
      if (typeof datasource === 'string') {
        return datasource;
      }
      if (datasource && typeof datasource === 'object' && '@id' in datasource) {
        return datasource['@id'];
      }
      return null;
    })
    .filter((id): id is string => Boolean(id));
}

/** A repeating linear gradient CSS string, one stripe per color, for a node or property's header. */
export function generateStripeGradientCSS(colors: string[], stripeWidth = 8, angle = 45): string {
  if (colors.length === 0) {
    return 'transparent';
  }

  const colorStops: string[] = [];

  colors.forEach((color, index) => {
    const startPos = index * stripeWidth;
    const endPos = (index + 1) * stripeWidth;
    colorStops.push(`${color} ${startPos}px`);
    colorStops.push(`${color} ${endPos}px`);
  });

  return `repeating-linear-gradient(${angle}deg, ${colorStops.join(', ')})`;
}

/** The same stripe pattern as `generateStripeGradientCSS`, as Cytoscape's own colors/positions pair rather than CSS. */
export function generateStripeGradient(colors: string[], repetitions = 4): { colors: string; positions: string } {
  if (colors.length === 0) {
    return { colors: '', positions: '' };
  }

  const colorStops: string[] = [];
  const positionStops: number[] = [];

  const totalSegments = colors.length * repetitions;
  const segmentSize = 100 / totalSegments;

  // Generate color stops and positions
  for (let rep = 0; rep < repetitions; rep++) {
    for (let i = 0; i < colors.length; i++) {
      const color = colors[i];
      const segmentIndex = rep * colors.length + i;
      const startPosition = segmentIndex * segmentSize;
      const endPosition = (segmentIndex + 1) * segmentSize;

      // Add color twice: once at start, once at end (for sharp cutoff)
      colorStops.push(color, color);
      positionStops.push(startPosition, endPosition);
    }
  }

  // Ensure we end at exactly 100%
  positionStops[positionStops.length - 1] = 100;

  return {
    colors: colorStops.join(' '),
    positions: positionStops.map(p => `${p.toFixed(2)}%`).join(' ')
  };
}

