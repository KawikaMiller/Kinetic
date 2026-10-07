import { useArrowMarker } from '../../components/ArrowMarker';
import { ADDER } from './layout';
import { BITS, bitAt, type AdderRun, type Timed } from './model';
import type { AdderMode } from './frames';

/** The state a carry wire is drawn in at this tick. */
function carryState(c: Timed, tick: number): 'pending' | 'arriving' | 'high' | 'low' {
  if (c.at > tick) return 'pending';
  if (c.at === tick) return 'arriving';
  return c.value ? 'high' : 'low';
}

/**
 * Four full-adder boxes, most significant on the left. In ripple mode each carry wire runs
 * from one stage into the next; in lookahead mode every carry comes up from the lookahead unit.
 */
export function RippleDiagram({ a, b, run, mode, tick }: { a: number; b: number; run: AdderRun; mode: AdderMode; tick: number }) {
  // Marker size is in stroke widths (2.5-3.5px here), so a small number keeps the head about 10px.
  const arrow = useArrowMarker('var(--muted)', { size: 3 });
  const { boxW, boxTop, boxH, boxX, carryY, unitTop, unitH, width, height } = ADDER;
  const right = (i: number) => boxX(i) + boxW;
  const label = (c: Timed) => (c.at > tick ? '?' : String(c.value));

  /** Where carry i enters its stage (from the right) or, for the carry out, where it leaves stage 3. */
  const carryEnd = (i: number) => (i === BITS ? boxX(BITS - 1) - 40 : right(i));
  const carryStart = (i: number) => (i === 0 ? right(0) + 40 : boxX(i - 1));

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="aa-svg" role="img" aria-label={`${mode} adder, tick ${tick}`}>
      {arrow.def}
      {run.carries.map((c, i) => {
        const state = carryState(c, tick);
        const name = i === 0 ? 'C₀' : i === BITS ? 'Cout' : `C${i}`;
        const fromUnit = mode === 'lookahead' && i > 0;
        const x2 = carryEnd(i);
        // From the unit, each carry rises just to the right of where it ends, then turns left into it.
        const riser = x2 + (i === BITS ? 20 : 14);
        const path = fromUnit ? `M ${riser} ${unitTop} V ${carryY} H ${x2}` : `M ${carryStart(i)} ${carryY} H ${x2}`;
        const lx = fromUnit ? riser : (carryStart(i) + x2) / 2;
        return (
          <g key={i} className={`aa-carry is-${state}`}>
            <path d={path} markerEnd={arrow.url} />
            <text x={lx} y={boxTop - 8} textAnchor="middle" className="aa-carry-label">
              {name} = {label(c)}
            </text>
          </g>
        );
      })}
      {Array.from({ length: BITS }, (_, i) => {
        const x = boxX(i);
        const s = run.sum[i];
        const formed = tick >= 1;
        return (
          <g key={i} className={`aa-stage ${s.at === tick ? 'is-now' : ''}`}>
            <text x={x + boxW / 2} y={boxTop - 26} textAnchor="middle" className="aa-in">
              A{i}={bitAt(a, i)} B{i}={bitAt(b, i)}
            </text>
            <rect x={x} y={boxTop} width={boxW} height={boxH} rx={10} className="aa-box" />
            <text x={x + boxW / 2} y={boxTop + 26} textAnchor="middle" className="aa-box-title">FA{i}</text>
            <text x={x + boxW / 2} y={boxTop + 50} textAnchor="middle" className="aa-gp">
              {formed ? `G=${bitAt(a & b, i)} P=${bitAt(a ^ b, i)}` : 'G=? P=?'}
            </text>
            <text x={x + boxW / 2} y={boxTop + boxH + 24} textAnchor="middle" className={`aa-sum ${s.at > tick ? 'is-pending' : s.value ? 'is-high' : ''}`}>
              S{i} = {s.at > tick ? '?' : s.value}
            </text>
          </g>
        );
      })}
      {mode === 'lookahead' && (
        <g className={`aa-unit ${tick >= 2 ? 'is-done' : ''}`}>
          <rect x={boxX(BITS - 1) - 40} y={unitTop} width={right(0) - boxX(BITS - 1) + 80} height={unitH} rx={8} />
          <text x={width / 2} y={unitTop + unitH / 2 + 4} textAnchor="middle">carry lookahead: every Cᵢ₊₁ from G, P and C₀ at once</text>
        </g>
      )}
    </svg>
  );
}
