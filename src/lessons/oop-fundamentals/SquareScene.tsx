import { motion } from 'motion/react';
import { useMemo, type ReactNode } from 'react';
import { CodePanel } from '../../components/CodePanel';
import { StageFrame } from '../../components/StageFrame';
import { Legend, Stat, Stats } from '../../components/ui';
import { SPRING } from '../../core/motion';
import { usePlayer } from '../../core/usePlayer';
import { SQUARE_CODE, squareFrames } from './frames';
import { OOP_MIN_WIDTH } from './shared';

const UNIT = 44;
const ORIGIN = { x: 90, y: 60 };
const SCENE_W = 660;
const SCENE_H = 260;

/** The shape itself, drawn to scale: a Square that Rect's setWidth stretches into a rectangle. */
export function SquareScene({ picker }: { picker: ReactNode }) {
  const frames = useMemo(() => squareFrames(), []);
  const player = usePlayer(frames, { interval: 1800 });
  const f = player.frame;

  return (
    <StageFrame
      minWidth={OOP_MIN_WIDTH}
      player={player}
      height={320}
      stats={
        <Stats>
          <Stat label="w × h" value={`${f.w} × ${f.h}`} color={f.broken ? 'var(--bad)' : 'var(--info)'} />
          <Stat label="area()" value={f.area ?? '…'} color={f.broken ? 'var(--bad)' : 'var(--ok)'} />
          <Stat label="Still a square?" value={f.broken ? 'no' : 'yes'} color={f.broken ? 'var(--bad)' : 'var(--ok)'} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'a valid square' },
            { color: 'var(--bad)', label: 'invariant broken (w ≠ h)' },
          ]}
        />
      }
      controls={[picker]}
    >
      <div className="oo">
        <CodePanel title="JavaScript" lines={SQUARE_CODE} active={f.line} />
        <svg className="oo-scene" viewBox={`0 0 ${SCENE_W} ${SCENE_H}`} role="img" aria-label="The square drawn to scale">
          <text className="scene-zone" x={16} y={24}>sq, drawn to scale</text>
          <motion.rect
            className={`oo-shape ${f.broken ? 'is-broken' : ''}`}
            x={ORIGIN.x}
            y={ORIGIN.y}
            rx={6}
            initial={false}
            animate={{ width: f.w * UNIT, height: f.h * UNIT }}
            transition={SPRING.soft}
          />
          <text className="oo-shape-label" x={ORIGIN.x + 10} y={ORIGIN.y + 22}>
            Square
          </text>
          <text className="oo-dim" x={ORIGIN.x} y={ORIGIN.y - 10}>
            w = {f.w}
          </text>
          <text className="oo-dim" x={ORIGIN.x - 12} y={ORIGIN.y + (f.h * UNIT) / 2} textAnchor="end">
            h = {f.h}
          </text>
        </svg>
      </div>
    </StageFrame>
  );
}
