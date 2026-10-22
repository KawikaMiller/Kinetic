import { describe, expect, it } from 'vitest';
import { sceneElements, sharedSceneComponents } from '../../core/testing/sceneKeys';
import { decode, makeSetup } from './attn';
import { batchCaption, handBatchUse, runBatching, tickAt } from './batching';
import { CACHE_OPENING, equalityCaption, equalityRun, memoryCaption } from './cache';
import { KV_HEADS_FULL, TOY_KV, decodeTokensPerSecond, planMemory, prefillTiming, decodeTiming, stepShape } from './cost';
import lesson from './index';
import { REQUEST_OPENING, requestCaption } from './request';
import { DEFAULT_SETTINGS, LARGEST_RESERVATION_BYTES, SMALLEST_BUDGET_BYTES, blockedAt, lockstepUtilisation, type Settings } from './sim';
import { STEP_OPENING } from './StepPanel';
import { decimalBytes, milliseconds } from './text';

describe('scenes', () => {
  it('every scene component carries its own key and no component is shared between scenes', () => {
    const els = sceneElements('llm-serving');
    expect(els).toHaveLength(3);
    expect(els.every((e) => e.keyed)).toBe(true);
    expect(sharedSceneComponents('llm-serving')).toEqual([]);
  });

  it('each scene opens on the state its try-this assumes', () => {
    expect(REQUEST_OPENING).toEqual({ prompt: 1000, output: 200 });
    expect(CACHE_OPENING).toMatchObject({ sequence: 2048, batch: 16, allocation: 'exact', forgetValues: false });
    expect(CACHE_OPENING.config).toEqual(TOY_KV);
    expect(DEFAULT_SETTINGS).toMatchObject({ policy: 'continuous', slots: 16, deviceGb: 24, reservation: 'need' });
  });
});

describe('try-this entries, from the default state, as written', () => {
  it('try-this 1: 20.00 ms to first token, about 2.03 ms per later token, about 423 ms, 83.3% of the tokens in 4.7% of the time; 100 prompt tokens read balanced', () => {
    const text = requestCaption(REQUEST_OPENING.prompt, REQUEST_OPENING.output);
    expect(text).toContain('Time to first token is 20.00 ms (compute-bound)');
    expect(text).toContain('Each later token takes about 2.03 ms (memory-bound)');
    expect(text).toContain('Prefill handles 83.3% of the tokens in 4.7% of the time');
    expect(milliseconds(0.4233796864)).toBe('423.38 ms');
    expect(prefillTiming(100).regime).toBe('balanced');
    expect(lesson.tryThis[0]).toContain('20.00 ms (compute-bound)');
    expect(lesson.tryThis[0]).toContain('about 2.03 ms (memory-bound)');
    expect(lesson.tryThis[0]).toContain('about 423 ms');
    expect(lesson.tryThis[0]).toContain('83.3% of the tokens in 4.7% of the time');
  });

  it('try-this 2: 50.3 MB and 437 fit; a batch of 438 reads "the 438th request waits"; full multi-head falls to 109', () => {
    const open = CACHE_OPENING;
    const plan = planMemory(open.config, open.sequence, open.batch, open.allocation);
    expect(decimalBytes(plan.perSequence)).toBe('50.3 MB');
    expect(plan.fits).toBe(437);
    expect(memoryCaption(plan, open.sequence, open.batch, open.allocation)).toContain('437 requests would fit');
    const over = planMemory(open.config, open.sequence, 438, open.allocation);
    expect(memoryCaption(over, open.sequence, 438, open.allocation)).toContain('the 438th request waits');
    expect(planMemory({ ...open.config, kvHeads: KV_HEADS_FULL }, open.sequence, open.batch, open.allocation).fits).toBe(109);
    expect(lesson.tryThis[1]).toContain('437 fit');
    expect(lesson.tryThis[1]).toContain('falls to 109');
  });

  it('try-this 3: at 600 tokens reserving 4,096 fits 218 and 16-token blocks fit 1,472; the forgetful cache first differs at step 2', () => {
    expect(planMemory(TOY_KV, 600, 16, 'reserve').fits).toBe(218);
    expect(planMemory(TOY_KV, 600, 16, 'blocks').fits).toBe(1472);
    const run = equalityRun(CACHE_OPENING.seed, true);
    expect(run.firstDivergence).toBe(2);
    expect(equalityCaption(run, true)).toContain('first differs at step 2');
    expect(lesson.tryThis[2]).toContain('218 fit');
    expect(lesson.tryThis[2]).toContain('1,472 fit');
    expect(lesson.tryThis[2]).toContain('step 2');
  });

  it('try-this 4: continuous 2,719 tokens per second and p50 13 ms; static 1,721 and a p50 near 6.7 s', () => {
    const cont = runBatching(1, 20, DEFAULT_SETTINGS);
    const stat = runBatching(1, 20, { ...DEFAULT_SETTINGS, policy: 'static' });
    expect(Math.round(cont.stats.tokensPerSecond)).toBe(2719);
    expect(Math.round((cont.stats.ttftP50 as number) * 1000)).toBe(13);
    expect(Math.round(stat.stats.tokensPerSecond)).toBe(1721);
    expect((stat.stats.ttftP50 as number).toFixed(1)).toBe('6.7');
    const state = cont.sim.tick.history[tickAt(cont, 500)];
    expect(batchCaption(cont, state, tickAt(cont, 500), 20)).toContain('2,719 output tokens per second');
    expect(lesson.tryThis[3]).toContain('about 2,719 output tokens per second');
    expect(lesson.tryThis[3]).toContain('about 1,721 tokens per second');
    expect(stat.finished.some((r) => r.freed > r.end)).toBe(true);
    expect(cont.finished.every((r) => r.freed === r.end)).toBe(true);
  });

  it('try-this 5: reserving 4,096 per request with 64 sequences, 8 GB and 60 per second holds the queue head back for cache on 2,294 of 5,203 iterations', () => {
    const run = runBatching(1, 60, { policy: 'continuous', slots: 64, deviceGb: 8, reservation: 'max' });
    expect(run.cacheBlocked).toBe(2294);
    expect(run.stats.iterations).toBe(5203);
    expect(lesson.tryThis[4]).toContain('2,294 of 5,203 iterations');
    const blocked = run.sim.tick.history.findIndex((_, i) => batchCaption(run, run.sim.tick.history[i], i, 60).includes('is free: it waits'));
    expect(blocked).toBeGreaterThanOrEqual(0);
  });
});

describe('manipulations: the wrong move and what the page says', () => {
  it('manipulation 1: raising the batch past what the cache holds says which request waits, with the sizes', () => {
    const plan = planMemory(TOY_KV, 2048, 438, 'exact');
    const text = memoryCaption(plan, 2048, 438, 'exact');
    expect(text).toContain('the 438th request waits (437 fit)');
    expect(text).toContain('22.05 GB against a 22.00 GB cache budget');
  });

  it('manipulation 2: the static policy at the same seed leaves idle slots that continuous does not, and says it holds them', () => {
    const stat = runBatching(1, 20, { ...DEFAULT_SETTINGS, policy: 'static' });
    const cont = runBatching(1, 20, DEFAULT_SETTINGS);
    const idle = (run: typeof stat) => run.finished.reduce((s, r) => s + (r.freed - r.end), 0);
    expect(idle(stat)).toBeGreaterThan(0);
    expect(idle(cont)).toBe(0);
    expect(stat.stats.utilisation as number).toBeLessThan(cont.stats.utilisation as number);
    expect(lockstepUtilisation([10, 10, 10, 200])).toBe(0.2875);
  });

  it('manipulation 3: the cache that forgets values diverges at step 2 and the message names the step and the size', () => {
    const run = decode(makeSetup(CACHE_OPENING.seed), { forgetValues: true });
    expect(run.firstDivergence).toBe(2);
    const text = equalityCaption(run, true);
    expect(text).toContain('With the value vectors forgotten');
    expect(text).toContain(`by ${run.steps[1].diff.toExponential(1)}`);
    expect(equalityCaption(decode(makeSetup(CACHE_OPENING.seed)), false)).toContain('matches recomputing from scratch within 1e-9 at every step');
  });
});

describe('the lesson text agrees with the model', () => {
  it('the key ideas quote the model\'s numbers', () => {
    expect(milliseconds(prefillTiming(1000).seconds)).toBe('20.00 ms');
    expect(lesson.keyIdeas[0]).toContain('20 ms');
    expect(lesson.keyIdeas[1]).toContain('437 requests of 2,048 tokens');
    const one = decodeTiming(1, 1000).seconds;
    const many = decodeTiming(64, 64_000).seconds;
    expect((many / one).toFixed(2)).toBe('1.76');
    expect(lesson.keyIdeas[2]).toContain('1.76 times');
    expect(Math.round(decodeTokensPerSecond(64, 1000) / decodeTokensPerSecond(1, 1000))).toBe(36);
    expect(lesson.keyIdeas[2]).toContain('36 times');
  });

  it('quiz figures: 2.02 and 3.57 ms, 17,913 against 494 tokens per second, 20 ms against about 403 ms', () => {
    expect((decodeTiming(1, 1000).seconds * 1000).toFixed(2)).toBe('2.02');
    expect((decodeTiming(64, 64_000).seconds * 1000).toFixed(2)).toBe('3.57');
    expect(Math.round(decodeTokensPerSecond(64, 1000))).toBe(17_913);
    expect(Math.round(decodeTokensPerSecond(1, 1000))).toBe(494);
    expect(lesson.quiz[1].why).toContain('about 403 ms');
    expect(lesson.quiz[2].why).toContain('17,913 tokens per second against 494');
    expect(lesson.quiz[3].why).toContain('230 of 800 token-slots busy, 28.75%');
    expect(lesson.quiz[4].why).toContain('218');
    expect(lesson.quiz[4].why).toContain('1,472');
  });
});

describe('try-this entries, followed in written order from one fresh load', () => {
  it('the cache scene: try 3 names the reset it needs, and without it the page shows 54 and 368, not 218 and 1,472', () => {
    // try 2 ends on full multi-head; try 3 as written first chooses toy-24 again
    const afterTry2 = { ...TOY_KV, kvHeads: KV_HEADS_FULL };
    expect(planMemory(afterTry2, 600, 438, 'reserve').fits).toBe(54);
    expect(planMemory(afterTry2, 600, 438, 'blocks').fits).toBe(368);
    expect(lesson.tryThis[2]).toContain('choose toy-24 again');
    expect(planMemory(TOY_KV, 600, 438, 'reserve').fits).toBe(218);
    expect(planMemory(TOY_KV, 600, 438, 'blocks').fits).toBe(1472);
  });

  it('the batching scene: try 4 ends on static, so try 5 as written chooses continuous again; the settings it ends on give 2,294 of 5,203', () => {
    const afterTry4: Settings = { ...DEFAULT_SETTINGS, policy: 'static' };
    const wrong = runBatching(1, 60, { ...afterTry4, slots: 64, deviceGb: 8, reservation: 'max' });
    expect(wrong.cacheBlocked).not.toBe(2294);
    expect(lesson.tryThis[4]).toContain('choose continuous again');
    const right = runBatching(1, 60, { ...afterTry4, policy: 'continuous', slots: 64, deviceGb: 8, reservation: 'max' });
    expect([right.cacheBlocked, right.stats.iterations]).toEqual([2294, 5203]);
  });
});

describe('the iteration count is the real one', () => {
  it('every run ends on exactly one done state, the last, and the count is the index of that state (no padding ticks)', () => {
    for (const policy of ['continuous', 'static'] as const) {
      for (const [seed, rate] of [[1, 20], [2, 5], [3, 60], [4, 1]] as const) {
        const run = runBatching(seed, rate, { ...DEFAULT_SETTINGS, policy });
        const history = run.sim.tick.history;
        expect(history.filter((s) => s.done), `${policy} ${seed} ${rate}`).toHaveLength(1);
        expect(history[history.length - 1].done).toBe(true);
        expect(run.stats.iterations).toBe(history.length - 1);
      }
    }
  });

  it('seed 1 at 20 requests per second: 8,357 continuous and 12,994 static (an independent scheduler counted the same; neither is a multiple of 512)', () => {
    expect(runBatching(1, 20, DEFAULT_SETTINGS).stats.iterations).toBe(8357);
    expect(runBatching(1, 20, { ...DEFAULT_SETTINGS, policy: 'static' }).stats.iterations).toBe(12_994);
  });
});

describe('the waiting caption is derived from the state', () => {
  it('"every slot is busy" is printed only for a continuous run with every slot taken; a static batch gets its own sentence', () => {
    let staticStates = 0;
    for (const policy of ['continuous', 'static'] as const) {
      for (const rate of [5, 20]) {
        const run = runBatching(1, rate, { ...DEFAULT_SETTINGS, policy });
        run.sim.tick.history.forEach((state, i) => {
          const text = batchCaption(run, state, i, rate);
          if (text.includes('Every slot is busy')) {
            expect(policy).toBe('continuous');
            expect(state.running.length).toBeGreaterThanOrEqual(run.sim.settings.slots);
          }
          if (blockedAt(run.sim, state)?.reason === 'batch') {
            staticStates += 1;
            expect(text).toContain('A static batch is running');
            expect(text).not.toContain('the cache');
            const free = run.sim.settings.slots - state.running.length;
            expect(text.includes('even though')).toBe(free > 0);
          }
        });
      }
    }
    expect(staticStates).toBeGreaterThan(1000);
  });

  it('the static caption at seed 1, 5 per second, iteration 248 names the free slots', () => {
    const run = runBatching(1, 5, { ...DEFAULT_SETTINGS, policy: 'static' });
    const text = batchCaption(run, run.sim.tick.history[248], 248, 5);
    expect(text).toContain('even though 14 slots are free');
  });

  it('the caption says "by the end of the run" for the totals and uses thousands separators', () => {
    const run = runBatching(1, 60, DEFAULT_SETTINGS);
    expect(batchCaption(run, run.sim.tick.history[100], 100, 60)).toMatch(/by the end of the run 1,\d{3} of 1,\d{3} requests finished/);
  });
});

describe('the step panel and the utilisation hint compute what the page quotes', () => {
  it('the opening state is 64 sequences of 1,000 tokens: 1.76 times the step time, 36 times the tokens per second', () => {
    const shape = stepShape(STEP_OPENING.batch, STEP_OPENING.context);
    expect(shape.timeRatio.toFixed(2)).toBe('1.76');
    expect(Math.round(shape.throughputRatio)).toBe(36);
    expect(Math.round(shape.tokensPerSecond)).toBe(17_913);
    expect(Math.round(shape.singleTokensPerSecond)).toBe(494);
    expect(stepShape(1, 1000).throughputRatio).toBe(1);
  });

  it('the hand batch: 230 of 800 token-slots by the lockstep count, 226 of 796 by the meter', () => {
    expect(handBatchUse()).toEqual({ tokenBusy: 230, tokenTotal: 800, decodeBusy: 226, decodeTotal: 796 });
  });

  it('the rejection guard cannot fire from the controls: the largest reservation fits the smallest budget', () => {
    expect(LARGEST_RESERVATION_BYTES).toBeLessThan(SMALLEST_BUDGET_BYTES);
    expect(runBatching(1, 60, { policy: 'static', slots: 64, deviceGb: 8, reservation: 'max' }).stats.rejected).toBe(0);
  });
});
