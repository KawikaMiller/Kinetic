import { motion } from 'motion/react';
import { useArrowMarker } from '../../components/ArrowMarker';
import { SPRING } from '../../core/motion';
import { BYTE, wheelIndex, wrap8 } from './model';

export const WHEEL_SIZE = 300;
const C = WHEEL_SIZE / 2;
const R_UNSIGNED = 132;
const R_TICK_OUT = 118;
const R_TICK_IN = 111;
const R_TICK_MAJOR = 106;
const R_SIGNED = 91;
const R_SEAM_IN = 78;
const LABEL_EVERY = 16;
const STEP_DEG = 360 / BYTE;
const DIRECTION_ARC_R = 144;
const DIRECTION_ARC_DEG = 16;

export interface Flash {
  signed: boolean;
  unsigned: boolean;
  id: number;
}

const rad = (deg: number) => (deg * Math.PI) / 180;
const polar = (r: number, deg: number) => ({ x: C + r * Math.sin(rad(deg)), y: C - r * Math.cos(rad(deg)) });

function radial(r1: number, r2: number, deg: number) {
  const a = polar(r1, deg);
  const b = polar(r2, deg);
  return { x1: a.x, y1: a.y, x2: b.x, y2: b.y };
}

const LABELS = Array.from({ length: BYTE / LABEL_EVERY }, (_, k) => k * LABEL_EVERY);
const TICKS = Array.from({ length: BYTE }, (_, k) => k);
/** The signed seam sits between 127 and 128 (= -128); the unsigned seam between 255 and 0. */
const SIGNED_SEAM_DEG = 127.5 * STEP_DEG;
const UNSIGNED_SEAM_DEG = -0.5 * STEP_DEG;

/**
 * An 8-bit odometer: 256 positions, unsigned labels on the outer ring, the same bit
 * patterns read as signed on the inner ring. The wheel turns so the current position
 * is always under the fixed pointer at the top.
 */
export function Wheel({ turns, flash }: { turns: number; flash: Flash | null }) {
  const arrow = useArrowMarker('var(--hi)', { size: 6 });
  const rotation = -turns * STEP_DEG;
  const current = wheelIndex(turns);
  const arcFrom = polar(DIRECTION_ARC_R, -DIRECTION_ARC_DEG);
  const arcTo = polar(DIRECTION_ARC_R, DIRECTION_ARC_DEG);

  return (
    <svg className="tc-wheel" width={WHEEL_SIZE} height={WHEEL_SIZE} viewBox={`0 0 ${WHEEL_SIZE} ${WHEEL_SIZE}`} role="img" aria-label={`8-bit wheel at ${current}`}>
      {arrow.def}
      <circle cx={C} cy={C} r={R_UNSIGNED + 12} className="tc-face" />
      <motion.g
        className="tc-rotor"
        initial={false}
        animate={{ rotate: rotation }}
        transition={SPRING.snappy}
        style={{ transformOrigin: `${C}px ${C}px`, transformBox: 'view-box' }}
      >
        <circle cx={C} cy={C} r={R_TICK_OUT} className="tc-ring-unsigned" />
        <circle cx={C} cy={C} r={R_SIGNED + 12} className="tc-ring-signed" />
        {TICKS.map((k) => (
          <line key={k} {...radial(k % LABEL_EVERY ? R_TICK_IN : R_TICK_MAJOR, R_TICK_OUT, k * STEP_DEG)} className="tc-tick" />
        ))}
        <line {...radial(R_SEAM_IN, R_TICK_OUT, SIGNED_SEAM_DEG)} className="tc-seam signed" />
        <line {...radial(R_TICK_OUT, R_UNSIGNED + 12, UNSIGNED_SEAM_DEG)} className="tc-seam unsigned" />
        {flash?.signed && (
          <motion.line key={`s${flash.id}`} {...radial(R_SEAM_IN, R_TICK_OUT, SIGNED_SEAM_DEG)} className="tc-seam-flash" initial={{ opacity: 1 }} animate={{ opacity: 0 }} transition={{ duration: 1.4 }} />
        )}
        {flash?.unsigned && (
          <motion.line key={`u${flash.id}`} {...radial(R_TICK_OUT, R_UNSIGNED + 12, UNSIGNED_SEAM_DEG)} className="tc-seam-flash" initial={{ opacity: 1 }} animate={{ opacity: 0 }} transition={{ duration: 1.4 }} />
        )}
        {LABELS.map((k) => {
          const deg = k * STEP_DEG;
          const outer = polar(R_UNSIGNED, deg);
          const inner = polar(R_SIGNED, deg);
          return (
            <g key={k}>
              {/* counter-rotated so the numbers stay upright while the wheel turns */}
              <motion.text x={outer.x} y={outer.y} className={`tc-label unsigned ${k === current ? 'is-now' : ''}`} initial={false} animate={{ rotate: -rotation }} transition={SPRING.snappy}>
                {k}
              </motion.text>
              <motion.text x={inner.x} y={inner.y} className={`tc-label signed ${k === current ? 'is-now' : ''}`} initial={false} animate={{ rotate: -rotation }} transition={SPRING.snappy}>
                {wrap8(k)}
              </motion.text>
            </g>
          );
        })}
      </motion.g>
      <path d={`M ${arcFrom.x} ${arcFrom.y} A ${DIRECTION_ARC_R} ${DIRECTION_ARC_R} 0 0 1 ${arcTo.x} ${arcTo.y}`} className="tc-direction" markerEnd={arrow.url} />
      <path d={`M ${C - 7} 6 L ${C + 7} 6 L ${C} 18 Z`} className="tc-pointer" />
      <text x={C} y={C - 8} className="tc-center unsigned">{current}</text>
      <text x={C} y={C + 18} className="tc-center signed">{wrap8(current)}</text>
      <text x={C} y={C + 34} className="tc-center-cap">unsigned / signed</text>
    </svg>
  );
}
