import { describe, expect, it } from 'vitest';
import { mulberry32, randInt } from '../../core/random';
import {
  BACKUP_AFTER, HORIZON, WORKERS, evenSpeeds, inputRecords, killSchedule, outputOf, sideEffectCount, simulate, startWorld, stepWorld, workOf,
  type ClusterConfig, type Kill, type World,
} from './cluster';
import { BROKEN_SEED, COMBINER_WORDS, combinerFacts, counterRun, killDemo, stragglerFacts } from './facts';
import { combine, mapWord, partitionOf, plan, reference, sameResult, sortedEntries, splitWords, type CombinerId, type JobId } from './job';
import { EVEN_WORDS, HOT_SHARE, HOT_WORD, PRESET_SHORT, SKEWED_WORDS, wordsOf } from './text';
import { runCluster } from './timeline';
import { createTickSim } from '../../core/simTick';
import { fnv1a } from '../../core/hash';

const SEEDS = 200;
const seeds = Array.from({ length: SEEDS }, (_, i) => i);
const VOCAB = ['the', 'cat', 'and', 'dog', 'bird', 'boat', 'bridge', 'book', 'bus', 'apple', 'ant', 'zebra', 'quokka', 'x'];
const randomWords = (seed: number, n: number): string[] => {
  const rnd = mulberry32(seed);
  return Array.from({ length: n }, () => VOCAB[randInt(0, VOCAB.length - 1, rnd)]);
};

describe('the text rules', () => {
  it('lowercases and splits on anything that is not a letter, dropping empties', () => {
    expect(wordsOf('The cat, the DOG!  And 3 birds-of-a-feather')).toEqual(['the', 'cat', 'the', 'dog', 'and', 'birds', 'of', 'a', 'feather']);
    expect(wordsOf('')).toEqual([]);
    expect(wordsOf(' 1 2 3 ,, ')).toEqual([]);
  });
  it('the skewed preset is exactly 60% one word, by an independent count', () => {
    expect(SKEWED_WORDS.filter((w) => w === HOT_WORD).length / SKEWED_WORDS.length).toBeCloseTo(HOT_SHARE, 10);
    expect(SKEWED_WORDS.filter((w) => w !== HOT_WORD)).toEqual(EVEN_WORDS.filter((w) => w !== HOT_WORD));
  });
});

describe('word count by hand', () => {
  it('"the cat and the dog and the bird" gives the 3, and 2, cat 1, dog 1, bird 1 for every split and reducer count, equal to a plain count', () => {
    const words = wordsOf(PRESET_SHORT);
    for (let m = 1; m <= 6; m++) {
      for (let r = 1; r <= 4; r++) {
        for (const combiner of ['off', 'sum'] as CombinerId[]) {
          const p = plan({ job: 'wordcount', combiner, words, mappers: m, reducers: r });
          expect(sortedEntries(p.result), `${m}x${r} ${combiner}`).toEqual([['the', 3], ['and', 2], ['bird', 1], ['cat', 1], ['dog', 1]]);
          expect(sameResult(p.result, reference('wordcount', words))).toBe(true);
        }
      }
    }
  });

  it('splits are contiguous, cover every word once, and differ in size by at most one', () => {
    for (let n = 0; n <= 25; n++) {
      const words = Array.from({ length: n }, (_, i) => `w${i}`);
      for (let m = 1; m <= 6; m++) {
        const splits = splitWords(words, m);
        expect(splits).toHaveLength(m);
        expect(splits.flat()).toEqual(words);
        const sizes = splits.map((s) => s.length);
        expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1);
      }
    }
  });

  it('an empty input gives an empty result, and an empty split is allowed', () => {
    const p = plan({ job: 'wordcount', combiner: 'off', words: [], mappers: 3, reducers: 2 });
    expect(p.result.size).toBe(0);
    expect(p.shuffled).toBe(0);
    expect(plan({ job: 'wordcount', combiner: 'off', words: ['a'], mappers: 4, reducers: 2 }).result.get('a')).toBe(1);
  });
});

describe('the shuffle', () => {
  it('every key goes to exactly one reducer and the same key always to the same one, over 10,000 words', () => {
    const words = randomWords(1, 10_000);
    for (const r of [1, 2, 3, 4]) {
      const where = new Map<string, number>();
      for (const w of words) {
        const p = partitionOf(w, r);
        expect(p).toBeGreaterThanOrEqual(0);
        expect(p).toBeLessThan(r);
        expect(p).toBe(fnv1a(w) % r);
        if (where.has(w)) expect(where.get(w)).toBe(p);
        where.set(w, p);
      }
      const pl = plan({ job: 'wordcount', combiner: 'off', words, mappers: 5, reducers: r });
      const homes = new Map<string, Set<number>>();
      pl.parts.forEach((part, i) => part.forEach((rec) => homes.set(rec.key, (homes.get(rec.key) ?? new Set()).add(i))));
      expect([...homes.values()].every((s) => s.size === 1)).toBe(true);
      expect(pl.parts.reduce((n, p) => n + p.length, 0)).toBe(words.length);
    }
  });

  it('records inside a partition are sorted by key', () => {
    const p = plan({ job: 'wordcount', combiner: 'off', words: randomWords(3, 500), mappers: 3, reducers: 2 });
    for (const part of p.parts) expect(part.map((r) => r.key)).toEqual([...part.map((r) => r.key)].sort());
  });
});

describe('the combiner', () => {
  it('never increases the records shuffled, and still gives the single-process answer, over 200 seeded inputs', () => {
    for (const seed of seeds) {
      const words = randomWords(seed, 5 + (seed % 60));
      const m = 1 + (seed % 6);
      const off = plan({ job: 'wordcount', combiner: 'off', words, mappers: m, reducers: 2 });
      const sum = plan({ job: 'wordcount', combiner: 'sum', words, mappers: m, reducers: 2 });
      expect(sum.shuffled).toBeLessThanOrEqual(off.shuffled);
      expect(off.shuffled).toBe(words.length);
      expect(sameResult(sum.result, reference('wordcount', words))).toBe(true);
      const avg = plan({ job: 'avglen', combiner: 'sum', words, mappers: m, reducers: 2 });
      expect(sameResult(avg.result, reference('avglen', words))).toBe(true);
    }
  });

  it('a sum combiner leaves one record per distinct word in each split (counted without the combiner code)', () => {
    const words = COMBINER_WORDS;
    const p = plan({ job: 'wordcount', combiner: 'sum', words, mappers: 2, reducers: 2 });
    const expected = p.splits.reduce((n, s) => n + new Set(s).size, 0);
    expect(p.shuffled).toBe(expected);
  });

  it('hand-worked: the paragraph on two mappers, words starting with "a": the true mean length is 23/9 and averaging each mapper\'s average gives 2.5', () => {
    // a-words in order with their lengths: at 2, and 3, at 2, a 1 | and 3, a 1, about 5, and 3, and 3. The first mapper gets words 1 to 21, the second 22 to 41.
    const split = splitWords(COMBINER_WORDS, 2);
    expect(split.map((s) => s.length)).toEqual([21, 20]);
    expect(split[0].filter((w) => w[0] === 'a').map((w) => w.length)).toEqual([2, 3, 2, 1]);
    expect(split[1].filter((w) => w[0] === 'a').map((w) => w.length)).toEqual([3, 1, 5, 3, 3]);
    const f = combinerFacts();
    const mk = (job: JobId, combiner: CombinerId) => plan({ job, combiner, words: COMBINER_WORDS, mappers: 2, reducers: 2 }).result.get('a')!;
    expect(mk('avglen', 'off')).toBeCloseTo(23 / 9, 12);
    expect(mk('avglen', 'sum')).toBeCloseTo(23 / 9, 12);
    expect(mk('avglen', 'naive')).toBeCloseTo((8 / 4 + 15 / 5) / 2, 12);
    expect(mk('avglen', 'naive')).toBe(2.5);
    expect(f.wrongKeys).toContain('a');
    expect(f.sumCorrect && f.offCorrect).toBe(true);
  });

  it('broken variant: the averaging combiner is right only when every mapper holds the same number of a key (equal counts), over 200 seeded inputs', () => {
    let wrong = 0;
    let rightWithEqualCounts = 0;
    for (const seed of seeds) {
      const words = randomWords(seed, 20 + (seed % 40));
      const splits = splitWords(words, 2);
      const naive = plan({ job: 'avglen', combiner: 'naive', words, mappers: 2, reducers: 1 }).result;
      const truth = reference('avglen', words);
      for (const [k, v] of truth) {
        const counts = splits.map((s) => s.filter((w) => w[0] === k).length);
        const equal = counts.every((c) => c === counts[0]);
        const same = Math.abs((naive.get(k) ?? NaN) - v) < 1e-9;
        if (!same) wrong++;
        if (equal && counts[0] > 0) {
          rightWithEqualCounts++;
          expect(same).toBe(true);
        }
      }
    }
    expect(wrong).toBeGreaterThan(0);
    expect(rightWithEqualCounts).toBeGreaterThan(0);
  });

  it('combine keeps first-appearance order and the (sum, count) pairs it was given', () => {
    const recs = ['b', 'a', 'b'].map((w) => mapWord('wordcount', w));
    expect(combine(recs, 'sum')).toEqual([{ key: 'b', sum: 2, count: 2 }, { key: 'a', sum: 1, count: 1 }]);
    expect(combine(recs, 'off')).toEqual(recs);
  });
});

/** Everything that must hold in every state and at the end of one run. */
function checkRun(history: readonly World[], world: World, cfg: ClusterConfig, label: string) {
  for (const w of history) {
    const running = w.attempts.filter((a) => a.status === 'running');
    const perWorker = new Map<number, number>();
    for (const a of running) perWorker.set(a.worker, (perWorker.get(a.worker) ?? 0) + 1);
    expect([...perWorker.values()].every((n) => n === 1), `${label}: a worker runs two tasks at tick ${w.tick}`).toBe(true);
    expect(running.every((a) => w.alive[a.worker]), `${label}: a dead worker runs a task at tick ${w.tick}`).toBe(true);
    expect(w.busy.every((b, i) => (b === null ? !running.some((a) => a.worker === i) : w.attempts[b].worker === i && w.attempts[b].status === 'running'))).toBe(true);
  }
  // no two attempts overlap on one worker, from the finished record alone
  for (let wk = 0; wk < WORKERS; wk++) {
    const mine = world.attempts.filter((a) => a.worker === wk).sort((a, b) => a.start - b.start);
    for (let i = 1; i < mine.length; i++) expect(mine[i].start, `${label}: overlap on worker ${wk}`).toBeGreaterThanOrEqual(mine[i - 1].end ?? world.tick);
  }
  // a re-run starts after the failure that caused it
  for (const a of world.attempts.filter((x) => x.redo)) expect(cfg.kills.some((k) => k.tick <= a.start), `${label}: a re-run before any failure`).toBe(true);
}

function checkOutput(world: World, cfg: ClusterConfig, words: readonly string[], label: string) {
  expect(world.done, `${label}: job did not finish`).toBe(true);
  const out = outputOf(world, cfg.plan);
  expect(out.complete).toBe(true);
  expect(sameResult(out.result, reference(cfg.plan.job, words)), `${label}: the table differs from the single-process answer`).toBe(true);
  // every reduce task's winning attempt read each map output exactly once, and no reduce task has two winners
  for (let r = 0; r < cfg.plan.reducers; r++) {
    const winner = world.attempts[world.tasks[`reduce-${r}`].by!];
    expect(winner.reads.map((x) => x.map).sort(), `${label}: reduce ${r} read a map output twice or missed one`).toEqual(Array.from({ length: cfg.plan.mappers }, (_, i) => i));
    expect(world.attempts.filter((a) => a.task === `reduce-${r}` && a.status === 'done')).toHaveLength(1);
  }
  if (cfg.plan.job === 'wordcount') {
    // no record counted twice: every word counted exactly once in the output
    const total = [...out.result.values()].reduce((a, b) => a + b, 0);
    expect(total, `${label}: records counted ${total} times for ${words.length} words`).toBe(words.length);
  }
}

describe('safety over seeded failure schedules (up to 2 failures, any timing)', () => {
  it('for every (M, R) in 1..6 x 1..4, with and without the combiner and backups, 200 seeded schedules leave the table equal to the single-process count', () => {
    const words = wordsOf(PRESET_SHORT);
    for (let m = 1; m <= 6; m++) {
      for (let r = 1; r <= 4; r++) {
        for (const combiner of ['off', 'sum'] as CombinerId[]) {
          for (const speculate of [false, true]) {
            const p = plan({ job: 'wordcount', combiner, words, mappers: m, reducers: r });
            const clean = simulate({ plan: p, speeds: evenSpeeds(), speculate, kills: [] }).world;
            for (const seed of seeds) {
              const cfg: ClusterConfig = { plan: p, speeds: evenSpeeds(), speculate, kills: killSchedule(seed, clean.finishedAt! + 2) };
              const { world, history } = simulate(cfg);
              const label = `M${m} R${r} ${combiner} spec=${speculate} seed ${seed}`;
              checkOutput(world, cfg, words, label);
              if (seed % 20 === 0) checkRun(history, world, cfg, label);
            }
          }
        }
      }
    }
  }, 180_000);

  it('the paragraph, both jobs, with a slow machine too: 200 schedules each, every state checked', () => {
    for (const job of ['wordcount', 'avglen'] as JobId[]) {
      for (const [m, r] of [[1, 1], [3, 2], [6, 4]] as const) {
        for (const speculate of [false, true]) {
          const p = plan({ job, combiner: 'sum', words: EVEN_WORDS, mappers: m, reducers: r });
          const speeds = speculate ? [100, 100, 25] : evenSpeeds();
          const clean = simulate({ plan: p, speeds, speculate, kills: [] }).world;
          for (const seed of seeds) {
            const cfg: ClusterConfig = { plan: p, speeds, speculate, kills: killSchedule(seed, clean.finishedAt! + 2) };
            const { world, history } = simulate(cfg);
            const label = `${job} M${m} R${r} spec=${speculate} seed ${seed}`;
            checkOutput(world, cfg, EVEN_WORDS, label);
            checkRun(history, world, cfg, label);
          }
        }
      }
    }
  }, 240_000);

  it('liveness is separate: with all workers dead the job stalls and is never reported done; with one left it finishes', () => {
    const p = plan({ job: 'wordcount', combiner: 'off', words: EVEN_WORDS, mappers: 4, reducers: 3 });
    const all: Kill[] = [{ worker: 0, tick: 5 }, { worker: 1, tick: 6 }, { worker: 2, tick: 7 }];
    const dead = simulate({ plan: p, speeds: evenSpeeds(), speculate: false, kills: all });
    expect(dead.world.stalled).toBe(true);
    expect(dead.world.done).toBe(false);
    expect(dead.world.finishedAt).toBeNull();
    expect(dead.world.tick).toBeLessThan(HORIZON);
    expect(dead.world.events.at(-1)!.text).toBe('no worker left: the job cannot finish');
    expect(outputOf(dead.world, p).complete).toBe(false);
    const one = simulate({ plan: p, speeds: evenSpeeds(), speculate: false, kills: all.slice(0, 2) });
    expect(one.world.done).toBe(true);
  });

  it('killing a worker twice, or after the job, changes nothing', () => {
    const p = plan({ job: 'wordcount', combiner: 'off', words: EVEN_WORDS, mappers: 4, reducers: 3 });
    const base = { plan: p, speeds: evenSpeeds(), speculate: false };
    const once = simulate({ ...base, kills: [{ worker: 1, tick: 12 }] });
    const twice = simulate({ ...base, kills: [{ worker: 1, tick: 12 }, { worker: 1, tick: 20 }] });
    expect(twice.world.finishedAt).toBe(once.world.finishedAt);
    expect(twice.world.attempts).toEqual(once.world.attempts);
    const clean = simulate({ ...base, kills: [] });
    const late = simulate({ ...base, kills: [{ worker: 0, tick: clean.world.finishedAt! + 5 }] });
    expect(late.world.attempts).toEqual(clean.world.attempts);
  });

  it('the same seed gives the same history, and the shared tick sim replays it step for step', () => {
    const p = plan({ job: 'wordcount', combiner: 'off', words: EVEN_WORDS, mappers: 4, reducers: 3 });
    const cfg: ClusterConfig = { plan: p, speeds: evenSpeeds(), speculate: true, kills: killSchedule(5, 40) };
    const a = simulate(cfg);
    const b = simulate(cfg);
    expect(JSON.stringify(a.history)).toBe(JSON.stringify(b.history));
    const work = workOf(p);
    const sim = createTickSim<World>({ seed: 1, init: () => startWorld(cfg), step: (w) => stepWorld(w, cfg, work) });
    for (const k of [0, 7, 20, a.history.length - 1]) expect(sim.at(k)).toEqual(a.history[k]);
  });
});

describe('what the stage claims about the scheduler rules', () => {
  it('a finished map task on a dead worker is run again, and a scheduler that forgets to do so gets wrong counts on some seed (lowest named)', () => {
    const p = plan({ job: 'wordcount', combiner: 'off', words: EVEN_WORDS, mappers: 4, reducers: 3 });
    const clean = simulate({ plan: p, speeds: evenSpeeds(), speculate: false, kills: [] }).world.finishedAt!;
    let lowest: number | null = null;
    for (const seed of seeds) {
      const kills = killSchedule(seed, clean + 2);
      const right = simulate({ plan: p, speeds: evenSpeeds(), speculate: false, kills });
      checkOutput(right.world, { plan: p, speeds: evenSpeeds(), speculate: false, kills }, EVEN_WORDS, `plain seed ${seed}`);
      const forgetful = simulate({ plan: p, speeds: evenSpeeds(), speculate: false, kills, redoLostMaps: false });
      const out = outputOf(forgetful.world, p);
      const ok = forgetful.world.done && sameResult(out.result, reference('wordcount', EVEN_WORDS));
      if (!ok && lowest === null) lowest = seed;
    }
    expect(lowest).not.toBeNull();
    // the reason: that schedule kills a worker that already held a finished map task
    const kills = killSchedule(lowest!, clean + 2);
    const hist = simulate({ plan: p, speeds: evenSpeeds(), speculate: false, kills: [] }).history;
    expect(kills.some((k) => k.tick < hist.length && hist[k.tick].attempts.some((a) => a.kind === 'map' && a.status === 'done' && a.worker === k.worker))).toBe(true);
  }, 180_000);

  it('a finished reduce task is not run again after its worker dies', () => {
    const p = plan({ job: 'wordcount', combiner: 'off', words: EVEN_WORDS, mappers: 4, reducers: 3 });
    const clean = simulate({ plan: p, speeds: evenSpeeds(), speculate: false, kills: [] });
    const finishedReduce = clean.world.attempts.find((a) => a.kind === 'reduce' && a.status === 'done')!;
    const kill: Kill = { worker: finishedReduce.worker, tick: finishedReduce.end! };
    const after = simulate({ plan: p, speeds: evenSpeeds(), speculate: false, kills: [kill] });
    expect(after.world.attempts.filter((a) => a.task === finishedReduce.task && a.status === 'done')).toHaveLength(1);
    expect(after.world.attempts.filter((a) => a.task === finishedReduce.task)).toHaveLength(1);
  });

  it('every task runs after the barrier: no reducer starts before the last map has finished with its output on a live worker', () => {
    for (const seed of seeds) {
      const p = plan({ job: 'wordcount', combiner: 'off', words: EVEN_WORDS, mappers: 4, reducers: 3 });
      const kills = killSchedule(seed, 60);
      const { world, history } = simulate({ plan: p, speeds: evenSpeeds(), speculate: false, kills });
      for (const a of world.attempts.filter((x) => x.kind === 'reduce')) {
        const before = history[a.start];
        for (let m = 0; m < 4; m++) {
          const st = before.tasks[`map-${m}`];
          expect(st.done && before.alive[before.attempts[st.by!].worker], `seed ${seed}: reducer ${a.index} started at ${a.start} without map ${m}`).toBe(true);
        }
      }
    }
  });
});

describe('stragglers and backups, computed', () => {
  it('a skewed input leaves one reducer far longer than the rest, and a backup does not shorten the job (the data is slow on any machine)', () => {
    const f = stragglerFacts();
    expect(f.skew.on).toBe(f.skew.off);
    const run = runCluster({ words: SKEWED_WORDS, speculate: true });
    const reduce = run.world.attempts.filter((a) => a.kind === 'reduce' && a.status === 'done');
    const lengths = reduce.map((a) => a.end! - a.start).sort((a, b) => a - b);
    expect(lengths.at(-1)!).toBeGreaterThan(2 * lengths[0]);
    expect(run.straggler).not.toBeNull();
    expect(run.world.attempts[run.straggler!].kind).toBe('reduce');
    const heavy = run.plan.parts.map((p) => p.length);
    expect(Math.max(...heavy) / SKEWED_WORDS.length).toBeGreaterThan(HOT_SHARE);
  });

  it('a slow machine stretches the job and a backup on a fast one shortens it', () => {
    const f = stragglerFacts();
    expect(f.slow.on).toBeLessThan(f.slow.off);
    expect(f.even.on).toBe(f.even.off);
    const run = runCluster({ words: EVEN_WORDS, speeds: [100, 100, 25], speculate: true });
    expect(run.world.attempts.some((a) => a.backup && a.status === 'done')).toBe(true);
    expect(run.world.attempts.some((a) => a.status === 'cancelled')).toBe(true);
    expect(run.correct).toBe(true);
  });

  it('a backup is only ever started for a task that has run at least BACKUP_AFTER ticks, on an idle worker, and the first copy to finish wins', () => {
    const run = runCluster({ words: EVEN_WORDS, speeds: [100, 100, 25], speculate: true });
    for (const b of run.world.attempts.filter((a) => a.backup)) {
      const original = run.world.attempts.find((a) => a.task === b.task && !a.backup)!;
      expect(b.start - original.start).toBeGreaterThanOrEqual(BACKUP_AFTER);
      const winners = run.world.attempts.filter((a) => a.task === b.task && a.status === 'done');
      expect(winners).toHaveLength(1);
    }
  });
});

describe('a map function with a side effect (the broken mode)', () => {
  it('the pinned seed is the lowest whose failure schedule leaves the side-effect counter wrong, and the reason is a map task that ran twice', () => {
    let lowest: number | null = null;
    for (const seed of seeds) {
      const run = counterRun(seed);
      const wrong = sideEffectCount(run.world) !== inputRecords(run.plan);
      const reran = Array.from({ length: 4 }, (_, m) => run.world.attempts.filter((a) => a.task === `map-${m}`).length).some((n) => n > 1);
      expect(wrong, `seed ${seed}: the counter is wrong exactly when some map task ran twice`).toBe(reran);
      expect(run.violation !== null).toBe(wrong);
      expect(run.correct, `seed ${seed}: the word counts stay right either way`).toBe(true);
      if (wrong && lowest === null) lowest = seed;
    }
    expect(lowest).toBe(BROKEN_SEED);
  }, 180_000);

  it('by trace and counterfactual at the pinned seed: the counter exceeds the input by the words of the re-run map task, and without that kill it matches', () => {
    const run = counterRun(BROKEN_SEED);
    const [kill] = run.cfg.kills;
    expect(run.cfg.kills).toHaveLength(1);
    // the trace: that worker held a finished map task when it died
    const held = run.world.attempts.filter((a) => a.kind === 'map' && a.worker === kill.worker && a.status === 'done' && a.end! <= kill.tick);
    expect(held.length).toBeGreaterThan(0);
    // independent count of the extra work: each held map task's words again, plus the part a killed attempt got through
    const extra = held.reduce((n, a) => n + run.plan.splits[a.index].length, 0) + run.world.attempts.filter((a) => a.status === 'killed' && a.kind === 'map').reduce((n, a) => n + a.processed, 0);
    expect(sideEffectCount(run.world)).toBe(inputRecords(run.plan) + extra);
    const noKill = counterRun(BROKEN_SEED, []);
    expect(sideEffectCount(noKill.world)).toBe(inputRecords(noKill.plan));
    expect(noKill.violation).toBeNull();
  });

  it('the side effect never changes the word counts or the schedule: the same kills give the same attempts with the check on or off', () => {
    const on = runCluster({ words: EVEN_WORDS, kills: [{ worker: 0, tick: 17 }], checkCounter: true });
    const off = runCluster({ words: EVEN_WORDS, kills: [{ worker: 0, tick: 17 }] });
    expect(on.world.attempts).toEqual(off.world.attempts);
    expect(on.correct && off.correct).toBe(true);
  });
});

describe('the "worker dies" demo the try-this uses', () => {
  it('one tick before the last map finishes, killing worker 1 loses a finished map output and lengthens the job, and the table stays right', () => {
    const d = killDemo();
    expect(d.heldFinishedMaps).toBeGreaterThan(0);
    expect(d.reruns).toBeGreaterThan(0);
    expect(d.afterEnd).toBeGreaterThan(d.cleanEnd);
    expect(d.correct).toBe(true);
  });
});
