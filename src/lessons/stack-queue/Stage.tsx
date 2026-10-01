import { AnimatePresence, motion, useAnimate } from 'motion/react';
import { useMemo, useState, type CSSProperties } from 'react';
import { Box } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Button, Controls, Legend, Segmented, Stat, Stats } from '../../components/ui';
import { useSetCaption } from '../../core/caption';
import { SPRING } from '../../core/motion';
import { usePlayer } from '../../core/usePlayer';
import { applyOp, type Item, type Op, type OpKind, type Target, type World } from './model';
import { buildScenario } from './scenario';
import './styles.css';

/** Room in each structure before the sandbox refuses more. */
const CAP = 7;
/** Sandbox item ids start here, clear of the scenario's ids. */
const FIRST_SANDBOX_ID = 100;

interface Sandbox extends World {
  op: Op | null;
  nextId: number;
  /** How many items each structure has had, so stack frames and print jobs number separately. */
  made: Record<Target, number>;
}
/** A harder "No!" than the shared SHAKE: the whole structure refuses. */
const REFUSE_SHAKE = { x: [0, -10, 10, -6, 6, 0] };

export function Stage() {
  const frames = useMemo(() => buildScenario(), []);
  const [mode, setMode] = useState<'guided' | 'sandbox'>('guided');
  const player = usePlayer(frames, { interval: 1700, keyboard: mode === 'guided' });
  const setCaption = useSetCaption();
  const [sandbox, setSandbox] = useState<Sandbox>({
    stack: [], queue: [], op: null, nextId: FIRST_SANDBOX_ID, made: { stack: 0, queue: 0 },
  });
  const [stackScope, animateStack] = useAnimate<HTMLDivElement>();
  const [queueScope, animateQueue] = useAnimate<HTMLDivElement>();

  const view: World & { op: Op | null } = mode === 'guided' ? player.frame : sandbox;

  const shake = (target: Target) => {
    const el = target === 'stack' ? stackScope.current : queueScope.current;
    const animate = target === 'stack' ? animateStack : animateQueue;
    if (el) animate(el, REFUSE_SHAKE, { duration: 0.4 });
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

  const act = (target: Target, kind: OpKind) => {
    const s = sandbox;
    const adding = kind === 'push' || kind === 'enqueue';
    const n = s.made[target] + 1;
    const fresh = adding ? { id: s.nextId, label: target === 'stack' ? `frame ${n}` : `job ${n}` } : undefined;
    const { world, outcome, item } = applyOp(s, target, kind, fresh, CAP);

    if (outcome !== 'ok' || !item) {
      shake(target);
      setCaption(refusal(target, kind, outcome));
      return;
    }
    const made = adding ? { ...s.made, [target]: n } : s.made;
    setSandbox({ ...world, op: { target, kind, item }, nextId: adding ? s.nextId + 1 : s.nextId, made });
    setCaption(done(target, kind, item));
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
        <Box className="sq-panel">
          <header className="sq-head">
            <div>
              <h3>Stack</h3>
              <span className="sq-rule sq-violet">LIFO · last in, first out</span>
            </div>
            <Badges ops={['push', 'pop', 'peek']} />
          </header>
          <div className="sq-stack-wrap">
            <Removed op={op} target="stack" />
            <div className="sq-stack" ref={stackScope} style={{ '--cap': CAP } as CSSProperties}>
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
                      transition={SPRING.stiff}
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
        </Box>

        <Box className="sq-panel">
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
                    transition={SPRING.snappy}
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
        </Box>
      </div>
    </StageFrame>
  );
}

/** Caption for a refused operation. Underflow is a removal from an empty stack; peeking just finds nothing. */
function refusal(target: Target, kind: OpKind, outcome: 'full' | 'empty' | 'ok') {
  if (outcome === 'full') {
    return (
      <>
        <span className="hl bad">{target === 'stack' ? 'Stack overflow!' : 'Queue full!'}</span> This one has room for {CAP}.
        Real ones grow, but memory isn't infinite.
      </>
    );
  }
  if (kind === 'peek') {
    return (
      <>
        <span className="hl bad">{target === 'stack' ? 'The stack is empty.' : 'The queue is empty.'}</span> There's
        nothing to peek at.
      </>
    );
  }
  return (
    <>
      <span className="hl bad">{target === 'stack' ? 'Stack underflow!' : 'Queue is empty!'}</span> Nothing to {kind}.
      Real code must check for this.
    </>
  );
}

/** Caption for an operation that went through. */
function done(target: Target, kind: OpKind, item: Item) {
  if (kind === 'peek') {
    return (
      <>
        <span className="hl">peek</span> → <b>{item.label}</b>. Looked, didn't remove. O(1).
      </>
    );
  }
  if (kind === 'push') return <><span className="hl ok">push</span> {item.label} onto the <b>top</b>. O(1).</>;
  if (kind === 'enqueue') return <><span className="hl ok">enqueue</span> {item.label} at the <b>back</b>. O(1).</>;
  return target === 'stack' ? (
    <>
      <span className="hl bad">pop</span> {item.label} off the <b>top</b>: the newest thing leaves first.
    </>
  ) : (
    <>
      <span className="hl bad">dequeue</span> {item.label} from the <b>front</b>: the oldest thing leaves first.
    </>
  );
}

function itemState(op: Op | null, target: Target, it: Item) {
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
function Removed({ op, target }: { op: Op | null; target: Target }) {
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
