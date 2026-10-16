import { useMemo, useState, type ReactNode } from 'react';
import { StageFrame } from '../../components/StageFrame';
import { Legend, Provenance, ProvenanceRow, Slider, Stat, Stats, Toggle } from '../../components/ui';
import { plural } from '../../core/format';
import { usePlayer } from '../../core/usePlayer';
import { starveFrames, type StarveFrame } from './frames';
import { LEAF_TICKS, STARVE_DEPTH, STARVE_WORKERS, isParent, runStarveToEnd, taskCount } from './starve';
import { starveOpening } from './openings';

export function StarveScene({ picker }: { picker: ReactNode }) {
  const [p, setP] = useState(starveOpening);
  const sim = useMemo(() => runStarveToEnd(p), [p]);
  const frames = useMemo(() => starveFrames(sim, p), [sim, p]);
  const player = usePlayer<StarveFrame>(frames, { interval: 600, autoplayOnChange: false });
  const tick = Math.floor(player.frame.now);
  const s = sim.history[Math.min(tick, sim.history.length - 1)];
  const total = taskCount(p.depth);
  const atEnd = tick >= sim.ticks;
  const stalled = atEnd && sim.violation !== null;
  const blocked = s.stacks.filter((st) => st.at(-1)?.phase === 'wait').length;
  const running = s.stacks.filter((st) => st.at(-1)?.phase === 'run').length;
  const set = (patch: Partial<typeof p>) => setP((cur) => ({ ...cur, ...patch }));

  const status = stalled ? 'stalled' : s.finished === total ? 'done' : 'running';
  return (
    <StageFrame
      player={player}
      height={400}
      stats={
        <Stats>
          <Stat label="Pool" value={status} color={stalled ? 'var(--bad)' : status === 'done' ? 'var(--ok)' : undefined} sub={[stalled ? 'every worker holds a waiting parent' : `tick ${tick}`]} />
          <Stat label="Workers" value={`${running} running · ${blocked} blocked`} sub={[`of ${plural(p.workers, 'worker')}`]} />
          <Stat label="Tasks finished" value={`${s.finished} of ${total}`} sub={[`${plural(s.queue.length, 'task')} waiting in the queue`]} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'running a leaf' },
            { color: 'var(--violet)', label: 'a parent blocked in its join' },
            { color: 'var(--ok)', label: 'finished' },
            { color: 'var(--bad)', label: 'stalled pool' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Toggle label="Join" value={p.helping} onChange={(helping) => set({ helping })} off="just waits" on="by helping" />
          <Slider label="Workers P" value={p.workers} {...STARVE_WORKERS} onChange={(workers) => set({ workers })} />
          <Slider label="Tree depth" value={p.depth} {...STARVE_DEPTH} format={(v) => `${v} (${2 ** v - 1} parents)`} onChange={(depth) => set({ depth })} />
        </>,
      ]}
    >
      <div className="tp-stage stage-pad">
        <div className="tp-workers" role="group" aria-label="The workers and the frames they hold">
          {s.stacks.map((st, w) => (
            <div key={w} className={`tp-worker ${stalled ? 'is-stalled' : ''}`}>
              <span className="tp-deque-name">worker {w}</span>
              <div className="tp-cards">
                {st.length === 0 ? <span className="tp-empty">idle</span> : st.map((f, i) => (
                  <span key={i} className={`cell is-tint tone-${f.phase === 'run' ? 'info' : stalled ? 'bad' : 'violet'} tp-card`}>
                    {isParent(f.task, p.depth) ? `P${f.task}` : `L${f.task}`}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="tp-queue" role="group" aria-label="The shared queue, next task first">
          <span className="tp-deque-name">queue</span>
          <div className="tp-cards">
            {s.queue.length === 0 ? <span className="tp-empty">empty</span> : s.queue.map((id) => (
              <span key={id} className="cell is-dim tp-card">{isParent(id, p.depth) ? `P${id}` : `L${id}`}</span>
            ))}
          </div>
        </div>
        <div className="tp-tasks" role="img" aria-label="Every task, finished ones green">
          {Array.from({ length: total }, (_, id) => (
            <span key={id} className={`cell tp-leaf ${s.done[id] ? 'is-tint tone-ok' : 'is-dim'}`}>{isParent(id, p.depth) ? `P${id}` : `L${id}`}</span>
          ))}
        </div>
        <ProvenanceRow>
          <Provenance kind="simulated">a deterministic tick sim, no randomness; a leaf is {LEAF_TICKS} ticks</Provenance>
          <Provenance kind="toy">simplified: a parent blocks until both children finish; real fork-join pools help or add threads to compensate, and are not modelled in depth</Provenance>
          <Provenance kind="from-memory">that real pools help or compensate depends on the library and its settings: check the one you use</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
