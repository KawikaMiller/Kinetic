/** mapreduce-batch: the scene defaults and the numbers the try-this entries and captions quote, each computed from the model. */
import { evenSpeeds, inputRecords, killSchedule, sideEffectCount, slowLastSpeeds, type Kill } from './cluster';
import { plan, reference, sameResult, type Plan } from './job';
import { EVEN_WORDS, PRESET_LONG, PRESET_SHORT, SKEWED_WORDS, wordsOf } from './text';
import { jobEnd, rerunCount, runCluster, type ClusterRun } from './timeline';

/** Scene 1 opens on the short sentence with these task counts. */
export const FLOW_MAPPERS = 2;
export const FLOW_REDUCERS = 2;
/** Scene 2 runs the paragraph on two mappers and two reducers: two splits of different sizes, so averages of averages go wrong. */
export const COMBINER_MAPPERS = 2;
export const COMBINER_REDUCERS = 2;
export const COMBINER_WORDS: string[] = wordsOf(PRESET_LONG);

export const flowPlan = (words: readonly string[] = wordsOf(PRESET_SHORT), m = FLOW_MAPPERS, r = FLOW_REDUCERS): Plan =>
  plan({ job: 'wordcount', combiner: 'off', words, mappers: m, reducers: r });

/** The shuffle's size in key-value records with each combiner choice, and the first key whose average goes wrong under the naive one. */
export function combinerFacts() {
  const base = { words: COMBINER_WORDS, mappers: COMBINER_MAPPERS, reducers: COMBINER_REDUCERS };
  const count = (combiner: 'off' | 'sum') => plan({ ...base, job: 'wordcount', combiner }).shuffled;
  const avg = (combiner: 'off' | 'sum' | 'naive') => plan({ ...base, job: 'avglen', combiner });
  const truth = reference('avglen', COMBINER_WORDS);
  const naive = avg('naive').result;
  const wrongKeys = [...truth].filter(([k, v]) => Math.abs((naive.get(k) ?? NaN) - v) > 1e-9).map(([k]) => k).sort();
  return {
    off: count('off'),
    sum: count('sum'),
    wrongKeys,
    firstWrong: wrongKeys[0],
    truth: truth.get(wrongKeys[0])!,
    naive: naive.get(wrongKeys[0])!,
    sumCorrect: sameResult(avg('sum').result, truth),
    offCorrect: sameResult(avg('off').result, truth),
  };
}

/** The wall time (ticks) of the straggler scenes, with and without backups. */
export function stragglerFacts() {
  const wall = (words: readonly string[], speeds: readonly number[], speculate: boolean) => jobEnd(runCluster({ words, speeds, speculate }));
  return {
    skew: { off: wall(SKEWED_WORDS, evenSpeeds(), false), on: wall(SKEWED_WORDS, evenSpeeds(), true) },
    slow: { off: wall(EVEN_WORDS, slowLastSpeeds(), false), on: wall(EVEN_WORDS, slowLastSpeeds(), true) },
    even: { off: wall(EVEN_WORDS, evenSpeeds(), false), on: wall(EVEN_WORDS, evenSpeeds(), true) },
  };
}

/** The kill the "A worker dies" try-this makes: worker 1, one tick before the last map task finishes. */
export function killDemo() {
  const clean = runCluster({ words: EVEN_WORDS });
  const barrier = Math.max(...clean.world.attempts.filter((a) => a.kind === 'map' && a.status === 'done').map((a) => a.end!));
  const kill: Kill = { worker: 0, tick: barrier - 1 };
  const after = runCluster({ words: EVEN_WORDS, kills: [kill] });
  const heldFinishedMaps = clean.history[kill.tick].attempts.filter((a) => a.kind === 'map' && a.status === 'done' && a.worker === kill.worker).length;
  return { clean, after, kill, barrier, heldFinishedMaps, reruns: rerunCount(after.world), correct: after.correct, cleanEnd: jobEnd(clean), afterEnd: jobEnd(after) };
}

/** Scene 5's job: the paragraph on four mappers and three reducers with the plain scheduler. */
export function counterRun(seed: number, kills?: readonly Kill[]): ClusterRun {
  const clean = runCluster({ words: EVEN_WORDS });
  return runCluster({ words: EVEN_WORDS, kills: kills ?? killSchedule(seed, jobEnd(clean) + 2), checkCounter: true });
}

/** The lowest seed whose failure schedule makes the side-effect counter wrong: pinned, and shown as scene 5's seed. */
export const BROKEN_SEED = 1;

export function counterFacts(seed: number = BROKEN_SEED) {
  const run = counterRun(seed);
  return { run, counter: sideEffectCount(run.world), records: inputRecords(run.plan), wordCountsRight: run.correct, kills: run.cfg.kills, violated: run.violation !== null };
}

/** What the first scene shows at its defaults, and with one reducer. */
export function flowFacts() {
  const p = flowPlan();
  const one = flowPlan(wordsOf(PRESET_SHORT), FLOW_MAPPERS, 1);
  return { words: p.words.length, pairs: p.shuffled, loads: p.parts.map((x) => x.length), oneLoad: one.parts[0].length, sameTable: sameResult(p.result, one.result), top: [...p.result].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0] };
}
