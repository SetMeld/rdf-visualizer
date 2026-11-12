/**
 * A CSS color as Cytoscape can draw it: `#rrggbb`, resolved within `within`.
 *
 * Cytoscape paints on a canvas and parses neither custom properties nor `oklch`, so the browser
 * resolves the color and a canvas reads it back.
 */
export function canvasColor(value: string, within: Element, fallback: string): string {
  const document = within.ownerDocument;
  const probe = document.createElement('span');
  // Not `color`, which is inherited: an undefined custom property would come back as the text color.
  probe.style.backgroundColor = value;
  within.appendChild(probe);
  const computed = document.defaultView?.getComputedStyle(probe).backgroundColor ?? '';
  probe.remove();

  const context = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  if (!computed || !context) return fallback;
  context.fillStyle = computed;
  context.fillRect(0, 0, 1, 1);
  const [red, green, blue, alpha] = context.getImageData(0, 0, 1, 1).data;
  const hex = (channel: number) => channel.toString(16).padStart(2, '0');
  return alpha === 0 ? fallback : `#${hex(red)}${hex(green)}${hex(blue)}`;
}
