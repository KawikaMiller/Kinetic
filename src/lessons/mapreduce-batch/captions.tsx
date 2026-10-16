/** mapreduce-batch: every caption, built from the model on screen. No number here is typed. */
import type { ReactNode } from 'react';
import { plural } from '../../core/format';
import { inputRecords, sideEffectCount, taskName } from './cluster';
import type { CombinerId, JobId, Plan } from './job';
import { reference, sameResult, JOBS } from './job';
import { backupOutcomes, jobEnd, rerunCount, type ClusterRun } from './timeline';

const hl = (tone: string, text: ReactNode) => <span className={`hl ${tone}`}>{text}</span>;
const num = (n: number) => n.toLocaleString('en-US');
const ticks = (n: number) => plural(n, 'tick');

export function flowCaption(p: Plan, words: number, truncatedFrom: number | null): ReactNode {
  if (words === 0) return <>No words: nothing to split, map or reduce, so the table is empty.</>;
  const loads = p.parts.map((x) => x.length);
  const heaviest = loads.indexOf(Math.max(...loads));
  const equal = sameResult(p.result, reference('wordcount', p.words));
  return (
    <>
      {hl('', num(words))} {words === 1 ? 'word' : 'words'} are split into {plural(p.mappers, 'piece')}; each word becomes one {hl('info', '(word, 1)')} pair, so {hl('info', num(p.shuffled))} pairs reach the shuffle.
      {' '}
      {p.reducers === 1 ? 'The one reducer gets them all' : `Reducer ${heaviest + 1} gets the most, ${plural(loads[heaviest], 'pair')} of ${num(p.shuffled)}`}, each key landing on one reducer. The merged table {equal ? hl('ok wrap', 'equals the plain single-process count') : hl('bad wrap', 'differs from the plain count')}.
      {truncatedFrom !== null && <> Only the first {num(words)} of the {num(truncatedFrom)} words are used.</>}
    </>
  );
}

export function combinerCaption(job: JobId, combiner: CombinerId, off: number, withIt: number, wrongKeys: readonly string[], firstWrong: { key: string; truth: number; naive: number } | null): ReactNode {
  const what = JOBS.find((j) => j.id === job)!.what;
  const crossing = (
    <>
      {hl('info', num(withIt))} {withIt === 1 ? 'record crosses' : 'records cross'} the shuffle{combiner === 'off' ? '' : ` instead of ${num(off)}`}
      {combiner !== 'off' && withIt < off && <>, {hl('ok', `${num(off - withIt)} saved`)}</>}.
    </>
  );
  if (combiner === 'naive') {
    return (
      <>
        {crossing} Each mapper replaced its values by their average, so the reducer averages averages: {wrongKeys.length === 0 ? hl('ok', 'it happens to agree here') : hl('bad wrap', `${plural(wrongKeys.length, 'key')} come out wrong`)}
        {firstWrong && <>, {firstWrong.key}: {firstWrong.naive.toFixed(3)} against the true {firstWrong.truth.toFixed(3)}</>}. Carrying (sum, count) instead keeps the answer exact.
      </>
    );
  }
  return (
    <>
      {job === 'wordcount' ? 'Word count' : 'Average word length'} ({what}): {crossing}{' '}
      {combiner === 'off' ? 'A combiner would merge each mapper\'s records first, which is safe only when the reduce is associative and commutative.' : 'Adding (sum, count) pairs is associative and commutative, so the answer is exact.'}
    </>
  );
}

export const CAUSES = { none: 'No straggler', data: 'Skewed data', machine: 'A slow machine' } as const;
export type Cause = keyof typeof CAUSES;

export function stragglerCaption(run: ClusterRun, cause: Cause, speculate: boolean): ReactNode {
  const end = jobEnd(run);
  const slow = run.straggler === null ? null : run.world.attempts[run.straggler];
  const backups = backupOutcomes(run.world);
  const loads = run.plan.parts.map((p) => p.length);
  return (
    <>
      {CAUSES[cause]}: the job takes {hl('', ticks(end))}.
      {slow ? (
        <>
          {' '}
          The {hl('hi', `${taskName(slow.task)} on worker ${slow.worker + 1}`)} runs {ticks((slow.end ?? end) - slow.start)}, well over the median of its kind
          {cause === 'data' && <> ({plural(Math.max(...loads), 'record')} sent to one reducer against {plural(Math.min(...loads), 'record')} to another)</>}.
        </>
      ) : (
        <> No task runs far longer than its kind&rsquo;s median.</>
      )}
      {speculate &&
        (backups.length === 0 ? (
          <> No backup was needed: no idle worker saw a slow task.</>
        ) : (
          <>
            {' '}
            {backups.map((b) => `${taskName(b.task)}'s backup (started tick ${b.start}) ${b.won ? 'won the race' : 'lost the race'}`).join('; ')}.
          </>
        ))}
    </>
  );
}

export function failureCaption(run: ClusterRun, killsShown: number): ReactNode {
  const w = run.world;
  if (w.stalled) return <>{hl('bad', 'No worker left: the job cannot finish.')} Nothing is reported as done.</>;
  const reruns = rerunCount(w);
  if (killsShown === 0) return <>No failures yet: the job finishes at {hl('', `tick ${jobEnd(run)}`)} and the table {run.correct ? hl('ok', 'equals the single-process count') : hl('bad', 'is wrong')}.</>;
  return (
    <>
      {plural(killsShown, 'failure')}, {reruns === 0 ? 'and no task had to run again' : hl('bad', `${plural(reruns, 'task')} run again`)}: the job finishes at {hl('', `tick ${jobEnd(run)}`)} and the table{' '}
      {run.correct ? hl('ok', 'still equals the single-process count') : hl('bad', 'is wrong')}.
    </>
  );
}

export function counterCaption(run: ClusterRun, sideEffect: boolean, seed: number): ReactNode {
  const records = inputRecords(run.plan);
  const counter = sideEffectCount(run.world);
  const kills = run.cfg.kills;
  const schedule = kills.length === 0 ? `Seed ${seed} has no failures` : `Seed ${seed}: ${kills.map((k) => `worker ${k.worker + 1} fails at tick ${k.tick}`).join(', ')}`;
  if (!sideEffect) return <>{schedule}. The map function is pure: re-running a task changes nothing outside it, and the word counts {run.correct ? hl('ok', 'stay right') : hl('bad', 'are wrong')}.</>;
  return (
    <>
      {schedule}. Every record a map attempt handles bumps the external counter: it ends at {hl(counter === records ? 'ok' : 'bad', num(counter))} for {hl('', plural(records, 'record'))}
      {counter === records ? ', as it should.' : ', so a side effect leaked from tasks that ran twice.'} The word counts {run.correct ? hl('ok', 'stay right') : hl('bad', 'are wrong')} either way.
    </>
  );
}
