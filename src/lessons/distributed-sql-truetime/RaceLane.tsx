import { decimal } from '../../core/format';
import type { Race } from './truetime';
import { RACE_LANE_W } from './layout';

const H = 230;

function laneVerdict(r: Race): string {
  if (r.ordered) return r.s2 === r.s1 ? 's2 equals s1: ordered only by the strict wait' : 's2 is above s1: ordered';
  return r.s2 === r.s1 ? 's2 equals s1: a tie is a violation' : 's2 is below s1: violation';
}
const PAD_X = 70;
const LANE = { t1: 60, t2: 150 } as const;
const BAR_H = 14;
const TICK_H = 22;
const LABEL_DY = -12;
/** Two labels closer than this stack on two lines. */
const CLOSE_PX = 90;

/** The two transactions on a true-time axis: the uncertainty interval around each leader's clock, the commit-wait bar, and the timestamps. */
export function RaceLane({ race, epsilon, e1, e2 }: { race: Race; epsilon: number; e1: number; e2: number }) {
  const c1 = race.t1 + e1;
  const c2 = race.t2 + e2;
  const lo = Math.min(race.t1, c1 - epsilon, c2 - epsilon) - 4;
  const hi = Math.max(race.s1, race.s2, race.ackAt, race.t2) + 8;
  const x = (t: number) => PAD_X + ((t - lo) / (hi - lo)) * (RACE_LANE_W - PAD_X - 12);
  const verdict = race.ordered ? 'var(--ok)' : 'var(--bad)';
  const tick = (t: number, y: number, label: string, color: string, dy = LABEL_DY) => (
    <g>
      <line x1={x(t)} x2={x(t)} y1={y - TICK_H / 2} y2={y + TICK_H / 2} stroke={color} strokeWidth={2.5} />
      <text x={x(t)} y={y + dy} textAnchor="middle" className="tt-label" fill={color}>{label}</text>
    </g>
  );
  return (
    <svg className="tt-lane" viewBox={`0 0 ${RACE_LANE_W} ${H}`} width={RACE_LANE_W} role="img" aria-label="The two transactions on a true-time axis with their uncertainty intervals, timestamps and the commit wait">
      <text x={6} y={LANE.t1 + 4} className="tt-shard" fill="var(--amber)">shard 1</text>
      <text x={6} y={LANE.t2 + 4} className="tt-shard" fill="var(--sky)">shard 2</text>
      <line x1={PAD_X - 6} x2={RACE_LANE_W - 6} y1={LANE.t1} y2={LANE.t1} stroke="var(--line-2)" />
      <line x1={PAD_X - 6} x2={RACE_LANE_W - 6} y1={LANE.t2} y2={LANE.t2} stroke="var(--line-2)" />
      {race.waitMs > 0 && <rect x={x(race.t1)} y={LANE.t1 - BAR_H / 2} width={x(race.ackAt) - x(race.t1)} height={BAR_H} rx={4} fill="var(--violet)" opacity={0.55} />}
      <rect x={x(c1 - epsilon)} y={LANE.t1 + 14} width={Math.max(1, x(c1 + epsilon) - x(c1 - epsilon))} height={6} rx={3} fill="var(--info)" opacity={0.7} />
      <rect x={x(c2 - epsilon)} y={LANE.t2 + 14} width={Math.max(1, x(c2 + epsilon) - x(c2 - epsilon))} height={6} rx={3} fill="var(--info)" opacity={0.7} />
      {tick(race.t1, LANE.t1, `T1 starts ${decimal(race.t1, 0)}`, 'var(--amber)', -22)}
      {tick(race.ackAt, LANE.t1, `ack ${decimal(race.ackAt, 1)}`, 'var(--text)', x(race.ackAt) - x(race.t1) < CLOSE_PX ? -36 : -22)}
      {tick(race.s1, LANE.t1, `s1 ${decimal(race.s1, 1)}`, 'var(--hi)', 36)}
      {tick(race.t2, LANE.t2, `T2 starts ${decimal(race.t2, 1)}`, 'var(--sky)', -22)}
      {tick(race.s2, LANE.t2, `s2 ${decimal(race.s2, 1)}`, verdict, 36)}
      <line x1={x(race.ackAt)} x2={x(race.t2)} y1={LANE.t1 + 12} y2={LANE.t2 - 12} stroke="var(--dim)" strokeDasharray="4 3" />
      <text x={RACE_LANE_W / 2} y={H - 8} textAnchor="middle" className="tt-verdict" fill={verdict}>{laneVerdict(race)}</text>
    </svg>
  );
}
