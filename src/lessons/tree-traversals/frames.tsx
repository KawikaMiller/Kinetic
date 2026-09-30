import type { ReactNode } from 'react';
import { createRecorder } from '../../core/recorder';
import type { Frame } from '../../core/types';
import { evaluateRpn, isOperator, reference, traversalEvents, type BTree, type Order } from './model';
import type { PresetId } from './presets';

export interface TtFrame extends Frame {
  current: number | null;
  emitted: number[];
  /** Depth-first call stack, bottom (root) first. */
  stack: number[];
  /** Level-order queue, front first. */
  queue: number[];
  /** The post-order output being evaluated as RPN, after the walk (expression tree only). */
  rpn: { token: string; stack: number[] } | null;
}

export const ORDER_NAMES: Record<Order, string> = { pre: 'Pre-order', in: 'In-order', post: 'Post-order', level: 'Level order' };

const RULES: Record<Order, string> = {
  pre: 'write each node down as soon as you arrive, then do its children',
  in: 'go all the way left, write the node, then go right',
  post: 'do both children first and write the node last',
  level: 'take nodes off the front of a queue, row by row, and put their children at the back',
};

function emitCaption(order: Order, label: string): ReactNode {
  if (order === 'pre') return <>Arrived at {label}: pre-order writes it down straight away, before its children.</>;
  if (order === 'in') return <>{label}'s left side is finished: write <b>{label}</b>, then go right.</>;
  if (order === 'post') return <>Both of {label}'s children are finished: write <b>{label}</b> last.</>;
  return <>{label} comes off the front of the queue: write it, then queue its children.</>;
}

/** What the finished output means, per preset and order. */
function verdict(preset: PresetId | 'custom', order: Order, out: string[]): ReactNode {
  const text = out.join(' ');
  if (preset === 'expression') {
    if (order === 'pre') return <><span className="hl ok">{text}</span> is Polish (prefix) notation: operator first, no brackets needed.</>;
    if (order === 'in') return <><span className="hl">{text}</span> reads as 3 + 8 = 11. In-order drops the brackets: infix needs (3 + 4) × 2 to mean 14.</>;
  }
  if (order === 'in' && preset === 'bst') return <><span className="hl ok">{text}</span>: sorted, because in a search tree left &lt; node &lt; right.</>;
  if (order === 'in') return <><span className="hl">{text}</span> is <b>not</b> sorted: in-order only gives sorted output on a binary search tree.</>;
  return <>{ORDER_NAMES[order]} output: <span className="hl ok">{text}</span>.</>;
}

export function traversalFrames(tree: BTree, order: Order, preset: PresetId | 'custom'): TtFrame[] {
  const label = (id: number) => tree.nodes[id].label;
  const parentOf = (id: number) => Object.keys(tree.nodes).map(Number).find((p) => tree.nodes[p].left === id || tree.nodes[p].right === id);
  const rec = createRecorder<TtFrame>({ current: null, emitted: [], stack: [], queue: [], rpn: null });
  const now = rec.get;

  rec.snap(<>{ORDER_NAMES[order]}: {RULES[order]}. Press play.</>);
  for (const e of traversalEvents(tree, order)) {
    const n = e.node;
    if (e.kind === 'call') rec.snap(<>visit({label(n)}) goes on the call stack.</>, undefined, { current: n, stack: [...now().stack, n] });
    else if (e.kind === 'emit') rec.snap(emitCaption(order, label(n)), undefined, { current: n, emitted: [...now().emitted, n] });
    else if (e.kind === 'return') {
      const stack = now().stack.slice(0, -1);
      const parent = parentOf(n);
      rec.snap(
        parent === undefined ? <>{label(n)} was the root: its call returns and the walk is over.</> : <>{label(n)} is done: its call pops and control returns to {label(parent)}.</>,
        undefined,
        { current: stack[stack.length - 1] ?? null, stack },
      );
    } else if (e.kind === 'enqueue') rec.snap(<>{label(n)} joins the back of the queue.</>, undefined, { queue: [...now().queue, n] });
    else rec.set({ current: n, queue: now().queue.slice(1) }); // dequeue: shown by the emit frame that follows
  }

  const out = reference(tree, order);
  rec.snap(verdict(preset, order, out), 2, { current: null });

  if (preset === 'expression' && order === 'post') {
    for (const step of evaluateRpn(out).steps) {
      const say = isOperator(step.token)
        ? <>{step.token}: pop two numbers, apply it, push <b>{step.stack[step.stack.length - 1]}</b>.</>
        : <>{step.token}: a number, push it.</>;
      rec.snap(say, undefined, { rpn: step });
    }
    rec.snap(
      <>
        = <span className="hl ok">{now().rpn?.stack[0]}</span>. Post-order is Reverse Polish Notation: no brackets, and a
        single stack evaluates it left to right.
      </>,
      2,
    );
  }
  return rec.frames;
}
