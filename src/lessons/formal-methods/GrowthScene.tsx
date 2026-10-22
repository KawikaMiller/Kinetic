import { useMemo, useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { Curve, Plot2D, Points } from '../../components/Plot2D';
import { StageFrame } from '../../components/StageFrame';
import { Hint, Legend, Provenance, ProvenanceRow, Segmented, Stat, Stats } from '../../components/ui';
import { integer, power } from '../../core/format';
import { MAX_PROCESSES, atomicLockClosedForm, atomicLockStates } from './spec';

const COUNTS = Array.from({ length: MAX_PROCESSES }, (_, i) => i + 1);
const OPTIONS = COUNTS.map((n) => ({ value: n, label: `${n}` }));
const PLOT_WIDTH = 356;
const ROWS = COUNTS.map((n) => ({ n, explored: atomicLockStates(n).states, closed: atomicLockClosedForm(n) }));
const CURVE = ROWS.map((r): [number, number] => [r.n, r.explored]);
const legend = (
  <Legend
    items={[
      { color: 'var(--ok)', label: 'the explorer finished: the count is the whole model' },
      { color: 'var(--info)', label: 'the closed form: free-lock states plus held-lock states' },
      { color: 'var(--hi)', label: 'the N you picked' },
    ]}
  />
);

/** Scene 2: how big the state space gets as processes are added, against its closed form. */
export function GrowthScene({ picker }: { picker: ReactNode }) {
  const [n, setN] = useState(2);
  const row = ROWS[n - 1];
  const point = useMemo(() => [{ x: n, y: row.explored, tone: 'hi' as const }], [n, row.explored]);

  return (
    <StageFrame
      height={520}
      intro={`${n} ${n === 1 ? 'process' : 'processes'} on the atomic lock: ${integer(row.explored)} reachable states, and the closed form ${power(n)} + ${n} x ${power(n - 1)} = ${integer(row.closed)} agrees. This is for this model at this N.`}
      introKey={`growth|${n}`}
      legend={legend}
      stats={
        <Stats>
          <Stat label="Reachable states" value={integer(row.explored)} color="var(--ok)" sub="exhaustive for this N" />
          <Stat label="Closed form" value={integer(row.closed)} color="var(--info)" sub={`${power(n)} + ${n} x ${power(n - 1)}`} />
          <Stat label="Agree" value={row.explored === row.closed ? 'yes' : 'no'} color={row.explored === row.closed ? 'var(--ok)' : 'var(--bad)'} />
        </Stats>
      }
      controls={[<>{picker}<Segmented label="Processes (N)" value={n} onChange={setN} options={OPTIONS} /></>]}
    >
      <div className="fm-stage stage-pad">
        <Box>
          <SectionTitle hint="three steps: arrive, take the lock when it is free, release; critical between take and release">States against N</SectionTitle>
          <Plot2D
            x={{ domain: [1, MAX_PROCESSES], label: 'processes N', ticks: MAX_PROCESSES }}
            y={{ domain: [1, 1000], log: true, label: 'reachable states' }}
            width={PLOT_WIDTH}
            ariaLabel="Reachable states of the atomic lock on a log scale against the number of processes, rising from 3 at one process to 256 at six"
          >
            <Curve points={CURVE} tone="ok" />
            <Points data={point} />
          </Plot2D>
          <table className="fm-table">
            <thead><tr><th>N</th><th>States</th><th>lock free</th><th>lock held</th></tr></thead>
            <tbody>
              {ROWS.map((r) => <tr key={r.n} className={r.n === n ? 'is-now' : ''}><td>{r.n}</td><td>{integer(r.explored)}</td><td>{integer(2 ** r.n)}</td><td>{integer(r.n * 2 ** (r.n - 1))}</td></tr>)}
            </tbody>
          </table>
          <p className="fm-note">All idle or waiting with the lock free is {power(n)} states; one process critical, the lock held and the rest idle or waiting is {n} x {power(n - 1)}.</p>
        </Box>
        <Hint block tone="muted">The exhaustive claim is for this model at this N. A real system, N = 1000 or an unbounded counter is not covered; checkers cope with such sizes by abstraction, symmetry and partial-order reduction (one sentence each, not shown) and by sampling.</Hint>
        <ProvenanceRow>
          <Provenance kind="toy">at most {MAX_PROCESSES} processes: the state count roughly doubles with each one, so the page stops where the explorer is still instant</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
