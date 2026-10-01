import { describe, expect, it } from 'vitest';
import { mulberry32, pick } from '../../core/random';
import { applyOp, type OpKind, type Target, type World } from './model';
import { buildScenario } from './scenario';

const empty = (): World => ({ stack: [], queue: [] });
const labels = (xs: { label: string }[]) => xs.map((x) => x.label);
const OPS: [Target, OpKind][] = [
  ['stack', 'push'], ['stack', 'pop'], ['stack', 'peek'],
  ['queue', 'enqueue'], ['queue', 'dequeue'], ['queue', 'peek'],
];

describe('applyOp', () => {
  it('behaves like a reference stack (push/pop at the end) and queue (push at end, shift at front) on 2,000 random ops', () => {
    const rnd = mulberry32(21);
    const CAP = 5;
    let w = empty();
    const refStack: string[] = [];
    const refQueue: string[] = [];
    for (let k = 0; k < 2000; k++) {
      const [target, kind] = pick(OPS, rnd);
      const ref = target === 'stack' ? refStack : refQueue;
      const item = { id: k, label: `x${k}` };
      const res = applyOp(w, target, kind, kind === 'push' || kind === 'enqueue' ? item : undefined, CAP);
      if (kind === 'push' || kind === 'enqueue') {
        if (ref.length >= CAP) expect(res.outcome).toBe('full');
        else {
          ref.push(item.label);
          expect(res.outcome).toBe('ok');
        }
      } else if (!ref.length) {
        expect(res.outcome).toBe('empty');
      } else {
        const expected = target === 'stack' ? ref[ref.length - 1] : ref[0];
        expect(res.item?.label).toBe(expected);
        if (kind === 'pop') ref.pop();
        if (kind === 'dequeue') ref.shift();
      }
      w = res.world;
      expect(labels(w.stack)).toEqual(refStack);
      expect(labels(w.queue)).toEqual(refQueue);
    }
  });

  it('is last-in-first-out for a stack and first-in-first-out for a queue', () => {
    let w = empty();
    for (const label of ['a', 'b', 'c']) {
      w = applyOp(w, 'stack', 'push', { id: w.stack.length, label }).world;
      w = applyOp(w, 'queue', 'enqueue', { id: 10 + w.queue.length, label }).world;
    }
    const popped: string[] = [];
    const dequeued: string[] = [];
    for (let i = 0; i < 3; i++) {
      const p = applyOp(w, 'stack', 'pop');
      popped.push(p.item!.label);
      const d = applyOp(p.world, 'queue', 'dequeue');
      dequeued.push(d.item!.label);
      w = d.world;
    }
    expect(popped).toEqual(['c', 'b', 'a']);
    expect(dequeued).toEqual(['a', 'b', 'c']);
  });

  it('peek returns the next item without changing anything, and never mutates its input', () => {
    const w = applyOp(applyOp(empty(), 'stack', 'push', { id: 1, label: 'a' }).world, 'stack', 'push', { id: 2, label: 'b' }).world;
    const snapshot = JSON.stringify(w);
    const peek = applyOp(w, 'stack', 'peek');
    expect(peek.item?.label).toBe('b');
    expect(peek.world).toBe(w);
    applyOp(w, 'stack', 'pop');
    expect(JSON.stringify(w)).toBe(snapshot);
  });

  it('refuses to add past the cap and to remove or peek an empty structure', () => {
    expect(applyOp(empty(), 'stack', 'pop').outcome).toBe('empty');
    expect(applyOp(empty(), 'queue', 'peek').outcome).toBe('empty');
    let w = empty();
    for (let i = 0; i < 3; i++) w = applyOp(w, 'stack', 'push', { id: i, label: `${i}` }, 3).world;
    expect(applyOp(w, 'stack', 'push', { id: 9, label: '9' }, 3).outcome).toBe('full');
  });
});

describe('the guided story', () => {
  it('ends with the browser history and printer queue the captions describe', () => {
    const frames = buildScenario();
    const last = frames[frames.length - 1];
    // visits google, docs, blog; back; news; back; back → only google left
    expect(labels(last.stack)).toEqual(['google']);
    // ann, bob, cat queued; ann prints; dan joins; bob prints → cat then dan
    expect(labels(last.queue)).toEqual(['cat.png', 'dan.txt']);
    const peeks = frames.filter((f) => f.op?.kind === 'peek').map((f) => f.op!.item!.label);
    expect(peeks).toEqual(['blog', 'bob.doc']);
    expect(frames.every((f) => f.say !== undefined)).toBe(true);
  });
});
