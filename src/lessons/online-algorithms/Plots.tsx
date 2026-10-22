import { useMemo } from 'react';
import { Curve, HLine, Plot2D, Points, VLine } from '../../components/Plot2D';
import { breakEvenBound, maxSeason, opt, ratio, skiCost, worstSeason, type Strategy } from './model';

export const PLOT_WIDTH = 356;
const PLOT_HEIGHT = 230;
const RATIO_HEADROOM = 1.1;
const MIN_RATIO_TOP = 2.2;

const seasons = (B: number) => Array.from({ length: maxSeason(B) }, (_, i) => i + 1);

/** Online cost and the hindsight optimum over the season length, with the chosen season marked. */
export function CostPlot({ B, strategy, N }: { B: number; strategy: Strategy; N: number }) {
  const online = useMemo(() => seasons(B).map((n) => [n, skiCost(strategy, B, n)] as const), [B, strategy]);
  const best = useMemo(() => seasons(B).map((n) => [n, opt(B, n)] as const), [B]);
  const top = Math.max(...online.map((p) => p[1]), B);
  return (
    <Plot2D
      x={{ domain: [1, maxSeason(B)], label: 'season length N (days)' }}
      y={{ domain: [0, top * RATIO_HEADROOM], label: 'cost' }}
      width={PLOT_WIDTH}
      height={PLOT_HEIGHT}
      ariaLabel="Cost of the online strategy and of the hindsight optimum against the season length"
    >
      <Curve points={online} tone="bad" />
      <Curve points={best} tone="ok" />
      <VLine at={N} label={`N = ${N}`} />
    </Plot2D>
  );
}

/** The ratio of online cost to the optimum over the season length, the break-even bound as a line, and a season rule (draggable when `onDragN` is given). */
export function RatioPlot({
  B, strategy, N, onDragN, showBound = true,
}: {
  B: number;
  strategy: Strategy;
  N: number;
  onDragN?: (n: number) => void;
  showBound?: boolean;
}) {
  const points = useMemo(() => seasons(B).map((n) => [n, ratio(strategy, B, n)] as const), [B, strategy]);
  const worst = useMemo(() => worstSeason(strategy, B), [B, strategy]);
  const top = Math.max(MIN_RATIO_TOP, worst.ratio * RATIO_HEADROOM);
  const max = maxSeason(B);
  return (
    <Plot2D
      x={{ domain: [1, max], label: 'season length N (days)' }}
      y={{ domain: [0, top], label: 'ratio to the optimum' }}
      width={PLOT_WIDTH}
      height={PLOT_HEIGHT}
      ariaLabel="Ratio of the online cost to the optimum against the season length"
    >
      {showBound && <HLine at={breakEvenBound(B)} label={`2 - 1/B = ${breakEvenBound(B).toFixed(2)}`} tone="dim" />}
      <Curve points={points} tone="bad" />
      <Points data={[{ x: worst.N, y: worst.ratio, tone: 'bad', hollow: true }]} />
      {onDragN ? (
        <VLine
          at={N}
          label={`N = ${N}`}
          onDrag={(x) => onDragN(Math.min(max, Math.max(1, Math.round(x))))}
          onStep={(dir) => onDragN(Math.min(max, Math.max(1, N + dir)))}
          ariaLabel="Season length"
          valueText={`season length ${N} days`}
        />
      ) : (
        <VLine at={N} label={`N = ${N}`} />
      )}
    </Plot2D>
  );
}
