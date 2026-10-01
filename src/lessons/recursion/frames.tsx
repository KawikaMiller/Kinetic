import type { ReactNode } from 'react';
import type { Frame } from '../../core/types';
import { fibCallTree, LIMIT, type FNode } from './model';

export type Tone = 'active' | 'waiting' | 'base' | 'returning' | 'crash';
export interface SFrame {
  id: number;
  label: string;
  note: ReactNode;
  tone: Tone;
}
export interface StackFrame extends Frame {
  stack: SFrame[];
  line: number | null;
  ret: { value: number; key: number } | null;
  crashed: boolean;
  calls: number;
  maxDepth: number;
  result: number | null;
}

interface LinearSpec {
  label: (d: number) => string;
  isBase: (d: number) => boolean;
  baseValue: number;
  combine: (d: number, sub: number) => { value: number; expr: string };
}

function linear(spec: LinearSpec, withBase: boolean, intro: ReactNode): StackFrame[] {
  const frames: StackFrame[] = [];
  const stack: SFrame[] = [];
  let calls = 0;
  let maxDepth = 0;
  let id = 0;
  const snap = (line: number | null, say: ReactNode, extra: Partial<StackFrame> = {}) =>
    frames.push({ stack: stack.map((f) => ({ ...f })), line, ret: null, crashed: false, calls, maxDepth, result: null, say, ...extra });

  snap(null, intro);

  let d = 0;
  for (;;) {
    calls++;
    stack.forEach((f) => {
      if (f.tone === 'active') f.tone = 'waiting';
    });
    const label = spec.label(d);
    stack.push({ id: id++, label, note: '', tone: 'active' });
    maxDepth = Math.max(maxDepth, stack.length);
    const top = stack[stack.length - 1];

    if (withBase && spec.isBase(d)) {
      top.tone = 'base';
      top.note = <>base case → returns {spec.baseValue}</>;
      snap(2, (
        <>
          <span className="hl ok">{label}</span> hits the <b>base case</b>: it returns {spec.baseValue} without calling itself. Now the stack unwinds.
        </>
      ));
      break;
    }
    if (!withBase && stack.length >= LIMIT) {
      stack.forEach((f) => {
        f.tone = 'crash';
      });
      snap(3, (
        <>
          💥 <span className="hl bad">Stack overflow</span>. With no base case nothing ever returns, so frames pile up until the runtime gives up:{' '}
          <code>RangeError: Maximum call stack size exceeded</code>.
        </>
      ), { crashed: true, hold: 3 });
      return frames;
    }
    top.note = <>waiting on {spec.label(d + 1)}…</>;
    snap(3, (
      <>
        <span className="hl">{label}</span>
        {withBase ? ' is not the base case, so it' : ' has no base case to stop it, so it'} calls <b>{spec.label(d + 1)}</b> and waits. New frame on the stack.
      </>
    ), { hold: 0.8 });
    d++;
  }

  // Unwind: each frame gets its answer from the one above it.
  let value = spec.baseValue;
  for (let k = d - 1; k >= 0; k--) {
    const popped = stack.pop()!;
    const caller = stack[stack.length - 1];
    const sub = value;
    const { value: v, expr } = spec.combine(k, sub);
    value = v;
    caller.tone = 'returning';
    caller.note = (
      <>
        got {sub} → {expr} = <b>{v}</b>
      </>
    );
    snap(3, (
      <>
        {popped.label} is done and pops off. Its return value <span className="hl info">{sub}</span> flows down to {caller.label}, which computes {expr} ={' '}
        <b>{v}</b>.
      </>
    ), { ret: { value: sub, key: popped.id } });
  }
  const last = stack.pop()!;
  snap(null, (
    <>
      <span className="hl ok">{last.label} = {value}</span>. {calls} calls, and the stack peaked at {maxDepth} frames: recursion depth costs memory.
    </>
  ), { result: value, ret: { value, key: last.id }, hold: 2 });
  return frames;
}

export function factorialFrames(n: number, withBase: boolean) {
  return linear(
    {
      label: (d) => `factorial(${n - d})`,
      isBase: (d) => n - d <= 1,
      baseValue: 1,
      combine: (d, sub) => ({ value: (n - d) * sub, expr: `${n - d} × ${sub}` }),
    },
    withBase,
    <>
      <b>factorial({n})</b> = {n} × factorial({n - 1}): a problem defined in terms of a smaller copy of itself. Press play and watch the call stack.
    </>,
  );
}

export function sumFrames(list: number[], withBase: boolean) {
  const show = (d: number) => `sum([${list.slice(d).join(',')}])`;
  return linear(
    {
      label: show,
      isBase: (d) => d >= list.length,
      baseValue: 0,
      combine: (d, sub) => ({ value: list[d] + sub, expr: `${list[d]} + ${sub}` }),
    },
    withBase,
    <>
      <b>sum</b> of a list = first item + sum of the rest. The empty list is the base case: its sum is 0.
    </>,
  );
}

// ── Fibonacci tree ─────────────────────────────────────────────────

export type NodeState = 'unseen' | 'active' | 'waiting' | 'done';
export interface TreeFrame extends Frame {
  states: NodeState[];
  values: (number | null)[];
  calls: number;
  repeats: number;
  current: number | null;
  counts: Record<number, number>;
}

/** What happens when fib(node.n) returns `v` to its caller. */
function returnCaption(node: FNode, v: number, nodes: FNode[], values: (number | null)[]): ReactNode {
  if (node.parent == null) return <><span className="hl ok">fib({node.n})</span> returns {v}.</>;
  const p = nodes[node.parent].n;
  if (node.n === p - 1) {
    return (
      <>
        <span className="hl ok">fib({node.n})</span> returns {v} to fib({p}), which still needs fib({p - 2}).
      </>
    );
  }
  const first = nodes.find((m) => m.parent === node.parent && m.n === p - 1);
  const a = first ? values[first.id] : null;
  return (
    <>
      <span className="hl ok">fib({node.n})</span> returns {v}, so fib({p}) = {a} + {v} = <b>{(a ?? 0) + v}</b>.
    </>
  );
}

export function fibTree(n0: number) {
  const { nodes, events, leaves } = fibCallTree(n0);
  const frames: TreeFrame[] = [];
  const states: NodeState[] = nodes.map(() => 'unseen');
  const values: (number | null)[] = nodes.map(() => null);
  const counts: Record<number, number> = {};
  let calls = 0;
  let repeats = 0;
  frames.push({
    states: states.slice(), values: values.slice(), calls, repeats, current: null, counts: {},
    say: (
      <>
        <b>fib({n0})</b> = fib({n0 - 1}) + fib({n0 - 2}). Each call makes <i>two</i> more calls, so the calls form a tree. Watch for repeats.
      </>
    ),
  });
  for (const e of events) {
    const node = nodes[e.id];
    if (e.t === 'call') {
      calls++;
      counts[node.n] = (counts[node.n] ?? 0) + 1;
      if (node.repeat) repeats++;
      states.forEach((s, i) => {
        if (s === 'active') states[i] = 'waiting';
      });
      states[e.id] = 'active';
      frames.push({
        states: states.slice(), values: values.slice(), calls, repeats, current: e.id, counts: { ...counts },
        say: node.repeat ? (
          <>
            Call <span className="hl bad">fib({node.n})</span> again. We already worked this out, but plain recursion forgets and recomputes it.
          </>
        ) : node.n <= 1 ? (
          <>
            <span className="hl ok">fib({node.n})</span> is a base case: it returns {node.n} straight away.
          </>
        ) : (
          <>
            Call <span className="hl">fib({node.n})</span>. It needs fib({node.n - 1}) and fib({node.n - 2}) first.
          </>
        ),
      });
    } else {
      states[e.id] = 'done';
      values[e.id] = e.v;
      if (node.parent != null) states[node.parent] = 'active';
      frames.push({
        states: states.slice(), values: values.slice(), calls, repeats, current: node.parent, counts: { ...counts },
        say: returnCaption(node, e.v, nodes, values),
      });
    }
  }
  const last = frames[frames.length - 1];
  last.hold = 2.5;
  last.say = (
    <>
      fib({n0}) = <span className="hl ok">{values[0]}</span> after <b>{calls} calls</b>, and <span className="hl bad">{repeats}</span> of them were repeats. Calls
      grow roughly 1.6× per extra n: exponential. Remembering answers (dynamic programming) fixes it.
    </>
  );
  return { nodes, frames, leaves };
}
