import { describe, expect, it } from 'vitest';
import { captionText as text } from '../../core/testing/captions';
import { ruleText } from './clocks';
import { compareCaption, drawCaption, registerCaption } from './captions';
import { DEFAULT_PRESET, MAX_EVENTS, PRESETS, PROCESSES, SLOTS, pairView, viewOf } from './execution';
import lesson from './index';
import { BROKEN_SEED, NO_PRUNE_SEED, runRegister } from './register';

const nameIndex = (v: ReturnType<typeof viewOf>, name: string) => v.stamps.findIndex((_, i) => v.name(i) === name);

describe('try-this entries, from the default state, as written', () => {
  it('try-this 1: in the default drawing a happened before e; e on P3 is stamped by the receive rules with hand-worked numbers', () => {
    expect(DEFAULT_PRESET.id).toBe('chain');
    const v = viewOf(DEFAULT_PRESET.model());
    const a = nameIndex(v, 'a');
    const e = nameIndex(v, 'e');
    expect(v.hb[a][e]).toBe(true);
    expect([v.stamps[e].lamport, v.stamps[e].vector]).toEqual([4, [1, 2, 2]]);
    const rule = ruleText(v.stamps[e], PROCESSES[v.stamps[e].lane]);
    expect(rule.lamport).toBe('L ← max(L, message) + 1 = max(1, 3) + 1 = 4');
    expect(rule.vector).toBe('V ← max(V, message) = max([0,0,1], [1,2,0]) = [1,2,1], then V[P3] ← V[P3] + 1 = [1,2,2]');
    expect(lesson.tryThis[0]).toContain(rule.lamport);
    expect(lesson.tryThis[0]).toContain(rule.vector);
    expect(text(drawCaption(v, e, 2))).toContain(`Event e on P3 is a receive. Lamport: ${rule.lamport}.`);
  });

  it('try-this 2: the default drawing has a misleading pair (f, e): L(f) = 2 < L(e) = 4 although they are concurrent, and the vectors say concurrent', () => {
    const v = viewOf(DEFAULT_PRESET.model());
    expect(v.misleading.length).toBeGreaterThan(0);
    const f = nameIndex(v, 'f');
    const e = nameIndex(v, 'e');
    expect(v.misleading.some((p) => p.a === f && p.b === e)).toBe(true);
    const p = pairView(v, f, e);
    expect(p).toMatchObject({ truth: 'concurrent', lamport: 'before', vector: 'concurrent', lamportMisleads: true, vectorWrong: false });
    const c = text(compareCaption(v, f, e, p));
    expect(c).toContain('Truth: f and e are concurrent');
    expect(c).toContain('which the events do not have');
  });

  it('try-this 3: "two concurrent writes" stamps both writes 1, with vectors [1,0,0] and [0,1,0], and calls them concurrent', () => {
    const preset = PRESETS.find((p) => p.id === 'concurrent')!;
    const v = viewOf(preset.model());
    const [a, b] = [nameIndex(v, 'a'), nameIndex(v, 'b')];
    expect([v.stamps[a].lamport, v.stamps[b].lamport]).toEqual([1, 1]);
    expect([v.stamps[a].vector, v.stamps[b].vector]).toEqual([[1, 0, 0], [0, 1, 0]]);
    expect(pairView(v, a, b).vector).toBe('concurrent');
    expect(lesson.tryThis[2]).toContain('[1,0,0] and [0,1,0]');
  });

  it('try-this 4: Lamport last-write-wins on the default seed loses a write and reports it, and there is a first violation to jump to', () => {
    const run = runRegister({ seed: BROKEN_SEED, mode: 'lww', resolve: 'merge' });
    const first = run.frames.findIndex((f) => f.violation !== null);
    expect(first).toBeGreaterThanOrEqual(0);
    expect(run.frames[first].violation).toMatch(/discarded write a although no surviving write came after it/);
    const last = run.frames.at(-1)!;
    expect(last.lost.length).toBeGreaterThan(0);
    const c = text(registerCaption({ mode: 'lww', seed: BROKEN_SEED, frame: last, widest: 1 }), { strict: true });
    expect(c).toContain('Silently lost so far');
  });

  it('try-this 5: siblings keep both writes and end on the resolution with a 3-entry vector (resolver outside the writers); never pruning breaks the second invariant', () => {
    const hand = { places: { a: 'r1', b: 'r2', resolver: 'r3' }, fixedLatencyMs: 20, seed: 0 } as const;
    const sib = runRegister({ ...hand, mode: 'siblings', resolve: 'merge' });
    expect(sib.frames.every((f) => f.violation === null)).toBe(true);
    expect(sib.widest).toBe(3);
    const noPrune = runRegister({ seed: NO_PRUNE_SEED, mode: 'no-prune', resolve: 'merge' });
    expect(noPrune.frames.find((f) => f.violation)?.violation).toMatch(/an ancestor of/);
  });
});

describe('captions are computed from the model', () => {
  it('the draw caption counts the concurrent pairs it prints, for every preset', () => {
    for (const p of PRESETS) {
      const v = viewOf(p.model());
      const n = v.stamps.length;
      let concurrent = 0;
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (!v.hb[i][j] && !v.hb[j][i]) concurrent++;
      const c = text(drawCaption(v, null, p.model().links.length), { strict: true });
      expect(c, p.id).toContain(`${concurrent} of the ${(n * (n - 1)) / 2} pairs are concurrent`);
    }
  });

  it('the compare caption names the truth, and says a Lamport order is "not there" exactly for concurrent pairs, for every pair of every preset', () => {
    for (const p of PRESETS) {
      const v = viewOf(p.model());
      for (let a = 0; a < v.stamps.length; a++) {
        for (let b = 0; b < v.stamps.length; b++) {
          if (a === b) continue;
          const pv = pairView(v, a, b);
          const c = text(compareCaption(v, a, b, pv), { strict: true });
          expect(c.includes('which the events do not have'), `${p.id} ${a} ${b}`).toBe(pv.truth === 'concurrent');
          expect(pv.vectorWrong).toBe(false);
        }
      }
    }
  });

  it('every preset fits the editor limits', () => {
    for (const p of PRESETS) {
      const m = p.model();
      expect(m.items.length).toBeLessThanOrEqual(MAX_EVENTS);
      expect(m.items.every((i) => i.start >= 0 && i.end < SLOTS && i.lane < PROCESSES.length)).toBe(true);
    }
  });
});

describe('lesson content', () => {
  it('has five try-this entries and five questions', () => {
    expect(lesson.tryThis).toHaveLength(5);
    expect(lesson.quiz).toHaveLength(5);
  });
});
