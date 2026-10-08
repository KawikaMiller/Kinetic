// Fixed positions for each preset's resource-allocation graph.
import type { Pt } from '../../components/GraphView';
import { PRESETS, type PresetId } from './model';

export interface GraphLayout {
  width: number;
  height: number;
  at: Record<string, Pt>;
  /** Tags go above nodes higher than this and below the rest, away from the middle. */
  centre: Pt;
}

/** Where a node's tag goes: `gap` straight above it in the top half of the drawing, below it in the bottom half. */
export function tagAt(l: GraphLayout, at: Pt, gap: number): Pt {
  return { x: at.x, y: at.y + (at.y < l.centre.y ? -gap : gap) };
}

const ring = (ids: readonly string[], cx: number, cy: number, r: number, startDeg: number, stepDeg: number) =>
  Object.fromEntries(ids.map((id, i) => {
    const a = ((startDeg + i * stepDeg) * Math.PI) / 180;
    return [id, { x: Math.round(cx + r * Math.cos(a)), y: Math.round(cy + r * Math.sin(a)) }];
  }));

/** Two threads and two resources on a square: the cycle runs round its edge. */
const square = (t1: string, r1: string, t2: string, r2: string): GraphLayout => ({
  width: 420,
  height: 290,
  centre: { x: 210, y: 140 },
  at: { [t1]: { x: 100, y: 70 }, [r1]: { x: 320, y: 70 }, [t2]: { x: 320, y: 210 }, [r2]: { x: 100, y: 210 } },
});

const DINING = PRESETS.dining;

export const LAYOUTS: Record<PresetId, GraphLayout> = {
  two: square('T1', 'A', 'T2', 'B'),
  database: square('T1', 'row 1', 'T2', 'row 2'),
  // Round the ring in cycle order: A → T1 → B → T2 → C → T3 → A.
  transfer: { width: 340, height: 330, centre: { x: 170, y: 165 }, at: ring(['A', 'T1', 'B', 'T2', 'C', 'T3'], 170, 165, 120, -90, 60) },
  dining: {
    width: 460,
    height: 430,
    centre: { x: 230, y: 214 },
    at: {
      // Philosopher i sits between fork i (left) and fork i + 1 (right).
      ...ring(DINING.threads.map((t) => t.id), 230, 214, 160, -90, 72),
      ...ring(DINING.resources, 230, 214, 112, -126, 72),
    },
  },
};
