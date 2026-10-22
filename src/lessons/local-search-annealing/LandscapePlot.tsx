import { useMemo } from 'react';
import { Bars, Curve, Plot2D, Points } from '../../components/Plot2D';
import { PHONE_QUERY, useMediaQuery } from '../../components/useMediaQuery';
import type { Tone } from '../../core/tone';
import { CELLS, GLOBAL_CELL, LANDSCAPE, LOCAL_CELL } from './landscape';

const PHONE_WIDTH = 356;
const DESKTOP_WIDTH = 560;
const PLOT_HEIGHT = 240;
/** Bars start below zero so the global minimum (score 0) still shows as a short bar. */
const FLOOR = -0.5;
const BALL_LIFT = 0.9;
const MAX_TRAIL_POINTS = 400;
const SCORE_TICKS = [0, 2, 4, 6, 8];

const BARS = LANDSCAPE.map((f, c): { x0: number; x1: number; y: number; tone: Tone } => ({
  x0: c, x1: c + 1, y: f, tone: c === GLOBAL_CELL ? 'ok' : c === LOCAL_CELL ? 'orange' : 'muted',
}));

/** The 20-cell landscape as bars (lower is better), with the ball, the trail it left and the best cell it saw. */
export function LandscapePlot({ cells, upTo, best }: { cells: readonly number[]; upTo: number; best: number }) {
  const phone = useMediaQuery(PHONE_QUERY);
  const trail = useMemo(() => {
    const stride = Math.max(1, Math.ceil(upTo / MAX_TRAIL_POINTS));
    const out: [number, number][] = [];
    for (let k = 0; k <= upTo; k += stride) out.push([cells[k] + 0.5, LANDSCAPE[cells[k]] + BALL_LIFT]);
    out.push([cells[upTo] + 0.5, LANDSCAPE[cells[upTo]] + BALL_LIFT]);
    return out;
  }, [cells, upTo]);
  const cell = cells[upTo];
  return (
    <Plot2D
      x={{ domain: [0, CELLS], label: 'cell', ticks: 10 }}
      y={{ domain: [FLOOR, 9.5], label: 'score (lower is better)', tickValues: SCORE_TICKS }}
      width={phone ? PHONE_WIDTH : DESKTOP_WIDTH}
      height={PLOT_HEIGHT}
      ariaLabel={`Landscape of 20 cells; the ball is on cell ${cell} with score ${LANDSCAPE[cell]}`}
    >
      <Bars bars={BARS} base={FLOOR} />
      <Curve points={trail} tone="info" dashed />
      <Points data={[{ x: best + 0.5, y: LANDSCAPE[best] + BALL_LIFT, tone: 'ok', hollow: true, r: 11 }]} />
      <Points data={[{ x: cell + 0.5, y: LANDSCAPE[cell] + BALL_LIFT, tone: 'hi' }]} r={7} />
    </Plot2D>
  );
}
