import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { StageFrame } from '../../components/StageFrame';
import { Button, Controls, Legend, PauseButton, Provenance, ProvenanceRow, Segmented, Slider, Stat, Stats } from '../../components/ui';
import { useIntroCaption, useSetCaption } from '../../core/caption';
import { duration, NA, perSec } from '../../core/format';
import { useCanvas, useLoop } from '../../core/hooks';
import { createCooldown } from '../../core/sim';
import { useSimulation } from '../../core/useSimulation';
import { BAD_DAY, badDayCaption, HEALTHY, healCaption, insightCaption, introCaption, MODE_LABEL, modeCaption, transitionCaption } from './captions';
import { drawScene } from './draw';
import {
  advance, B_CAP, BROKEN_SEED, createWorld, ERROR_RED_PCT, insightFor, isStorm, NET, STORM_RATIO, STORM_RETRY_SHARE, THREADS, TIMEOUT, type Mode, type Stats as SimStats, type World,
} from './sim';

const MODES: Mode[] = ['naive', 'backoff', 'breaker'];

const STAGE_HEIGHT = 470;
const INSIGHT_COOLDOWN_S = 8;
const DEFAULT_RATE = 15;
/** What turns the load stat red, said under it: the thread pool caps B's load, so at high traffic the second half is what fires. */
const STORM_RULE = `red above ${STORM_RATIO}× the users, or when over ${Math.round(STORM_RETRY_SHARE * 100)}% of it is retries`;

export function Stage() {
  const setCaption = useSetCaption();
  const [mode, setMode] = useState<Mode>('naive');
  const [fail, setFail] = useState(HEALTHY.fail);
  const [latency, setLatency] = useState(HEALTHY.latency);
  const [rate, setRate] = useState(DEFAULT_RATE);
  const insight = useRef(createCooldown(INSIGHT_COOLDOWN_S));
  const lastTransition = useRef(-1); // time of the last breaker transition we narrated

  useIntroCaption(introCaption());

  const narrateTransitions = (w: World) => {
    for (const t of w.sim.transitions.filter((x) => x.t > lastTransition.current)) {
      lastTransition.current = t.t;
      if (t.to !== 'closed' || w.sim.mode === 'breaker') setCaption(transitionCaption(t.to));
    }
  };

  const narrateInsight = (w: World, st: SimStats) => {
    if (!insight.current.ready(w.sim.now)) return;
    const found = insightFor(st, { rate: w.rate, mode: w.sim.mode, failRate: w.sim.failRate });
    if (found) {
      insight.current.fire(w.sim.now);
      setCaption(insightCaption(found));
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
    setCaption(modeCaption(m));
  };

  const badDay = () => {
    setFail(BAD_DAY.fail);
    setLatency(BAD_DAY.latency);
    setCaption(badDayCaption());
  };
  const heal = () => {
    setFail(HEALTHY.fail);
    setLatency(HEALTHY.latency);
    setCaption(healCaption());
  };

  return (
    <StageFrame minWidth={640}
      height={STAGE_HEIGHT}
      stats={
        <Stats>
          <Stat
            label="Load on B"
            value={snap ? perSec(snap.bLoad) : NA}
            color={snap && isStorm(snap, rate) ? 'var(--bad)' : undefined}
            sub={snap ? [`users send ${rate}/s`, `${perSec(snap.bRetryLoad)} are retries`, STORM_RULE] : [`users send ${rate}/s`, STORM_RULE]}
          />
          <Stat
            label="A error rate"
            value={snap ? `${snap.errorPct.toFixed(0)}%` : NA}
            color={snap && snap.errorPct >= ERROR_RED_PCT ? 'var(--bad)' : undefined}
            sub={snap ? `${snap.fallbackPct.toFixed(0)}% fallbacks` : ''}
          />
          <Stat label="p99 latency" value={snap ? duration(snap.p99) : NA} color={snap && snap.p99 > TIMEOUT ? 'var(--bad)' : 'var(--ok)'} />
          <Stat label="A threads busy" value={snap ? `${snap.busyThreads}/${THREADS}` : NA} color={snap && snap.busyThreads >= THREADS ? 'var(--bad)' : undefined} />
        </Stats>
      }
      legend={
        <>
          <Legend
            items={[
              { color: 'var(--info)', label: 'call to B', shape: 'dot' },
              { color: 'var(--ok)', label: 'success', shape: 'dot' },
              { color: 'var(--bad)', label: 'failure / timeout', shape: 'dot' },
              { color: 'var(--violet)', label: 'waiting to retry' },
              { color: 'var(--trk-hw)', label: 'fallback', shape: 'dot' },
              { color: 'var(--amber)', label: 'probe / half-open', shape: 'dot' },
              { color: 'var(--faint)', label: 'orphaned work', shape: 'dot' },
            ]}
          />
          <ProvenanceRow>
            <Provenance kind="simulated" seed={BROKEN_SEED}>
              seeded random failures and bursty traffic; the clock follows your frame rate, so a live run can differ from the same seed in a test
            </Provenance>
            <Provenance kind="illustrative">
              B's capacity ({B_CAP} calls), its slowdown under load and the {Math.round(NET * 1000)} ms hop (slowed down to watch) are made up, not measured
            </Provenance>
          </ProvenanceRow>
        </>
      }
      controls={
        <Controls>
          <Segmented label="Protection" options={MODES.map((m) => ({ value: m, label: MODE_LABEL[m] }))} value={mode} onChange={pickMode} />
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
