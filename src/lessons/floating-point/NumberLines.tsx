import { motion } from 'motion/react';
import { SPRING } from '../../core/motion';
import { linearScale, logScale } from '../../core/scale';
import { neighbours, ulpAt } from './model';

export const LINES_WIDTH = 600;
const PAD = 30;
const NEIGHBOURS = 3;
const ZOOM_H = 96;
const ZOOM_AXIS_Y = 56;
const MAG_H = 92;
const MAG_AXIS_Y = 36;
const MAG_MIN_EXP = -6;
const MAG_MAX_EXP = 9;
const MAG_TICK_STEP = 3;

const short = (x: number) => (Math.abs(x) >= 1e5 || (x !== 0 && Math.abs(x) < 1e-3) ? x.toExponential(3) : String(Number(x.toPrecision(8))));

/**
 * The representable float32s either side of the current value, on a linear axis, so
 * the gap between neighbours is visible (and changes where a power of two is crossed).
 */
export function ZoomLine({ bits, value, typed }: { bits: number; value: number; typed: number | null }) {
  const mag = Math.abs(value);
  const { below, above } = neighbours(bits, NEIGHBOURS);
  const all = [...below, mag, ...above];
  const lo = all[0];
  const hi = all[all.length - 1];
  const x = linearScale(lo, hi === lo ? lo + 1 : hi, PAD, LINES_WIDTH - PAD);
  const typedMag = typed === null ? null : Math.abs(typed);
  const showTyped = typedMag !== null && typedMag !== mag && typedMag >= lo && typedMag <= hi;
  const gapTo = above[0];

  return (
    <svg className="fp-line" width={LINES_WIDTH} height={ZOOM_H} viewBox={`0 0 ${LINES_WIDTH} ${ZOOM_H}`} role="img" aria-label="nearest representable neighbours">
      <text x={PAD} y={14} className="fp-line-title">zoomed in: every float32 near |x| (linear)</text>
      <line x1={PAD} y1={ZOOM_AXIS_Y} x2={LINES_WIDTH - PAD} y2={ZOOM_AXIS_Y} className="fp-axis" />
      {gapTo !== undefined && (
        <g className="fp-gap">
          <path d={`M ${x.map(mag)} ${ZOOM_AXIS_Y - 14} v -5 H ${x.map(gapTo)} v 5`} />
          <text x={(x.map(mag) + x.map(gapTo)) / 2} y={ZOOM_AXIS_Y - 23}>gap {gapTo - mag > 0 ? short(gapTo - mag) : ''}</text>
        </g>
      )}
      {[...below, ...above].map((n) => (
        <circle key={n} cx={x.map(n)} cy={ZOOM_AXIS_Y} r={4} className="fp-neighbour" />
      ))}
      {showTyped && (
        <g>
          <circle cx={x.map(typedMag)} cy={ZOOM_AXIS_Y} r={7} className="fp-typed" />
          <text x={x.map(typedMag)} y={ZOOM_AXIS_Y + 26} className="fp-typed-label">you typed</text>
        </g>
      )}
      <motion.circle cy={ZOOM_AXIS_Y} r={6} className="fp-current" initial={false} animate={{ cx: x.map(mag) }} transition={SPRING.snappy} />
      <text x={x.map(lo)} y={ZOOM_H - 6} className="fp-end">{short(lo)}</text>
      <text x={x.map(hi)} y={ZOOM_H - 6} className="fp-end is-right">{short(hi)}</text>
    </svg>
  );
}

const MAG_TICKS = Array.from({ length: (MAG_MAX_EXP - MAG_MIN_EXP) / MAG_TICK_STEP + 1 }, (_, i) => MAG_MIN_EXP + i * MAG_TICK_STEP);

/** Magnitudes on a log axis, with the gap between neighbouring floats at each power of ten. */
export function MagnitudeLine({ value }: { value: number }) {
  const x = logScale(10 ** MAG_MIN_EXP, 10 ** MAG_MAX_EXP, PAD, LINES_WIDTH - PAD);
  const mag = Math.abs(value);
  const onScale = Number.isFinite(mag) && mag >= 10 ** MAG_MIN_EXP && mag <= 10 ** MAG_MAX_EXP;

  return (
    <svg className="fp-line" width={LINES_WIDTH} height={MAG_H} viewBox={`0 0 ${LINES_WIDTH} ${MAG_H}`} role="img" aria-label="gap size by magnitude">
      <text x={PAD} y={14} className="fp-line-title">zoomed out: the gap between floats at each size (log scale)</text>
      <line x1={PAD} y1={MAG_AXIS_Y} x2={LINES_WIDTH - PAD} y2={MAG_AXIS_Y} className="fp-axis" />
      {MAG_TICKS.map((k) => {
        const tx = x.map(10 ** k);
        return (
          <g key={k}>
            <line x1={tx} y1={MAG_AXIS_Y - 5} x2={tx} y2={MAG_AXIS_Y + 5} className="fp-axis" />
            <text x={tx} y={MAG_AXIS_Y + 20} className="fp-tick">1e{k}</text>
            <text x={tx} y={MAG_AXIS_Y + 36} className="fp-tick-gap">gap {ulpAt(10 ** k).toExponential(1)}</text>
          </g>
        );
      })}
      {onScale ? (
        <motion.circle cy={MAG_AXIS_Y} r={6} className="fp-current" initial={false} animate={{ cx: x.map(mag) }} transition={SPRING.snappy} />
      ) : (
        <text x={LINES_WIDTH - PAD} y={MAG_AXIS_Y - 10} className="fp-end is-right">|x| is off this scale</text>
      )}
    </svg>
  );
}
