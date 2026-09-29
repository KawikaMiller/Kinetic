import { AnimatePresence, motion, useAnimate } from 'motion/react';
import { useMemo, useState, type ReactNode } from 'react';
import { StageFrame } from '../../components/StageFrame';
import { Button, Controls, Legend, Segmented, Stat, Stats } from '../../components/ui';
import { useSetCaption } from '../../core/caption';
import type { Frame } from '../../core/types';
import { usePlayer } from '../../core/usePlayer';
import './styles.css';

interface Item {
  id: number;
  label: string;
}

type OpKind = 'push' | 'pop' | 'peek' | 'enqueue' | 'dequeue';

interface Op {
  target: 'stack' | 'queue';
  kind: OpKind;
  item?: Item;
}

interface World {
  stack: Item[]; // index 0 = bottom
  queue: Item[]; // index 0 = front
}

interface SqFrame extends Frame, World {
  op: Op | null;
}

const CAP = 7;

/* ─── Guided scenario ──────────────────────────────────────────────── */

type Step =
  | { do: 'push' | 'enqueue'; label: string; say: ReactNode }
  | { do: 'pop' | 'dequeue' | 'peek-stack' | 'peek-queue' | 'none'; say: ReactNode; hold?: number };

const SCRIPT: Step[] = [
  { do: 'none', say: <>Your browser's <b>Back</b> button is a <span className="hl violet">stack</span>. Every page you visit gets pushed on top. Press play.</> },
  { do: 'push', label: 'google', say: <>Visit google → <span className="hl ok">push</span>. It lands on top.</> },
  { do: 'push', label: 'docs', say: <>Click through to docs → <span className="hl ok">push</span>.</> },
  { do: 'push', label: 'blog', say: <>Then blog. The newest page is <b>always</b> on top.</> },
  { do: 'peek-stack', say: <><span className="hl">peek</span>: look at the top without removing it. That's the page you're on.</> },
  { do: 'pop', say: <>Hit Back → <span className="hl bad">pop</span>. blog comes off the top. <b>Last in, first out.</b></> },
  { do: 'push', label: 'news', say: <>Visit news: pushed on top of docs.</> },
  { do: 'pop', say: <>Back → pop news.</> },
  { do: 'pop', say: <>Back again → pop docs. You always undo the <b>most recent</b> thing first.</> },
  { do: 'none', say: <>Now a <span className="hl info">queue</span>: a printer. First come, first served.</> },
  { do: 'enqueue', label: 'ann.pdf', say: <>Ann sends a job → <span className="hl ok">enqueue</span> at the back.</> },
  { do: 'enqueue', label: 'bob.doc', say: <>Bob's job joins behind Ann.</> },
  { do: 'enqueue', label: 'cat.png', say: <>Then Cat. Jobs line up in arrival order.</> },
  { do: 'dequeue', say: <>Printer is free → <span className="hl bad">dequeue</span> from the front. Ann was first, Ann prints first.</> },
  { do: 'enqueue', label: 'dan.txt', say: <>Dan's job goes to the <b>back</b>. No cutting in line.</> },
  { do: 'peek-queue', say: <><span className="hl">peek</span> at the front: Bob's up next.</> },
  { do: 'dequeue', say: <>Dequeue → Bob prints. <b>First in, first out.</b></> },
  { do: 'none', hold: 2, say: <>Stack = <span className="hl violet">LIFO</span> (undo, back button, call stack). Queue = <span className="hl info">FIFO</span> (job queues, BFS, buffers). Both are O(1) at their ends.</> },
];

function buildScenario(): SqFrame[] {
  let id = 1;
  let w: World = { stack: [], queue: [] };
  return SCRIPT.map((s) => {
    let op: Op | null = null;
    if (s.do === 'push') {
      const item = { id: id++, label: s.label };
      w = { ...w, stack: [...w.stack, item] };
      op = { target: 'stack', kind: 'push', item };
    } else if (s.do === 'enqueue') {
      const item = { id: id++, label: s.label };
      w = { ...w, queue: [...w.queue, item] };
      op = { target: 'queue', kind: 'enqueue', item };
    } else if (s.do === 'pop') {
      op = { target: 'stack', kind: 'pop', item: w.stack[w.stack.length - 1] };
      w = { ...w, stack: w.stack.slice(0, -1) };
    } else if (s.do === 'dequeue') {
      op = { target: 'queue', kind: 'dequeue', item: w.queue[0] };
      w = { ...w, queue: w.queue.slice(1) };
    } else if (s.do === 'peek-stack') {
      op = { target: 'stack', kind: 'peek', item: w.stack[w.stack.length - 1] };
    } else if (s.do === 'peek-queue') {
      op = { target: 'queue', kind: 'peek', item: w.queue[0] };
    }
    return { ...w, op, say: s.say, hold: 'hold' in s ? s.hold : undefined };
  });
}

/* ─── Stage ────────────────────────────────────────────────────────── */

export function Stage() {
  const frames = useMemo(() => buildScenario(), []);
  const [mode, setMode] = useState<'guided' | 'sandbox'>('guided');
  const player = usePlayer(frames, { interval: 1700, keyboard: mode === 'guided' });
  const setCaption = useSetCaption();
  const [sandbox, setSandbox] = useState<World & { op: Op | null; nextId: number }>({
    stack: [], queue: [], op: null, nextId: 100,
  });
  const [stackScope, animateStack] = useAnimate<HTMLDivElement>();
  const [queueScope, animateQueue] = useAnimate<HTMLDivElement>();

  const view: World & { op: Op | null } = mode === 'guided' ? player.frame : sandbox;

  const shake = (target: 'stack' | 'queue') => {
    const el = target === 'stack' ? stackScope.current : queueScope.current;
    const animate = target === 'stack' ? animateStack : animateQueue;
    if (el) animate(el, { x: [0, -10, 10, -6, 6, 0] }, { duration: 0.4 });
  };

  const switchMode = (m: 'guided' | 'sandbox') => {
    setMode(m);
    if (m === 'sandbox') {
      player.pause();
      setSandbox((s) => ({ ...s, stack: player.frame.stack, queue: player.frame.queue, op: null }));
      setCaption(<>Sandbox: push, pop and peek yourself. Watch which end each one uses.</>);
    } else {
      setCaption(player.frame.say);
    }
  };

  const act = (target: 'stack' | 'queue', kind: OpKind) => {
    const s = sandbox;
    const list = target === 'stack' ? s.stack : s.queue;
    const adding = kind === 'push' || kind === 'enqueue';
    if (adding && list.length >= CAP) {
      shake(target);
      setCaption(<><span className="hl bad">{target === 'stack' ? 'Stack overflow!' : 'Queue full!'}</span> This one has room for {CAP}. Real ones grow, but memory isn't infinite.</>);
      return;
    }
    if (!adding && !list.length) {
      shake(target);
      setCaption(<><span className="hl bad">{target === 'stack' ? 'Stack underflow!' : 'Queue is empty!'}</span> Nothing to {kind}. Real code must check for this.</>);
      return;
    }
    const top = target === 'stack' ? list[list.length - 1] : list[0];
    if (kind === 'peek') {
      setSandbox({ ...s, op: { target, kind, item: top } });
      setCaption(<><span className="hl">peek</span> → <b>{top.label}</b>. Looked, didn't remove. O(1).</>);
      return;
    }
    if (adding) {
      const item = { id: s.nextId, label: target === 'stack' ? `frame ${s.nextId - 99}` : `job ${s.nextId - 99}` };
      const next = target === 'stack' ? { stack: [...s.stack, item] } : { queue: [...s.queue, item] };
      setSandbox({ ...s, ...next, op: { target, kind, item }, nextId: s.nextId + 1 });
      setCaption(
        target === 'stack'
          ? <><span className="hl ok">push</span> {item.label} onto the <b>top</b>. O(1).</>
          : <><span className="hl ok">enqueue</span> {item.label} at the <b>back</b>. O(1).</>,
      );
      return;
    }
    const next = target === 'stack' ? { stack: s.stack.slice(0, -1) } : { queue: s.queue.slice(1) };
    setSandbox({ ...s, ...next, op: { target, kind, item: top } });
    setCaption(
      target === 'stack'
        ? <><span className="hl bad">pop</span> {top.label} off the <b>top</b>: the newest thing leaves first.</>
        : <><span className="hl bad">dequeue</span> {top.label} from the <b>front</b>: the oldest thing leaves first.</>,
    );
  };

  const op = view.op;
  const lastOp = op && op.item ? `${op.kind} → ${op.item.label}` : '·';

  return (
    <StageFrame
      player={mode === 'guided' ? player : undefined}
      height={430}
      stats={
        <Stats>
          <Stat label="Stack size" value={view.stack.length} color="var(--violet)" />
          <Stat label="Queue size" value={view.queue.length} color="var(--info)" />
          <Stat label="Last op" value={<span className="sq-lastop">{lastOp}</span>} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--ok)', label: 'just added' },
            { color: 'var(--hi)', label: 'peeked' },
            { color: 'var(--bad)', label: 'removed' },
          ]}
        />
      }
      controls={
        <Controls>
          <Segmented
            label="Mode"
            value={mode}
            onChange={switchMode}
            options={[
              { value: 'guided', label: 'Guided story' },
              { value: 'sandbox', label: 'Sandbox' },
            ]}
          />
          {mode === 'sandbox' && (
            <>
              <div className="sq-btns">
                <span className="sq-btns-label">Stack</span>
                <Button onClick={() => act('stack', 'push')}>Push</Button>
                <Button onClick={() => act('stack', 'pop')}>Pop</Button>
                <Button onClick={() => act('stack', 'peek')}>Peek</Button>
              </div>
              <div className="sq-btns">
                <span className="sq-btns-label">Queue</span>
                <Button onClick={() => act('queue', 'enqueue')}>Enqueue</Button>
                <Button onClick={() => act('queue', 'dequeue')}>Dequeue</Button>
                <Button onClick={() => act('queue', 'peek')}>Peek</Button>
              </div>
            </>
          )}
        </Controls>
      }
    >
      <div className="sq">
        <section className="sq-panel">
          <header className="sq-head">
            <div>
              <h3>Stack</h3>
              <span className="sq-rule sq-violet">LIFO · last in, first out</span>
            </div>
            <Badges ops={['push', 'pop', 'peek']} />
          </header>
          <div className="sq-stack-wrap">
            <Removed op={op} target="stack" />
            <div className="sq-stack" ref={stackScope}>
              <AnimatePresence mode="popLayout" initial={false}>
                {view.stack.map((it, i) => {
                  const isTop = i === view.stack.length - 1;
                  return (
                    <motion.div
                      key={it.id}
                      layout
                      className={`sq-item sq-item-stack ${itemState(op, 'stack', it)}`}
                      initial={{ opacity: 0, y: -90, scale: 0.9 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -110, x: 60, rotate: 8 }}
                      transition={{ type: 'spring', stiffness: 380, damping: 28 }}
                    >
                      {it.label}
                      {isTop && <span className="sq-marker sq-marker-top">◀ top</span>}
                    </motion.div>
                  );
                })}
              </AnimatePresence>
              {!view.stack.length && <span className="sq-empty">empty</span>}
            </div>
          </div>
        </section>

        <section className="sq-panel">
          <header className="sq-head">
            <div>
              <h3>Queue</h3>
              <span className="sq-rule sq-info">FIFO · first in, first out</span>
            </div>
            <Badges ops={['enqueue', 'dequeue', 'peek']} />
          </header>
          <div className="sq-queue-wrap">
            <div className="sq-flow">
              <span>← dequeue from front</span>
              <span>enqueue at back ←</span>
            </div>
            <div className="sq-queue" ref={queueScope}>
              <AnimatePresence mode="popLayout" initial={false}>
                {view.queue.map((it, i) => (
                  <motion.div
                    key={it.id}
                    layout
                    className={`sq-item sq-item-queue ${itemState(op, 'queue', it)}`}
                    initial={{ opacity: 0, x: 120 }}
                    animate={{ opacity: 1, x: 0, y: 0 }}
                    exit={{ opacity: 0, x: -120, y: 30 }}
                    transition={{ type: 'spring', stiffness: 320, damping: 30 }}
                  >
                    {it.label}
                    {i === 0 && <span className="sq-marker sq-marker-front">front</span>}
                    {i === view.queue.length - 1 && <span className="sq-marker sq-marker-back">back</span>}
                  </motion.div>
                ))}
              </AnimatePresence>
              {!view.queue.length && <span className="sq-empty">empty</span>}
            </div>
            <Removed op={op} target="queue" />
          </div>
        </section>
      </div>
    </StageFrame>
  );
}

function itemState(op: Op | null, target: 'stack' | 'queue', it: Item) {
  if (!op || op.target !== target || op.item?.id !== it.id) return '';
  return op.kind === 'peek' ? 'peeked' : 'added';
}

function Badges({ ops }: { ops: string[] }) {
  return (
    <div className="sq-badges">
      {ops.map((o) => (
        <span key={o} className="sq-badge">
          {o} <b>O(1)</b>
        </span>
      ))}
    </div>
  );
}

/** A ghost of whatever was just removed, so you can see where it went. */
function Removed({ op, target }: { op: Op | null; target: 'stack' | 'queue' }) {
  const show = op && op.target === target && (op.kind === 'pop' || op.kind === 'dequeue') && op.item;
  return (
    <div className={`sq-removed sq-removed-${target}`}>
      <AnimatePresence>
        {show && (
          <motion.span
            key={op.item!.id}
            className="sq-removed-chip"
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
          >
            {op.kind === 'pop' ? 'popped' : 'dequeued'}: <b>{op.item!.label}</b>
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  );
}
