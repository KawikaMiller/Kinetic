import type { ReactNode } from 'react';
import { pad2 } from '../../core/format';
import type { Frame } from '../../core/types';
import { runPipeline, type PipelineOptions, type Run, type Scheduled } from './pipeline';

export type LiveStatus = 'pending' | 'running' | 'passed' | 'failed' | 'blocked' | 'cancelled';

export interface JobView {
  status: LiveStatus;
  /** 0..1 while running. */
  progress: number;
}

export interface PipelineFrame extends Frame {
  t: number;
  jobs: Record<string, JobView>;
}

/** Progress frames added between events so running bars visibly fill. */
const TICK_SECONDS = 20;

/** "5:42" for 342 seconds. */
export const minSec = (s: number) => `${Math.floor(s / 60)}:${pad2(Math.round(s % 60))}`;

function viewAt(s: Scheduled, t: number, failTime: number | null): JobView {
  const failedYet = failTime !== null && t >= failTime;
  if (s.start === null) return { status: failedYet ? s.status : 'pending', progress: 0 };
  if (t < s.start) return { status: 'pending', progress: 0 };
  if (t < s.end!) return { status: 'running', progress: (t - s.start) / (s.end! - s.start) };
  return { status: s.status, progress: 1 };
}

const names = (xs: Scheduled[]) => xs.map((s) => s.job.label).join(', ');

function describe(run: Run, t: number, failTime: number | null): ReactNode {
  const startedNow = run.jobs.filter((s) => s.start === t);
  const passedNow = run.jobs.filter((s) => s.end === t && s.status === 'passed');
  const failed = run.jobs.find((s) => s.status === 'failed');
  if (t === 0) {
    const install = run.jobs[0];
    return (
      <>
        Push received: the pipeline starts with <b>install</b>
        {install.job.cacheHit ? (
          <>
            , restored from the dependency cache: <span className="hl info">{install.job.duration}s</span> instead of a cold
            download.
          </>
        ) : (
          <>, downloading every dependency from scratch ({install.job.duration}s).</>
        )}
      </>
    );
  }
  if (failed && t === failTime) {
    const cancelled = run.jobs.filter((s) => s.status === 'cancelled');
    return (
      <>
        <span className="hl bad">✗ {failed.job.label} failed</span>: one test broke. Every job that depends on it is{' '}
        <b>blocked</b> and never runs{run.jobs.some((s) => s.job.id === 'deploy') ? ', including deploy' : ''}.
        {cancelled.length > 0 && <> Fail fast also cancels {names(cancelled)}.</>}
      </>
    );
  }
  const parts: ReactNode[] = [];
  if (passedNow.length) parts.push(<span key="p"><span className="hl ok">{names(passedNow)} passed</span> at {minSec(t)}. </span>);
  if (startedNow.length) {
    parts.push(
      <span key="s">
        {startedNow.length > 1 ? <>{names(startedNow)} start <b>in parallel</b>: none of them waits for the others.</> : <>{names(startedNow)} starts.</>}
      </span>,
    );
  }
  return parts.length ? <>{parts}</> : undefined;
}

function summary(run: Run): ReactNode {
  if (run.failed) {
    return (
      <>
        Red pipeline after <b>{minSec(run.wallClock)}</b>. Nothing past the failed job ran, so broken code can't reach{' '}
        {run.jobs.some((s) => s.job.id === 'deploy') ? 'production' : 'main'}. Read the log, fix the test, push again.
      </>
    );
  }
  return (
    <>
      Green in <span className="hl violet">{minSec(run.wallClock)}</span>, though the jobs add up to{' '}
      <b>{minSec(run.jobSeconds)}</b> of work. Wall-clock time is the longest chain of dependencies (the violet path), not the
      sum of every job.
    </>
  );
}

/** One frame per event (a job starting, passing, failing), plus ticks in between for progress. */
export function pipelineFrames(o: PipelineOptions): { run: Run; frames: PipelineFrame[] } {
  const run = runPipeline(o);
  const failed = run.jobs.find((s) => s.status === 'failed');
  const failTime = failed ? failed.end! : null;
  const events = [...new Set([0, ...run.jobs.flatMap((s) => (s.start === null ? [] : [s.start, s.end!]))])].sort((a, b) => a - b);

  const times: number[] = [];
  events.forEach((t, i) => {
    times.push(t);
    const next = events[i + 1];
    if (next === undefined) return;
    const ticks = Math.floor((next - t) / TICK_SECONDS);
    for (let k = 1; k < ticks; k++) times.push(t + ((next - t) * k) / ticks);
  });

  // Every frame carries a caption, so scrubbing straight to a progress tick still reads true:
  // ticks repeat the last event's caption quietly (no fade).
  let last: PipelineFrame['say'];
  const frames = times.map((t): PipelineFrame => {
    const jobs = Object.fromEntries(run.jobs.map((s) => [s.job.id, viewAt(s, t, failTime)]));
    const event = events.includes(t) ? describe(run, t, failTime) : undefined;
    if (event !== undefined) {
      last = event;
      return { t, jobs, say: event, hold: 1.6 };
    }
    return { t, jobs, say: last, quiet: true };
  });
  frames[frames.length - 1].say = summary(run);
  frames[frames.length - 1].hold = 3;
  return { run, frames };
}
