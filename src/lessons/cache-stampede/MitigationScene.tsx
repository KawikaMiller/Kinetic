import { useMemo, useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { Bars, Plot2D } from '../../components/Plot2D';
import { SeedField } from '../../components/SeedField';
import { StageFrame } from '../../components/StageFrame';
import { Button, ChipButton, Hint, Legend, Provenance, ProvenanceRow, Slider, Stats, Toggle } from '../../components/ui';
import { integer, pct } from '../../core/format';
import { jitterCaption, msText } from './captions';
import { SLOW_QUERY_MS, VIRAL_LAMBDA, initialMitigation, type MitigationState } from './init';
import {
  BETAS, EARLY_STUDY_SEEDS, JITTER_RANGE, KEYS, LOAD_RANGE, NO_MITIGATION, RECOMPUTE_RANGE, busiestSecond, expiryCounts, runStampede, waitShare, type Mitigations,
} from './model';
import { RunCharts, RunStats } from './RunView';
import { useRunPlayer } from './useRunPlayer';

const BETA_RANGE = { min: 0, max: 4, step: 0.5 } as const;
const TABLE_ROWS: { label: string; m: Mitigations }[] = [
  { label: 'none', m: NO_MITIGATION },
  { label: 'request coalescing', m: { ...NO_MITIGATION, coalesce: true } },
  { label: 'serve stale while revalidating', m: { ...NO_MITIGATION, stale: true } },
  { label: 'lock with a timeout', m: { ...NO_MITIGATION, lock: true } },
  { label: 'early refresh, β = 1', m: { ...NO_MITIGATION, beta: 1 } },
];

export function MitigationScene({ picker }: { picker: ReactNode }) {
  const [s, setS] = useState<MitigationState>(initialMitigation);
  const run = useMemo(() => runStampede({ seed: s.seed, lambda: s.lambda, recomputeMs: s.recomputeMs, mitigations: s.mitigations }), [s.seed, s.lambda, s.recomputeMs, s.mitigations]);
  const player = useRunPlayer(run);
  const set = (patch: Partial<MitigationState>) => setS((x) => ({ ...x, ...patch }));
  const setM = (patch: Partial<Mitigations>) => setS((x) => ({ ...x, mitigations: { ...x.mitigations, ...patch } }));
  const table = useMemo(
    () => TABLE_ROWS.map((r) => ({ label: r.label, summary: runStampede({ seed: s.seed, lambda: s.lambda, recomputeMs: s.recomputeMs, mitigations: r.m }).summary })),
    [s.seed, s.lambda, s.recomputeMs],
  );
  const shares = useMemo(() => (s.mitigations.beta > 0 ? BETAS.map((b) => ({ beta: b, share: waitShare(b, s.lambda, s.recomputeMs) })) : null), [s.mitigations.beta, s.lambda, s.recomputeMs]);
  const counts = useMemo(() => expiryCounts(s.seed, s.jitterPct), [s.seed, s.jitterPct]);
  const busiest = busiestSecond(counts);
  const bars = useMemo(() => counts.map((y, x) => ({ x0: x, x1: x + 1, y })), [counts]);

  return (
    <StageFrame
      height={720}
      player={player}
      stats={<Stats><RunStats run={run} /></Stats>}
      legend={
        <Legend
          items={[
            { color: 'var(--bad)', label: 'a recompute that hits the database' },
            { color: 'var(--violet)', label: 'a background early refresh' },
            { color: 'var(--orange)', label: 'the client timeout line' },
            { color: 'var(--dim)', label: 'the database full-speed capacity', shape: 'line' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <ChipButton tone="info" onClick={() => set({ lambda: VIRAL_LAMBDA })}>viral post (λ {VIRAL_LAMBDA.toLocaleString('en-US')})</ChipButton>
          <ChipButton tone="info" onClick={() => set({ recomputeMs: SLOW_QUERY_MS })}>slow query (R {msText(SLOW_QUERY_MS)})</ChipButton>
          <ChipButton tone="info" onClick={() => set({ jitterPct: 0 })}>synchronised TTLs</ChipButton>
          <Button onClick={() => setS(initialMitigation())}>Reset</Button>
        </>,
        <>
          <Toggle label="Request coalescing" value={s.mitigations.coalesce} onChange={(coalesce) => setM({ coalesce })} />
          <Toggle label="Serve stale while revalidating" value={s.mitigations.stale} onChange={(stale) => setM({ stale })} />
          <Toggle label="Lock with a timeout" value={s.mitigations.lock} onChange={(lock) => setM({ lock })} />
          <Slider label="Early refresh β" value={s.mitigations.beta} {...BETA_RANGE} format={(v) => (v === 0 ? 'off' : String(v))} onChange={(beta) => setM({ beta })} />
        </>,
        <>
          <Slider label="Requests per second (λ)" value={s.lambda} {...LOAD_RANGE} format={(v) => `${v.toLocaleString('en-US')}/s`} onChange={(lambda) => set({ lambda })} />
          <Slider label="Recompute time (R)" value={s.recomputeMs} {...RECOMPUTE_RANGE} format={msText} onChange={(recomputeMs) => set({ recomputeMs })} />
          <Slider label="TTL jitter (many keys)" value={s.jitterPct} {...JITTER_RANGE} format={(v) => `±${v}%`} onChange={(jitterPct) => set({ jitterPct })} />
          <SeedField seed={s.seed} onSeed={(seed) => set({ seed })} />
        </>,
      ]}
    >
      <div className="cs-stage stage-pad">
        <RunCharts run={run} now={player.frame.now} />
        <Box>
          <SectionTitle hint="the same seed, one protection at a time">What each one does</SectionTitle>
          <div className="cs-table-wrap">
            <table className="data-table cs-table">
              <thead>
                <tr><th>Protection</th><th>Queries</th><th>Waited</th><th>p99</th></tr>
              </thead>
              <tbody>
                {table.map((r) => (
                  <tr key={r.label}>
                    <th scope="row" className="keep-case">{r.label}</th>
                    <td>{integer(r.summary.queries)}</td>
                    <td>{integer(r.summary.waited)}</td>
                    <td>{msText(r.summary.p99Ms)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Box>
        {shares && (
          <Hint tone="muted" block>
            Early refresh, share of {EARLY_STUDY_SEEDS} seeds on which at least one request waited at the expiry: {shares.map((x) => `β ${x.beta}: ${pct(x.share)}`).join(', ')}.
          </Hint>
        )}
        <Box>
          <SectionTitle hint={`${integer(KEYS)} keys given one TTL at deploy time`}>When many keys expire together</SectionTitle>
          <Plot2D x={{ domain: [0, counts.length], label: 'seconds after deploy' }} y={{ domain: [0, KEYS], label: 'keys expiring' }} ariaLabel="Keys expiring in each second after deploy">
            <Bars bars={bars} tone="info" />
          </Plot2D>
          <p className="cs-note">{jitterCaption(busiest, s.jitterPct)}</p>
        </Box>
        <ProvenanceRow>
          <Provenance kind="simulated" seed={s.seed}>one hot key and one database, ticking every 5 ms; every protection runs on the same seed</Provenance>
          <Provenance kind="illustrative">the capacity, timeouts and the {integer(KEYS)}-key TTL of 60 s are made up; real caches layer</Provenance>
          <Provenance kind="from-memory">early refresh is the rule from a 2015 paper on optimal probabilistic cache stampede prevention (Vattani, Chierichetti, Lowenberg); verify the details there</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
