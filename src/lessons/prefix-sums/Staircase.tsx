// The prefix sums as a staircase over the array's bars. prefix[i] sits on the boundary
// *before* cell i, and the riser into boundary i + 1 is exactly a[i], so a range sum is
// the height difference between two boundaries: prefix[r + 1] − prefix[l].

const W = 720;
const H = 270;
const PAD = 44;
const STAIR_TOP = 26;
const STAIR_BASE = 158;
const BAR_TOP = 184;
const BAR_BASE = 256;
const LABEL_GAP = 9;
const AXIS_X = 4;
const AXIS_LABEL_Y = 12;
const BRACKET_GAP = 14;

export function Staircase({ values, prefix, l, r }: { values: number[]; prefix: number[]; l: number; r: number }) {
  const n = values.length;
  const cw = (W - 2 * PAD) / n;
  const x = (i: number) => PAD + i * cw;
  const peak = Math.max(1, ...prefix);
  const y = (p: number) => STAIR_BASE - (p / peak) * (STAIR_BASE - STAIR_TOP);
  const barMax = Math.max(1, ...values);
  const inRange = (i: number) => i >= l && i <= r;

  const treads = values.map((_, i) => ({ x1: x(i), x2: x(i + 1), y: y(prefix[i]) }));
  const risers = values.map((_, i) => ({ x: x(i + 1), y1: y(prefix[i]), y2: y(prefix[i + 1]), hot: inRange(i) }));
  const top = y(prefix[r + 1]);
  const bottom = y(prefix[l]);
  const bracketX = x(r + 1) + BRACKET_GAP;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="ps-chart" role="img" aria-label="Prefix sums as a staircase over the array">
      <text x={AXIS_X} y={AXIS_LABEL_Y} className="ps-axis">
        prefix
      </text>
      <text x={AXIS_X} y={BAR_TOP - LABEL_GAP} className="ps-axis">
        a
      </text>
      <line x1={x(l)} x2={x(r + 1)} y1={bottom} y2={bottom} className="ps-guide ps-from" />
      {treads.map((t, i) => (
        <line key={`t${i}`} x1={t.x1} x2={t.x2} y1={t.y} y2={t.y} className="ps-tread" />
      ))}
      {risers.map((s, i) => (
        <line key={`s${i}`} x1={s.x} x2={s.x} y1={s.y1} y2={s.y2} className={`ps-riser ${s.hot ? 'is-hot' : ''}`} />
      ))}
      {prefix.map((p, i) => {
        const role = i === l ? 'is-from' : i === r + 1 ? 'is-to' : '';
        return (
          <g key={`p${i}`} className={`ps-point ${role}`}>
            <circle cx={x(i)} cy={y(p)} r={role ? 6 : 3.5} />
            <text x={x(i)} y={y(p) - LABEL_GAP} textAnchor="middle">
              {p}
            </text>
          </g>
        );
      })}
      <line x1={bracketX} x2={bracketX} y1={bottom} y2={top} className="ps-bracket" />
      <text x={bracketX + 6} y={(top + bottom) / 2 + 4} className="ps-bracket-label">
        {prefix[r + 1] - prefix[l]}
      </text>
      {values.map((v, i) => {
        const h = (v / barMax) * (BAR_BASE - BAR_TOP);
        return (
          <g key={`b${i}`}>
            <rect
              x={x(i) + cw * 0.18}
              y={BAR_BASE - h}
              width={cw * 0.64}
              height={Math.max(1, h)}
              rx={4}
              className={`ps-bar ${inRange(i) ? 'is-hot' : ''}`}
            />
            <text x={x(i) + cw / 2} y={BAR_BASE - h - 5} textAnchor="middle" className="ps-bar-label">
              {v}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
