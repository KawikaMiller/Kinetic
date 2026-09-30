import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { toOptions } from '../../components/options';
import { StageFrame } from '../../components/StageFrame';
import { Button, Controls, Legend, PauseButton, Segmented, Slider, Stat, Stats } from '../../components/ui';
import { useIntroCaption, useSetCaption } from '../../core/caption';
import { duration, NA, perSec } from '../../core/format';
import { useCanvas, useLoop } from '../../core/hooks';
import { createCooldown } from '../../core/sim';
import { useSimulation } from '../../core/useSimulation';
import { drawScene } from './draw';
import { advance, B_CAP, createWorld, OPEN_FOR, THREADS, TIMEOUT, type Mode, type Stats as SimStats, type World } from './sim';

const MODES: { id: Mode; label: string; say: ReactNode }[] = [
  { id: 'naive', label: 'Naive retries',
    say: <><span className="hl bad">Naive retries</span>: on any failure, retry immediately, up to 3 times. Sounds helpful. Now give B a bad day.</> },
  { id: 'backoff', label: 'Backoff + jitter',
    say: <><span className="hl violet">Exponential backoff + jitter</span>: wait a random time up to 0.2 s, 0.4 s, 0.8 s before each retry. Retries stop arriving in lockstep.</> },
  { id: 'breaker', label: 'Circuit breaker',
    say: <><span className="hl ok">Circuit breaker</span> (plus backoff): if most recent calls fail, stop calling B at all for a while and serve a fallback.</> },
];

const STAGE_HEIGHT = 470;
const INSIGHT_COOLDOWN_S = 8;
const STORM_RATIO = 1.8; // B load vs real traffic that counts as a retry storm
const HEALTHY = { fail: 3, latency: 120 };
const BAD_DAY = { fail: 60, latency: 700 };

export function Stage() {
  const setCaption = useSetCaption();
  const [mode, setMode] = useState<Mode>('naive');
  const [fail, setFail] = useState(HEALTHY.fail);
  const [latency, setLatency] = useState(HEALTHY.latency);
  const [rate, setRate] = useState(15);
  const insight = useRef(createCooldown(INSIGHT_COOLDOWN_S));
  const lastTransition = useRef(-1); // time of the last breaker transition we narrated

  useIntroCaption(<>Users hit <b>Service A</b>, which calls <b>Service B</b> for every request. Everything's healthy. {MODES[0].say}</>);

  const narrateTransitions = (w: World) => {
    const sim = w.sim;
    for (const t of sim.transitions.filter((x) => x.t > lastTransition.current)) {
      lastTransition.current = t.t;
      if (t.to === 'open') setCaption(<>Breaker <span className="hl bad">OPEN</span>: most recent calls failed. For {OPEN_FOR} s, A fails fast with a fallback instead of calling B, and B gets room to recover.</>);
      if (t.to === 'half') setCaption(<><span className="hl">HALF-OPEN</span>: {OPEN_FOR} s are up. Let 3 probe requests through to test whether B has recovered.</>);
      if (t.to === 'closed' && sim.mode === 'breaker') setCaption(<>Probes succeeded → breaker <span className="hl ok">CLOSED</span>. Normal traffic flows to B again.</>);
    }
  };

  const narrateInsight = (w: World, st: SimStats) => {
    const { sim } = w;
    if (!insight.current.ready(sim.now)) return;
    let say: ReactNode = null;
    if (st.busyThreads >= THREADS && st.errorPct > 50) {
      say = <><span className="hl bad">Cascade</span>: all {THREADS} of A's threads are stuck waiting on B, so A now fails its own users. B's problem became A's problem.</>;
    } else if (st.bLoad > w.rate * STORM_RATIO && sim.mode !== 'breaker') {
      say = <><span className="hl bad">Retry storm</span>: B is getting {(st.bLoad / w.rate).toFixed(1)}× the real user traffic. Every retry is extra load on a service that's already struggling.</>;
    } else if (st.bConc > B_CAP * 2 && sim.failRate < 0.1) {
      say = <>B is healthy again, but still buried under <b>{st.bConc}</b> calls, many for requests A already gave up on. Retries keep it from recovering.</>;
    }
    if (say) {
      insight.current.fire(sim.now);
      setCaption(say);
    }
  };

  const { world, snap, paused, togglePause } = useSimulation({
    create: () => createWorld(rate),
    step: (w, dt) => {
      advance(w, dt);
      narrateTransitions(w);
    },
    snapshot: (w) => w.sim.stats(),
    onSnapshot: narrateInsight,
  });
  const { wrapRef, canvasRef, redraw } = useCanvas((ctx, w, h) => drawScene(ctx, w, h, world()));
  useLoop(redraw, !paused);

  useEffect(() => {
    const s = world().sim;
    s.failRate = fail / 100;
    s.latency = latency / 1000;
  }, [world, fail, latency]);
  useEffect(() => {
    world().rate = rate;
  }, [world, rate]);

  const pickMode = (m: Mode) => {
    setMode(m);
    world().sim.setMode(m);
    setCaption(MODES.find((x) => x.id === m)!.say);
  };

  const badDay = () => {
    setFail(BAD_DAY.fail);
    setLatency(BAD_DAY.latency);
    setCaption(<><span className="hl bad">B is having a bad day</span>: 60% of calls fail and the rest take 0.7 s. A's timeout is {TIMEOUT} s. Watch what A does to B.</>);
  };
  const heal = () => {
    setFail(HEALTHY.fail);
    setLatency(HEALTHY.latency);
    setCaption(<><span className="hl ok">B is fixed</span>. Does the system recover on its own?</>);
  };

  return (
    <StageFrame
      height={STAGE_HEIGHT}
      stats={
        <Stats>
          <Stat label="Load on B" value={snap ? perSec(snap.bLoad) : NA} color={snap && snap.bLoad > rate * 1.5 ? 'var(--bad)' : 'var(--info)'} sub={`users send ${rate}/s`} />
          <Stat label="A error rate" value={snap ? `${snap.errorPct.toFixed(0)}%` : NA} color="var(--bad)" sub={snap ? `${snap.fallbackPct.toFixed(0)}% fallbacks` : ''} />
          <Stat label="p99 latency" value={snap ? duration(snap.p99) : NA} color={snap && snap.p99 > TIMEOUT ? 'var(--bad)' : 'var(--ok)'} />
          <Stat label="A threads busy" value={snap ? `${snap.busyThreads}/${THREADS}` : NA} color={snap && snap.busyThreads >= THREADS ? 'var(--bad)' : 'var(--hi)'} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'call to B', shape: 'dot' },
            { color: 'var(--ok)', label: 'success', shape: 'dot' },
            { color: 'var(--bad)', label: 'failure / timeout', shape: 'dot' },
            { color: 'var(--violet)', label: 'waiting to retry' },
            { color: 'var(--hi)', label: 'fallback', shape: 'dot' },
            { color: 'var(--faint)', label: 'orphaned work', shape: 'dot' },
          ]}
        />
      }
      controls={
        <Controls>
          <Segmented label="Protection" options={toOptions(MODES)} value={mode} onChange={pickMode} />
          <Slider label="B failure rate" value={fail} min={0} max={90} onChange={setFail} format={(v) => `${v}%`} />
          <Slider label="B latency" value={latency} min={50} max={1500} step={10} onChange={setLatency} format={(v) => `${v}ms`} />
          <Slider label="User traffic" value={rate} min={5} max={25} onChange={setRate} format={(v) => perSec(v)} />
          <Button variant="danger" onClick={badDay}>🔥 B has a bad day</Button>
          <Button onClick={heal}>💚 Heal B</Button>
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
