import type { ReactNode } from 'react';
import { plural } from '../../core/format';
import type { Frame } from '../../core/types';

export const CAP = 10; // array capacity
export const SLOTS = 16; // memory slots available to the linked list

export type Where = 'front' | 'middle' | 'end';
export type Op = 'access' | 'insert' | 'delete';

export interface Item {
  id: number;
  v: number;
}
export interface LNode {
  slot: number;
  id: number;
  v: number;
  next: number | null; // slot of the next node
}
export interface Model {
  arr: Item[];
  nodes: LNode[];
  head: number | null;
}

export interface ArrView {
  slots: (Item | null)[];
  hi: number | null;
  ok: number | null;
  bad: number | null;
  formula: ReactNode;
  steps: number;
  done: boolean;
  note: ReactNode;
}
export interface ListView {
  nodes: LNode[];
  head: number | null;
  cur: number | null;
  fresh: number | null;
  hot: [number, number] | null;
  bad: number | null;
  steps: number;
  done: boolean;
  note: ReactNode;
}
export interface AlFrame extends Frame {
  arr: ArrView;
  list: ListView;
}

export const hex = (n: number) => '0x' + n.toString(16).toUpperCase();
export const arrAddr = (i: number) => hex(0x100 + i * 4);
export const listAddr = (s: number) => hex(0x200 + s * 16);

/** Big-O for each op, [array, linked list] (singly linked, head pointer only). */
export const COST: Record<Op, Record<Where, [string, string]>> = {
  access: { front: ['O(1)', 'O(1)'], middle: ['O(1)', 'O(n)'], end: ['O(1)', 'O(n)'] },
  insert: { front: ['O(n)', 'O(1)'], middle: ['O(n)', 'O(n)'], end: ['O(1)', 'O(n)'] },
  delete: { front: ['O(n)', 'O(1)'], middle: ['O(n)', 'O(n)'], end: ['O(1)', 'O(n)'] },
};

const VERDICT: Record<Op, Record<Where, ReactNode>> = {
  access: {
    front: 'Both are instant at the front.',
    middle: 'The array did arithmetic; the list had to walk. That is O(1) vs O(n).',
    end: 'The array did arithmetic; the list walked the whole chain. That is O(1) vs O(n).',
  },
  insert: {
    front: 'The array shifted every element; the list rewired two pointers. O(n) vs O(1).',
    middle: 'Both pay O(n): the array to shift, the list to walk. The list\'s actual insert is O(1) once it gets there.',
    end: 'The array just writes the next slot. The list has no tail pointer, so it walks to the end. (A tail pointer would make it O(1).)',
  },
  delete: {
    front: 'The array closed the gap by shifting everything left; the list just moved head. O(n) vs O(1).',
    middle: 'Both pay O(n): the array to shift, the list to walk to the predecessor.',
    end: 'The array just forgets the last slot. The list must walk to the node before the tail.',
  },
};

const LABEL: Record<Op, string> = { access: 'Access', insert: 'Insert', delete: 'Delete' };

export function orderOf(nodes: LNode[], head: number | null) {
  const bySlot = new Map(nodes.map((n) => [n.slot, n]));
  const out: LNode[] = [];
  let s = head;
  while (s != null) {
    const n = bySlot.get(s);
    if (!n) break;
    out.push(n);
    s = n.next;
  }
  return out;
}

const toSlots = (arr: Item[]): (Item | null)[] => Array.from({ length: CAP }, (_, i) => arr[i] ?? null);

export function position(op: Op, where: Where, len: number) {
  if (op === 'insert') return where === 'front' ? 0 : where === 'end' ? len : Math.floor(len / 2);
  return where === 'front' ? 0 : where === 'end' ? len - 1 : Math.floor((len - 1) / 2);
}

function runArray(op: Op, p: number, arr: Item[], v: number, id: number) {
  const states: ArrView[] = [];
  const slots = toSlots(arr);
  let steps = 0;
  const push = (s: Partial<ArrView>) =>
    states.push({ slots: slots.slice(), hi: null, ok: null, bad: null, formula: null, steps, done: false, note: '', ...s });
  const len = arr.length;

  if (op === 'access') {
    steps = 1;
    push({
      hi: p,
      formula: (
        <>
          0x100 + {p} × 4 = <b>{arrAddr(p)}</b>
        </>
      ),
      note: (
        <>
          One multiplication and it lands on slot {p}: <span className="hl ok">{arr[p].v}</span>.
        </>
      ),
    });
  } else if (op === 'insert') {
    for (let j = len - 1; j >= p; j--) {
      slots[j + 1] = slots[j];
      slots[j] = null;
      steps++;
      push({ hi: j + 1, note: <>Shift {slots[j + 1]!.v} right to make room ({steps} moved so far).</> });
    }
    slots[p] = { id, v };
    steps++;
    push({
      ok: p,
      formula: <>write at {arrAddr(p)}</>,
      note: p === len ? <>End of the array: write straight into the next free slot.</> : <>Write <span className="hl ok">{v}</span> into the gap at [{p}].</>,
    });
  } else {
    steps++;
    push({ bad: p, note: <>Remove <span className="hl bad">{arr[p].v}</span> from slot {p}…</> });
    slots[p] = null;
    if (p === len - 1) {
      push({ note: <>It was the last one. Nothing to shift.</> });
    }
    for (let j = p + 1; j < len; j++) {
      slots[j - 1] = slots[j];
      slots[j] = null;
      steps++;
      push({ hi: j - 1, note: <>…then shift {slots[j - 1]!.v} left to close the gap.</> });
    }
  }
  states[states.length - 1].done = true;
  return { states, after: slots.filter((s): s is Item => s !== null) };
}

function runList(op: Op, p: number, nodes0: LNode[], head0: number | null, v: number, id: number, free: number) {
  const states: ListView[] = [];
  let nodes = nodes0.map((n) => ({ ...n }));
  let head = head0;
  let steps = 0;
  const find = (s: number) => nodes.find((n) => n.slot === s)!;
  const push = (s: Partial<ListView>) =>
    states.push({ nodes: nodes.map((n) => ({ ...n })), head, cur: null, fresh: null, hot: null, bad: null, steps, done: false, note: '', ...s });
  const order = orderOf(nodes, head);
  const walk = (upTo: number, extra: Partial<ListView> = {}) => {
    for (let k = 0; k <= upTo; k++) {
      steps++;
      push({
        ...extra,
        cur: order[k].slot,
        note: k === 0 ? <>Start at <b>head</b> ({listAddr(order[0].slot)}).</> : <>Follow the next pointer to {listAddr(order[k].slot)} (hop {k}).</>,
      });
    }
  };

  if (op === 'access') {
    walk(p);
    states[states.length - 1].note = (
      <>
        Reached <span className="hl ok">{order[p].v}</span> after {plural(p + 1, 'step')}. No shortcut: it has to walk.
      </>
    );
  } else if (op === 'insert') {
    steps++;
    nodes.push({ slot: free, id, v, next: null });
    push({ fresh: free, note: <>Allocate a node wherever memory is free: {listAddr(free)}.</> });
    if (p === 0) {
      find(free).next = head;
      steps++;
      push({ fresh: free, hot: head != null ? [free, head] : null, note: <>Point the new node at the old head.</> });
      head = free;
      steps++;
      push({ fresh: free, note: <>Move <b>head</b> to the new node. Nothing else moved.</> });
    } else {
      walk(p - 1, { fresh: free });
      const pred = find(order[p - 1].slot);
      find(free).next = pred.next;
      steps++;
      push({ cur: pred.slot, fresh: free, hot: pred.next != null ? [free, pred.next] : null, note: <>New node points at the rest of the list.</> });
      pred.next = free;
      steps++;
      push({ cur: pred.slot, fresh: free, hot: [pred.slot, free], note: <>Predecessor now points at the new node. Linked in.</> });
    }
  } else {
    const target = order[p];
    if (p === 0) {
      steps++;
      push({ bad: target.slot, note: <>The target is the head node.</> });
      head = target.next;
      steps++;
      push({ bad: target.slot, note: <>Move <b>head</b> past it.</> });
    } else {
      walk(p - 1);
      const pred = find(order[p - 1].slot);
      pred.next = target.next;
      steps++;
      push({
        cur: pred.slot,
        bad: target.slot,
        hot: target.next != null ? [pred.slot, target.next] : null,
        note: <>Skip over it: the predecessor now points past <span className="hl bad">{target.v}</span>.</>,
      });
    }
    nodes = nodes.filter((n) => n.slot !== target.slot);
    push({ note: <>Free the old node. No shifting.</> });
  }
  states[states.length - 1].done = true;
  return { states, nodes, head };
}

export function intro(m: Model): AlFrame[] {
  return [
    {
      arr: { slots: toSlots(m.arr), hi: null, ok: null, bad: null, formula: null, steps: 0, done: true, note: '' },
      list: { nodes: m.nodes, head: m.head, cur: null, fresh: null, hot: null, bad: null, steps: 0, done: true, note: '' },
      say: (
        <>
          Same values, two layouts. Pick a position, then <b>Access</b>, <b>Insert</b> or <b>Delete</b> and watch both do the work.
        </>
      ),
    },
  ];
}

export function buildRun(op: Op, where: Where, m: Model, v: number, id: number, free: number) {
  const len = m.arr.length;
  const p = position(op, where, len);
  const a = runArray(op, p, m.arr, v, id);
  const l = runList(op, p, m.nodes, m.head, v, id, free);
  const n = Math.max(a.states.length, l.states.length);
  const what = op === 'insert' ? <>Insert <span className="hl info">{v}</span> at the {where}</> : <>{LABEL[op]} the {where} item</>;

  const frames: AlFrame[] = [
    {
      arr: { ...a.states[0], slots: toSlots(m.arr), hi: null, ok: null, bad: null, formula: null, steps: 0, done: false, note: '' },
      list: { nodes: m.nodes, head: m.head, cur: null, fresh: null, hot: null, bad: null, steps: 0, done: false, note: '' },
      say: <>{what} of both. Same job, very different amounts of work.</>,
    },
  ];
  for (let k = 0; k < n; k++) {
    const av = a.states[Math.min(k, a.states.length - 1)];
    const lv = l.states[Math.min(k, l.states.length - 1)];
    const ad = k >= a.states.length - 1;
    const ld = k >= l.states.length - 1;
    frames.push({
      arr: { ...av, done: ad },
      list: { ...lv, done: ld },
      say: (
        <>
          <span className="al-tag al-tag-arr">Array</span> {k < a.states.length ? av.note : <span className="muted">done ✓</span>}
          <br />
          <span className="al-tag al-tag-lst">List</span> {k < l.states.length ? lv.note : <span className="muted">done ✓</span>}
        </>
      ),
    });
  }
  const last = frames[frames.length - 1];
  const [ac, lc] = COST[op][where];
  last.hold = 2.5;
  const as = a.states[a.states.length - 1].steps;
  const ls = l.states[l.states.length - 1].steps;
  last.say = (
    <>
      Array: <span className={`hl ${as <= ls ? 'ok' : 'bad'}`}>{plural(as, 'step')} · {ac}</span>{' '}
      List: <span className={`hl ${ls <= as ? 'ok' : 'bad'}`}>{plural(ls, 'step')} · {lc}</span>
      <br />
      {VERDICT[op][where]}
    </>
  );

  return { frames, after: { arr: a.after, nodes: l.nodes, head: l.head } as Model };
}
