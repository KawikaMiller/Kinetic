import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import { StageFrame } from '../../components/StageFrame';
import { Button, Controls, Legend, Segmented, Stat, Stats } from '../../components/ui';
import { useArrowMarker } from '../../components/ArrowMarker';
import { useElementSize } from '../../core/hooks';
import { SPRING } from '../../core/motion';
import { freshInt, randInt } from '../../core/random';
import { usePlayer } from '../../core/usePlayer';
import { buildRun, intro, type AlFrame, type ArrView, type ListView } from './frames';
import { CAP, COST, SLOTS, arrAddr, listAddr, orderOf, type Model, type Op, type Where } from './model';
import './styles.css';

const START_VALUES = [12, 7, 33, 5, 21];
const START_SLOTS = [3, 11, 6, 14, 1];
/** Inserted values are drawn from 1..MAX_VALUE. */
const MAX_VALUE = 99;
/** Ids for items created after the starting set, clear of the starting ids. */
const FIRST_NEW_ID = 100;

function initialModel(): Model {
  return {
    arr: START_VALUES.map((v, i) => ({ id: i + 1, v })),
    nodes: START_VALUES.map((v, i) => ({ slot: START_SLOTS[i], id: i + 1, v, next: START_SLOTS[i + 1] ?? null })),
    head: START_SLOTS[0],
  };
}

interface Run {
  frames: AlFrame[];
  after: Model;
  nextId: number;
  op: Op | null;
  /** Where the last operation really happened (with 1-2 items "end" can be the front). */
  where: Where;
}

export function Stage() {
  const [where, setWhere] = useState<Where>('front');
  const [run, setRun] = useState<Run>(() => {
    const m = initialModel();
    return { frames: intro(m), after: m, nextId: FIRST_NEW_ID, op: null, where: 'front' };
  });
  const player = usePlayer(run.frames, { interval: 950 });
  const { arr, list } = player.frame;
  const len = run.after.arr.length;

  const doOp = (op: Op) => {
    const m = run.after;
    const taken = new Set(m.nodes.map((n) => n.slot));
    const res = buildRun(op, where, m, randInt(1, MAX_VALUE), run.nextId, freshInt(0, SLOTS - 1, taken) ?? 0);
    setRun({ frames: res.frames, after: res.after, nextId: run.nextId + 1, op, where: res.where });
  };

  const reset = () => {
    const m = initialModel();
    setRun({ frames: intro(m), after: m, nextId: FIRST_NEW_ID, op: null, where: 'front' });
  };

  const cost = run.op ? COST[run.op][run.where] : null;
  const full = len >= CAP;

  return (
    <StageFrame minWidth={480}
      player={player}
      height={430}
      stats={
        <Stats>
          <Stat label="Array steps" value={arr.steps} color="var(--violet)" sub={cost ? cost[0] : '—'} />
          <Stat label="List steps" value={list.steps} color="var(--info)" sub={cost ? cost[1] : '—'} />
          <Stat label="Items" value={len} sub={`array capacity ${CAP}`} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'working on it' },
            { color: 'var(--info)', label: 'new node' },
            { color: 'var(--ok)', label: 'written / found' },
            { color: 'var(--bad)', label: 'removed' },
            { color: 'var(--violet)', label: 'next pointer', shape: 'line' },
          ]}
        />
      }
      controls={
        <Controls>
          <Segmented
            label="Position"
            value={where}
            onChange={setWhere}
            options={[
              { value: 'front', label: 'Front' },
              { value: 'middle', label: 'Middle' },
              { value: 'end', label: 'End' },
            ]}
          />
          <Button variant="primary" onClick={() => doOp('access')} disabled={len === 0}>
            Access
          </Button>
          <Button onClick={() => doOp('insert')} disabled={full} title={full ? 'Array is at capacity' : undefined}>
            Insert
          </Button>
          <Button onClick={() => doOp('delete')} disabled={len === 0}>
            Delete
          </Button>
          <Button onClick={reset}>Reset</Button>
          {full && <span className="al-hint">Array is full (capacity {CAP}). A real dynamic array would copy itself into one twice as big.</span>}
        </Controls>
      }
    >
      <div className="al">
        <ArrayStrip view={arr} />
        <ListStrip view={list} />
      </div>
    </StageFrame>
  );
}

function ArrayStrip({ view }: { view: ArrView }) {
  const items = view.slots.flatMap((it, slot) => (it ? [{ ...it, slot }] : []));
  return (
    <section className="al-panel">
      <header className="al-head">
        <span className="al-title al-title-arr">Array</span>
        <span className="al-sub">one contiguous block · base 0x100 · 4 bytes per item</span>
        <AnimatePresence mode="wait">
          {view.formula && (
            <motion.span key={String(view.steps)} className="al-formula" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              {view.formula}
            </motion.span>
          )}
        </AnimatePresence>
      </header>
      <div className="al-arr" style={{ gridTemplateColumns: `repeat(${CAP}, 1fr)` }}>
        {Array.from({ length: CAP }, (_, i) => (
          <div key={i} className={`al-aslot ${i === view.hi ? 'is-hi' : ''} ${i === CAP - 1 ? 'last' : ''}`}>
            <span className="al-idx">[{i}]</span>
            <span className="al-addr">{arrAddr(i)}</span>
          </div>
        ))}
        <div className="al-items">
          <AnimatePresence>
            {items.map((it) => {
              const cls = it.slot === view.bad ? 'is-bad' : it.slot === view.ok ? 'is-ok' : it.slot === view.hi ? 'is-hi' : '';
              return (
                <motion.div
                  key={it.id}
                  className={`al-item ${cls}`}
                  style={{ width: `${100 / CAP}%` }}
                  initial={{ opacity: 0, scale: 0.4, left: `${(it.slot / CAP) * 100}%` }}
                  animate={{ opacity: 1, scale: 1, left: `${(it.slot / CAP) * 100}%` }}
                  exit={{ opacity: 0, scale: 0.4, y: 20 }}
                  transition={SPRING.snappy}
                >
                  <span>{it.v}</span>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}

const ARC_H = 104;
/** Room above the tallest arc for the "head" label. */
const ARC_HEADROOM = 22;
/** Lowest an arc may be; longer jumps rise higher than this. */
const ARC_MIN_LIFT = 16;
/** Extra height per hop (cycling through 3), so arcs of similar length don't sit on top of each other. */
const ARC_STAGGER = 9;

function ListStrip({ view }: { view: ListView }) {
  const [ref, size] = useElementSize<HTMLDivElement>();
  const arrow = useArrowMarker('var(--violet)');
  const hotArrow = useArrowMarker('var(--hi)');
  const cw = size.width / SLOTS;
  const bySlot = new Map(view.nodes.map((n) => [n.slot, n]));
  const edges = view.nodes.filter((n) => n.next != null && bySlot.has(n.next)).map((n) => [n.slot, n.next!] as [number, number]);
  const hop = new Map(orderOf(view.nodes, view.head).map((n, i) => [n.slot, i]));

  const arc = (a: number, b: number) => {
    const x1 = (a + 0.5) * cw;
    const x2 = (b + 0.5) * cw;
    // taller arcs for longer jumps, and staggered by hop, so overlapping pointers fan out instead of stacking
    const span = ARC_H - ARC_HEADROOM;
    const byLength = Math.min(span - 2 * ARC_STAGGER, ARC_MIN_LIFT + (Math.abs(b - a) / SLOTS) * span * 1.3);
    const lift = byLength + ((hop.get(a) ?? 0) % 3) * ARC_STAGGER;
    return `M ${x1} ${ARC_H} C ${x1} ${ARC_H - lift}, ${x2} ${ARC_H - lift}, ${x2} ${ARC_H - 2}`;
  };

  return (
    <section className="al-panel">
      <header className="al-head">
        <span className="al-title al-title-lst">Linked list</span>
        <span className="al-sub">nodes live wherever memory was free · each stores a pointer to the next</span>
      </header>
      <div className="al-lwrap" ref={ref}>
        <svg className="al-arcs" width={size.width} height={ARC_H} aria-hidden="true">
          {arrow.def}
          {hotArrow.def}
          {cw > 0 &&
            edges.map(([a, b]) => {
              const hot = view.hot && view.hot[0] === a && view.hot[1] === b;
              return (
                <motion.path
                  key={`${a}-${b}`}
                  className={`al-edge ${hot ? 'is-hot' : ''}`}
                  initial={{ opacity: 0, d: arc(a, b) }}
                  animate={{ opacity: 1, d: arc(a, b) }}
                  transition={{ duration: 0.3 }}
                  markerEnd={hot ? hotArrow.url : arrow.url}
                />
              );
            })}
          {cw > 0 && view.head != null && (
            <motion.g initial={false} animate={{ x: (view.head + 0.5) * cw }} transition={SPRING.snappy}>
              <text x={0} y={12} textAnchor="middle" className="al-headlabel">
                head
              </text>
              <line x1={0} y1={16} x2={0} y2={ARC_H - 4} className="al-headline" />
            </motion.g>
          )}
        </svg>
        <div className="al-mem" style={{ gridTemplateColumns: `repeat(${SLOTS}, 1fr)` }}>
          {Array.from({ length: SLOTS }, (_, s) => {
            const n = bySlot.get(s);
            const cls = !n
              ? ''
              : s === view.bad
                ? 'is-bad'
                : s === view.fresh
                  ? 'is-fresh'
                  : s === view.cur
                    ? 'is-hi'
                    : '';
            return (
              <div key={s} className="al-mslot">
                <AnimatePresence>
                  {n && (
                    <motion.div
                      key={n.id}
                      className={`al-node ${cls}`}
                      initial={{ opacity: 0, scale: 0.4 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.3, y: 16 }}
                      transition={SPRING.snappy}
                    >
                      <b>{n.v}</b>
                      <span className="al-next">{n.next == null ? '→ null' : `→ ${listAddr(n.next).slice(2)}`}</span>
                    </motion.div>
                  )}
                </AnimatePresence>
                <span className="al-addr">{listAddr(s)}</span>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
