import { describe, expect, it } from 'vitest';
import { captionText as text } from '../../core/testing/captions';
import { correctStrictlyLongest } from '../../core/testing/quiz';
import { ruleText } from './clocks';
import { compareCaption, drawCaption, registerCaption } from './captions';
import { addItem, moveItem, removeItem, selectItem } from '../../core/laneEditor';
import { DEFAULT_PRESET, MAX_EVENTS, isSelectionOnly, PRESETS, PROCESSES, SLOTS, pairView, viewOf } from './execution';
import lesson from './index';
import { vectorBetween } from './clocks';
import { BROKEN_SEED, DEFAULT_REGISTER, NO_PRUNE_SEED, REG_MODES, canHoldStale, registerCluster, runRegister, visibleTrace, widestVector, type RegMode } from './register';

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

  it('try-this 5: from the scene default (seed 0, merge), siblings keep both writes and the largest vector has as many entries as replicas that coordinated; a third replica resolving gives 3; never pruning breaks the second invariant', () => {
    const sib = runRegister({ ...DEFAULT_REGISTER, mode: 'siblings' });
    expect(sib.frames.every((f) => f.violation === null)).toBe(true);
    // Independent count: the replicas that received a put or the resolve at the default seed (every one of them created a version with its own entry).
    const c = registerCluster({ ...DEFAULT_REGISTER, mode: 'siblings' });
    c.run();
    const resolver = c.trace.find((r) => r.kind === 'deliver' && (r.payload as { type?: string } | undefined)?.type === 'resolve')!.to!;
    const puts = c.trace.filter((r) => r.kind === 'deliver' && (r.payload as { type?: string } | undefined)?.type === 'put').map((r) => r.to!);
    expect(sib.widest).toBe(new Set([...puts, resolver]).size);
    expect(widestVector({ ...DEFAULT_REGISTER, mode: 'siblings' })).toBe(sib.widest);
    expect(lesson.tryThis[4]).toContain(`has ${sib.widest} entries on this seed`);
    expect(lesson.tryThis[4]).toContain('gives 3');
    const third = runRegister({ places: { a: 'r1', b: 'r2', resolver: 'r3' }, fixedLatencyMs: 20, seed: 0, mode: 'siblings', resolve: 'merge' });
    expect(third.widest).toBe(3);
    const noPrune = runRegister({ seed: NO_PRUNE_SEED, mode: 'no-prune', resolve: 'merge' });
    expect(noPrune.frames.find((f) => f.violation)?.violation).toMatch(/an ancestor of/);
  });
});

describe('the compare scene is read-only', () => {
  it('only a change of selection passes; adding, moving, removing or linking an event does not', () => {
    const model = DEFAULT_PRESET.model();
    expect(isSelectionOnly(model, selectItem(model, model.items[0].id))).toBe(true);
    const added = addItem(model, 1, 12, { name: 'z' });
    if (!added.ok) throw new Error(added.reason);
    expect(isSelectionOnly(model, added.model)).toBe(false);
    const removed = removeItem(model, model.items[0].id);
    if (!removed.ok) throw new Error(removed.reason);
    expect(isSelectionOnly(model, removed.model)).toBe(false);
    const moved = moveItem(model, model.items[0].id, 0, 1);
    if (!moved.ok) throw new Error(moved.reason);
    expect(isSelectionOnly(model, moved.model)).toBe(false);
  });
});

describe('the register scene draws only what can happen in each mode', () => {
  const dominated = (frames: ReturnType<typeof runRegister>['frames']) =>
    frames.some((f) => Object.values(f.replicas).some((vs) => vs.some((u) => vs.some((v) => v.id !== u.id && Object.entries(u.vv).every(([k, n]) => (v.vv[k] ?? 0) >= n)))));
  it('a kept-but-stale version occurs in no-prune and never in lww or siblings, over 200 seeds each (so the legend lists it only there)', () => {
    for (const mode of REG_MODES) {
      const seen = Array.from({ length: 200 }, (_, seed) => dominated(runRegister({ seed, mode, resolve: 'merge' }).frames)).some(Boolean);
      expect(seen, mode).toBe(canHoldStale(mode));
    }
  });
  it('last-write-wins draws no resolve arrow, because the resolution does nothing there; the other modes keep it', () => {
    const c = (mode: RegMode) => { const k = registerCluster({ ...DEFAULT_REGISTER, mode }); k.run(); return visibleTrace(k.trace, mode).map((r) => (r.payload as { type?: string } | undefined)?.type); };
    expect(c('lww')).not.toContain('resolve');
    expect(c('siblings')).toContain('resolve');
  });
});

describe('quiz question 2: "larger in some components and equal in the rest" never means concurrent', () => {
  it('over random vector pairs, a vector that is at least the other everywhere and larger somewhere is after it, never concurrent', () => {
    let state = 12345;
    const next = () => (state = (state * 1103515245 + 12345) % 2147483648) / 2147483648;
    for (let i = 0; i < 2000; i++) {
      const x = [0, 1, 2].map(() => Math.floor(next() * 4));
      const y = x.map((n) => n + Math.floor(next() * 3));
      const strictlyMore = y.some((n, k) => n > x[k]);
      if (strictlyMore) expect(vectorBetween(y, x)).toBe('after');
    }
    expect(lesson.quiz[1].options.filter((o) => o.includes('larger in some components and equal in all the others'))).toHaveLength(1);
    expect(lesson.quiz[1].answer).toBe(0);
  });
});

describe('captions are computed from the model', () => {
  it('the compare caption says ties go by process exactly when the two Lamport stamps are equal', () => {
    for (const p of PRESETS) {
      const v = viewOf(p.model());
      for (let a = 0; a < v.stamps.length; a++) {
        for (let b = 0; b < v.stamps.length; b++) {
          if (a === b) continue;
          const c = text(compareCaption(v, a, b, pairView(v, a, b)), { strict: true });
          expect(c.includes('equal stamps, ties broken by process number'), `${p.id} ${a} ${b}`).toBe(v.stamps[a].lamport === v.stamps[b].lamport);
        }
      }
    }
  });

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
  it('the correct quiz option is the strictly longest in at most half of the questions', () => {
    expect(correctStrictlyLongest(lesson.quiz)).toBeLessThanOrEqual(Math.floor(lesson.quiz.length / 2));
  });
  it('has five try-this entries and five questions', () => {
    expect(lesson.tryThis).toHaveLength(5);
    expect(lesson.quiz).toHaveLength(5);
  });
});
