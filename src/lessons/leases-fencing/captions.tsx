import type { ReactNode } from 'react';
import { timeFrames, type TimedFrame } from '../../core/frames';
import { leaseEvents, domainEndMs, type LeaseEvent } from './events';
import { CLIENT_A, MODE_LABEL, statsAt, type FenceMode, type LeaseRun, type LeaseSetup, type Verdict } from './model';

export const secText = (ms: number) => `${(ms / 1000).toFixed(1)} s`;

/** What the store does with a write in each mode, one clause (used by the intro and by the table captions). */
export const MODE_RULE: Record<FenceMode, string> = {
  none: 'storage applies every write it receives',
  check: 'a client looks at its own clock and the lease expiry just before it writes, and storage applies every write',
  fence: 'storage remembers the highest token it has applied and rejects a lower one',
  'fence-random': 'storage rejects a token lower than the highest it has applied, but the lock service hands out random tokens',
};

/** The local clock reading of A at true time `t`, from the setup (offset and drift). */
const aClock = (setup: LeaseSetup, t: number) => t * (1 + setup.aDriftPpm / 1e6) + setup.aOffsetMs;

export function eventCaption(run: LeaseRun, ev: LeaseEvent): ReactNode {
  const { setup } = run;
  switch (ev.kind) {
    case 'grant':
      return (
        <>
          At {secText(ev.t)} the lock service grants the lease to {ev.grant.to} with <span className="hl violet">token {ev.grant.token}</span>. It runs {secText(setup.ttlMs)} on the lock service&apos;s own clock, until {secText(ev.t + setup.ttlMs)}
          {setup.heartbeatMs === null || ev.grant.to !== CLIENT_A ? '' : ' unless it is renewed'}.
        </>
      );
    case 'expiry':
      return (
        <>
          At {secText(ev.t)} the lease of {ev.grant.to} (token {ev.grant.token}) <span className="hl dim">lapses</span>: nobody renewed it in time. The lock service is free to hand it to the next in line.
        </>
      );
    case 'pause':
      return (
        <>
          At {secText(ev.t)} client A <span className="hl orange">freezes</span>
          {ev.until === null ? ' for the rest of the run' : <> for {secText(ev.until - ev.t)}</>} (a garbage-collection pause, a VM stall, a slow disk). From inside, nothing seems to have happened.
        </>
      );
    case 'resume':
      return (
        <>
          At {secText(ev.t)} client A wakes. Its own clock reads {secText(aClock(setup, ev.t))}, and it has no idea it was frozen: whatever it believed before the pause is still what it believes.
        </>
      );
    case 'abandon':
      return ev.why === 'check' ? (
        <>
          At {secText(ev.t)} {ev.node} checks its lease before writing: by its own clock the lease has run out, so it <span className="hl dim">stops</span> without writing.
        </>
      ) : (
        <>
          At {secText(ev.t)} the lock service tells {ev.node} that its lease is lost, so it <span className="hl dim">stops</span>.
        </>
      );
    case 'write': {
      const e = ev.entry;
      if (!e.applied && e.refusedNewest) {
        return (
          <>
            At {secText(ev.t)} {e.from}&apos;s write with token {e.token} reaches storage and is <span className="hl bad">rejected</span> (token {e.token} &lt; {e.highestBefore}) although it comes from the newest lease: the older lease drew a higher number, so storage turns the rightful holder away.
          </>
        );
      }
      if (!e.applied) {
        return (
          <>
            At {secText(ev.t)} {e.from}&apos;s write with token {e.token} reaches storage and is <span className="hl ok">rejected</span>: stale token {e.token} &lt; {e.highestBefore}. The newer value stays.
          </>
        );
      }
      if (e.stale) {
        return (
          <>
            At {secText(ev.t)} {e.from}&apos;s write with token {e.token} reaches storage and is <span className="hl bad">applied</span> although a newer lease&apos;s write had already landed: the stale value overwrites it.
          </>
        );
      }
      return (
        <>
          At {secText(ev.t)} {e.from}&apos;s write with token {e.token} reaches storage and is <span className="hl ok">applied</span>.
        </>
      );
    }
  }
}

export function introCaption(setup: LeaseSetup): ReactNode {
  const pause =
    setup.pauseMs === 0 ? 'Nobody is paused.' : `Client A is paused for ${secText(setup.pauseMs)}, ${setup.pauseAt === 'job' ? 'in the middle of its job' : 'just before its write leaves'}.`;
  return (
    <>
      <b>{MODE_LABEL[setup.mode]}</b>: {MODE_RULE[setup.mode]}. The lease lasts {secText(setup.ttlMs)}. {pause} Press play, or drag the timeline.
    </>
  );
}

export function summaryCaption(run: LeaseRun, verdict: Verdict | null): ReactNode {
  const s = statsAt(run, Infinity);
  return (
    <>
      At the end storage applied {s.applied} {s.applied === 1 ? 'write' : 'writes'} and rejected {s.rejected}
      {s.staleApplied > 0 ? (
        <>
          : <span className="hl bad">{s.staleApplied} stale {s.staleApplied === 1 ? 'write was' : 'writes were'} applied</span>
        </>
      ) : s.refusedNewest > 0 ? (
        <>
          : <span className="hl bad wrap">{s.refusedNewest} of the rejections turned away the newest lease&apos;s write</span>
        </>
      ) : (
        <>
          : <span className="hl ok">no stale write got through</span>
        </>
      )}
      , across {run.grants.length} {run.grants.length === 1 ? 'lease' : 'leases'}.{' '}
      {verdict ? <>The invariant check stopped at <span className="hl bad wrap">{verdict.rule}: {verdict.message}</span>.</> : <>All three invariants held at every step of this run.</>}
    </>
  );
}

/** Scene 3's closing caption: what the lapse cost, for the purpose the learner picked, read from the run. */
export function needsSummary(purpose: 'efficiency' | 'correctness', storeChecks: boolean, r: { jobsRun: number; staleApplied: number; rejected: number }): ReactNode {
  const repeated = Math.max(0, r.jobsRun - 1);
  if (purpose === 'efficiency') {
    return (
      <>
        {r.jobsRun} clients ran the job, so the lapse cost {repeated} repeated {repeated === 1 ? 'run' : 'runs'}: wasted work, which is all an efficiency lock stands to lose when repeating the job is safe (the lesson assumes it is for this purpose).
        {r.staleApplied > 0 ? ' Storage did apply a second, older result, and that is harmless only because the job is safe to repeat.' : ''}
      </>
    );
  }
  if (r.staleApplied > 0) {
    return (
      <>
        {storeChecks ? 'Storage checked tokens, yet' : 'Storage cannot check a token, so'} <span className="hl bad">{r.staleApplied} stale {r.staleApplied === 1 ? 'write was' : 'writes were'} applied</span>: for a lock that protects data the lapse corrupted it.
        {storeChecks ? '' : ' The token travelled with the write and nothing looked at it.'}
      </>
    );
  }
  return (
    <>
      Storage compared tokens and <span className="hl ok">rejected {r.rejected} stale {r.rejected === 1 ? 'write' : 'writes'}</span>: {r.jobsRun} clients ran the job, one result survived, and the data is intact because storage took part.
    </>
  );
}

/** The replay of a run: one frame per second-ish of its timeline, plus a captioned frame at every event. */
export function leaseFrames(run: LeaseRun, verdict: Verdict | null, summary?: ReactNode): TimedFrame[] {
  return timeFrames({
    end: domainEndMs(run),
    steps: 30,
    milestones: leaseEvents(run).map((ev) => ({ t: ev.t, say: eventCaption(run, ev) })),
    intro: introCaption(run.setup),
    summary: summary ?? summaryCaption(run, verdict),
    hold: 2.2,
  });
}
