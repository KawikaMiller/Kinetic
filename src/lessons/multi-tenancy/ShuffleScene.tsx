import { useMemo, useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { SeedField } from '../../components/SeedField';
import { StageFrame } from '../../components/StageFrame';
import { Button, Hint, Legend, Provenance, ProvenanceRow, Slider, Stat, Stats } from '../../components/ui';
import { useIntroCaption } from '../../core/caption';
import { integer, pct } from '../../core/format';
import { mulberry32 } from '../../core/random';
import { shuffleCaption } from './captions';
import { MONTE_CARLO_SAMPLES, N_RANGE, assignments, enumerateOverlap, exactIdentical, exactShare, maxK, monteCarlo, randomSubset } from './combos';
import { initialShuffle, type ShuffleState } from './init';

const RING = { size: 300, centre: 150, radius: 108, worker: 19 } as const;

function workerAt(i: number, n: number) {
  const angle = (2 * Math.PI * i) / n - Math.PI / 2;
  return { x: RING.centre + RING.radius * Math.cos(angle), y: RING.centre + RING.radius * Math.sin(angle) };
}

/** The workers on a ring: the noisy tenant's are down, the other tenant's carry a violet ring. */
function Ring({ n, noisy, other }: { n: number; noisy: ReadonlySet<number>; other: ReadonlySet<number> }) {
  return (
    <svg className="mt-ring" viewBox={`0 0 ${RING.size} ${RING.size}`} width={RING.size} role="img" aria-label={`${n} workers on a ring. Down: ${[...noisy].map((w) => w + 1).join(', ')}. The other tenant uses: ${[...other].map((w) => w + 1).join(', ')}.`}>
      <circle cx={RING.centre} cy={RING.centre} r={RING.radius} className="mt-ring-track" />
      {Array.from({ length: n }, (_, i) => {
        const { x, y } = workerAt(i, n);
        const down = noisy.has(i);
        const mine = other.has(i);
        return (
          <g key={i}>
            <circle cx={x} cy={y} r={RING.worker} className={`mt-worker ${down ? 'is-down' : 'is-up'} ${mine ? 'is-other' : ''}`} />
            <text x={x} y={y + 4} textAnchor="middle" className="mt-worker-label">{i + 1}</text>
          </g>
        );
      })}
    </svg>
  );
}

export function ShuffleScene({ picker }: { picker: ReactNode }) {
  const [s, setS] = useState<ShuffleState>(initialShuffle);
  const k = Math.min(s.k, maxK(s.n));
  const noisy = useMemo(() => new Set(Array.from({ length: k }, (_, i) => i)), [k]);
  const other = useMemo(() => new Set(randomSubset(s.n, k, mulberry32(s.seed))), [s.n, k, s.seed]);
  const estimate = useMemo(() => monteCarlo(s.n, k, MONTE_CARLO_SAMPLES, s.seed), [s.n, k, s.seed]);
  const overlap = useMemo(() => enumerateOverlap(s.n, k), [s.n, k]);
  const shared = [...other].some((w) => noisy.has(w));
  const identical = [...other].every((w) => noisy.has(w));
  const rows = Array.from({ length: maxK(s.n) }, (_, i) => i + 1);

  useIntroCaption(shuffleCaption(s.n, k, estimate, { sharing: shared, identical }), [s.n, k, s.seed]);

  return (
    <StageFrame
      height={520}
      stats={
        <Stats>
          <Stat label="Assignments" value={integer(assignments(s.n, k))} sub={[`ways to give a tenant ${k} of ${s.n} workers`]} />
          <Stat label="Shares a worker" value={pct(exactShare(s.n, k), 1)} color="var(--orange)" sub={[`${overlap.sharing} of ${overlap.total} counted one by one`, `${pct(estimate.share, 1)} measured over ${integer(estimate.samples)}`]} />
          <Stat label="Loses every worker" value={pct(exactIdentical(s.n, k), 1)} color="var(--bad)" sub={[`${overlap.identical} of ${overlap.total} counted one by one`, `${pct(estimate.identical, 1)} measured over ${integer(estimate.samples)}`]} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--bad)', label: 'a worker the noisy tenant took down' },
            { color: 'var(--violet)', label: 'a worker the other tenant uses (ring)' },
            { color: 'var(--ok)', label: 'a worker that is up' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Button onClick={() => setS(initialShuffle())}>Reset</Button>
        </>,
        <>
          <Slider label="Workers (N)" value={s.n} min={N_RANGE.min} max={N_RANGE.max} onChange={(n) => setS((x) => ({ ...x, n, k: Math.min(x.k, maxK(n)) }))} />
          <Slider label="Workers per tenant (k)" value={k} min={1} max={maxK(s.n)} onChange={(v) => setS((x) => ({ ...x, k: v }))} />
          <SeedField seed={s.seed} onSeed={(seed) => setS((x) => ({ ...x, seed }))} />
        </>,
      ]}
    >
      <div className="mt-stage stage-pad">
        <div className="mt-shuffle">
          <Box>
            <SectionTitle hint="the noisy tenant and one other, drawn from the seed">Workers</SectionTitle>
            <Ring n={s.n} noisy={noisy} other={other} />
          </Box>
          <Box>
            <SectionTitle hint={`${s.n} workers`}>What k buys</SectionTitle>
            <div className="mt-table-wrap">
              <table className="data-table mt-table">
                <thead>
                  <tr><th>k</th><th>Assignments</th><th>Shares a worker</th><th>Loses all</th></tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r} className={r === k ? 'is-actor' : ''}>
                      <th scope="row">{r}</th>
                      <td>{integer(assignments(s.n, r))}</td>
                      <td>{pct(exactShare(s.n, r), 1)}</td>
                      <td>{pct(exactIdentical(s.n, r), 1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Box>
        </div>
        <Hint tone="muted" block>
          A tenant gets at most half of the workers, and at most six, so k stays between 1 and {maxK(s.n)} here. The noisy tenant takes down its own {k} {k === 1 ? 'worker' : 'workers'}. With k = 1 this is plain sharding.
        </Hint>
        <ProvenanceRow>
          <Provenance kind="simulated" seed={s.seed}>{integer(MONTE_CARLO_SAMPLES)} random assignments from the seed, next to the exact counts</Provenance>
          <Provenance kind="from-memory">shuffle sharding is a technique AWS has described in its Builders&apos; Library; verify the details there</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
