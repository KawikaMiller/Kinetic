import { motion } from 'motion/react';
import type { PointerEvent } from 'react';
import { usePlot } from '../../components/plotContext';
import { SPRING } from '../../core/motion';
import type { Point } from '../../core/plot';
import { CLUSTER_TONES } from './view';
import type { P } from './model';

const ARM = 9;
const RING_R = 15;

/** Centroids as large ✚ marks in their cluster's colour; a --hi ring while they're moving. */
export function Centroids({ centroids, moving }: { centroids: readonly P[]; moving: boolean }) {
  const { xs, ys } = usePlot();
  return (
    <g className="km-centroids" aria-hidden="true">
      {centroids.map((c, j) => (
        <motion.g key={j} initial={false} animate={{ x: xs.map(c[0]), y: ys.map(c[1]) }} transition={SPRING.soft} className={`tone-${CLUSTER_TONES[j]}`}>
          {moving && <circle className="km-moving" r={RING_R} />}
          <path className="km-cross-under" d={`M${-ARM} 0H${ARM}M0 ${-ARM}V${ARM}`} />
          <path className="km-cross" d={`M${-ARM} 0H${ARM}M0 ${-ARM}V${ARM}`} />
        </motion.g>
      ))}
    </g>
  );
}

/** Pointer path for editing points: a click in the plotting box. The keyboard path is the cursor and its buttons. */
export function ClickCatcher({ onClick }: { onClick: (p: Point) => void }) {
  const { box, toData } = usePlot();
  const down = (e: PointerEvent<SVGRectElement>) => {
    const p = toData(e.clientX, e.clientY);
    if (p) onClick(p);
  };
  return <rect className="km-catcher" x={box.x} y={box.y} width={box.width} height={box.height} onPointerDown={down} aria-hidden="true" />;
}
