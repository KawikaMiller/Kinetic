import type { ReactNode } from 'react';
import { timeFrames, type TimedFrame } from '../../core/frames';
import type { Frame } from '../../core/types';
import { pctText } from '../../core/format';
import { dayRuns, fireLabel, type Cron } from './cron';
import { queueStatsAt, type QueueRun } from './queue';
import { DAY_HOURS, DAY_MS, HOUR_MS, MIN_MS, MISS_AFTER_MS, SCHED_LABEL, schedStatsAt, type SchedRun } from './sched';
import { clockLabel, rowWord } from './view';
import { WHEEL_SLOTS, heapOrder, inversions, runWheel, type WheelJob } from './wheel';

const secs = (ms: number) => `${(ms / 1000).toFixed(1)} s`;
const jobWord = (n: number) => (n === 1 ? 'job' : 'jobs');

/* ---------- scene 1: the wheel ---------- */

export interface WheelFrame extends Frame {
  tick: number;
}

/** One frame per tick; a caption at the ticks where something fires, and a closing summary. */
export function wheelFrames(jobs: readonly WheelJob[]): WheelFrame[] {
  const { firings, ticks } = runWheel(jobs);
  const delay = new Map(jobs.map((j) => [j.id, j.delay]));
  const heap = heapOrder(jobs);
  const flips = inversions(jobs);
  const intro = (
    <>
      The wheel has {WHEEL_SLOTS} slots and a pointer that moves one slot every second. Each job sits in slot (due tick) mod {WHEEL_SLOTS} with a count of laps still to go. Press play: a job fires when the pointer reaches its slot with no laps left.
    </>
  );
  const frames: WheelFrame[] = [{ tick: 0, say: intro }];
  for (let t = 1; t <= ticks; t++) {
    const here = firings.filter((f) => f.tick === t);
    if (here.length === 0) {
      frames.push({ tick: t });
      continue;
    }
    const names = here.map((f) => `job ${f.id} (due ${delay.get(f.id)} s)`).join(', then ');
    const wrongOrder = flips.filter(([a, b]) => here.some((f) => f.id === a) && here.some((f) => f.id === b));
    frames.push({
      tick: t,
      say: (
        <>
          Tick {t}: the pointer reaches slot {t % WHEEL_SLOTS} and fires {names}.
          {wrongOrder.length > 0 ? (
            <>
              {' '}
              <span className="hl orange wrap">The heap would have run job {wrongOrder[0][0]} first: both are due inside this tick, and the wheel keeps insertion order within a slot</span>.
            </>
          ) : null}
        </>
      ),
      hold: 1.6,
    });
  }
  frames.push({
    tick: ticks,
    say: (
      <>
        All {jobs.length} {jobWord(jobs.length)} fired, each at the tick that ends its delay: never early and under one tick late. The sorted queue would have fired them in the order {heap.map((id) => `job ${id}`).join(', ')}
        {flips.length === 0 ? ', which is the same order here' : `; the wheel differs for ${flips.length} ${flips.length === 1 ? 'pair' : 'pairs'}, always inside one tick`}.
      </>
    ),
    hold: 2,
  });
  return frames;
}

/* ---------- scene 2: the queue ---------- */

export function queueFrames(run: QueueRun, summary: ReactNode, intro: ReactNode): TimedFrame[] {
  const s = run.setup;
  const milestones: { t: number; say: ReactNode }[] = [];
  for (const e of run.events) {
    if (e.kind === 'visible') {
      milestones.push({ t: e.at, say: <>At {secs(e.at)} nobody has acknowledged job {e.job} within the {secs(s.visibilityMs)} window, so the queue makes it <span className="hl info">visible again</span> and hands it to someone else.</> });
    } else if (e.kind === 'retry' && e.attempt === 1) {
      milestones.push({ t: e.at, say: <>At {secs(e.at)} job {e.job} fails. The queue waits {secs(e.delayMs ?? 0)} ({s.jitter ? 'a random share of the backoff ceiling' : 'the backoff ceiling'}) and <span className="hl orange">retries</span>.</> });
    } else if (e.kind === 'dlq') {
      milestones.push({ t: e.at, say: <>At {secs(e.at)} job {e.job} has used all {e.attempt} of its attempts and goes to the <span className="hl violet">dead-letter queue</span>.</> });
    }
  }
  for (const r of run.runs) {
    if (r.end === null) continue;
    if (r.outcome === 'dup') {
      milestones.push({ t: r.end, say: <>At {secs(r.end)} job {r.job} finishes its <span className="hl bad">second run</span>: its effect is applied a second time.</> });
    } else if (r.outcome === 'noop') {
      milestones.push({ t: r.end, say: <>At {secs(r.end)} job {r.job} finishes a repeat run, and the idempotency key makes it a <span className="hl dim">no-op</span>.</> });
    } else if (r.outcome === 'killed') {
      milestones.push({ t: r.end, say: <>At {secs(r.end)} {r.worker} dies mid-job: nothing is acknowledged, so job {r.job} comes back when its window ends.</> });
    }
  }
  return timeFrames({ end: Math.max(1000, run.end + 500), steps: 24, milestones, intro, summary, hold: 2.2 });
}

export function queueIntro(run: QueueRun): ReactNode {
  const s = run.setup;
  return (
    <>
      A queue hands jobs to two workers and hides each for {secs(s.visibilityMs)}; job 2 takes {secs(s.longJobMs)}. {s.idempotent ? 'Every effect carries an idempotency key.' : 'Effects carry no key.'} Press play.
    </>
  );
}

export function queueSummary(run: QueueRun): ReactNode {
  const st = queueStatsAt(run, Infinity);
  return (
    <>
      At the end {st.done} {jobWord(st.done)} are done, {st.retries} {st.retries === 1 ? 'retry' : 'retries'} happened and {st.dlq} {jobWord(st.dlq)} sit in the dead-letter queue.{' '}
      {st.doubleEffects > 0 ? <span className="hl bad wrap">{st.doubleEffects} {st.doubleEffects === 1 ? 'effect was' : 'effects were'} applied twice</span> : <span className="hl ok">no effect was applied twice</span>}
      {st.duplicateRuns > 0 && st.doubleEffects === 0 ? <>: {st.duplicateRuns} repeat {st.duplicateRuns === 1 ? 'run was' : 'runs were'} harmless because of the key</> : null}.
    </>
  );
}

/** Under the retry panel: how many retries land in the busiest quarter second, with and without jitter. */
export function stormNote(peakLockstep: number, peakJitter: number, jobs: number, jitter: boolean): ReactNode {
  return (
    <>
      {jobs} jobs fail at the same moment. In the busiest quarter second {peakLockstep} retries land without jitter and {peakJitter} with it; the bars show {jitter ? 'full jitter' : 'no jitter'}. The jittered retries are {pctText(1 - peakJitter / peakLockstep, 0)} fewer at the peak.
    </>
  );
}

/* ---------- scene 3: cron on three replicas ---------- */

export function schedIntro(run: SchedRun): ReactNode {
  return (
    <>
      <b>{SCHED_LABEL[run.setup.mode]}</b>: three replicas hold the same job, <code>0 * * * *</code>, and it is due at the top of every hour. One cron minute is one second of simulated time here. Press play and watch a day of fires.
    </>
  );
}

export function schedFrames(run: SchedRun, summary: ReactNode): TimedFrame[] {
  const milestones: { t: number; say: ReactNode }[] = [];
  const first = run.rows[0];
  if (first) milestones.push({ t: first.at, say: <>At {clockLabel(first.at)} the first fire is due and {run.setup.mode === 'every' ? 'every replica runs it' : 'a replica runs it'}: {first.by} {rowWord(first)}.</> });
  run.grants.slice(1).forEach((g) => milestones.push({ t: g.at, say: <>At {clockLabel(g.at)} the lease passes to {g.to} with <span className="hl violet">token {g.token}</span>.</> }));
  if (run.pause) milestones.push({ t: run.pause.from, say: <>At {clockLabel(run.pause.from)} replica r1 <span className="hl orange">freezes</span> for {Math.round((run.pause.to - run.pause.from) / MIN_MS)} cron minutes. It still believes it leads.</> });
  if (run.pause) milestones.push({ t: run.pause.to, say: <>At {clockLabel(run.pause.to)} r1 wakes up with its old fire timer still pending.</> });
  if (run.crashedAt !== null) milestones.push({ t: run.crashedAt, say: <>At {clockLabel(run.crashedAt)} replica r1 is <span className="hl dim">killed</span>.</> });
  for (const r of run.rows) {
    if (r.duplicate) milestones.push({ t: r.at, say: <>At {clockLabel(r.at)} {r.by} {rowWord(r)}: the {clockLabel(r.fire * HOUR_MS)} fire has now <span className="hl bad">taken effect twice</span>.</> });
    else if (r.reason === 'stale token' && r.by === 'r1') milestones.push({ t: r.at, say: <>At {clockLabel(r.at)} the late run from {r.by} (token {r.token}) is <span className="hl ok">rejected</span>: a newer token is on record.</> });
  }
  const turned = run.rows.find((r) => r.reason === 'unique key');
  if (turned) milestones.push({ t: turned.at, say: <>At {clockLabel(turned.at)} {turned.by} tries to run the {clockLabel(turned.fire * HOUR_MS)} fire and the <span className="hl violet">unique key</span> refuses the second insert: one winner per fire, no leader needed.</> });
  for (const k of run.missed) milestones.push({ t: k * HOUR_MS + MISS_AFTER_MS, say: <>The {clockLabel(k * HOUR_MS)} fire <span className="hl bad">was missed</span>: no replica ran it, because nobody led when it was due.</> });
  return timeFrames({ end: DAY_MS, steps: 48, milestones, intro: schedIntro(run), summary, hold: 2.2 });
}

export function schedSummary(run: SchedRun): ReactNode {
  const st = schedStatsAt(run, Infinity);
  return (
    <>
      Over the day {st.applied} runs took effect across {DAY_HOURS} scheduled fires.{' '}
      {st.repeatedFires > 0 ? <span className="hl bad wrap">{st.repeatedFires} {st.repeatedFires === 1 ? 'fire' : 'fires'} took effect more than once ({st.extraRuns} extra {st.extraRuns === 1 ? 'run' : 'runs'})</span> : <span className="hl ok">no fire took effect twice</span>}
      {st.missed > 0 ? <>, <span className="hl bad">{st.missed} {st.missed === 1 ? 'fire was' : 'fires were'} missed</span></> : null}
      {st.turnedAway > 0 ? <>, and {st.turnedAway} {st.turnedAway === 1 ? 'attempt was' : 'attempts were'} turned away</> : null}.
    </>
  );
}

/* ---------- scene 4: cron expressions ---------- */

export interface DayCounts {
  byDom: number;
  byDow: number;
  both: number;
  runs: number;
}

/** For one month of a year (UTC): how many days the day-of-month field matches, the day-of-week field matches, both match, and the job runs. */
export function dayCounts(c: Cron, year: number, month1: number): DayCounts {
  const days = new Date(Date.UTC(year, month1, 0)).getUTCDate();
  const counts = { byDom: 0, byDow: 0, both: 0, runs: 0 };
  for (let d = 1; d <= days; d++) {
    const dow = new Date(Date.UTC(year, month1 - 1, d)).getUTCDay();
    const a = c.dom.values.has(d);
    const b = c.dow.values.has(dow);
    if (a) counts.byDom++;
    if (b) counts.byDow++;
    if (a && b) counts.both++;
    if (dayRuns(c, month1, d, dow)) counts.runs++;
  }
  return counts;
}

export function exprCaption(c: Cron, fires: readonly number[], month: string, counts: DayCounts): ReactNode {
  const restricted = !c.dom.star && !c.dow.star;
  return (
    <>
      Next fire: {fires.length > 0 ? fireLabel(fires[0]) : 'none within nine years'}.{' '}
      {restricted ? (
        <>
          Both day fields are restricted, so in the Vixie rule the job runs when <span className="hl orange">either</span> matches: in {month} that is {counts.byDom} {counts.byDom === 1 ? 'day' : 'days'} by day-of-month and {counts.byDow} by day-of-week, {counts.runs} in all ({counts.both} match both).
        </>
      ) : (
        <>A star in a day field means that field is not restricted, so every field has to match: {counts.runs} {counts.runs === 1 ? 'day' : 'days'} in {month}.</>
      )}
    </>
  );
}
