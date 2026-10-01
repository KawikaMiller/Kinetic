import type { ReactNode } from 'react';
import type { Frame } from '../../core/types';
import { applyOp, type Op, type OpKind, type Target, type World } from './model';

export interface SqFrame extends Frame, World {
  op: Op | null;
}

type Step =
  | { do: 'push' | 'enqueue'; label: string; say: ReactNode }
  | { do: 'pop' | 'dequeue' | 'peek-stack' | 'peek-queue' | 'none'; say: ReactNode; hold?: number };

/** The guided story: a browser Back button (stack), then a printer (queue). */
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

/** Which structure and operation each scripted step performs. */
const STEP_OP: Record<Exclude<Step['do'], 'none'>, { target: Target; kind: OpKind }> = {
  push: { target: 'stack', kind: 'push' },
  pop: { target: 'stack', kind: 'pop' },
  'peek-stack': { target: 'stack', kind: 'peek' },
  enqueue: { target: 'queue', kind: 'enqueue' },
  dequeue: { target: 'queue', kind: 'dequeue' },
  'peek-queue': { target: 'queue', kind: 'peek' },
};

export function buildScenario(): SqFrame[] {
  let id = 1;
  let w: World = { stack: [], queue: [] };
  return SCRIPT.map((s) => {
    let op: Op | null = null;
    if (s.do !== 'none') {
      const { target, kind } = STEP_OP[s.do];
      const res = applyOp(w, target, kind, 'label' in s ? { id: id++, label: s.label } : undefined);
      w = res.world;
      op = { target, kind, item: res.item };
    }
    return { ...w, op, say: s.say, hold: 'hold' in s ? s.hold : undefined };
  });
}
