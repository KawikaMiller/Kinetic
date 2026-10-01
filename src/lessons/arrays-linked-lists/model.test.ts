import { describe, expect, it } from 'vitest';
import { freshInt, mulberry32, pick, randInt } from '../../core/random';
import { buildRun } from './frames';
import {
  arrAddr, CAP, effectiveWhere, listAddr, orderOf, position, runOp, SLOTS, type Model, type Op, type Where,
} from './model';

const WHERES: Where[] = ['front', 'middle', 'end'];

function startModel(): Model {
  const values = [12, 7, 33, 5, 21];
  const slots = [3, 11, 6, 14, 1];
  return {
    arr: values.map((v, i) => ({ id: i + 1, v })),
    nodes: values.map((v, i) => ({ slot: slots[i], id: i + 1, v, next: slots[i + 1] ?? null })),
    head: slots[0],
  };
}

const values = (m: Model) => m.arr.map((x) => x.v);
const listValues = (m: Model) => orderOf(m.nodes, m.head).map((n) => n.v);

describe('array and linked list operations', () => {
  it('both structures end up holding exactly what a reference JS array holds, over 3,000 random ops', () => {
    const rnd = mulberry32(31);
    let m = startModel();
    const ref = values(m);
    let id = 100;
    for (let k = 0; k < 3000; k++) {
      const len = ref.length;
      const ops: Op[] = [];
      if (len > 0) ops.push('access', 'delete');
      if (len < CAP) ops.push('insert');
      const op = pick(ops, rnd);
      const where = pick(WHERES, rnd);
      const v = randInt(1, 99, rnd);
      const free = freshInt(0, SLOTS - 1, new Set(m.nodes.map((n) => n.slot)), rnd) ?? 0;
      const p = position(op, where, len);
      const run = runOp(op, where, m, v, id++, free);
      if (op === 'insert') ref.splice(p, 0, v);
      if (op === 'delete') ref.splice(p, 1);
      if (op === 'access') expect(run.arr.states.at(-1)!.note).toEqual({ k: 'access', p, v: ref[p] });
      m = run.after;
      expect(values(m)).toEqual(ref);
      expect(listValues(m)).toEqual(ref);
      // every list node is reachable, and no two share a memory slot
      expect(orderOf(m.nodes, m.head)).toHaveLength(m.nodes.length);
      expect(new Set(m.nodes.map((n) => n.slot)).size).toBe(m.nodes.length);
    }
  });

  it('counts the work each structure really does', () => {
    for (let len = 1; len <= CAP - 1; len++) {
      const m: Model = {
        arr: Array.from({ length: len }, (_, i) => ({ id: i, v: i })),
        nodes: Array.from({ length: len }, (_, i) => ({ slot: i, id: i, v: i, next: i + 1 < len ? i + 1 : null })),
        head: 0,
      };
      for (const where of WHERES) {
        for (const op of ['access', 'insert', 'delete'] as Op[]) {
          const p = position(op, where, len);
          const run = runOp(op, where, m, 50, 99, SLOTS - 1);
          if (op === 'access') {
            expect(run.arr.steps).toBe(1); // one address calculation
            expect(run.list.steps).toBe(p + 1); // walk from head
          } else if (op === 'insert') {
            expect(run.arr.steps).toBe(len - p + 1); // shift the tail right, then write
            expect(run.list.steps).toBe(p === 0 ? 3 : 1 + p + 2); // allocate, walk to the predecessor, two pointer writes
          } else {
            expect(run.arr.steps).toBe(1 + (len - 1 - p)); // remove, then shift the tail left
            expect(run.list.steps).toBe(p === 0 ? 2 : p + 1); // move head, or walk to the predecessor and relink
          }
        }
      }
    }
  });
});

describe('position and effectiveWhere', () => {
  it('picks front, middle and end indexes, and reports where the work really happened', () => {
    expect(position('insert', 'end', 5)).toBe(5);
    expect(position('delete', 'end', 5)).toBe(4);
    expect(position('access', 'middle', 5)).toBe(2);
    // one item: every position is the front
    for (const where of WHERES) expect(effectiveWhere('delete', position('delete', where, 1), 1)).toBe('front');
    expect(effectiveWhere('insert', position('insert', 'end', 1), 1)).toBe('end');
    expect(effectiveWhere('insert', position('insert', 'middle', 1), 1)).toBe('front');
    expect(effectiveWhere('delete', position('delete', 'end', 2), 2)).toBe('end');
  });

  it('a one-item delete no longer talks about "the node before the tail"', () => {
    const m: Model = { arr: [{ id: 1, v: 7 }], nodes: [{ slot: 4, id: 1, v: 7, next: null }], head: 4 };
    const { frames, where } = buildRun('delete', 'end', m, 0, 2, 0);
    expect(where).toBe('front');
    expect(JSON.stringify(frames.at(-1)!.say)).not.toContain('before the tail');
  });
});

describe('addresses', () => {
  it('computes base + index × size', () => {
    expect(arrAddr(0)).toBe('0x100');
    expect(arrAddr(3)).toBe('0x10C');
    expect(listAddr(0)).toBe('0x200');
    expect(listAddr(15)).toBe('0x2F0');
  });
});
