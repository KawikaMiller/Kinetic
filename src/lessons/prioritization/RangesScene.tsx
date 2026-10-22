import { useMemo, useState, type ReactNode } from 'react';
import { Bar } from '../../components/Bar';
import { SeedField } from '../../components/SeedField';
import { StageFrame } from '../../components/StageFrame';
import { ClaimLabel, Legend, Provenance, ProvenanceRow, Slider, Stat, Stats } from '../../components/ui';
import { rangesCaption } from './captions';
import { CLOSE_CALL, ITEMS, RUNS, SPREAD, orderBy, simulateRanks, topTwo } from './model';
import { OPENING } from './opening';

const label = (id: string) => ITEMS.find((i) => i.id === id)!.label;

/** Scene 3: impact and effort as ranges. A seeded Monte Carlo ranks the items many times. */
export function RangesScene({ picker }: { picker: ReactNode }) {
  const [sigma, setSigma] = useState(OPENING.ranges.sigma);
  const [seed, setSeed] = useState(OPENING.ranges.seed);
  const stats = useMemo(() => simulateRanks(ITEMS, sigma, seed), [sigma, seed]);
  const top = topTwo(stats);
  const planned = orderBy(ITEMS, 'ratio');

  return (
    <StageFrame
      height={640}
      intro={rangesCaption(stats, top, sigma)}
      introKey={[sigma, seed]}
      stats={
        <Stats>
          <Stat label="Most likely to rank first" value={label(top.top)} sub={`${Math.round(stats.first[top.top] * 100)}% of ${RUNS.toLocaleString('en-US')} runs`} />
          <Stat label="Runner-up" value={label(top.second)} sub={`${Math.round(stats.first[top.second] * 100)}% of runs`} />
          <Stat label="Gap" value={`${Math.round(top.gap * 100)} points`} color={top.close ? 'var(--orange)' : undefined} sub={top.close ? `a close call: under ${Math.round(CLOSE_CALL * 100)} points` : `a clear gap: ${Math.round(CLOSE_CALL * 100)} points or more`} />
        </Stats>
      }
      legend={<Legend items={[{ color: 'var(--info)', label: 'chance of ranking first' }, { color: 'var(--orange)', label: 'a close call (a gap under 10 points)' }]} />}
      controls={[<>{picker}<Slider label="Spread of impact and effort" value={sigma} {...SPREAD} format={(v) => v.toFixed(1)} onChange={setSigma} /><SeedField seed={seed} onSeed={setSeed} /></>]}
    >
      <div className="pz-stage stage-pad">
        <table className="data-table pz-table">
          <caption>Items in plan order, with their simulated ranking</caption>
          <thead><tr><th>Item</th><th>Plan rank</th><th>Ranks first</th><th>Rank, 90% of runs</th></tr></thead>
          <tbody>
            {planned.map((id, k) => (
              <tr key={id}>
                <td>{label(id)}</td>
                <td>{k + 1}</td>
                <td className="pz-bar-cell"><Bar value={stats.first[id]} max={1} tone="info" height={8} ariaLabel={`${label(id)} ranks first in ${Math.round(stats.first[id] * 100)}% of runs`} trailing={`${Math.round(stats.first[id] * 100)}%`} /></td>
                <td>{stats.interval[id][0] === stats.interval[id][1] ? stats.interval[id][0] : `${stats.interval[id][0]} to ${stats.interval[id][1]}`}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <ProvenanceRow>
          <Provenance kind="simulated" seed={seed}>{RUNS.toLocaleString('en-US')} seeded rankings, impact and effort log-normal around the plan</Provenance>
          <Provenance kind="invented">the items and numbers are invented; real cost of delay is hard to estimate, which is why this scene exists</Provenance>
          <ClaimLabel kind="view">&quot;don&apos;t agonise over close calls&quot; is advice some teams give, not a rule</ClaimLabel>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
