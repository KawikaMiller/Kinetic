import { useMemo, useState, type ReactNode } from 'react';
import { GanttLanes } from '../../components/GanttLanes';
import { SeedField } from '../../components/SeedField';
import { StageFrame } from '../../components/StageFrame';
import { Hint, Legend, Provenance, ProvenanceRow, Segmented, Slider, Stat, Stats, Toggle } from '../../components/ui';
import { useMediaQuery, PHONE_QUERY } from '../../components/useMediaQuery';
import { WideRegion } from '../../components/WideRegion';
import { barsAt } from '../../core/gantt';
import { pctText, sig } from '../../core/format';
import { usePlayer } from '../../core/usePlayer';
import { forkBars, leafState, parentsOf, workerLanes, workerTone } from './bars';
import { forkFrames, type ForkFrame } from './frames';
import { BROKEN_SEED, GRAIN_RANGE, RATIOS, SLOW_STEAL_TICKS, WORKER_RANGE, brentBound, buildTree, createForkSim, lowerBound, runForkJoin } from './forkjoin';
import { forkOpening, type StealModel } from './openings';

const PHONE_MAX_WORKERS = 6;
const MODEL_OPTIONS: { value: StealModel; label: string }[] = [
  { value: 'greedy', label: 'a steal lands at once (greedy)' },
  { value: 'slow', label: `a steal takes ${SLOW_STEAL_TICKS} ticks (broken)` },
];

export function ForkScene({ picker }: { picker: ReactNode }) {
  const [open] = useState(forkOpening);
  const [params, setParams] = useState(open.params);
  const [model, setModel] = useState<StealModel>(open.model);
  const phone = useMediaQuery(PHONE_QUERY);
  const workers = Math.min(params.workers, phone ? PHONE_MAX_WORKERS : WORKER_RANGE.max);
  const p = useMemo(() => ({ ...params, workers, stealLatency: model === 'slow' ? SLOW_STEAL_TICKS : 0 }), [params, workers, model]);
  const tree = useMemo(() => buildTree(p.n, p.grain, p.ratioPct, p.forkCost), [p.n, p.grain, p.ratioPct, p.forkCost]);
  const res = useMemo(() => runForkJoin(p, tree), [p, tree]);
  const sim = useMemo(() => createForkSim(p, tree), [p, tree]);
  const frames = useMemo(() => forkFrames(sim, p, res), [sim, p, res]);
  const player = usePlayer<ForkFrame>(frames, { interval: 280, autoplayOnChange: false });
  const now = player.frame.now;
  const bars = useMemo(() => forkBars(sim, tree, res.makespan), [sim, tree, res.makespan]);
  const parentOf = useMemo(() => parentsOf(tree), [tree]);
  const tick = Math.floor(now);
  const state = sim.history[Math.min(tick, sim.history.length - 1)];
  const brent = brentBound(res, p.workers);
  const lower = lowerBound(res, p.workers);

  const set = (patch: Partial<typeof params>) => setParams((cur) => ({ ...cur, ...patch }));
  const chooseModel = (m: StealModel) => {
    setModel(m);
    set({ seed: m === 'slow' ? BROKEN_SEED : open.params.seed });
  };

  return (
    <StageFrame
      player={player}
      height={460}
      stats={
        <Stats>
          <Stat label="Makespan" value={`${res.makespan} ticks`} sub={p.steal ? [`no schedule beats ${sig(lower)}`] : [`no schedule beats ${sig(lower)}`, 'stealing is off: all the work runs on worker 0']} />
          <Stat label="Work T1 · span T∞" value={`${res.work} · ${res.span}`} sub={['ticks of work · longest chain']} />
          <Stat label="Steals" value={res.steals} sub={[`workers ${pctText(res.utilisation, 0)} busy`]} />
          <Stat
            label="Brent bound T1/P + T∞"
            value={sig(brent)}
            color={res.makespan <= brent ? 'var(--ok)' : 'var(--bad)'}
            sub={[res.makespan <= brent ? 'this run is within it' : `this run breaks it (${res.makespan} > ${sig(brent)})`, model === 'greedy' ? 'model: greedy' : `model: a steal takes ${SLOW_STEAL_TICKS} ticks, not greedy`]}
          />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--orange)', label: 'a worker and the pieces it ran (4 hues, then they repeat)' },
            { color: 'var(--info)', label: 'a steal (diamond) or walking to one (dashed)' },
            { color: 'var(--dim)', label: 'idle (hatched)' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented label="Split" value={params.ratioPct} onChange={(ratioPct) => set({ ratioPct })} options={RATIOS.map((r) => ({ value: r, label: `${r}/${100 - r}` }))} />
          <Toggle label="Stealing" value={params.steal} onChange={(steal) => set({ steal })} off="off" on="on" />
        </>,
        <>
          <Slider label="Workers P" value={workers} min={WORKER_RANGE.min} max={phone ? PHONE_MAX_WORKERS : WORKER_RANGE.max} onChange={(w) => set({ workers: w })} />
          <Slider label="Grain" value={params.grain} {...GRAIN_RANGE} onChange={(grain) => set({ grain })} />
          <SeedField seed={params.seed} onSeed={(seed) => set({ seed })} />
        </>,
        <Segmented key="model" label="Steal model" value={model} onChange={chooseModel} options={MODEL_OPTIONS} />,
      ]}
    >
      <div className="tp-stage stage-pad">
        <div className="tp-timeline">
          <WideRegion minWidth={560} label="Worker timeline: scroll sideways to see all of it">
            <GanttLanes
              lanes={workerLanes(p.workers)}
              bars={barsAt(bars, now)}
              domain={[0, res.makespan]}
              now={now}
              unit=" t"
              axis
              size="sm"
              labelWidth={72}
              labelMinPx={Number.POSITIVE_INFINITY}
              ariaLabel={`What each of the ${p.workers} workers did, tick by tick`}
            />
          </WideRegion>
        </div>
        <div className="tp-deques" role="group" aria-label="Each worker's deque, oldest task first">
          {state.deques.slice(0, p.workers).map((d, w) => (
            <div key={w} className="tp-deque">
              <span className="tp-deque-name">worker {w}</span>
              <div className="tp-cards">
                {d.length === 0 ? <span className="tp-empty">empty</span> : d.map((id, i) => (
                  <span key={id} className={`cell is-tint tone-${workerTone(w)} tp-card`} title={i === 0 ? 'oldest: where a thief takes from' : i === d.length - 1 ? 'newest: where the owner works' : undefined}>
                    {tree.tasks[id].size}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
        <Hint tone="muted" block>Each deque reads oldest to newest, left to right: the owner works at the right end, a thief takes from the left.</Hint>
        <div className="tp-leaves" role="img" aria-label={`The ${tree.leaves.length} leaf pieces and which worker ran each`}>
          {tree.leaves.map((leaf) => {
            const ls = leafState(sim, parentOf, leaf, tick);
            const cls =
              ls.kind === 'hidden' ? 'tp-leaf is-hidden' : ls.kind === 'queued' ? 'cell is-dim tp-leaf' : ls.kind === 'running' ? `cell is-solid tone-${workerTone(ls.worker)} tp-leaf` : `cell is-tint tone-${workerTone(ls.worker)} tp-leaf`;
            return <span key={leaf} className={cls}>{tree.tasks[leaf].size}</span>;
          })}
        </div>
        <ProvenanceRow>
          <Provenance kind="simulated" seed={p.seed}>a seeded tick sim: the seed picks which victim a thief tries</Provenance>
          <Provenance kind="toy">joins cost nothing, a piece of size s takes s ticks, and in the greedy model a steal lands in the tick it is attempted</Provenance>
          <Provenance kind="from-memory">real pools add a lock-free deque (Chase-Lev) with memory ordering, not modelled here, and real fork-join pools help or compensate when a task blocks</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
