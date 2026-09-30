import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { StageFrame } from '../../components/StageFrame';
import { Button, Controls, Legend, PauseButton, Segmented, Slider, Stat, Stats } from '../../components/ui';
import { useIntroCaption, useSetCaption } from '../../core/caption';
import { NA, perSec } from '../../core/format';
import { useCanvas, useLoop } from '../../core/hooks';
import { useSimulation } from '../../core/useSimulation';
import { drawScene } from './draw';
import { advance, ALGO_IDS, boundaryAttack, burst, BURST_SIZE, createWorld, snapshot, type AlgoId, type AttackResult } from './sim';
import './styles.css';

const ALGOS: Record<AlgoId, { label: string; say: ReactNode }> = {
  fixed: {
    label: 'Fixed window',
    say: <><span className="hl">Fixed window</span>: count requests per clock second, reset to zero on the tick. Simple and cheap, but try the boundary attack.</>,
  },
  sliding: {
    label: 'Sliding window',
    say: <><span className="hl info">Sliding window</span>: count requests in the <b>last</b> 1 s, measured from right now. No boundary to game, but it has to remember timestamps.</>,
  },
  token: {
    label: 'Token bucket',
    say: <><span className="hl ok">Token bucket</span>: tokens drip in at the limit rate; each request spends one. A full bucket allows a short <b>burst</b>, then you're held to the average.</>,
  },
  leaky: {
    label: 'Leaky bucket',
    say: <><span className="hl violet">Leaky bucket</span>: requests queue up and leak out at a constant rate. Output is perfectly smooth; bursts wait in line, overflow gets a 429.</>,
  },
};

const CANVAS_HEIGHT = 430;
const STAGE_HEIGHT = 560;
const SNAPSHOT_EVERY = 0.25;
const DEFAULTS = { algo: 'token' as AlgoId, rate: 8, limit: 10, capacity: 10 };

export function Stage() {
  const setCaption = useSetCaption();
  const [algo, setAlgo] = useState<AlgoId>(DEFAULTS.algo);
  const [rate, setRate] = useState(DEFAULTS.rate);
  const [limit, setLimit] = useState(DEFAULTS.limit);
  const [capacity, setCapacity] = useState(DEFAULTS.capacity);

  useIntroCaption(<>Requests fly in from the left and hit the limiter. {ALGOS.token.say}</>);

  const narrateAttack = ({ algo: a, passed, fixed, limit: L }: AttackResult) => {
    setCaption(
      a === 'fixed' ? (
        <>Boundary attack: fixed window let <span className="hl bad">{fixed}</span> requests through in ~0.4 s. The limit is {L}/s, but
          the counter reset in the middle of the burst, so both windows said yes.</>
      ) : a === 'leaky' ? (
        <>Same attack: the leaky bucket queued what fit and is draining it at a steady {L}/s. Fixed window would have let{' '}
          <span className="hl bad">{fixed}</span> straight through.</>
      ) : (
        <>Same attack: {ALGOS[a].label.toLowerCase()} let <span className="hl ok">{passed}</span> through. Fixed window
          would have allowed <span className="hl bad">{fixed}</span> of the {2 * L}.</>
      ),
    );
  };

  const { world, snap, paused, togglePause } = useSimulation({
    create: () => createWorld(algo, rate, { limit, capacity }),
    step: (w, dt) => {
      const attack = advance(w, dt);
      if (attack) narrateAttack(attack);
    },
    snapshot,
    snapshotEvery: SNAPSHOT_EVERY,
  });
  const { wrapRef, canvasRef, redraw } = useCanvas((ctx, w) => drawScene(ctx, w, world()));
  useLoop(redraw, !paused);

  useEffect(() => {
    const w = world();
    w.algo = algo;
    w.rate = rate;
  }, [world, algo, rate]);
  useEffect(() => {
    for (const l of Object.values(world().limiters)) l.setParams({ limit, capacity });
  }, [world, limit, capacity]);

  const pick = (id: AlgoId) => {
    setAlgo(id);
    world().algo = id;
    setCaption(ALGOS[id].say);
  };

  const sendBurst = () => {
    burst(world());
    setCaption(<><span className="hl bad">Burst!</span> {BURST_SIZE} requests at once. Which algorithm lets how many through?</>);
  };

  const attack = () => {
    const L = boundaryAttack(world());
    setCaption(
      <>Boundary attack: one client sends <b>{L}</b> requests just before the clock ticks over, and <b>{L}</b> more just
        after. Watch the timeline around the dashed line.</>,
    );
  };

  const rows = snap?.rows;
  const sel = rows?.[algo];

  return (
    <StageFrame minWidth={640}
      height={STAGE_HEIGHT}
      stats={
        <Stats>
          <Stat label="Allowed" value={sel ? sel.ok : NA} color="var(--ok)" sub="last 10 s" />
          <Stat label="Rejected 429" value={sel ? `${sel.rejectPct.toFixed(0)}%` : NA} color="var(--bad)" sub={sel ? `${sel.bad} requests` : ''} />
          <Stat
            label="Peak in any 1 s"
            value={sel ? sel.peak : NA}
            color={sel && sel.peak > limit ? 'var(--bad)' : 'var(--hi)'}
            sub={`limit ${perSec(limit)}`}
          />
          {algo === 'token' && <Stat label="Tokens" value={snap ? Math.floor(snap.tokens) : NA} color="var(--hi)" sub={`of ${capacity}`} />}
          {algo === 'leaky' && <Stat label="Queued" value={snap?.queue ?? NA} color="var(--violet)" sub={`of ${capacity}`} />}
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'request', shape: 'dot' },
            { color: 'var(--ok)', label: 'allowed', shape: 'dot' },
            { color: 'var(--bad)', label: 'rejected (429)', shape: 'dot' },
            { color: 'var(--hi)', label: 'token / counter' },
          ]}
        />
      }
      controls={
        <Controls>
          <Segmented label="Algorithm" options={ALGO_IDS.map((id) => ({ value: id, label: ALGOS[id].label }))} value={algo} onChange={pick} />
          <Slider label="Traffic" value={rate} min={2} max={30} onChange={setRate} format={(v) => perSec(v)} />
          <Slider label="Limit" value={limit} min={4} max={20} onChange={setLimit} format={(v) => perSec(v)} />
          <Slider label="Bucket size" value={capacity} min={1} max={30} onChange={setCapacity} />
          <Button variant="danger" onClick={sendBurst}>⚡ Burst ×{BURST_SIZE}</Button>
          <Button onClick={attack}>⏱ Boundary attack</Button>
          <PauseButton paused={paused} onToggle={togglePause} />
        </Controls>
      }
    >
      <div className="rl">
        <div ref={wrapRef} className="canvas-wrap" style={{ '--h': `${CANVAS_HEIGHT}px` } as CSSProperties}>
          <canvas ref={canvasRef} />
        </div>
        <div className="rl-compare">
          <div className="rl-compare-head">
            <span>Same traffic, every algorithm <em>· last 10 s · click to switch</em></span>
          </div>
          <div className="rl-rows">
            {ALGO_IDS.map((id) => {
              const r = rows?.[id];
              return (
                <button key={id} type="button" className={`rl-row ${id === algo ? 'on' : ''}`} onClick={() => pick(id)}>
                  <b>{ALGOS[id].label}</b>
                  <span className="rl-ok">{r ? r.ok : NA} ok</span>
                  <span className="rl-bad">{r ? r.bad : NA} rejected</span>
                  <span className={r && r.peak > limit ? 'rl-bad' : 'rl-peak'}>peak {r ? r.peak : NA}/s</span>
                </button>
              );
            })}
          </div>
          <p className="rl-note">
            Real APIs keep one limiter <b>per key</b> (user, API key or IP). With many servers, the counts live in a shared
            store such as Redis so every server enforces the same limit.
          </p>
        </div>
      </div>
    </StageFrame>
  );
}
