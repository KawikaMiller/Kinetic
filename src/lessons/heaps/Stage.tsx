import { AnimatePresence, motion } from 'motion/react';
import { useState, type CSSProperties } from 'react';
import { Tray } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Button, Controls, Hint, Legend, Stat, Stats } from '../../components/ui';
import { SPRING } from '../../core/motion';
import { randInt, shuffle } from '../../core/random';
import { usePlayer } from '../../core/usePlayer';
import { extractFrames, heapifyFrames, idle, insertFrames, OUT_SHOWN, type HeapFrame, type OutItem } from './frames';
import { MAX, parent, type HItem } from './model';
import './styles.css';

const START = [2, 5, 3, 8, 9, 6, 4, 12, 10];
/** Inserted and heapified priorities are drawn from 1..MAX_PRIORITY. */
const MAX_PRIORITY = 30;
/** Heapify builds an array of this many random items. */
const HEAPIFY_SIZE = { min: 9, max: 13 };
/** Ids for items created after the starting set, clear of the START ids. */
const FIRST_NEW_ID = 100;

interface Run {
  items: HItem[];
  out: OutItem[];
  frames: HeapFrame[];
  nextId: number;
}

const initial = (): Run => {
  const items = START.map((v, i) => ({ id: i + 1, v }));
  return {
    items,
    out: [],
    nextId: FIRST_NEW_ID,
    frames: idle(items, [], <>A <b>min-heap</b>: every parent is ≤ its children, so the smallest item is always at the root. Same data, drawn two ways.</>),
  };
};

export function Stage() {
  const [run, setRun] = useState<Run>(initial);
  const player = usePlayer(run.frames, { interval: 900 });
  const f = player.frame;

  const insert = () => {
    const item = { id: run.nextId, v: randInt(1, MAX_PRIORITY) };
    const res = insertFrames(run.items, run.out, item);
    setRun({ ...run, items: res.items, frames: res.frames, nextId: run.nextId + 1 });
  };
  const extract = () => {
    const res = extractFrames(run.items, run.out);
    setRun({ ...run, items: res.items, out: res.out, frames: res.frames });
  };
  const heapify = () => {
    const n = randInt(HEAPIFY_SIZE.min, HEAPIFY_SIZE.max);
    const vals = shuffle(Array.from({ length: MAX_PRIORITY }, (_, i) => i + 1)).slice(0, n);
    const raw = vals.map((v, i) => ({ id: run.nextId + i, v }));
    const res = heapifyFrames(raw);
    setRun({ items: res.items, out: [], frames: res.frames, nextId: run.nextId + n });
  };

  const full = run.items.length >= MAX;
  const empty = run.items.length === 0;

  return (
    <StageFrame minWidth={810}
      player={player}
      height={470}
      stats={
        <Stats>
          <Stat label="Size" value={f.items.length} sub={`max ${MAX} here`} />
          <RootStat items={f.items} />
          <Stat label="Comparisons" value={f.comparisons} color="var(--hi)" />
          <Stat label="Swaps" value={f.swaps} color="var(--violet)" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'comparing' },
            { color: 'var(--violet)', label: 'just swapped' },
            { color: 'var(--info)', label: 'new / moved in' },
            { color: 'var(--ok)', label: 'settled / min' },
          ]}
        />
      }
      controls={
        <Controls>
          <Button variant="primary" onClick={insert} disabled={full}>
            Insert random task
          </Button>
          <Button onClick={extract} disabled={empty}>
            Extract min
          </Button>
          <Button onClick={heapify}>Heapify a random array</Button>
          <Button onClick={() => setRun(initial())}>Reset</Button>
          <Hint block>
            Toy sizes: at most {MAX} items (four full levels), priorities 1 to {MAX_PRIORITY}, and the run order keeps the latest{' '}
            {OUT_SHOWN}. Equal priorities can come out in either order: a heap isn't stable.
          </Hint>
        </Controls>
      }
    >
      <div className="hp">
        <ArrayRow frame={f} />
        <div className="hp-body">
          <TreeView frame={f} />
          <Tray className="hp-out" label="Run order (extracted)" labelWeight="regular">
            <AnimatePresence initial={false}>
              {f.out.map((it) => (
                <motion.div key={it.id} className="hp-out-item" layout initial={{ opacity: 0, x: -30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}>
                  <span>#{it.run}</span> priority <b>{it.v}</b>
                </motion.div>
              ))}
            </AnimatePresence>
            {f.out.length === 0 && <p className="hp-out-empty">Extract to run the most urgent task.</p>}
          </Tray>
        </div>
      </div>
    </StageFrame>
  );
}

/** The root is the minimum only once heap order holds above it; mid-sift it can be the item still sinking. */
function RootStat({ items }: { items: HItem[] }) {
  const root = items[0];
  const isMin = !root || items.every((it) => it.v >= root.v);
  return (
    <Stat
      label="Min (root)"
      value={root?.v ?? '—'}
      color={isMin ? 'var(--ok)' : 'var(--info)'}
      sub={isMin ? undefined : 'not the min yet'}
    />
  );
}

function toneOf(frame: HeapFrame, i: number) {
  if (frame.swap && frame.swap.includes(i)) return 'swap';
  if (frame.hi.includes(i)) return 'hi';
  if (frame.fresh === i) return 'fresh';
  if (frame.ok.includes(i)) return 'ok';
  return '';
}

function ArrayRow({ frame }: { frame: HeapFrame }) {
  const parentLink = frame.hi.length === 2 && frame.hi[1] === parent(frame.hi[0]) ? frame.hi : null;
  return (
    <div className="hp-arr">
      <div className="hp-arr-head">
        <span>array</span>
        <AnimatePresence mode="wait">
          {frame.formula && (
            <motion.span key={String(frame.comparisons)} className="hp-formula" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              {frame.formula}
            </motion.span>
          )}
        </AnimatePresence>
      </div>
      <div className="hp-slots" style={{ '--slots': MAX } as CSSProperties}>
        {Array.from({ length: MAX }, (_, i) => (
          <div key={i} className={`hp-slot ${i < frame.items.length ? '' : 'empty'} ${parentLink?.includes(i) ? 'linked' : ''} ${i === MAX - 1 ? 'last' : ''}`}>
            <span>{i}</span>
          </div>
        ))}
        {frame.items.map((it, i) => (
          <motion.div
            key={it.id}
            className={`hp-cell ${toneOf(frame, i)}`}
            style={{ width: `${100 / MAX}%` }}
            initial={{ left: `${(i / MAX) * 100}%`, opacity: 0, y: -12 }}
            animate={{ left: `${(i / MAX) * 100}%`, opacity: 1, y: 0 }}
            transition={SPRING.snappy}
          >
            <b>{it.v}</b>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

const TW = 760;
const TH = 250;
function nodePos(i: number) {
  const depth = Math.floor(Math.log2(i + 1));
  const first = 2 ** depth - 1;
  const k = i - first;
  const count = 2 ** depth;
  return { x: ((k + 0.5) / count) * TW, y: 26 + depth * 68 };
}

function TreeView({ frame }: { frame: HeapFrame }) {
  const n = frame.items.length;
  return (
    <svg className="hp-tree" viewBox={`0 0 ${TW} ${TH}`} preserveAspectRatio="xMidYMid meet">
      {Array.from({ length: n }, (_, i) => {
        if (i === 0) return null;
        const a = nodePos(parent(i));
        const b = nodePos(i);
        const hot = frame.hi.includes(i) && frame.hi.includes(parent(i));
        return (
          <g key={`e${i}`}>
            <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} className={`hp-edge ${hot ? 'hot' : ''}`} />
            <text x={(a.x + b.x) / 2 + (b.x < a.x ? -10 : 10)} y={(a.y + b.y) / 2} textAnchor="middle" className="hp-edge-label">
              {i % 2 ? '2i+1' : '2i+2'}
            </text>
          </g>
        );
      })}
      {frame.items.map((it, i) => {
        const p = nodePos(i);
        return (
          <motion.g key={it.id} className={`hp-node ${toneOf(frame, i)}`} initial={{ x: p.x, y: p.y, opacity: 0 }} animate={{ x: p.x, y: p.y, opacity: 1 }} transition={SPRING.snappy}>
            <circle r={19} />
            <text y={5} textAnchor="middle" className="hp-node-v">
              {it.v}
            </text>
            <text y={33} textAnchor="middle" className="hp-node-i">
              [{i}]
            </text>
          </motion.g>
        );
      })}
    </svg>
  );
}
