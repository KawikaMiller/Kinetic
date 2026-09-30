import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { toOptions } from '../../components/options';
import { StageFrame } from '../../components/StageFrame';
import { Button, Controls, Legend, PauseButton, Segmented, Slider, Stat, Stats } from '../../components/ui';
import { useIntroCaption, useSetCaption } from '../../core/caption';
import { duration, NA, perSec } from '../../core/format';
import { useCanvas, useLoop } from '../../core/hooks';
import { useSimulation } from '../../core/useSimulation';
import { createRenderer } from './draw';
import {
  advance, arrivalRate, CAP, createWorld, MEM_LIMIT, MU, SHED_AT, SPIKE_MULT, SPIKE_S,
  type Policy, type Stats as SimStats, type World,
} from './sim';

const POLICIES: { id: Policy; label: string; say: ReactNode }[] = [
  { id: 'unbounded', label: 'Unbounded queue',
    say: <><span className="hl bad">Unbounded queue</span>: accept everything, queue it in memory, get to it eventually. Push arrivals past {MU}/s and see what "eventually" means.</> },
  { id: 'bounded', label: 'Bounded + backpressure',
    say: <><span className="hl info">Bounded queue + backpressure</span>: at most {CAP} items. When it's full the producer has to wait, so the slow stage sets the pace.</> },
  { id: 'shed', label: 'Load shedding',
    say: <><span className="hl violet">Load shedding</span>: past {SHED_AT} queued, reject low-priority work instantly with a 503; only when completely full is high-priority work refused too.</> },
];

const STAGE_HEIGHT = 470;
const INITIAL_RATE = 8;
const P99_BAD_S = 3;
const GROWING_QUEUE = 60; // queue length that earns the "grows forever" insight
const KNEE = { from: 0.85, to: 1 }; // utilisation band that earns the "knee of the curve" insight

export function Stage() {
  const setCaption = useSetCaption();
  const [policy, setPolicy] = useState<Policy>('unbounded');
  const [rate, setRate] = useState(INITIAL_RATE);
  const [drawScene] = useState(createRenderer);

  useIntroCaption(<>Work arrives at <b>{INITIAL_RATE}/s</b>; the worker can do <b>{MU}/s</b>. 80% busy and the queue stays short. {POLICIES[0].say}</>);

  const narrateEvents = (w: World) => {
    for (const e of w.p.events.splice(0)) {
      if (e === 'oom') setCaption(<><span className="hl bad">💥 Out of memory.</span> The queue passed {MEM_LIMIT} items and the process was killed. Everything waiting in it is gone, and so is every request that arrives while it restarts.</>);
      if (e === 'restart') setCaption(<>Restarted with an empty queue… and if arrivals still beat {MU}/s, it fills right back up. An unbounded queue doesn't fix overload, it just delays the crash.</>);
      if (e === 'blocked') setCaption(<>Queue full → <span className="hl info">backpressure</span>. The producer is told to wait. Latency inside the service stays bounded, and memory can't blow up.</>);
      if (e === 'shedStart') setCaption(<>Overloaded → <span className="hl violet">shedding</span> low-priority work with an instant 503. Yellow high-priority work still gets in.</>);
    }
  };

  const narrateInsight = (w: World, st: SimStats) => {
    const now = w.p.now;
    if (!w.insight.ready(now)) return;
    const rho = arrivalRate(w) / MU;
    if (w.p.policy === 'unbounded' && rho > 1 && st.queue > GROWING_QUEUE && !st.down) {
      w.insight.fire(now);
      setCaption(<>Arrivals beat the worker, so the queue grows <b>forever</b>. Each new item waits behind {st.queue} others: <span className="hl bad">{(st.queue / MU).toFixed(0)} s</span> and climbing.</>);
    } else if (rho >= KNEE.from && rho < KNEE.to) {
      w.insight.fire(now);
      setCaption(<>{Math.round(rho * 100)}% utilisation: still keeping up <i>on average</i>, but random bursts pile up and latency spikes. That's the knee of the curve.</>);
    }
  };

  const sim = useSimulation({
    create: () => createWorld(rate, policy),
    step: (w, dt) => {
      advance(w, dt);
      narrateEvents(w);
    },
    snapshot: (w) => w.p.stats(),
    onSnapshot: narrateInsight,
  });
  const { world, snap, paused, togglePause } = sim;
  const { wrapRef, canvasRef, redraw } = useCanvas((ctx, w, h) => drawScene(ctx, w, h, world()));
  useLoop(redraw, !paused);

  useEffect(() => {
    world().rate = rate;
  }, [world, rate]);

  const pick = (id: Policy) => {
    setPolicy(id);
    world().p.setPolicy(id);
    setCaption(POLICIES.find((x) => x.id === id)!.say);
  };

  const spike = () => {
    const w = world();
    w.spikeUntil = w.p.now + SPIKE_S;
    setCaption(<><span className="hl bad">Spike!</span> {SPIKE_MULT}× the arrivals for {SPIKE_S} seconds: {rate * SPIKE_MULT}/s against a worker that does {MU}/s.</>);
  };

  const reset = () => {
    sim.reset();
    setCaption(<>Fresh start, same policy: <b>{POLICIES.find((x) => x.id === policy)!.label}</b>.</>);
  };

  const rho = rate / MU;

  return (
    <StageFrame minWidth={700}
      height={STAGE_HEIGHT}
      stats={
        <Stats>
          <Stat label="Utilisation" value={`${Math.round(rho * 100)}%`} color={rho >= 1 ? 'var(--bad)' : rho >= 0.8 ? 'var(--hi)' : 'var(--ok)'} sub={`${perSec(rate)} in · ${perSec(MU)} capacity`} />
          <Stat label="In queue" value={snap?.queue ?? 0} color={snap && snap.queue > CAP ? 'var(--bad)' : 'var(--info)'} sub={policy === 'bounded' && snap?.pending ? `${snap.pending} waiting upstream` : ' '} />
          <Stat label="p99 latency" value={snap ? duration(snap.p99) : NA} color={snap && snap.p99 > P99_BAD_S ? 'var(--bad)' : 'var(--ok)'} sub={snap ? `p50 ${duration(snap.p50)}` : ''} />
          <Stat label="Crashes" value={snap?.crashes ?? 0} color="var(--bad)" sub={`${snap?.lost ?? 0} requests lost`} />
          <Stat label="Shed (503)" value={snap ? snap.rejectedLow + snap.rejectedHigh : 0} color="var(--violet)" sub={snap ? `${snap.rejectedHigh} high-priority` : ''} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'work item' },
            { color: 'var(--hi)', label: 'high priority' },
            { color: 'var(--ok)', label: 'done' },
            { color: 'var(--bad)', label: 'dropped / lost' },
          ]}
        />
      }
      controls={
        <Controls>
          <Segmented label="Overload policy" options={toOptions(POLICIES)} value={policy} onChange={pick} />
          <Slider label="Arrival rate" value={rate} min={2} max={20} onChange={setRate} format={(v) => perSec(v)} />
          <Button variant="danger" onClick={spike}>⚡ Spike ×{SPIKE_MULT}</Button>
          <Button onClick={reset}>↺ Reset</Button>
          <PauseButton paused={paused} onToggle={togglePause} />
        </Controls>
      }
    >
      <div ref={wrapRef} className="canvas-wrap" style={{ '--h': `${STAGE_HEIGHT}px` } as CSSProperties}>
        <canvas ref={canvasRef} />
      </div>
    </StageFrame>
  );
}
