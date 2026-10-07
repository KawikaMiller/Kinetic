import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { StageFrame } from '../../components/StageFrame';
import { Button, Controls, Hint, Legend, PauseButton, Segmented, Slider, Stat, Stats } from '../../components/ui';
import { useIntroCaption, useSetCaption } from '../../core/caption';
import { duration, NA, perSec } from '../../core/format';
import { useCanvas, useLoop } from '../../core/hooks';
import { useSimulation } from '../../core/useSimulation';
import { createMessageView, drawScene } from './draw';
import {
  advance, BACKLOG_WARN, createWorld, MAX_ATTEMPTS, publishPoison, REDELIVER_AFTER, SUBSCRIBERS, switchMode, takeInsight,
  type Mode, type SimEvent, type Stats as SimStats, type World,
} from './sim';

const STAGE_HEIGHT = 430;
const SNAPSHOT_EVERY = 0.3;
const DEFAULTS = { mode: 'work' as Mode, rate: 3, consumers: 2, speed: 1 };

export function Stage() {
  const setCaption = useSetCaption();
  const [mode, setMode] = useState<Mode>(DEFAULTS.mode);
  const [rate, setRate] = useState(DEFAULTS.rate);
  const [consumers, setConsumers] = useState(DEFAULTS.consumers);
  const [speed, setSpeed] = useState(DEFAULTS.speed);
  const view = useRef(createMessageView());

  useIntroCaption(
    <>Producers publish 3 messages/s, but 2 workers only manage about 2/s between them. Watch the <b>backlog</b> grow in the queue.</>,
  );

  const narrateEvents = (events: SimEvent[]) => {
    for (const e of events) {
      if (e.kind === 'dlq') {
        setCaption(<>After {MAX_ATTEMPTS} failed attempts the poison message is parked in the <span className="hl bad">dead-letter queue</span>. The queue keeps flowing; a human (or a tool) inspects it later.</>);
      } else if (e.kind === 'poisonRetry') {
        setCaption(<>The consumer choked on the <span className="hl violet">poison message</span> (attempt {e.msg.attempts} of {MAX_ATTEMPTS}). It goes back in the queue to be retried.</>);
      } else if (e.kind === 'duplicate') {
        setCaption(<><span className="hl bad">Processed twice!</span> The first worker did the work but died before acking, so the broker redelivered it. At-least-once delivery means consumers must be <b>idempotent</b>.</>);
      } else if (e.kind === 'redelivered') {
        setCaption(<>No ack arrived, so the broker <span className="hl">redelivers</span> message #{e.msg.seq} to the front of the queue. Nothing is lost.</>);
      }
    }
  };

  const narrateInsight = (w: World, st: SimStats) => {
    const insight = takeInsight(w, st);
    if (insight === 'backlog') {
      setCaption(<>Backlog at <span className="hl bad">{st.depth}</span> and rising: consumers are slower than producers. Add consumers or speed them up; the queue just buys you time.</>);
    } else if (insight === 'slowSubscriber') {
      setCaption(<>The slow <span className="hl">analytics</span> subscriber has its own backlog, but email and search are unaffected. Each subscriber consumes at its own pace.</>);
    }
  };

  const { world, snap, paused, togglePause } = useSimulation({
    create: () => createWorld(mode, consumers, rate, speed),
    step: (w, dt) => narrateEvents(advance(w, dt)),
    snapshot: (w) => w.broker.stats(),
    snapshotEvery: SNAPSHOT_EVERY,
    onSnapshot: narrateInsight,
  });
  const { wrapRef, canvasRef, redraw } = useCanvas((ctx, w, h) => drawScene(ctx, w, h, world().broker, view.current));
  useLoop(redraw, !paused);

  useEffect(() => {
    world().rate = rate;
  }, [world, rate]);
  useEffect(() => {
    world().broker.speed = speed;
  }, [world, speed]);
  useEffect(() => {
    world().broker.setConsumers(consumers);
  }, [world, consumers]);

  const pickMode = (m: Mode) => {
    setMode(m);
    switchMode(world(), m, consumers, speed);
    setCaption(
      m === 'work' ? (
        <><span className="hl info">Work queue</span>: each message goes to exactly <b>one</b> consumer. Add consumers to share the load.</>
      ) : (
        <><span className="hl violet">Pub/sub</span>: every message is copied to <b>each subscriber</b>'s queue. Email, analytics and search each get their own copy.</>
      ),
    );
  };

  const crash = () => {
    const crashed = world().broker.crashOne();
    if (!crashed) return;
    const c = crashed.consumer;
    const who = mode === 'pubsub' ? SUBSCRIBERS[c.lane].name : `worker ${c.id}`;
    setCaption(
      crashed.msg ? (
        <><span className="hl bad">{who} crashed</span> mid-message. It never sent an ack, so the broker still owns that message.</>
      ) : (
        <><span className="hl bad">{who} crashed</span> while idle. Nothing was in flight, so there's nothing to redeliver.</>
      ),
    );
  };

  const poison = () => {
    publishPoison(world());
    setCaption(<>A <span className="hl violet">poison message</span>: malformed data that makes the consumer throw every single time.</>);
  };

  return (
    <StageFrame minWidth={640}
      height={STAGE_HEIGHT}
      stats={
        <Stats>
          <Stat label="Queue depth" value={snap?.depth ?? 0} color={snap && snap.depth > BACKLOG_WARN ? 'var(--bad)' : 'var(--hi)'} />
          <Stat
            label="Throughput"
            value={snap ? perSec(snap.throughput, 1) : NA}
            color="var(--ok)"
            sub={mode === 'pubsub' ? `acks across ${SUBSCRIBERS.length} subscribers` : `producing ${perSec(rate)}`}
          />
          <Stat label="Avg latency" value={snap ? duration(snap.avgLatency) : NA} sub="publish → ack" />
          <Stat label="Redelivered" value={snap?.redeliveries ?? 0} color="var(--hi)" sub={`${snap?.duplicates ?? 0} duplicates`} />
          <Stat label="Dead letters" value={snap?.dlq ?? 0} color="var(--bad)" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'message' },
            { color: 'var(--hi)', label: 'redelivered' },
            { color: 'var(--violet)', label: 'poison' },
            { color: 'var(--ok)', label: 'acked' },
            { color: 'var(--bad)', label: 'crashed / dead letter' },
          ]}
        />
      }
      controls={
        <Controls>
          <Segmented
            label="Mode"
            options={[{ value: 'work', label: 'Work queue' }, { value: 'pubsub', label: 'Pub/sub fan-out' }]}
            value={mode}
            onChange={pickMode}
          />
          <Slider label="Producer rate" value={rate} min={1} max={10} onChange={setRate} format={(v) => perSec(v)} />
          {mode === 'work' && <Slider label="Consumers" value={consumers} min={1} max={6} onChange={setConsumers} />}
          <Slider label="Consumer speed" value={speed} min={0.5} max={3} step={0.25} onChange={setSpeed} format={(v) => (mode === 'work' ? `${v}/s each` : `${v}×`)} />
          <Button variant="danger" onClick={crash}>💥 Crash a consumer</Button>
          <Button onClick={poison}>☠ Poison message</Button>
          <PauseButton paused={paused} onToggle={togglePause} />
          <Hint block>
            A simulated broker: work times vary ±30%, a crash past halfway counts as the work already done, a message with
            no ack after {REDELIVER_AFTER} s is redelivered, and {MAX_ATTEMPTS} failed attempts send it to the dead-letter queue.
            Failed poison messages go straight back to the head, like RabbitMQ's requeue.
          </Hint>
        </Controls>
      }
    >
      <div ref={wrapRef} className="canvas-wrap" style={{ '--h': `${STAGE_HEIGHT}px` } as CSSProperties}>
        <canvas ref={canvasRef} />
      </div>
    </StageFrame>
  );
}
