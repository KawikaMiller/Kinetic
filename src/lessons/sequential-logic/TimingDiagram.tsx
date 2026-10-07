import type { Bit } from '../../core/bits';
import { isRisingEdge, type Sample } from './model';

export const WINDOW = 40;
const SAMPLE_W = 12;
const LABEL_W = 96;
const LANE_H = 44;
const WAVE_H = 24;
export const DIAGRAM_WIDTH = LABEL_W + WINDOW * SAMPLE_W + 8;

interface Lane {
  label: string;
  pick: (s: Sample) => Bit;
  /** CLK and D colour each stretch by level; the Q lanes are stored values. */
  kind: 'level' | 'stored';
}

const LANES: readonly Lane[] = [
  { label: 'CLK', pick: (s) => s.clk, kind: 'level' },
  { label: 'D', pick: (s) => s.d, kind: 'level' },
  { label: 'Q latch', pick: (s) => s.latch, kind: 'stored' },
  { label: 'Q flip-flop', pick: (s) => s.ff, kind: 'stored' },
];

/** Runs of equal values in a lane, as [start index, end index (exclusive), value]. */
function runs(samples: readonly Sample[], pick: (s: Sample) => Bit): [number, number, Bit][] {
  const out: [number, number, Bit][] = [];
  samples.forEach((s, i) => {
    const v = pick(s);
    const last = out[out.length - 1];
    if (last && last[2] === v) last[1] = i + 1;
    else out.push([i, i + 1, v]);
  });
  return out;
}

/** The last WINDOW samples as square waves, one lane per signal, rising (capturing) edges marked. */
export function TimingDiagram({ samples }: { samples: readonly Sample[] }) {
  const shown = samples.slice(-WINDOW);
  const x = (i: number) => LABEL_W + i * SAMPLE_W;
  const height = LANES.length * LANE_H + 8;
  return (
    <svg viewBox={`0 0 ${DIAGRAM_WIDTH} ${height}`} width={DIAGRAM_WIDTH} className="sq-timing" role="img" aria-label="Timing diagram: CLK, D and both Q outputs">
      {shown.map((s, i) =>
        isRisingEdge(s.t) ? <line key={`e${s.t}`} x1={x(i)} x2={x(i)} y1={4} y2={height - 4} className="sq-edge" /> : null,
      )}
      {LANES.map((lane, k) => {
        const top = k * LANE_H + (LANE_H - WAVE_H) / 2 + 4;
        const y = (v: Bit) => (v ? top : top + WAVE_H);
        const segments = runs(shown, lane.pick);
        return (
          <g key={lane.label}>
            <text x={LABEL_W - 10} y={top + WAVE_H / 2 + 4} textAnchor="end" className="sq-lane-label">{lane.label}</text>
            {segments.map(([from, to, v], j) => {
              const prev = segments[j - 1];
              const rise = prev ? `M ${x(from)} ${y(prev[2])} V ${y(v)} ` : `M ${x(from)} ${y(v)} `;
              return (
                <path key={from} d={`${rise}H ${x(to)}`} className={`sq-wave is-${lane.kind} ${v ? 'is-high' : 'is-low'}`} />
              );
            })}
          </g>
        );
      })}
    </svg>
  );
}
