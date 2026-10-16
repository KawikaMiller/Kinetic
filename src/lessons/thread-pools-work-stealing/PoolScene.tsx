import { useMemo, useState, type ReactNode } from 'react';
import { Bar } from '../../components/Bar';
import { Curve, Plot2D, Points, VLine } from '../../components/Plot2D';
import { StageFrame } from '../../components/StageFrame';
import { ChipButton, Legend, Provenance, ProvenanceRow, Slider, Stat, Stats } from '../../components/ui';
import { pctText, sig } from '../../core/format';
import { poolCaption } from './frames';
import { mixRatio, poolOpening } from './openings';
import { CORE_RANGE, MIXES, OVERHEAD_DIV, POOL_CPU, POOL_RANGE, POOL_TASKS, bestPool, ruleOfThumb, simulatePool, sweepPool } from './pool';

const mixLabel = (i: number) => (MIXES[i] === 0 ? 'CPU-bound (w/c = 0)' : `w/c = ${MIXES[i]}`);

export function PoolScene({ picker }: { picker: ReactNode }) {
  const [s, setS] = useState(poolOpening);
  const ratio = mixRatio(s);
  const result = useMemo(() => simulatePool({ cores: s.cores, ratio, pool: s.pool }), [s.cores, ratio, s.pool]);
  const curve = useMemo(() => sweepPool({ cores: s.cores, ratio }), [s.cores, ratio]);
  const best = useMemo(() => {
    const pool = bestPool(curve);
    return { pool, throughput: curve[pool - POOL_RANGE.min].throughput };
  }, [curve]);
  const rule = ruleOfThumb(s.cores, ratio);
  const top = Math.ceil(Math.max(...curve.map((c) => c.throughput)) * 1.1);
  const set = (patch: Partial<typeof s>) => setS((cur) => ({ ...cur, ...patch }));

  return (
    <StageFrame
      height={420}
      intro={poolCaption({ cores: s.cores, ratio, pool: s.pool }, result, best)}
      introKey={[s.cores, s.mixIndex, s.pool]}
      stats={
        <Stats>
          <Stat label="Throughput" value={sig(result.throughput)} color="var(--info)" sub={['tasks per 100 ticks', `${POOL_TASKS} tasks in ${result.makespan} ticks`]}>
            <Bar value={result.throughput} max={top} tone="info" height={6} ariaLabel={`Throughput ${sig(result.throughput)} of ${top}`} />
          </Stat>
          <Stat label="Cores busy" value={pctText(result.coreUse, 0)} sub={[`${s.cores} ${s.cores === 1 ? 'core' : 'cores'}`]}>
            <Bar value={result.coreUse} max={1} tone="hi" height={6} ariaLabel={`Cores ${pctText(result.coreUse, 0)} busy`} />
          </Stat>
          <Stat label="Best pool in the sweep" value={best.pool} sub={[`rule of thumb: ${rule}`]} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'throughput by pool size (swept)', shape: 'line' },
            { color: 'var(--hi)', label: 'your pool size', shape: 'line' },
            { color: 'var(--muted)', label: 'rule of thumb', shape: 'line' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Slider label="Mix" value={s.mixIndex} min={0} max={MIXES.length - 1} format={mixLabel} onChange={(mixIndex) => set({ mixIndex })} />
          <Slider label="Cores C" value={s.cores} {...CORE_RANGE} onChange={(cores) => set({ cores })} />
          <Slider label="Pool size P" value={s.pool} {...POOL_RANGE} onChange={(pool) => set({ pool })} />
        </>,
        <>
          <ChipButton tone="info" on={s.mixIndex === 0} onClick={() => set({ mixIndex: 0, pool: s.cores })}>CPU-bound, pool = cores</ChipButton>
          <ChipButton tone="info" on={s.pool === Math.min(POOL_RANGE.max, rule)} onClick={() => set({ pool: Math.min(POOL_RANGE.max, rule) })}>pool = the rule of thumb</ChipButton>
        </>,
      ]}
    >
      <div className="tp-stage stage-pad">
        <Plot2D
          x={{ domain: [POOL_RANGE.min, POOL_RANGE.max], label: 'pool size P (threads)', ticks: 8 }}
          y={{ domain: [0, top], label: 'tasks per 100 ticks', ticks: 5 }}
          ariaLabel={`Throughput against pool size for ${s.cores} cores and a wait to compute ratio of ${ratio}`}
        >
          <Curve points={curve.map((c): [number, number] => [c.pool, c.throughput])} tone="info" />
          {rule <= POOL_RANGE.max && rule !== s.pool && <VLine at={rule} label="rule of thumb" tone="dim" />}
          <VLine at={s.pool} label={`P = ${s.pool}`} tone="hi" dashed={false} />
          <Points data={[{ x: s.pool, y: result.throughput, tone: 'hi' }]} />
        </Plot2D>
        <ProvenanceRow>
          <Provenance kind="simulated">{POOL_TASKS} identical tasks run tick by tick on the pool and the cores: a deterministic run, no randomness</Provenance>
          <Provenance kind="toy">a task computes {POOL_CPU} ticks, then waits (w/c times that); every burst gets one extra tick per {OVERHEAD_DIV} threads, a toy contention cost</Provenance>
          <Provenance kind="from-memory">the rule of thumb threads = cores × (1 + wait / compute) is credited to Java Concurrency in Practice; verify against that book before naming it</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
