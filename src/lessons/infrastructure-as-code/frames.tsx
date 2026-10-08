import type { ReactNode } from 'react';
import { plural } from '../../core/format';
import type { Frame } from '../../core/types';
import { isNoop, planCounts, type ApplyRun, type Plan, type StepResult, type World } from './model';

export interface ApplyFrame extends Frame {
  /** Steps finished so far. */
  done: number;
  /** The cloud and the state after those steps. */
  world: World;
  /** The step that just ran (null before the first). */
  result: StepResult | null;
}

const OP_VERB = { destroy: 'Destroy', create: 'Create', update: 'Update' } as const;

function stepCaption(run: ApplyRun, k: number): ReactNode {
  const r = run.results[k];
  const { address, op } = r.step;
  const n = run.steps.length;
  const head = (
    <>
      Step {k + 1} of {n}: <b>{OP_VERB[op].toLowerCase()}</b> <code>{address}</code>.{' '}
    </>
  );
  if (r.status === 'skipped') return <>{head}<span className="hl">{r.message}</span>, so there is no id to give it and the tool doesn't try.</>;
  if (r.status === 'failed') return <>{head}<span className="hl bad">Failed: {r.message}.</span> The tool never recorded it, so it can't tell it is already there.</>;
  const deps = run.snapshots[k].state[address]?.deps ?? [];
  if (op === 'destroy') return <>{head}It goes {k === 0 ? 'first' : 'next'}: <span className="hl bad">{r.message}</span>, once everything that depends on it has gone.</>;
  if (op === 'update') return <>{head}<span className="hl">{r.message}</span>: same resource, same id.</>;
  return (
    <>
      {head}
      <span className="hl ok">{r.message}</span>
      {deps.length > 0 ? <>, after {deps.join(' and ')} existed.</> : <>. It depends on nothing, so it can go whenever its turn comes.</>}
    </>
  );
}

export function applyFrames(before: World, run: ApplyRun): ApplyFrame[] {
  const frames: ApplyFrame[] = [
    {
      done: 0,
      world: before,
      result: null,
      say: (
        <>
          Approved. Apply runs {plural(run.steps.length, 'step')} in dependency order: things being destroyed go first, dependents before what they depend on, then things being created
          or updated, dependencies first.
        </>
      ),
    },
  ];
  run.results.forEach((result, k) => {
    frames.push({ done: k + 1, world: run.snapshots[k], result, say: stepCaption(run, k) });
  });
  const count = (s: StepResult['status']) => run.results.filter((r) => r.status === s).length;
  const failed = count('failed');
  const skipped = count('skipped');
  frames.push({
    done: run.steps.length,
    world: run.final,
    result: run.results.at(-1) ?? null,
    hold: 2,
    say:
      failed + skipped === 0 ? (
        <>Apply complete: {plural(count('ok'), 'step')} succeeded. Plan again and the plan is empty, because the state and the cloud now match the config.</>
      ) : (
        <>
          Apply finished with problems: {count('ok')} ok, <span className="hl bad">{failed} failed</span>, {skipped} skipped. The cloud is unchanged where steps failed.
        </>
      ),
  });
  return frames;
}

/** The caption after Plan: counts and what the refresh found, all from the plan. */
export function planCaption(p: Plan): ReactNode {
  const n = planCounts(p);
  const found = p.drift.length + p.gone.length;
  const refreshNote =
    found > 0 ? (
      <>
        {' '}
        Refreshing first found <span className="hl orange">{plural(found, 'difference')}</span> between the state and the cloud.
      </>
    ) : null;
  if (isNoop(p)) return <>No changes: the config, the state and the cloud agree, so there is nothing to do.{refreshNote}</>;
  return (
    <>
      Plan: <span className="hl ok">{n.add} to add</span>, <span className="hl">{n.change} to change</span>, <span className="hl bad">{n.destroy} to destroy</span>. Nothing has changed yet:
      the plan is a preview.{refreshNote}
    </>
  );
}
