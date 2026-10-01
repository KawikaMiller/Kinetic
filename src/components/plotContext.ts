import { createContext, useContext } from 'react';
import type { PlotFrame, Point } from '../core/plot';

/** Shared by Plot2D and its layers (kept apart so Plot2D.tsx exports only components). */
export interface PlotContextValue extends PlotFrame {
  /** Id of the clip path around the plotting box. */
  clip: string;
  /** Client (pointer) coordinates → data coordinates, clamped to the domain. */
  toData: (clientX: number, clientY: number) => Point | null;
}

export const PlotContext = createContext<PlotContextValue | null>(null);

/** The plot's scales and box, for custom layers drawn in data space: `xs.map(x)`, `ys.map(y)`. */
export function usePlot(): PlotContextValue {
  const ctx = useContext(PlotContext);
  if (!ctx) throw new Error('usePlot must be used inside <Plot2D>');
  return ctx;
}
