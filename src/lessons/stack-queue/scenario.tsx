import type { ReactNode } from 'react';
import type { Frame } from '../../core/types';

export interface Item {
  id: number;
  label: string;
}

export type OpKind = 'push' | 'pop' | 'peek' | 'enqueue' | 'dequeue';
export type Target = 'stack' | 'queue';

export interface Op {
  target: Target;
  kind: OpKind;
  item?: Item;
}

export interface World {
  stack: Item[]; // index 0 = bottom
  queue: Item[]; // index 0 = front
}

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

export function buildScenario(): SqFrame[] {
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
