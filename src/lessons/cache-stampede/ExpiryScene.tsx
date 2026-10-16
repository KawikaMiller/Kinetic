import { useMemo, useState, type ReactNode } from 'react';
import { SeedField } from '../../components/SeedField';
import { StageFrame } from '../../components/StageFrame';
import { Button, ChipButton, Hint, Legend, Provenance, ProvenanceRow, Slider, Stats } from '../../components/ui';
import { msText } from './captions';
import { SLOW_QUERY_MS, VIRAL_LAMBDA, initialExpiry, type ExpiryState } from './init';
import { LOAD_RANGE, NO_MITIGATION, RECOMPUTE_RANGE, runStampede } from './model';
import { RunCharts, RunStats } from './RunView';
import { useRunPlayer } from './useRunPlayer';

export function ExpiryScene({ picker }: { picker: ReactNode }) {
  const [s, setS] = useState<ExpiryState>(initialExpiry);
  const run = useMemo(() => runStampede({ seed: s.seed, lambda: s.lambda, recomputeMs: s.recomputeMs, mitigations: NO_MITIGATION }), [s.seed, s.lambda, s.recomputeMs]);
  const player = useRunPlayer(run);
  const set = (patch: Partial<ExpiryState>) => setS((x) => ({ ...x, ...patch }));

  return (
    <StageFrame
      height={560}
      player={player}
      stats={<Stats><RunStats run={run} /></Stats>}
      legend={
        <Legend
          items={[
            { color: 'var(--bad)', label: 'a recompute that hits the database' },
            { color: 'var(--orange)', label: 'a timeout, and the client timeout line' },
            { color: 'var(--dim)', label: 'the database full-speed capacity', shape: 'line' },
            { color: 'var(--hi)', label: 'now', shape: 'line' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <ChipButton tone="info" onClick={() => set({ lambda: VIRAL_LAMBDA })}>viral post (λ {VIRAL_LAMBDA.toLocaleString('en-US')})</ChipButton>
          <ChipButton tone="info" onClick={() => set({ recomputeMs: SLOW_QUERY_MS })}>slow query (R {msText(SLOW_QUERY_MS)})</ChipButton>
          <Button onClick={() => setS(initialExpiry())}>Reset</Button>
        </>,
        <>
          <Slider label="Requests per second (λ)" value={s.lambda} {...LOAD_RANGE} format={(v) => `${v.toLocaleString('en-US')}/s`} onChange={(lambda) => set({ lambda })} />
          <Slider label="Recompute time (R)" value={s.recomputeMs} {...RECOMPUTE_RANGE} format={msText} onChange={(recomputeMs) => set({ recomputeMs })} />
          <SeedField seed={s.seed} onSeed={(seed) => set({ seed })} />
        </>,
      ]}
    >
      <div className="cs-stage stage-pad">
        <RunCharts run={run} now={player.frame.now} />
        <Hint tone="muted" block>
          With no protection, every request that misses starts its own recompute. When more run at once than the database has capacity for, each one slows down, clients time out and retry, and the retries add queries.
        </Hint>
        <ProvenanceRow>
          <Provenance kind="simulated" seed={s.seed}>one hot key and one database, ticking every 5 ms; the same seed replays the same run</Provenance>
          <Provenance kind="illustrative">the capacity, timeout and write delay are made up; real caches layer, and real databases degrade in their own way</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
