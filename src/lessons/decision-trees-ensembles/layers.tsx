import type { PointerEvent } from 'react';
import { usePlot } from '../../components/plotContext';
import type { Point } from '../../core/plot';
import type { Cls, Sample } from './model';
import { CLASS_TONE } from './view';

const MISS_GAP = 2.5;

/**
 * Training (solid) or validation (hollow) points in their class colour, each with its own
 * radius (AdaBoost's weights), and a red ring round every point the current model gets wrong.
 * Plot2D's Points takes one radius for the whole layer and has no ring, hence this layer.
 */
export function SampleDots({ samples, hollow = false, radius, predict }: {
  samples: readonly Sample[];
  hollow?: boolean;
  radius: (i: number) => number;
  predict?: (s: Sample) => Cls;
}) {
  const { xs, ys } = usePlot();
  return (
    <g className="plot-points" aria-hidden="true">
      {samples.map((s, i) => {
        const [cx, cy, r] = [xs.map(s.x), ys.map(s.y), radius(i)];
        return (
          <g key={i}>
            {predict && predict(s) !== s.label && <circle className="dte-miss" cx={cx} cy={cy} r={r + MISS_GAP} />}
            <circle className={`plot-point tone-${CLASS_TONE[s.label]} ${hollow ? 'is-hollow' : ''}`} cx={cx} cy={cy} r={r} />
          </g>
        );
      })}
    </g>
  );
}

/** Pointer path for adding a point: a click anywhere in the plotting box. The keyboard path is the cursor + button. */
export function AddPointCatcher({ onAdd }: { onAdd: (p: Point) => void }) {
  const { box, toData } = usePlot();
  const down = (e: PointerEvent<SVGRectElement>) => {
    const p = toData(e.clientX, e.clientY);
    if (p) onAdd(p);
  };
  return <rect className="dte-catcher" x={box.x} y={box.y} width={box.width} height={box.height} onPointerDown={down} aria-hidden="true" />;
}
