import { describe, expect, it } from 'vitest';
import { expectCaption } from '../../core/testing/captions';
import { forSeeds, type Safety, type TraceRow } from '../../core/distSim';
import { SEED_MAX } from '../../core/seed';
import { bugCaption, fifoCaption, offenceText, verdictWords } from './captions';
import { buildRun } from './frames';
import lesson from './index';
import { BROKEN_SEED, BROKEN_SEED_CLOSURE } from './pins';
import {
  DEFAULT_OPTIONS, NAMES, RATES, SEED_RANGE, SEEDS_TOTAL, TIME_MS, closureOf, runSeed, snapshotScenario, sweepSeeds, viewsOf, type Name, type Rate, type SimOptions, type SnapMsg,
} from './sim';
import { complete, conserved, initProc, onMarker, onToken, recordSelf, recordedTotals, searchSmall, withdraw, SENDS, TOTAL_TOKENS, type Proc } from './snapshot';

const procs = () => NAMES.map((n) => initProc(n, NAMES, 100));

const row = (kind: 'send' | 'deliver', msgId: number, from: string, to: string, amount: number, t: number): TraceRow<SnapMsg> =>
  ({ id: t, t, kind, from, to, msgId, payload: { type: 'token', amount } }) as TraceRow<SnapMsg>;

describe('hand-worked vectors (the spec\'s arithmetic, on the pure functions)', () => {
  it('vector 1, naive cut loses a token in flight: 70 + 100 + 100 = 270, the closure is fine, conservation catches it', () => {
    // A sends 30 to B at t = 1 (A = 70); A records at 2 (70); B records at 0.5, before receiving (100); C records 100.
    const trace = [row('send', 1, 'A', 'B', 30, 1), row('deliver', 1, 'A', 'B', 30, 3)];
    // Cuts: A has done 1 event (the send) inside; B has done 0 (recorded before the receive); C none.
    expect(closureOf(trace, [1, 0, 0]).closed).toBe(true);
    expect(70 + 100 + 100).toBe(270);
  });

  it('vector 2, naive cut double counts: 100 + 130 + 100 = 330 and the closure fails, naming the message', () => {
    // A records at 0.5, before sending (cut 0); B records at 2, after receiving (cut 1).
    const trace = [row('send', 1, 'A', 'B', 30, 1), row('deliver', 1, 'A', 'B', 30, 1.5)];
    const c = closureOf(trace, [0, 1, 0]);
    expect(c.closed).toBe(false);
    expect(c.offence).toMatchObject({ from: 'A', to: 'B', amount: 30, receiveAt: 1, sendAt: 1 });
    expect(offenceText(c.offence!)).toBe("30 tokens sent by A after A's cut, received by B before B's cut: B's record includes tokens A's record still holds");
    expect(100 + 130 + 100).toBe(330);
  });

  it('vector 3, markers on a FIFO channel: A = 70 records, B gets the token first (130) then the marker: 70 + 130 + 100 = 300', () => {
    let [a, b, c] = procs();
    a = withdraw(a, 30);
    a = recordSelf(a); // A records 70 and starts recording its incoming channels
    b = onToken(b, 'A', 30); // the token arrives before the marker: B has not recorded, so the channel is not recording
    const rb = onMarker(b, 'A'); // B records 130 and closes the channel from A, empty
    const rc = onMarker(c, 'A');
    b = rb.state;
    c = rc.state;
    expect([a.recorded, b.recorded, c.recorded]).toEqual([70, 130, 100]);
    expect(rb.recordedNow && rc.recordedNow).toBe(true);
    expect(b.channels.A).toEqual({ status: 'done', sum: 0 });
    // B and C send markers back; A, B and C receive them and every channel closes.
    a = onMarker(onMarker(a, 'B').state, 'C').state;
    b = onMarker(b, 'C').state;
    c = onMarker(c, 'B').state;
    expect(complete([a, b, c])).toBe(true);
    expect(recordedTotals([a, b, c])).toEqual({ states: 300, channels: 0, total: 300 });
  });

  it('vector 4, a marker overtakes the token: B records 100 and closes the channel; the token is recorded nowhere: 70 + 100 + 100 = 270', () => {
    let [a, b, c] = procs();
    a = withdraw(a, 30);
    a = recordSelf(a);
    const rb = onMarker(b, 'A');
    b = rb.state; // records 100, closes the channel from A empty
    b = onToken(b, 'A', 30); // the token arrives after: the channel is closed, so nothing records it
    c = onMarker(c, 'A').state;
    a = onMarker(onMarker(a, 'B').state, 'C').state;
    b = onMarker(b, 'C').state;
    c = onMarker(c, 'B').state;
    expect(complete([a, b, c])).toBe(true);
    expect(recordedTotals([a, b, c]).total).toBe(270);
    expect(conserved([a, b, c], 300)).toBe('conservation broken: the record sums to 270 of 300');
  });
});

describe('the exhaustive leg: 2 processes, 2 tokens each, per-channel FIFO or not', () => {
  it('FIFO conserves in all 64, 416 and 1,160 states at 1, 2 and 3 transfers each (the counts equal the spec author\'s independent scratch model)', () => {
    const counts = [SENDS.min, SENDS.min + 1, SENDS.max].map((s) => searchSmall(true, s));
    expect(counts.map((c) => c.states)).toEqual([64, 416, 1160]);
    for (const c of counts) expect(c).toMatchObject({ truncated: false, violation: null });
  });

  it('without FIFO the shortest counterexample is 4 steps at every transfer count, and the record sums to 3 of 4', () => {
    for (const s of [SENDS.min, SENDS.min + 1, SENDS.max]) {
      const r = searchSmall(false, s);
      expect(r.violation!.steps).toHaveLength(4);
      expect(r.violation!.message).toBe('conservation broken: the record sums to 3 of 4');
      const last = r.violation!.steps[3].state;
      const total = recordedTotals(last.nodes as Proc[]);
      expect(total.total).toBe(3);
    }
    expect(searchSmall(false, 2).violation!.steps.map((x) => x.actor)).toEqual(['A', 'B', 'B', 'A']);
  });

  it('the caption says what each search found', () => {
    const text = expectCaption(fifoCaption({ sends: 2, fifoStates: 416, counterexample: 4, failing: 130, seeds: 200 }));
    expect(text).toContain('416 states and conserved the total in all of them');
    expect(text).toContain('counterexample of 4 steps');
  });
});

describe('the seeded leg, three processes (sampled, not exhaustive)', () => {
  const RATE_KEYS = Object.keys(RATES) as Rate[];

  it('FIFO channels pass conservation and closure on 200 of 200 seeds at all three transfer rates', () => {
    for (const rate of RATE_KEYS) {
      const s = sweepSeeds({ ...DEFAULT_OPTIONS, rate });
      expect(s.failing, rate).toEqual([]);
    }
  });

  it('non-FIFO at the busy rate fails on 130 of 200 seeds (65%, inside the 45 to 75% band), both as shortfalls and as double counts', () => {
    const s = sweepSeeds({ ...DEFAULT_OPTIONS, fifo: false });
    expect(s.failing).toHaveLength(130);
    expect(s.failing.length / SEEDS_TOTAL).toBeGreaterThan(0.45);
    expect(s.failing.length / SEEDS_TOTAL).toBeLessThan(0.75);
    expect(s.shortfalls).toBe(70);
    expect(s.doubleCounts).toBe(60);
    expect(s.rule0).toHaveLength(130);
    expect(s.rule1).toHaveLength(33);
  });

  it('the pinned counterexamples: seed 1 fails conservation (rule 0), seed 11 is the lowest to fail closure (rule 1); neither is 0', () => {
    const s = sweepSeeds({ ...DEFAULT_OPTIONS, fifo: false });
    expect(s.lowestRule0).toBe(BROKEN_SEED);
    expect(s.lowestRule1).toBe(BROKEN_SEED_CLOSURE);
    expect(BROKEN_SEED).toBeGreaterThan(0);
    expect(runSeed({ ...DEFAULT_OPTIONS, fifo: false }, BROKEN_SEED).result).toMatchObject({ conservation: false, total: 293 });
    expect(runSeed({ ...DEFAULT_OPTIONS, fifo: false }, BROKEN_SEED_CLOSURE).result.closure.closed).toBe(false);
    // The same fixed mode passes the same seeds.
    expect(runSeed(DEFAULT_OPTIONS, BROKEN_SEED).result).toMatchObject({ conservation: true });
    expect(runSeed(DEFAULT_OPTIONS, BROKEN_SEED_CLOSURE).result.closure.closed).toBe(true);
  });

  it('forSeeds, asserting conservation after every event, finds the same lowest failing seed', () => {
    const conservation: Safety<ReturnType<typeof viewsOf>[number]> = (snap) => {
      const ps = NAMES.map((n) => snap.nodes[n].state!.proc);
      return conserved(ps, TOTAL_TOKENS);
    };
    const verdict = forSeeds(SEED_RANGE, snapshotScenario({ ...DEFAULT_OPTIONS, fifo: false }), [conservation]);
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) {
      expect(verdict.seed).toBe(BROKEN_SEED);
      expect(verdict.message).toBe('conservation broken: the record sums to 293 of 300');
    }
    expect(forSeeds(SEED_RANGE, snapshotScenario(DEFAULT_OPTIONS), [conservation])).toEqual({ ok: true, seeds: 200 });
  });

  it('the rates fail on 48 (calm), 130 (busy) and 188 (very busy) of 200 seeds without FIFO; very busy is over 90% and is not the default', () => {
    const fails = (rate: Rate) => sweepSeeds({ ...DEFAULT_OPTIONS, rate, fifo: false }).failing.length;
    expect([fails('calm'), fails('busy'), fails('veryBusy')]).toEqual([48, 130, 188]);
    expect(DEFAULT_OPTIONS.rate).toBe('busy');
  });

  it('the channel audit, from the trace alone, explains every shortfall on a closed cut and finds nothing on FIFO channels', () => {
    for (let seed = SEED_RANGE.from; seed < SEED_RANGE.to; seed++) {
      const fifo = runSeed(DEFAULT_OPTIONS, seed).result;
      expect(fifo.mismatched, `fifo seed ${seed}`).toEqual([]);
      const loose = runSeed({ ...DEFAULT_OPTIONS, fifo: false }, seed).result;
      if (loose.closure.closed) {
        const missing = loose.mismatched.reduce((s, c) => s + c.inFlight - c.recorded, 0);
        expect(0 - loose.difference, `loose seed ${seed}`).toBe(missing);
      }
    }
  });

  it('the naive cut fails closure on 200 of 200 seeds at the default times and conservation on 196: it is shown with its offending message', () => {
    const s = sweepSeeds({ ...DEFAULT_OPTIONS, method: 'naive' });
    expect(s.rule1).toHaveLength(200);
    expect(s.rule0).toHaveLength(196);
    expect(s.shortfalls).toBe(151);
    expect(s.doubleCounts).toBe(45);
  });
});

describe('scene 3: the bug is real, and the closure check lets the page say so', () => {
  const bugged: SimOptions = { ...DEFAULT_OPTIONS, bug: true };

  it('with markers on FIFO channels the cut is always closed, and a shortfall equals the tokens C dropped inside the cut, on all 200 seeds', () => {
    let shortfalls = 0;
    for (let seed = SEED_RANGE.from; seed < SEED_RANGE.to; seed++) {
      const r = runSeed(bugged, seed).result;
      expect(r.closure.closed, `seed ${seed}`).toBe(true);
      expect(0 - r.difference, `seed ${seed}`).toBe(r.lostInCut);
      expect(r.mismatched).toEqual([]);
      if (r.difference < 0) shortfalls++;
    }
    expect(shortfalls).toBe(87);
  });

  it('the naive cut cannot tell: its difference mixes in-flight tokens with the dropped ones', () => {
    let mixed = 0;
    for (let seed = SEED_RANGE.from; seed < SEED_RANGE.to; seed++) {
      const r = runSeed({ ...bugged, method: 'naive' }, seed).result;
      if (r.difference !== 0 && -r.difference !== r.lostInCut) mixed++;
    }
    expect(mixed).toBeGreaterThan(100);
  });

  it('the caption blames the system only when the cut passed closure', () => {
    const r = runSeed(bugged, 2).result;
    const text = expectCaption(bugCaption({ bug: true, method: 'markers', result: r }));
    if (r.difference < 0) expect(text).toContain('real');
    expect(expectCaption(bugCaption({ bug: false, method: 'markers', result: runSeed(DEFAULT_OPTIONS, 1).result }))).toContain('passed both checks');
  });
});

describe('frames and extremes', () => {
  it('every frame conserves tokens (held plus in flight is 300) in a run with no bug, and the last frame has nothing in flight', () => {
    for (const seed of [1, 2, 3]) {
      const run = buildRun(DEFAULT_OPTIONS, seed);
      for (const f of run.frames) {
        const held = f.procs.reduce((s, p) => s + p.tokens, 0);
        const flying = f.inflight.reduce((s, m) => s + (m.amount ?? 0), 0);
        expect(held + flying).toBe(TOTAL_TOKENS);
      }
      const last = run.frames[run.frames.length - 1];
      expect(last.inflight).toEqual([]);
      expect(last.finished).toBe(true);
      expect(run.frames.length).toBeGreaterThan(100);
    }
  });

  it('every control at its extremes: record times 0 and 200, each initiator, each rate, FIFO on and off, seeds 0 and the largest seed', () => {
    for (const method of ['markers', 'naive'] as const) {
      for (const rate of Object.keys(RATES) as Rate[]) {
        for (const fifo of [true, false]) {
          for (const initiator of NAMES as readonly Name[]) {
            for (const t of [TIME_MS.min, TIME_MS.max]) {
              for (const seed of [0, SEED_MAX]) {
                const r = runSeed({ method, rate, fifo, initiator, startMs: t, recordMs: [t, TIME_MS.max - t, t], bug: false }, seed).result;
                expect(r.finished, `${method} ${rate} ${fifo} ${initiator} ${t} ${seed}`).toBe(true);
              }
            }
          }
        }
      }
    }
  });

  it('the verdict words say when a snapshot has not finished', () => {
    expect(expectCaption(verdictWords({ ...runSeed(DEFAULT_OPTIONS, 1).result, finished: false }))).toContain('has not finished');
  });
});

describe('try-this entries, from the default state, as written', () => {
  it('try-this 1: the default run ends with 300 of 300 and both checks holding', () => {
    const r = runSeed(DEFAULT_OPTIONS, 1).result;
    expect(r).toMatchObject({ total: 300, conservation: true });
    expect(r.closure.closed).toBe(true);
    expect(lesson.tryThis[0]).toContain('reads 300 of 300');
  });

  it('try-this 2: the naive cut at the default times reads 300 by luck for seed 1, and closure names a message', () => {
    const r = runSeed({ ...DEFAULT_OPTIONS, method: 'naive' }, 1).result;
    expect(r.total).toBe(300);
    expect(r.closure.closed).toBe(false);
    expect(lesson.tryThis[1]).toContain(offenceText(r.closure.offence!));
    expect(lesson.tryThis[1]).toContain('the total reads 300 for this seed');
  });

  it('try-this 3: B recording at 0 ms gives 318 (double counted) and at 200 ms gives 291 (missing)', () => {
    const naive = { ...DEFAULT_OPTIONS, method: 'naive' as const };
    expect(runSeed({ ...naive, recordMs: [100, 0, 120] }, 1).result.total).toBe(318);
    expect(runSeed({ ...naive, recordMs: [100, 200, 120] }, 1).result.total).toBe(291);
    expect(lesson.tryThis[2]).toContain('reads 318');
    expect(lesson.tryThis[2]).toContain('291');
  });

  it('try-this 4: markers without FIFO on seed 1 read 293 of 300 and name the channel that held tokens nobody recorded', () => {
    const r = runSeed({ ...DEFAULT_OPTIONS, fifo: false }, 1).result;
    expect(r.total).toBe(293);
    expect(r.mismatched.length).toBeGreaterThan(0);
    const m = r.mismatched[0];
    expect(lesson.tryThis[3]).toContain(`reads 293 of 300`);
    expect(lesson.tryThis[3]).toContain(`from ${m.from} to ${m.to}, which held ${m.inFlight} tokens`);
    expect(expectCaption(verdictWords(r))).toContain(`held ${m.inFlight} tokens at the cut but the record has ${m.recorded}`);
  });

  it('try-this 5: at 2 transfers each FIFO conserves in 416 states and the non-FIFO counterexample is 4 steps', () => {
    expect(lesson.tryThis[4]).toContain('416 states');
    expect(lesson.tryThis[4]).toContain('counterexample of 4 steps');
    expect(lesson.tryThis[4]).toContain('3 of 4');
  });

  it('the rates are the spec\'s ranges', () => {
    expect([RATES.calm, RATES.busy, RATES.veryBusy].map((r) => [r.min, r.max])).toEqual([[20, 40], [5, 15], [2, 6]]);
  });
});
