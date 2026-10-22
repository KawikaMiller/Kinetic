import { describe, expect, it, vi } from 'vitest';
import { cacheCount, decode, makeSetup, recomputeCount, EQUAL_TOLERANCE, INPUT_DIM, KEY_DIM } from './attn';
import {
  AVG_SEQ, BANDWIDTH, DEVICE_MEM, FLOPS, FLOPS_PER_TOKEN, KV_HEADS_FULL, MAX_SEQ, PARAMS, RIDGE_TOKENS, TOY_KV, WEIGHT_BYTES, decodeTiming,
  decodeTokensPerSecond, heldTokens, kvBytes, kvBytesPerToken, ordinal, planMemory, prefillTiming, runRequest, weightBytes, type Allocation,
} from './cost';
import { parseLength } from './length';
import {
  DEFAULT_SETTINGS, HORIZON_SECONDS, MAX_ITERATIONS, STATIC_WAIT_SECONDS, blockedAt, clampRate, clampSettings, createSim, createSimOn, lockstepUtilisation,
  makeWorkload, reservedBytes, runToEnd, statsOf, type Request, type Settings,
} from './sim';
import { nearestRank } from '../../core/stats';

// The seeded sweeps are exact but slow when the whole suite runs in parallel.
vi.setConfig({ testTimeout: 120_000 });

const MS = 1000;

describe('weight and cache arithmetic', () => {
  it('weight bytes are parameters x bits / 8', () => {
    expect(weightBytes(1e9, 16)).toBe(2e9);
    expect(weightBytes(1e9, 8)).toBe(1e9);
    expect(weightBytes(1e9, 4)).toBe(0.5e9);
    expect(WEIGHT_BYTES).toBe(2e9);
    expect(PARAMS * 2).toBe(FLOPS_PER_TOKEN);
  });

  it('the cache formula equals a BigInt recomputation at the ends of every control', () => {
    const big = (c: { layers: number; kvHeads: number; headDim: number; bytes: number }, seq: number, batch: number) =>
      2n * BigInt(c.layers) * BigInt(c.kvHeads) * BigInt(c.headDim) * BigInt(seq) * BigInt(batch) * BigInt(c.bytes);
    let checked = 0;
    for (const layers of [1, 96]) for (const kvHeads of [1, 64]) for (const headDim of [16, 256]) for (const bytes of [1, 2, 4]) {
      for (const seq of [1, 131_072]) for (const batch of [1, 512]) {
        const c = { layers, kvHeads, headDim, bytes };
        expect(kvBytes(c, seq, batch), JSON.stringify([c, seq, batch])).toBe(Number(big(c, seq, batch)));
        checked += 1;
      }
    }
    expect(checked).toBe(2 * 2 * 2 * 3 * 2 * 2);
  });

  it('the hand numbers: 24,576 per token, 50,331,648 per 2,048 tokens, 805,306,368 for 16, four times with 16 KV heads', () => {
    // 2 (K and V) x 24 layers x 4 heads x 64 dims x 2 bytes = 24,576
    expect(kvBytesPerToken(TOY_KV)).toBe(24_576);
    expect(kvBytes(TOY_KV, 2048, 1)).toBe(50_331_648);
    expect(kvBytes(TOY_KV, 2048, 16)).toBe(805_306_368);
    const full = { ...TOY_KV, kvHeads: KV_HEADS_FULL };
    expect(kvBytes(full, 2048, 16)).toBe(3_221_225_472);
    expect(kvBytes(full, 2048, 16)).toBe(4 * kvBytes(TOY_KV, 2048, 16));
  });

  it('the hand fit counts: 437 at 2,048 tokens, 109 with 16 KV heads, 218 reserving 4,096, 1,472 in blocks at 600 tokens', () => {
    // budget 24e9 - 2e9 = 22e9; floor(22e9 / 50,331,648) = floor(437.1) = 437
    expect(planMemory(TOY_KV, 2048, 1, 'exact').budget).toBe(22e9);
    expect(planMemory(TOY_KV, 2048, 1, 'exact').fits).toBe(437);
    expect(planMemory({ ...TOY_KV, kvHeads: KV_HEADS_FULL }, 2048, 1, 'exact').fits).toBe(109);
    expect(Math.floor(22e9 / (4096 * 24_576))).toBe(218);
    expect(planMemory(TOY_KV, AVG_SEQ, 1, 'reserve').fits).toBe(218);
    // ceil(600 / 16) x 16 = 608 tokens held; floor(22e9 / 14,942,208) = 1,472
    expect(heldTokens('blocks', AVG_SEQ)).toBe(608);
    expect(Math.floor(22e9 / (608 * 24_576))).toBe(1472);
    expect(planMemory(TOY_KV, AVG_SEQ, 1, 'blocks').fits).toBe(1472);
  });

  it('the 438th request waits: 437 fit and the plan names the first that does not', () => {
    expect(planMemory(TOY_KV, 2048, 437, 'exact').firstWaiting).toBeNull();
    const plan = planMemory(TOY_KV, 2048, 438, 'exact');
    expect(plan.firstWaiting).toBe(438);
    expect(ordinal(plan.firstWaiting as number)).toBe('438th');
    expect(plan.share).toBeGreaterThan(1);
  });

  it('ordinals: 1st 2nd 3rd 4th, 11th 12th 13th, 21st 112th', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 112, 438].map(ordinal)).toEqual(['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '112th', '438th']);
  });

  it('allocation rules at the ends: a sequence longer than the reservation holds its own length', () => {
    const rules: Allocation[] = ['exact', 'reserve', 'blocks'];
    expect(rules.map((a) => heldTokens(a, 1))).toEqual([1, MAX_SEQ, 16]);
    expect(rules.map((a) => heldTokens(a, 131_072))).toEqual([131_072, 131_072, 131_072]);
    expect(planMemory(TOY_KV, 131_072, 512, 'exact').fits).toBe(6); // floor(22e9 / (131,072 x 24,576)) = 6
    expect(planMemory(TOY_KV, 1, 1, 'exact', 1e9).fits).toBe(0); // a device smaller than the weights has no cache budget
  });
});

describe('one request on the toy device', () => {
  it('n = 1,000, m = 200: TTFT 20 ms, decode 403.38 ms, total 423.38 ms, TPOT 2.027 ms, to 1e-6 in milliseconds', () => {
    const run = runRequest(1000, 200);
    // prefill max(1000 x 2e9 / 1e14, 2e9 / 1e12) = max(20 ms, 2 ms) = 20 ms
    expect(run.ttft * MS).toBeCloseTo(20, 6);
    // weights part 199 x 2 ms = 398 ms; cache part sum(n + j - 1, j = 2..200) = 199 x 1,000 + (1 + 2 + ... + 199 = 19,900) = 218,900 token-steps x 24,576 B / 1e12
    const tokenSteps = 199 * 1000 + (199 * 200) / 2;
    expect(tokenSteps).toBe(218_900);
    const closedForm = 199 * (WEIGHT_BYTES / BANDWIDTH) + (tokenSteps * 24_576) / BANDWIDTH;
    expect(run.decodeSeconds).toBeCloseTo(closedForm, 12);
    expect(run.decodeSeconds * MS).toBeCloseTo(403.3796864, 6);
    expect(run.totalSeconds * MS).toBeCloseTo(423.3796864, 6);
    expect((run.tpot as number) * MS).toBeCloseTo(2.02703, 5);
    expect(run.promptShareOfTokens).toBeCloseTo(1000 / 1200, 12);
    expect(run.promptShareOfTime).toBeCloseTo(20 / 423.3796864, 9);
    expect(run.prefill.regime).toBe('compute-bound');
    expect(run.decodeRegime).toBe('memory-bound');
  });

  it('the ridge: prefill is balanced at 100 prompt tokens and the label flips there', () => {
    expect(RIDGE_TOKENS).toBe(100);
    expect(FLOPS / BANDWIDTH).toBe(100);
    expect(prefillTiming(100).regime).toBe('balanced');
    expect(prefillTiming(99).regime).toBe('memory-bound');
    expect(prefillTiming(101).regime).toBe('compute-bound');
    expect(prefillTiming(99).seconds).toBe(prefillTiming(1).seconds);
  });

  it('decode at a batch of 1 is memory-bound by a factor of 100 at an empty cache', () => {
    const t = decodeTiming(1, 0);
    expect(t.regime).toBe('memory-bound');
    expect(t.memorySeconds / t.computeSeconds).toBeCloseTo(100, 9);
  });

  it('extremes: n at 1 and 8,192, m at 1 and 1,024', () => {
    expect(runRequest(1, 1).tpot).toBeNull();
    expect(runRequest(1, 1).decodeSeconds).toBe(0);
    expect(runRequest(1, 1).totalSeconds).toBeCloseTo(0.002, 12);
    const longest = runRequest(8192, 1024);
    expect(Number.isFinite(longest.totalSeconds)).toBe(true);
    expect(longest.prefill.seconds * MS).toBeCloseTo((8192 * 2e9) / 1e14 * MS, 9);
    expect(runRequest(8192, 1).promptShareOfTokens).toBeCloseTo(8192 / 8193, 12);
  });

  it('the step shape: a decode step costs a + c b, so 64 sequences give 36 times the tokens per second for 1.76 times the step time', () => {
    const one = decodeTiming(1, 1000);
    const sixtyFour = decodeTiming(64, 64_000);
    // b = 1: (2e9 + 24.576e6) / 1e12 = 2.024576 ms; b = 64: (2e9 + 64 x 24.576e6) / 1e12 = 3.572864 ms
    expect(one.seconds * MS).toBeCloseTo(2.024576, 9);
    expect(sixtyFour.seconds * MS).toBeCloseTo(3.572864, 9);
    expect(sixtyFour.seconds / one.seconds).toBeCloseTo(1.7647, 3);
    expect(decodeTokensPerSecond(1, 1000)).toBeCloseTo(493.9, 1);
    expect(decodeTokensPerSecond(64, 1000)).toBeCloseTo(17_912.9, 0);
    expect(decodeTokensPerSecond(64, 1000) / decodeTokensPerSecond(1, 1000)).toBeCloseTo(36.27, 1);
  });
});

/** An independent scalar-loop causal attention for one query row: no matrix helpers, only for loops. */
function naiveDecode(inputs: number[][], wq: number[][], wk: number[][], wv: number[][], t: number): number[] {
  const dot = (x: number[], w: number[][], col: number) => {
    let s = 0;
    for (let i = 0; i < x.length; i += 1) s += x[i] * w[i][col];
    return s;
  };
  const q: number[] = [];
  for (let c = 0; c < wq[0].length; c += 1) q.push(dot(inputs[t], wq, c));
  const scores: number[] = [];
  for (let j = 0; j <= t; j += 1) {
    let s = 0;
    for (let c = 0; c < q.length; c += 1) s += q[c] * dot(inputs[j], wk, c);
    scores.push(s / Math.sqrt(q.length));
  }
  const top = Math.max(...scores);
  let z = 0;
  const e = scores.map((s) => {
    const v = Math.exp(s - top);
    z += v;
    return v;
  });
  const out: number[] = [];
  for (let c = 0; c < wv[0].length; c += 1) {
    let s = 0;
    for (let j = 0; j <= t; j += 1) s += (e[j] / z) * dot(inputs[j], wv, c);
    out.push(s);
  }
  return out;
}

describe('cached decoding equals recomputing', () => {
  it('equal to 1e-9 at every step for 100 seeded heads and 1 to 16 tokens, against a naive scalar-loop attention', () => {
    for (let seed = 0; seed < 100; seed += 1) {
      const tokens = 1 + (seed % 16);
      const setup = makeSetup(seed, tokens);
      const run = decode(setup);
      expect(run.steps).toHaveLength(tokens);
      run.steps.forEach((s, t) => {
        const naive = naiveDecode(setup.inputs, setup.wq, setup.wk, setup.wv, t);
        for (let c = 0; c < naive.length; c += 1) {
          expect(Math.abs(s.cached[c] - naive[c]), `seed ${seed} step ${t + 1}`).toBeLessThan(EQUAL_TOLERANCE);
          expect(Math.abs(s.recomputed[c] - naive[c]), `seed ${seed} step ${t + 1}`).toBeLessThan(EQUAL_TOLERANCE);
        }
        expect(s.diff).toBeLessThan(EQUAL_TOLERANCE);
      });
      expect(run.firstDivergence).toBeNull();
    }
  });

  it('the projection counts are n(n + 1)/2 recomputing and n with the cache', () => {
    const run = decode(makeSetup(7));
    const last = run.steps[run.steps.length - 1];
    expect([last.recomputeProjections, last.cacheProjections]).toEqual([21, 6]);
    for (let n = 1; n <= 16; n += 1) {
      const l = decode(makeSetup(3, n)).steps[n - 1];
      expect([l.recomputeProjections, l.cacheProjections]).toEqual([recomputeCount(n), cacheCount(n)]);
      expect(recomputeCount(n)).toBe((n * (n + 1)) / 2);
    }
  });

  it('a cache that forgets the new value vectors first differs at step 2, by more than 1e-3, on every one of 100 seeds; the correct cache passes the same seeds', () => {
    for (let seed = 0; seed < 100; seed += 1) {
      const setup = makeSetup(seed);
      expect(decode(setup).firstDivergence, `correct, seed ${seed}`).toBeNull();
      const broken = decode(setup, { forgetValues: true });
      expect(broken.steps[0].diff, `seed ${seed} step 1`).toBeLessThan(EQUAL_TOLERANCE);
      expect(broken.firstDivergence, `seed ${seed}`).toBe(2);
      expect(broken.steps[1].diff, `seed ${seed} step 2`).toBeGreaterThan(1e-3);
    }
  });

  it('the toy head has the stated shape', () => {
    const setup = makeSetup(1);
    expect(setup.inputs).toHaveLength(6);
    expect(setup.inputs[0]).toHaveLength(INPUT_DIM);
    expect(setup.wk[0]).toHaveLength(KEY_DIM);
  });
});

describe('the batching simulator', () => {
  const FAST: Settings = DEFAULT_SETTINGS;

  it('the same seed gives the same history, a different seed another', () => {
    const a = createSim(1, 20);
    const b = createSim(1, 20);
    runToEnd(a);
    runToEnd(b);
    expect(a.tick.history).toEqual(b.tick.history);
    const c = createSim(2, 20);
    runToEnd(c);
    expect(c.tick.history.length).not.toBe(a.tick.history.length);
  });

  it('at(k) equals running k iterations from the start', () => {
    const full = createSim(1, 20);
    runToEnd(full);
    for (const k of [0, 1, 17, 500, full.tick.ticks]) {
      const fresh = createSim(1, 20);
      fresh.tick.run(k);
      expect(fresh.tick.state, `k = ${k}`).toEqual(full.tick.at(k));
    }
  });

  it('conservation: at every iteration the requests waiting, running, finished and rejected add up to those that have arrived', () => {
    const configs: [string, number, Settings][] = [
      ['continuous', 20, FAST], ['static', 20, { ...FAST, policy: 'static' }],
      ['continuous full', 60, { policy: 'continuous', slots: 64, deviceGb: 8, reservation: 'max' }],
      ['static full', 60, { policy: 'static', slots: 8, deviceGb: 8, reservation: 'max' }],
    ];
    for (const [name, rate, settings] of configs) {
      const sim = createSim(3, rate, settings);
      runToEnd(sim);
      sim.tick.history.forEach((s, k) => {
        expect(s.arrived - s.head + s.running.length + s.finishedCount + s.rejected, `${name} iteration ${k}`).toBe(s.arrived);
        expect(s.running.length).toBeLessThanOrEqual(settings.slots);
        expect(reservedBytes(s), `${name} iteration ${k}`).toBeLessThanOrEqual(sim.budget);
      });
      expect(sim.tick.violation).toBeNull();
      const end = sim.tick.state;
      expect(end.done).toBe(true);
      expect(end.finishedCount + end.rejected).toBe(sim.workload.length);
    }
  });

  const hand = (outputs: number[]): Request[] => outputs.map((output, id) => ({ id, arrive: 0, prompt: 100, output }));

  it('static batch of outputs 10, 10, 10, 200: token-slot utilisation 230 / 800 = 28.75%, the simulator\'s decode-step count 226 / 796', () => {
    expect(lockstepUtilisation([10, 10, 10, 200])).toBe(0.2875);
    const sim = createSimOn(hand([10, 10, 10, 200]), 1, { policy: 'static', slots: 4, deviceGb: 24, reservation: 'need' });
    const end = runToEnd(sim);
    // 199 decode steps after the prefill makes token 1; sequences emitting in them: 9 + 9 + 9 + 199 = 226
    expect(end.decodeIterations).toBe(199);
    expect(end.busySlotSteps).toBe(226);
    expect(statsOf(sim, end).utilisation).toBeCloseTo(226 / (4 * 199), 12);
    expect(end.finishedCount).toBe(4);
  });

  it('continuous batching refills the three short sequences\' slots after step 10 and finishes the same eight requests sooner', () => {
    const outputs = [10, 10, 10, 200, 10, 10, 10, 10];
    const settings = (policy: 'static' | 'continuous'): Settings => ({ policy, slots: 4, deviceGb: 24, reservation: 'need' });
    const stat = createSimOn(hand(outputs), 1, settings('static'));
    const cont = createSimOn(hand(outputs), 1, settings('continuous'));
    const s = statsOf(stat, runToEnd(stat));
    const c = statsOf(cont, runToEnd(cont));
    expect(c.makespan).toBeLessThan(s.makespan);
    expect(c.tokensPerSecond).toBeGreaterThan(s.tokensPerSecond);
    expect(c.utilisation as number).toBeGreaterThan(s.utilisation as number);
  });

  it('static batching leaves when the oldest request has waited 50 ms, or at once when it already has', () => {
    const lone: Request[] = [{ id: 0, arrive: 1, prompt: 100, output: 1 }];
    const sim = createSimOn(lone, 1, { policy: 'static', slots: 4, deviceGb: 24, reservation: 'need' });
    const end = runToEnd(sim);
    const rec = sim.tick.history.at(-1)?.finished;
    expect(rec?.start).toBeCloseTo(1 + STATIC_WAIT_SECONDS, 12);
    expect(end.finishedCount).toBe(1);
  });

  it('a request needing more cache than the whole budget is rejected, not queued forever, and the others still run', () => {
    // 2.1 GB device: budget 0.1 GB; 5,000 tokens x 24,576 B = 122.9 MB cannot ever fit, 100 tokens can
    const reqs: Request[] = [
      { id: 0, arrive: 0, prompt: 3000, output: 2000 },
      { id: 1, arrive: 0.001, prompt: 100, output: 20 },
    ];
    for (const policy of ['continuous', 'static'] as const) {
      const sim = createSimOn(reqs, 1, { policy, slots: 4, deviceGb: 2.1, reservation: 'need' });
      const end = runToEnd(sim);
      expect(end.rejected, policy).toBe(1);
      expect(end.finishedCount, policy).toBe(1);
      expect(end.done).toBe(true);
      expect(sim.tick.violation).toBeNull();
    }
  });

  it('blocked: a head that needs more than is free reports cache with the two sizes; with all slots busy it reports slots', () => {
    const reqs: Request[] = [0, 1, 2].map((id) => ({ id, arrive: 0, prompt: 1000, output: 1000 })); // 2,000 tokens = 49.152 MB each
    const sim = createSimOn(reqs, 1, { policy: 'continuous', slots: 8, deviceGb: 2.1, reservation: 'need' }); // budget 100 MB: two fit
    runToEnd(sim);
    const hit = sim.tick.history.find((s) => blockedAt(sim, s)?.reason === 'cache');
    expect(hit).toBeDefined();
    const b = blockedAt(sim, hit as never);
    expect(b?.needBytes).toBe(2000 * 24_576);
    expect(b?.freeBytes).toBe(1e8 - 2 * 2000 * 24_576);
    const slotSim = createSim(1, 60, { ...FAST, slots: 1 });
    runToEnd(slotSim);
    expect(slotSim.tick.history.some((s) => blockedAt(slotSim, s)?.reason === 'slots')).toBe(true);
  });

  it('on 200 seeded workloads continuous throughput is at least static\'s, and the p50 time to first token at 5 requests per second is lower', () => {
    let atLeast = 0;
    let strictly = 0;
    let lowerP50 = 0;
    const seeds = Array.from({ length: 200 }, (_, i) => i + 1);
    for (const seed of seeds) {
      const stat = createSim(seed, 5, { ...FAST, policy: 'static' });
      const cont = createSim(seed, 5, FAST);
      const s = statsOf(stat, runToEnd(stat));
      const c = statsOf(cont, runToEnd(cont));
      if (c.tokensPerSecond >= s.tokensPerSecond - 1e-9) atLeast += 1;
      if (c.tokensPerSecond > s.tokensPerSecond + 1e-9) strictly += 1;
      if ((c.ttftP50 as number) < (s.ttftP50 as number)) lowerP50 += 1;
    }
    // The page says "on these seeded workloads": the shares are printed in the report, the claim is the whole set.
    expect(atLeast).toBe(200);
    expect(lowerP50).toBe(200);
    expect(strictly).toBeGreaterThan(100);
  }, 180_000);

  it('on 200 seeded workloads at 20 requests per second continuous batching is not worse on throughput, and much better on average', () => {
    let atLeast = 0;
    let sumStatic = 0;
    let sumCont = 0;
    for (let seed = 1; seed <= 200; seed += 1) {
      const stat = createSim(seed, 20, { ...FAST, policy: 'static' });
      const cont = createSim(seed, 20, FAST);
      const s = statsOf(stat, runToEnd(stat));
      const c = statsOf(cont, runToEnd(cont));
      if (c.tokensPerSecond >= s.tokensPerSecond - 1e-9) atLeast += 1;
      sumStatic += s.tokensPerSecond;
      sumCont += c.tokensPerSecond;
    }
    expect(atLeast).toBe(200);
    expect(sumCont / sumStatic).toBeGreaterThan(1.3);
  }, 120_000);

  it('extremes: S at 1 and 64, rate at 1 and 60, memory at 8 and 80 GB, and one beyond is clamped', () => {
    for (const slots of [1, 64]) for (const rate of [1, 60]) for (const deviceGb of [8, 80]) for (const policy of ['static', 'continuous'] as const) {
      const sim = createSim(2, rate, { policy, slots, deviceGb, reservation: 'max' });
      const end = runToEnd(sim);
      expect(end.done, `${policy} S${slots} ${rate}/s ${deviceGb}GB`).toBe(true);
      expect(sim.tick.violation).toBeNull();
      const st = statsOf(sim, end);
      expect(Number.isFinite(st.tokensPerSecond)).toBe(true);
      expect(sim.tick.ticks).toBeLessThan(MAX_ITERATIONS);
    }
    expect(clampSettings({ ...FAST, slots: 0, deviceGb: 7 })).toMatchObject({ slots: 1, deviceGb: 8 });
    expect(clampSettings({ ...FAST, slots: 65, deviceGb: 81 })).toMatchObject({ slots: 64, deviceGb: 80 });
    expect([clampRate(0), clampRate(61), clampRate(20.4)]).toEqual([1, 60, 20]);
  });

  it('an empty workload ends at once and prints no traffic, not NaN', () => {
    const sim = createSimOn([], 1, FAST);
    const end = runToEnd(sim);
    const st = statsOf(sim, end);
    expect(end.done).toBe(true);
    expect([st.tokensPerSecond, st.ttftP50, st.ttftP99, st.utilisation]).toEqual([0, null, null, null]);
  });

  it('the workload follows its named constants: arrivals inside the horizon, prompts 64 to 1,024, outputs 1 to 1,024', () => {
    const w = makeWorkload(1, 20);
    expect(w.length).toBeGreaterThan(300);
    for (const r of w) {
      expect(r.arrive).toBeLessThan(HORIZON_SECONDS);
      expect(r.prompt).toBeGreaterThanOrEqual(64);
      expect(r.prompt).toBeLessThanOrEqual(1024);
      expect(r.output).toBeGreaterThanOrEqual(1);
      expect(r.output).toBeLessThanOrEqual(1024);
    }
    const lengths = w.map((r) => r.output).sort((a, b) => a - b);
    expect(nearestRank(lengths, 50) as number).toBeGreaterThan(60);
    expect(nearestRank(lengths, 50) as number).toBeLessThan(150);
    expect(makeWorkload(1, 20)).toEqual(w);
  });
});

describe('typed lengths', () => {
  it('accepts whole numbers inside the bounds, with thousands commas', () => {
    expect(parseLength('1000', 'prompt tokens', 1, 8192)).toEqual({ ok: true, value: 1000 });
    expect(parseLength('8,192', 'prompt tokens', 1, 8192)).toEqual({ ok: true, value: 8192 });
    expect(parseLength('1', 'prompt tokens', 1, 8192)).toEqual({ ok: true, value: 1 });
  });

  it('refuses decimals, 1e3, negatives, empty and one beyond either end with the stated bound', () => {
    for (const bad of ['12.5', '1e3', '-4', '', '   ', '0', '8193', 'abc']) {
      const r = parseLength(bad, 'prompt tokens', 1, 8192);
      expect(r.ok, `"${bad}"`).toBe(false);
    }
    const small = parseLength('0', 'prompt tokens', 1, 8192);
    const big = parseLength('8193', 'prompt tokens', 1, 8192);
    expect(small.ok ? '' : small.error).toContain('the smallest allowed value is 1');
    expect(big.ok ? '' : big.error).toContain('the largest allowed value is 8,192');
    const empty = parseLength('', 'prompt tokens', 1, 8192);
    expect(empty.ok ? '' : empty.error).toContain('1 to 8,192');
  });

  it('every refusal reads as a sentence for any label, even a plural noun phrase or a symbol, and never splices the label into the middle of a phrase', () => {
    for (const label of ['Batch (requests)', 'Prompt tokens', 'd_in']) {
      for (const bad of ['', '0', '9000']) {
        const r = parseLength(bad, label, 1, 8192);
        const text = r.ok ? '' : r.error;
        expect(text.startsWith(`${label}: `), `${label} "${bad}"`).toBe(true);
        expect(text).not.toMatch(/whole number of|start at|stop at/);
      }
    }
  });
});

describe('device constants', () => {
  it('are the named round numbers of the page', () => {
    expect([DEVICE_MEM, BANDWIDTH, FLOPS, PARAMS]).toEqual([24e9, 1e12, 1e14, 1e9]);
  });
  it('the nearest-rank helper is what the p50 and p99 use', () => {
    expect(nearestRank([1, 2, 3, 4], 50)).toBe(2);
  });
});
