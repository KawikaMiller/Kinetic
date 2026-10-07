import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../core/random';
import { captionText } from '../../core/testing/captions';
import { eventCaption } from './frames';
import { NEAR_WRAP, capacity, createRing, dequeue, enqueue, headSlot, size, tailSlot, type Policy, type Ring, type Strategy } from './model';

const STRATEGIES: Strategy[] = ['sentinel', 'count', 'masked'];
const POLICIES: Policy[] = ['block', 'drop', 'overwrite'];

describe('captions for every strategy × policy (9 combinations)', () => {
  it('state the model’s own slot, size, wrap and loss for every event of a seeded run', () => {
    for (const strategy of STRATEGIES)
      for (const policy of POLICIES)
        for (const start of strategy === 'masked' ? [0, NEAR_WRAP] : [0]) {
          const rnd = mulberry32(strategy.length * 7 + policy.length);
          let r: Ring = createRing(strategy, 8, start);
          let next = 1;
          for (let k = 0; k < 300; k++) {
            const before = r;
            const out = rnd() < 0.6 ? enqueue(r, next++, policy) : dequeue(r);
            r = out.ring;
            const e = out.event;
            const text = captionText(eventCaption(e, r, before));
            const used = `(${size(r)} of ${capacity(r)} used)`;
            if (e.kind === 'enqueued' || e.kind === 'dequeued') {
              expect(text).toContain(`${e.kind === 'enqueued' ? 'Enqueued' : 'Dequeued'} ${e.value} ${e.kind === 'enqueued' ? 'into' : 'from'} slot ${e.slot}`);
              expect(text).toContain(used);
              const moved = e.kind === 'enqueued' ? tailSlot(r) : headSlot(r);
              if (strategy === 'masked') {
                const which = e.kind === 'enqueued' ? 'tail' : 'head';
                expect(text).toContain(`${before[which]} → ${r[which]}`);
                expect(text.includes('wrapped past 2³²')).toBe(r[which] < before[which]);
                expect(text).toContain(`= ${moved}`);
              } else if (!(strategy === 'count' && e.kind === 'enqueued')) {
                expect(text.includes('wraps')).toBe(moved === 0);
                expect(text).toContain(`% 8 = ${moved}`);
              }
            }
            if (e.kind === 'blocked') expect(policy).toBe('block');
            if (e.kind === 'dropped') expect(text).toContain(`${e.value} is thrown away`);
            if (e.kind === 'overwrote') expect(text).toContain(`${e.lost} is lost`);
            if (e.kind === 'empty') expect(size(r)).toBe(0);
          }
        }
  });
});
