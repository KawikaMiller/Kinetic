import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import { StageFrame } from '../../components/StageFrame';
import { Button, Controls, Legend, Segmented, Stat, Stats } from '../../components/ui';
import { randInt, useElementSize } from '../../core/hooks';
import { usePlayer } from '../../core/usePlayer';
import {
  CAP, COST, SLOTS, arrAddr, buildRun, intro, listAddr,
  type AlFrame, type ArrView, type ListView, type Model, type Op, type Where,
} from './model';
import './styles.css';

const START_VALUES = [12, 7, 33, 5, 21];
const START_SLOTS = [3, 11, 6, 14, 1];

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
}

export function Stage() {
  const [where, setWhere] = useState<Where>('front');
  const [run, setRun] = useState<Run>(() => {
    const m = initialModel();
    return { frames: intro(m), after: m, nextId: 100, op: null };
  });
  const player = usePlayer(run.frames, { interval: 950 });
  const { arr, list } = player.frame;
  const len = run.after.arr.length;

  const doOp = (op: Op) => {
    const m = run.after;
    const taken = new Set(m.nodes.map((n) => n.slot));
    const free = Array.from({ length: SLOTS }, (_, i) => i).filter((s) => !taken.has(s));
    const res = buildRun(op, where, m, randInt(1, 99), run.nextId, free[randInt(0, free.length - 1)] ?? 0);
    setRun({ frames: res.frames, after: res.after, nextId: run.nextId + 1, op });
  };

  const reset = () => {
    const m = initialModel();
    setRun({ frames: intro(m), after: m, nextId: 100, op: null });
  };

  const cost = run.op ? COST[run.op][where] : null;
  const full = len >= CAP;

  return (
    <StageFrame
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

const spring = { type: 'spring', stiffness: 260, damping: 26 } as const;

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
          <div key={i} className={`al-aslot ${i === view.hi ? 'is-hi' : ''}`}>
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
                  transition={spring}
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

function ListStrip({ view }: { view: ListView }) {
  const [ref, size] = useElementSize<HTMLDivElement>();
  const cw = size.width / SLOTS;
  const bySlot = new Map(view.nodes.map((n) => [n.slot, n]));
  const edges = view.nodes.filter((n) => n.next != null && bySlot.has(n.next)).map((n) => [n.slot, n.next!] as [number, number]);

  const arc = (a: number, b: number) => {
    const x1 = (a + 0.5) * cw;
    const x2 = (b + 0.5) * cw;
    // taller arcs for longer jumps, so overlapping pointers fan out instead of stacking
    const lift = Math.min(ARC_H - 22, 16 + (Math.abs(b - a) / SLOTS) * (ARC_H - 22) * 1.3);
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
          <defs>
            <marker id="al-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" fill="var(--violet)" />
            </marker>
            <marker id="al-arrow-hot" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" fill="var(--hi)" />
            </marker>
          </defs>
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
                  markerEnd={hot ? 'url(#al-arrow-hot)' : 'url(#al-arrow)'}
                />
              );
            })}
          {cw > 0 && view.head != null && (
            <motion.g initial={false} animate={{ x: (view.head + 0.5) * cw }} transition={spring}>
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
                      transition={spring}
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
