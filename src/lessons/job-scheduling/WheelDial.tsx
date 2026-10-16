import type { Placement } from './wheel';
import { WHEEL_SLOTS } from './wheel';

const SIZE = 300;
const CENTRE = SIZE / 2;
const R_OUT = 140;
const R_IN = 46;
const R_LABEL = 128;
const R_JOBS = 92;
const SLICE = 360 / WHEEL_SLOTS;
const LINE_PX = 15;
const MAX_LISTED = 3;

/** Point on a circle of radius `r` at `deg` degrees clockwise from twelve o'clock. */
const at = (r: number, deg: number) => {
  const a = ((deg - 90) * Math.PI) / 180;
  return { x: CENTRE + r * Math.cos(a), y: CENTRE + r * Math.sin(a) };
};

function sector(slot: number): string {
  const [a0, a1] = [slot * SLICE - SLICE / 2, slot * SLICE + SLICE / 2];
  const [o0, o1, i1, i0] = [at(R_OUT, a0), at(R_OUT, a1), at(R_IN, a1), at(R_IN, a0)];
  return `M${o0.x} ${o0.y} A${R_OUT} ${R_OUT} 0 0 1 ${o1.x} ${o1.y} L${i1.x} ${i1.y} A${R_IN} ${R_IN} 0 0 0 ${i0.x} ${i0.y} Z`;
}

/** The wheel at one tick: eight slots, the pointer, and the jobs waiting in each with their laps to go. */
export function WheelDial({ slots, pointer, firedNow, ariaLabel }: { slots: readonly (readonly Placement[])[]; pointer: number | null; firedNow: readonly number[]; ariaLabel: string }) {
  const tip = pointer === null ? null : at(R_OUT - 6, pointer * SLICE);
  return (
    <svg className="js-dial" viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label={ariaLabel}>
      {slots.map((jobs, s) => (
        <g key={s}>
          <path className={`js-slot${pointer === s ? ' is-pointer' : ''}`} d={sector(s)} />
          <text className="js-slot-no" x={at(R_LABEL, s * SLICE).x} y={at(R_LABEL, s * SLICE).y} textAnchor="middle" dominantBaseline="middle">{s}</text>
          {jobs.slice(0, MAX_LISTED).map((j, i) => {
            const p = at(R_JOBS, s * SLICE);
            return (
              <text key={j.id} className={`js-job${firedNow.includes(j.id) ? ' is-fired' : ''}`} x={p.x} y={p.y + (i - (Math.min(jobs.length, MAX_LISTED) - 1) / 2) * LINE_PX} textAnchor="middle" dominantBaseline="middle">
                J{j.id}
                <tspan className="js-rounds"> ·{j.rounds}</tspan>
              </text>
            );
          })}
          {jobs.length > MAX_LISTED && (
            <text className="js-more" x={at(R_JOBS - 22, s * SLICE).x} y={at(R_JOBS - 22, s * SLICE).y} textAnchor="middle" dominantBaseline="middle">+{jobs.length - MAX_LISTED}</text>
          )}
        </g>
      ))}
      {tip && <line className="js-pointer" x1={CENTRE} y1={CENTRE} x2={tip.x} y2={tip.y} />}
      <circle className="js-hub" cx={CENTRE} cy={CENTRE} r={8} />
    </svg>
  );
}
