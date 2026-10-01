import { plural } from '../../core/format';
import type { Frame } from '../../core/types';
import { showArgv, type PipelineRun, type ShellResult, type StageRun } from './shell';

/** One step of the replay: a command running, or a whole pipeline skipped by && / ||. */
export type Step = { kind: 'stage'; pipeline: number; stage: number } | { kind: 'skip'; pipeline: number };

export interface ShellFrame extends Frame {
  /** How many steps have happened so far. */
  shown: number;
}

export function stepsOf(result: ShellResult): Step[] {
  return result.runs.flatMap((r, p): Step[] => (r.ran ? r.stages.map((_, s) => ({ kind: 'stage', pipeline: p, stage: s })) : [{ kind: 'skip', pipeline: p }]));
}

const where = (to: string) => (to === 'pipe' ? 'down the pipe' : to === 'terminal' ? 'to the terminal' : <>into <b>{to}</b></>);

function stageCaption(st: StageRun) {
  const cmd = <span className="hl info">{showArgv(st.argv)}</span>;
  const exit = <span className={`hl ${st.exit === 0 ? 'ok' : 'bad'}`}>exit {st.exit}</span>;
  return (
    <>
      {cmd} sends {plural(st.stdout.length, 'line')} {where(st.stdoutTo)}
      {st.stderr.length > 0 && <>, and an error on stderr {where(st.stderrTo)}</>}: {exit}.
    </>
  );
}

function skipCaption(run: PipelineRun, prevExit: number | null) {
  return (
    <>
      <span className="hl">{run.op}</span> skips <span className="hl info">{run.source}</span>: the last exit code was{' '}
      {prevExit}, and {run.op === '&&' ? '&& only continues after success (0)' : '|| only continues after a failure (not 0)'}.
    </>
  );
}

export function buildFrames(result: ShellResult): ShellFrame[] {
  if (result.error) return [{ shown: 0, say: <>The shell couldn't parse that: <span className="hl bad">{result.error}</span>.</> }];
  const steps = stepsOf(result);
  const frames: ShellFrame[] = [
    {
      shown: 0,
      say: result.runs.length > 1
        ? <>The shell splits the line into {result.runs.length} parts joined by ; && ||, and runs them left to right.</>
        : <>Each command's output (stdout) feeds the next command's input through the pipe.</>,
    },
  ];
  steps.forEach((step, k) => {
    const run = result.runs[step.pipeline];
    const prevExit = result.runs.slice(0, step.pipeline).reverse().find((r) => r.ran)?.exit ?? 0;
    frames.push({ shown: k + 1, say: step.kind === 'skip' ? skipCaption(run, prevExit) : stageCaption(run.stages[step.stage]) });
  });
  const last = frames[frames.length - 1];
  last.hold = 2;
  return frames;
}
