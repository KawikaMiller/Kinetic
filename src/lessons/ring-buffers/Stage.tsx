import { useRef, useState } from 'react';
import { AnimatedValue } from '../../components/AnimatedValue';
import { ArrayStrip } from '../../components/ArrayStrip';
import { SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Button, ChipButton, Hint, Legend, PauseButton, Segmented, Slider, Stat, Stats } from '../../components/ui';
import { useIntroCaption, useSetCaption } from '../../core/caption';
import { perSec } from '../../core/format';
import { useInterval } from '../../core/useInterval';
import { INTRO, POLICY_LABEL, STRATEGY_LABEL, eventCaption } from './frames';
import {
  MAX_SLOTS, MIN_SLOTS, NEAR_WRAP, capacity, createRing, decision, dequeue, enqueue, headSlot, isEmpty, isFull, refusal, reservedSlot, size, tailSlot,
  type Event, type Policy, type Ring, type Strategy,
} from './model';
import { RingView, type Flash } from './RingView';
import './styles.css';

const BATCH = 5;
/** Auto-run checks the producer and consumer this often. */
const TICK_MS = 100;
const MAX_RATE = 6;

const STRATEGIES = (Object.keys(STRATEGY_LABEL) as Strategy[]).map((s) => ({ value: s, label: STRATEGY_LABEL[s] }));
const POLICIES = (Object.keys(POLICY_LABEL) as Policy[]).map((p) => ({ value: p, label: POLICY_LABEL[p] }));

interface Counts {
  dropped: number;
  overwritten: number;
  blocked: number;
}
const ZERO: Counts = { dropped: 0, overwritten: 0, blocked: 0 };

const WHERE = [
  { title: 'Kernel log', body: 'dmesg reads a fixed-size ring: when it fills, the oldest messages are overwritten.' },
  { title: 'Audio', body: 'The sound card drains a ring of samples while the app refills it; run dry and you hear a glitch.' },
  { title: 'Network cards', body: 'A NIC writes arriving packets into an RX ring; if the driver falls behind, new packets are dropped.' },
  { title: 'Bounded buffer', body: 'The producer–consumer buffer in `semaphores-condition-variables` is this ring, with threads blocking when it is full.' },
];

export function Stage() {
  const [strategy, setStrategy] = useState<Strategy>('sentinel');
  const [policy, setPolicy] = useState<Policy>('block');
  const [n, setN] = useState(8);
  const [ring, setRing] = useState<Ring>(() => createRing('sentinel', 8));
  const [counts, setCounts] = useState<Counts>(ZERO);
  const [flash, setFlash] = useState<Flash | null>(null);
  const [last, setLast] = useState<Event | null>(null);
  const [running, setRunning] = useState(false);
  const [produceRate, setProduceRate] = useState(3);
  const [consumeRate, setConsumeRate] = useState(2);
  const next = useRef(1);
  const flashes = useRef(0);
  const budget = useRef({ produce: 0, consume: 0 });
  // Pointer angles count from where each pointer started, so the ring turns continuously.
  const [base, setBase] = useState({ head: 0, tail: 0 });
  const setCaption = useSetCaption();

  const why = refusal(strategy, n);
  useIntroCaption(INTRO[ring.strategy], [ring.strategy]);

  const reset = (s: Strategy, size: number, start = 0) => {
    const refused = refusal(s, size);
    if (refused) {
      setCaption(<>{refused}</>);
      setRunning(false);
      return;
    }
    const r = createRing(s, size, start);
    setBase({ head: headSlot(r), tail: tailSlot(r) });
    setRing(r);
    setCounts(ZERO);
    setFlash(null);
    setLast(null);
    next.current = 1;
  };

  const apply = (r0: Ring, op: 'enqueue' | 'dequeue', narrate: boolean): Ring => {
    const { ring: r, event } = op === 'enqueue' ? enqueue(r0, next.current, policy) : dequeue(r0);
    if (op === 'enqueue' && event.kind !== 'blocked') next.current++;
    setCounts((c) => ({
      dropped: c.dropped + +(event.kind === 'dropped'),
      overwritten: c.overwritten + +(event.kind === 'overwrote'),
      blocked: c.blocked + +(event.kind === 'blocked'),
    }));
    if (event.kind === 'overwrote') setFlash({ kind: 'overwrite', slot: event.slot, key: ++flashes.current });
    // A dropped item never reaches a slot: flash it at the tail arrow, not over the item it would have hit.
    if (event.kind === 'dropped') setFlash({ kind: 'drop', key: ++flashes.current });
    setLast(event);
    if (narrate) setCaption(eventCaption(event, r, r0), { quiet: running });
    return r;
  };

  const run = (ops: ('enqueue' | 'dequeue')[]) => {
    let r = ring;
    ops.forEach((op, i) => (r = apply(r, op, i === ops.length - 1)));
    setRing(r);
  };

  useInterval(
    () => {
      const b = budget.current;
      b.produce += (produceRate * TICK_MS) / 1000;
      b.consume += (consumeRate * TICK_MS) / 1000;
      const ops: ('enqueue' | 'dequeue')[] = [];
      while (b.produce >= 1 || b.consume >= 1) {
        if (b.produce >= b.consume && b.produce >= 1) {
          b.produce--;
          ops.push('enqueue');
        } else {
          b.consume--;
          ops.push('dequeue');
        }
      }
      if (ops.length) run(ops);
    },
    TICK_MS,
    running && !why,
  );

  const d = decision(ring);
  const reserved = reservedSlot(ring);

  return (
    <StageFrame
      height={520}
      stats={
        <Stats>
          <Stat label="Size" value={<AnimatedValue value={size(ring)} />} sub={`of ${capacity(ring)} usable`} color={isFull(ring) ? 'var(--hi)' : 'var(--muted)'} />
          <Stat label="Dropped" value={counts.dropped} color={counts.dropped ? 'var(--bad)' : 'var(--muted)'} />
          <Stat label="Overwritten" value={counts.overwritten} color={counts.overwritten ? 'var(--orange)' : 'var(--muted)'} />
          <Stat label="Producer blocked" value={counts.blocked} color="var(--muted)" sub="times" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'head (read)', shape: 'dot' },
            { color: 'var(--violet)', label: 'tail (write)', shape: 'dot' },
            { color: 'var(--hi)', label: 'filled slot', shape: 'square' },
            { color: 'var(--dim)', label: 'empty slot (dashed: kept empty)', shape: 'square' },
            { color: 'var(--orange)', label: 'overwritten', shape: 'square' },
            { color: 'var(--bad)', label: 'dropped', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          <Segmented
            label="Full or empty?"
            value={strategy}
            onChange={(s) => {
              setStrategy(s);
              reset(s, n);
            }}
            options={STRATEGIES}
          />
          <Segmented label="When full" value={policy} onChange={setPolicy} options={POLICIES} />
        </>,
        <>
          <Slider
            label="Slots N"
            value={n}
            min={MIN_SLOTS}
            max={MAX_SLOTS}
            onChange={(v) => {
              setN(v);
              reset(strategy, v);
            }}
          />
          <Button variant="primary" onClick={() => run(['enqueue'])} disabled={!!why}>
            Enqueue
          </Button>
          <Button onClick={() => run(Array<'enqueue'>(BATCH).fill('enqueue'))} disabled={!!why}>
            Enqueue ×{BATCH}
          </Button>
          <Button onClick={() => run(['dequeue'])} disabled={!!why}>
            Dequeue
          </Button>
          <Button onClick={() => reset(strategy, n)} disabled={!!why}>
            Reset
          </Button>
          {strategy === 'masked' && !why && (
            <ChipButton tone="violet" size="md" onClick={() => reset('masked', n, NEAR_WRAP)}>
              Start counters near 2³²
            </ChipButton>
          )}
        </>,
        <>
          <PauseButton paused={!running} onToggle={() => setRunning(!running)} />
          <Slider label="Producer" value={produceRate} min={0} max={MAX_RATE} onChange={setProduceRate} format={(v) => perSec(v)} />
          <Slider label="Consumer" value={consumeRate} min={0} max={MAX_RATE} onChange={setConsumeRate} format={(v) => perSec(v)} />
        </>,
      ]}
    >
      <div className="rb stage-pad">
        {why && (
          <p className="rb-refusal" role="alert">
            {why} Still showing the last valid buffer: "{STRATEGY_LABEL[ring.strategy]}" with {ring.n} slots.
          </p>
        )}
        <div className="rb-views">
          <div className="rb-ring-wrap">
            <RingView ring={ring} headBase={base.head} tailBase={base.tail} flash={flash} />
          </div>
          <div className="rb-side">
            <SectionTitle>The same {ring.n} slots as the flat array they really are</SectionTitle>
            <ArrayStrip
              className="rb-flat"
              values={ring.slots.map((v) => v ?? '')}
              cellState={(i) => (ring.slots[i] !== null ? 'active' : i === reserved ? 'idle' : 'dim')}
              pointers={
                headSlot(ring) === tailSlot(ring)
                  ? [{ i: headSlot(ring), label: 'head = tail', tone: 'violet', id: 'both' }]
                  : [
                      { i: headSlot(ring), label: 'head', tone: 'info', id: 'head' },
                      { i: tailSlot(ring), label: 'tail', tone: 'violet', id: 'tail' },
                    ]
              }
              showIndex
              fontSize={12}
              cellMax={44}
              cellTitle={(i) => `slot ${i}: ${ring.slots[i] ?? (i === reserved ? 'kept empty' : 'empty')}`}
            />
            <div className="rb-decide">
              <SectionTitle>How "{STRATEGY_LABEL[ring.strategy]}" decides</SectionTitle>
              <code className={isEmpty(ring) ? 'is-true' : ''}>empty? {d.empty}: {String(isEmpty(ring))}</code>
              <code className={isFull(ring) ? 'is-true' : ''}>full?  {d.full}: {String(isFull(ring))}</code>
              <code>size: {d.size}</code>
            </div>
            {last?.kind === 'overwrote' && <span className="rb-lost tone-orange">{last.lost} overwritten by {last.value}</span>}
            {last?.kind === 'dropped' && <span className="rb-lost tone-bad">{last.value} dropped</span>}
          </div>
        </div>
        <div className="rb-where" aria-label="Where you meet ring buffers">
          {WHERE.map((w) => (
            <div key={w.title} className="rb-where-card">
              <b>{w.title}</b>
              <span>{w.body.split('`').map((part, i) => (i % 2 ? <code key={i}>{part}</code> : part))}</span>
            </div>
          ))}
        </div>
        <Hint block>
          Nothing simulated: the buffer logic runs live in your browser, exactly as written in the readout. Producer and consumer speeds are
          illustrative. With one producer and one consumer, "Keep one slot empty" or "Masked counters", and Block or Drop, each index has a single
          writer (the producer moves tail, the consumer moves head), which is why such rings can run without a lock, given the right memory ordering.
          A shared count (both sides write it), "Overwrite oldest" (the producer moves head too) or several producers break that, and need atomics or a
          lock.
        </Hint>
      </div>
    </StageFrame>
  );
}
