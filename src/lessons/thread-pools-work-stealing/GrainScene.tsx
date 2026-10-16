import { useMemo, useState, type ReactNode } from 'react';
import { Curve, HLine, Plot2D, Points, VLine } from '../../components/Plot2D';
import { SeedField } from '../../components/SeedField';
import { StageFrame } from '../../components/StageFrame';
import { Legend, Provenance, ProvenanceRow, Slider, Stat, Stats } from '../../components/ui';
import { pctText } from '../../core/format';
import { grainCaption } from './frames';
import { GRAIN_RANGE, TOTAL_WORK, WORKER_RANGE, buildTree, runForkJoin, span, sweepGrain, work, type Params } from './forkjoin';
import { FORK_COST, grainOpening } from './openings';

const baseParams = (workers: number, seed: number): Omit<Params, 'grain'> => ({ n: TOTAL_WORK, ratioPct: 50, forkCost: FORK_COST, workers, steal: true, stealLatency: 0, seed });

export function GrainScene({ picker }: { picker: ReactNode }) {
  const [s, setS] = useState(grainOpening);
  const base = useMemo(() => baseParams(s.workers, s.seed), [s.workers, s.seed]);
  const curve = useMemo(() => sweepGrain(base), [base]);
  const best = useMemo(() => curve.reduce((a, b) => (b.makespan < a.makespan ? b : a)), [curve]);
  const here = curve[s.grain - GRAIN_RANGE.min];
  const tree = useMemo(() => buildTree(TOTAL_WORK, s.grain, 50, FORK_COST), [s.grain]);
  const run = useMemo(() => runForkJoin({ ...base, grain: s.grain }, tree), [base, s.grain, tree]);
  const slower = here.makespan > TOTAL_WORK;
  const top = Math.ceil(Math.max(...curve.map((c) => c.makespan)) / 100) * 100;
  const set = (patch: Partial<typeof s>) => setS((cur) => ({ ...cur, ...patch }));

  return (
    <StageFrame
      height={400}
      intro={grainCaption(s.grain, here.makespan, TOTAL_WORK, best, s.workers)}
      introKey={[s.workers, s.grain, s.seed]}
      stats={
        <Stats>
          <Stat
            label="Makespan"
            value={`${here.makespan} ticks`}
            color={slower ? 'var(--bad)' : here.makespan === best.makespan ? 'var(--ok)' : undefined}
            sub={[slower ? `slower than one worker (${TOTAL_WORK})` : `one worker takes ${TOTAL_WORK}`]}
          />
          <Stat label="Pieces · forks" value={`${tree.leaves.length} · ${tree.tasks.length - tree.leaves.length}`} sub={[`each fork costs ${FORK_COST} ticks`]} />
          <Stat label="Work T1 · span T∞" value={`${work(tree)} · ${span(tree)}`} sub={[`workers ${pctText(run.utilisation, 0)} busy`]} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'makespan by grain (swept)', shape: 'line' },
            { color: 'var(--hi)', label: 'your grain', shape: 'line' },
            { color: 'var(--ok)', label: 'best grain', shape: 'dot' },
            { color: 'var(--muted)', label: 'one worker, no splitting', shape: 'line' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Slider label="Workers P" value={s.workers} {...WORKER_RANGE} onChange={(workers) => set({ workers })} />
          <Slider label="Grain" value={s.grain} {...GRAIN_RANGE} onChange={(grain) => set({ grain })} />
          <SeedField seed={s.seed} onSeed={(seed) => set({ seed })} />
        </>,
      ]}
    >
      <div className="tp-stage stage-pad">
        <Plot2D
          x={{ domain: [GRAIN_RANGE.min, GRAIN_RANGE.max], label: 'grain size (units a piece may hold)', ticks: 8 }}
          y={{ domain: [0, top], label: 'makespan (ticks)', ticks: 5 }}
          ariaLabel={`Makespan against grain size on ${s.workers} workers with a fork cost of ${FORK_COST} ticks`}
        >
          <Curve points={curve.map((c): [number, number] => [c.grain, c.makespan])} tone="info" />
          <HLine at={TOTAL_WORK} label="one worker" tone="dim" />
          <VLine at={s.grain} label={`g = ${s.grain}`} tone="hi" dashed={false} />
          <Points data={[{ x: best.grain, y: best.makespan, tone: 'ok' }, { x: s.grain, y: here.makespan, tone: slower ? 'bad' : 'hi' }]} />
        </Plot2D>
        <ProvenanceRow>
          <Provenance kind="simulated" seed={s.seed}>every point of the curve is a full seeded run of the scheduler</Provenance>
          <Provenance kind="toy">each fork costs {FORK_COST} ticks of spawn overhead (a named constant of this scene) and a piece of s units takes s ticks</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
