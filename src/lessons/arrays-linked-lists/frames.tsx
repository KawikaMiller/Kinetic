import type { ReactNode } from 'react';
import { plural } from '../../core/format';
import type { Frame } from '../../core/types';
import {
  arrAddr, COST, listAddr, runOp, toSlots,
  type ArrFormula, type ArrNote, type ArrState, type ListNote, type ListState, type Model, type Op, type Where,
} from './model';

export interface ArrView extends Omit<ArrState, 'formula' | 'note'> {
  formula: ReactNode;
  done: boolean;
}
export interface ListView extends Omit<ListState, 'note'> {
  done: boolean;
}
export interface AlFrame extends Frame {
  arr: ArrView;
  list: ListView;
}

const VERDICT: Record<Op, Record<Where, string>> = {
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

function formulaText(f: ArrFormula): ReactNode {
  if (!f) return null;
  return f.k === 'address' ? (
    <>
      0x100 + {f.p} × 4 = <b>{arrAddr(f.p)}</b>
    </>
  ) : (
    <>write at {arrAddr(f.p)}</>
  );
}

function arrCaption(n: ArrNote | null): ReactNode {
  if (!n) return '';
  switch (n.k) {
    case 'access':
      return <>One multiplication and it lands on slot {n.p}: <span className="hl ok">{n.v}</span>.</>;
    case 'shift-right':
      return <>Shift {n.v} right to make room ({n.moved} moved so far).</>;
    case 'write':
      return n.atEnd ? <>End of the array: write straight into the next free slot.</> : <>Write <span className="hl ok">{n.v}</span> into the gap at [{n.p}].</>;
    case 'remove':
      return <>Remove <span className="hl bad">{n.v}</span> from slot {n.p}…</>;
    case 'was-last':
      return <>It was the last one. Nothing to shift.</>;
    case 'shift-left':
      return <>…then shift {n.v} left to close the gap.</>;
  }
}

function listCaption(n: ListNote | null): ReactNode {
  if (!n) return '';
  switch (n.k) {
    case 'start':
      return <>Start at <b>head</b> ({listAddr(n.slot)}).</>;
    case 'hop':
      return <>Follow the next pointer to {listAddr(n.slot)} (hop {n.hop}).</>;
    case 'reached':
      return <>Reached <span className="hl ok">{n.v}</span> after {plural(n.steps, 'step')}. No shortcut: it has to walk.</>;
    case 'alloc':
      return <>Allocate a node wherever memory is free: {listAddr(n.slot)}.</>;
    case 'point-at-head':
      return <>Point the new node at the old head.</>;
    case 'move-head':
      return <>Move <b>head</b> to the new node. Nothing else moved.</>;
    case 'point-at-rest':
      return <>New node points at the rest of the list.</>;
    case 'linked':
      return <>Predecessor now points at the new node. Linked in.</>;
    case 'target-is-head':
      return <>The target is the head node.</>;
    case 'skip-head':
      return <>Move <b>head</b> past it.</>;
    case 'skip':
      return <>Skip over it: the predecessor now points past <span className="hl bad">{n.v}</span>.</>;
    case 'free':
      return <>Free the old node. No shifting.</>;
  }
}

const arrView = ({ formula, note: _note, ...rest }: ArrState, done: boolean): ArrView => ({ ...rest, formula: formulaText(formula), done });
const listView = ({ note: _note, ...rest }: ListState, done: boolean): ListView => ({ ...rest, done });

export function intro(m: Model): AlFrame[] {
  return [
    {
      arr: { slots: toSlots(m.arr), hi: null, ok: null, bad: null, formula: null, steps: 0, done: true },
      list: { nodes: m.nodes, head: m.head, cur: null, fresh: null, hot: null, bad: null, steps: 0, done: true },
      say: (
        <>
          Same values, two layouts. Pick a position, then <b>Access</b>, <b>Insert</b> or <b>Delete</b> and watch both do the work.
        </>
      ),
    },
  ];
}

/** Frames for one operation on both structures, side by side, plus the model afterwards. */
export function buildRun(op: Op, where: Where, m: Model, v: number, id: number, free: number) {
  const run = runOp(op, where, m, v, id, free);
  const a = run.arr.states;
  const l = run.list.states;
  const n = Math.max(a.length, l.length);
  const what = op === 'insert' ? <>Insert <span className="hl info">{v}</span> at the {where}</> : <>{LABEL[op]} the {where} item</>;

  const frames: AlFrame[] = [
    {
      arr: { slots: toSlots(m.arr), hi: null, ok: null, bad: null, formula: null, steps: 0, done: false },
      list: { nodes: m.nodes, head: m.head, cur: null, fresh: null, hot: null, bad: null, steps: 0, done: false },
      say: <>{what} of both. Same job, very different amounts of work.</>,
    },
  ];
  for (let k = 0; k < n; k++) {
    const av = a[Math.min(k, a.length - 1)];
    const lv = l[Math.min(k, l.length - 1)];
    frames.push({
      arr: arrView(av, k >= a.length - 1),
      list: listView(lv, k >= l.length - 1),
      say: (
        <>
          <span className="al-tag al-tag-arr">Array</span> {k < a.length ? arrCaption(av.note) : <span className="muted">done ✓</span>}
          <br />
          <span className="al-tag al-tag-lst">List</span> {k < l.length ? listCaption(lv.note) : <span className="muted">done ✓</span>}
        </>
      ),
    });
  }
  const last = frames[frames.length - 1];
  const [ac, lc] = COST[op][run.where];
  const as = run.arr.steps;
  const ls = run.list.steps;
  last.hold = 2.5;
  last.say = (
    <>
      Array: <span className={`hl ${as <= ls ? 'ok' : 'bad'}`}>{plural(as, 'step')} · {ac}</span>{' '}
      List: <span className={`hl ${ls <= as ? 'ok' : 'bad'}`}>{plural(ls, 'step')} · {lc}</span>
      <br />
      {m.arr.length === 1 && op === 'delete'
        ? 'With one item, front, middle and end are the same item: the array forgets it and the list moves head.'
        : VERDICT[op][run.where]}
    </>
  );

  return { frames, after: run.after, where: run.where };
}
