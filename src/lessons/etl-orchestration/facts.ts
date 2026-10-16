/** etl-orchestration: the numbers the try-this entries and captions quote, each computed from the model at the scene's default. */
import { DAYS, HORIZON_HOURS, dayStatus, keyOf, runPipeline, triggerHour, type Config, type Op, type World } from './engine';
import { hourLabel, weekDate } from './chart';
import { DEFAULT_FAIL_DAY, DEFAULT_FAIL_TASK, initialLoadScene, SCHEDULE_OPEN_HOUR } from './init';
import { BROKEN_SEED } from './scenario';
import { PAUSE_FROM, PAUSE_TO, SCHEDULE_START, createdBy, logicalDate, triggers } from './schedule';
import { rerunAfterRuleChange } from './shape';

export const baseConfig: Config = { retries: 0, mode: 'overwrite', failures: {}, ops: [], flaky: false };
export const finalOf = (cfg: Config, seed = 0): World => runPipeline(cfg, seed, HORIZON_HOURS).state;

/** The failure scene's try-this: inject a permanent failure into day 3's clean, then clear and rerun it. */
export function failureFacts() {
  const failing: Config = { ...baseConfig, failures: { [keyOf(DEFAULT_FAIL_DAY, DEFAULT_FAIL_TASK)]: { kind: 'permanent' } } };
  const stuck = finalOf(failing);
  const retried = finalOf({ ...failing, retries: 3 });
  const failedAt = stuck.runs[DEFAULT_FAIL_DAY].tasks[DEFAULT_FAIL_TASK].spans.at(-1)!.end;
  const clearOp: Op = { at: failedAt + 1, kind: 'clear', day: DEFAULT_FAIL_DAY, task: DEFAULT_FAIL_TASK };
  const cleared = finalOf({ ...failing, ops: [clearOp] });
  return {
    day: DEFAULT_FAIL_DAY + 1,
    date: weekDate(DEFAULT_FAIL_DAY),
    blocked: (['join', 'load_report'] as const).map((t) => stuck.runs[DEFAULT_FAIL_DAY].tasks[t].status),
    stuckRows: stuck.output[DEFAULT_FAIL_DAY],
    retriedAttempts: retried.runs[DEFAULT_FAIL_DAY].tasks[DEFAULT_FAIL_TASK].spans.length,
    clearedRows: cleared.output[DEFAULT_FAIL_DAY],
    source: cleared.source[DEFAULT_FAIL_DAY],
    clearOp,
    failedAt,
  };
}

/** The load scene: the pinned seed's schedule under append and under overwrite. */
export function loadFacts() {
  const s = initialLoadScene();
  const run = (mode: 'append' | 'overwrite') => finalOf({ ...baseConfig, mode, ops: s.ops }, s.seed);
  const append = run('append');
  const overwrite = run('overwrite');
  const dup = (w: World) => Array.from({ length: DAYS }, (_, d) => d).filter((d) => dayStatus(w, d) === 'duplicated');
  return {
    ops: s.ops,
    seed: BROKEN_SEED,
    appendDuplicated: dup(append).length,
    overwriteDuplicated: dup(overwrite).length,
    appendRows: append.output.reduce((a, b) => a + b, 0),
    overwriteRows: overwrite.output.reduce((a, b) => a + b, 0),
    sourceRows: overwrite.source.reduce((a, b) => a + b, 0),
  };
}

/** The ETL and ELT reruns after the cleaning rule changes. */
export function shapeFacts() {
  return { etl: rerunAfterRuleChange('etl'), elt: rerunAfterRuleChange('elt') };
}

/** The schedule scene: when the run for the logical date at the opening hour is created, and what a pause does. */
export function scheduleFacts() {
  const openDay = Math.floor(SCHEDULE_OPEN_HOUR / 24);
  const date = logicalDate(openDay);
  const closes = triggerHour(openDay);
  const missed = triggers(true, true).filter((t) => t.kind === 'caught-up');
  return {
    date,
    openLabel: hourLabel(SCHEDULE_START, SCHEDULE_OPEN_HOUR),
    runExistsAtOpening: createdBy(SCHEDULE_OPEN_HOUR, false, false).some((t) => t.day === openDay),
    closesLabel: hourLabel(SCHEDULE_START, closes),
    runsOn: createdBy(closes, false, false).filter((t) => t.day === openDay).length,
    missedDays: missed.length,
    onRuns: createdBy(PAUSE_TO, true, true).filter((t) => t.kind === 'caught-up').length,
    offRuns: createdBy(PAUSE_TO, true, false).filter((t) => t.kind === 'caught-up').length,
    pauseFromLabel: hourLabel(SCHEDULE_START, PAUSE_FROM),
    pauseToLabel: hourLabel(SCHEDULE_START, PAUSE_TO),
  };
}
