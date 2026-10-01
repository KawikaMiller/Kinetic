/**
 * Paint on an offscreen canvas and return it as a data URL for an SVG `<image>`, so a
 * layer with thousands of cells (a 1,000-person CellGrid, Plot2D's Heat) costs one
 * element instead of thousands. Drawn at 2× for high-DPI screens; null without a DOM.
 */
export function paintImage(width: number, height: number, draw: (ctx: CanvasRenderingContext2D) => void, scale = 2): string | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.ceil(width * scale));
  canvas.height = Math.max(1, Math.ceil(height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.scale(scale, scale);
  draw(ctx);
  return canvas.toDataURL();
}
