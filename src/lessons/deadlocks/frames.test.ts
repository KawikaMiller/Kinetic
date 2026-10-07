import { describe, expect, it } from 'vitest';
import { captionText } from '../../core/testing/captions';
import { RATE_SEEDS, buildFrames, deadlockCount } from './frames';
import { ALL_ON, CONDITION_KEYS, PRESETS, verdictOf, run, type Backoff, type Conditions, type PresetId, type RunOptions } from './model';

const IDS = Object.keys(PRESETS) as PresetId[];
/** All 16 on/off combinations of the four conditions. */
const COMBOS: Conditions[] = Array.from({ length: 16 }, (_, m) =>
  Object.fromEntries(CONDITION_KEYS.map((k, i) => [k, !(m & (1 << i))])) as unknown as Conditions,
);
const SCHEDULES: { schedule: RunOptions['schedule']; backoff: Backoff }[] = [
  { schedule: { kind: 'turns' }, backoff: 'fixed' },
  { schedule: { kind: 'turns' }, backoff: 'random' },
  ...Array.from({ length: 20 }, (_, seed) => ({ schedule: { kind: 'random' as const, seed }, backoff: 'random' as const })),
];

describe('captions over every preset × condition combination × schedule', () => {
  it('end on a caption that matches the run’s own verdict, and every frame has one', () => {
    for (const id of IDS)
      for (const conditions of COMBOS)
        for (const s of SCHEDULES) {
          const o = { conditions, ...s };
          const frames = buildFrames(id, o);
          expect(frames.every((f) => f.say !== undefined)).toBe(true);
          const verdict = verdictOf(run(PRESETS[id], o));
          const last = captionText(frames.at(-1)!.say);
          expect(last.startsWith('Deadlock.')).toBe(verdict === 'deadlock');
          expect(last.startsWith('Livelock.')).toBe(verdict === 'livelock');
          expect(last.startsWith(`All ${PRESETS[id].threads.length} finished.`)).toBe(verdict === 'finished');
          // A permanent deadlock needs all four conditions; breaking any one rules it out.
          if (verdict === 'deadlock') expect(conditions).toEqual(ALL_ON);
          // Livelock only comes from tryLock retrying in lockstep.
          if (verdict === 'livelock') expect(conditions.noPreemption).toBe(false);
          expect(verdict).not.toBe('timeout');

          const intro = captionText(frames[0].say);
          for (const k of CONDITION_KEYS) {
            const phrase = { mutualExclusion: 'mutual exclusion is off', holdAndWait: 'hold-and-wait is off', noPreemption: 'no-preemption is off', circularWait: 'circular wait is off' }[k];
            expect(intro.includes(phrase)).toBe(!conditions[k]);
          }
          expect(intro.includes('All four Coffman conditions hold')).toBe(CONDITION_KEYS.every((k) => conditions[k]));

          for (const f of frames) {
            const text = captionText(f.say);
            if (f.note.kind === 'block') expect(text.includes('cycle')).toBe(f.cycle !== null);
            if (f.note.kind === 'abort') expect(text).toContain(`aborts ${f.victim}, the transaction that began last`);
          }
        }
  });
});

describe('deadlockCount', () => {
  it('counts the random seeds that deadlock (or need an abort), and is 0 once a condition is broken', () => {
    for (const id of IDS) {
      const n = deadlockCount(id, ALL_ON);
      expect(n).toBeGreaterThan(0);
      expect(n).toBeLessThan(RATE_SEEDS);
      for (const k of CONDITION_KEYS) expect(deadlockCount(id, { ...ALL_ON, [k]: false })).toBe(0);
    }
  });
});
