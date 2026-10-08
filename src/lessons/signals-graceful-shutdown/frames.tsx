import type { ReactNode } from 'react';
import { plural } from '../../core/format';
import { createRecorder } from '../../core/recorder';
import type { Frame } from '../../core/types';
import { CHILD_PID, isZombie, LB_LAG, PARENT_PID, procTable, SIGTERM_AT, type ChildCase, type ShutdownRun } from './model';

export type Phase = 'running' | 'sigterm' | 'lb' | 'drain' | 'exit';

export interface ShutdownFrame extends Frame {
  now: number;
  phase: Phase;
}

export const sec = (t: number) => `${Number(t.toFixed(1))} s`;
const names = (xs: { label: string }[]) => xs.map((x) => x.label).join(', ');

export function shutdownFrames(run: ShutdownRun): ShutdownFrame[] {
  const rec = createRecorder<ShutdownFrame>({ now: 0, phase: 'running' });
  const inFlightAtTerm = run.requests.filter((r) => r.start < SIGTERM_AT && r.start + r.dur > SIGTERM_AT);
  rec.snap(<>The server is handling requests behind a load balancer. A deploy is about to replace it.</>, 1, { now: SIGTERM_AT - 1 });

  const term = (() => {
    switch (run.mode) {
      case 'none':
        return (
          <>
            The orchestrator sends <span className="hl">SIGTERM</span>. There's no handler, so the default action applies: the process terminates on the spot (it runs under a tiny init here; as a container's PID 1 it would ignore SIGTERM instead).{' '}
            <span className="hl bad">{plural(inFlightAtTerm.length, 'request')} in flight cut</span> ({names(inFlightAtTerm)}).
          </>
        );
      case 'pid1':
        return (
          <>
            The orchestrator sends <span className="hl">SIGTERM</span> to PID 1, which is <code>/bin/sh -c</code>, not the app. The shell doesn't pass it on, and PID 1 has no
            default action for signals it doesn't handle, so nothing happens at all.
          </>
        );
      default:
        return (
          <>
            The orchestrator sends <span className="hl">SIGTERM</span>. The app's handler runs: it marks itself not ready but keeps serving, because the load balancer hasn't
            noticed yet. {plural(inFlightAtTerm.length, 'request')} in flight.
          </>
        );
    }
  })();
  rec.snap(term, 1.6, { now: SIGTERM_AT, phase: 'sigterm' });

  // Later events, collected first and then played in time order (a short grace period can end before the LB notices).
  const events: { t: number; rank: number; say: ReactNode; hold: number; phase: Phase }[] = [];
  const refused = run.requests.filter((r) => r.fate === 'refused');
  const gone = run.exitAt <= run.lbRemoved;
  {
    events.push({ t: run.lbRemoved, rank: 0, phase: 'lb', hold: 1.4, say: (
      <>
        {LB_LAG} s later the load balancer <span className="hl violet">removes the instance</span>: new requests go to other replicas.{' '}
        {refused.length > 0 ? (
          <span className="hl bad">
            {plural(refused.length, 'request')} arrived in between and got an error: {gone ? 'the process was already gone (a 502 from the LB)' : 'nothing was accepting connections'}.
          </span>
        ) : run.handled && !gone ? (
          <>Requests that arrived in between were still served. Now the app closes its listening socket and drains.</>
        ) : (
          <>Requests that arrived in between were still served.</>
        )}
      </>
    ) });
  }

  if (run.mode !== 'none') {
    const ends = [...new Set(run.requests.filter((r) => r.fate === 'drained' && r.end > run.lbRemoved).map((r) => r.end))].sort((a, b) => a - b);
    for (const t of ends) {
      const done = run.requests.filter((r) => r.fate === 'drained' && r.end === t);
      const left = run.requests.filter((r) => r.start < t && r.end > t && (r.fate === 'drained' || r.fate === 'cut'));
      events.push({ t, rank: 1, phase: 'drain', hold: 1, say: (
        <>
          {sec(t)}: {names(done)} finished <span className="hl ok">normally</span>. {left.length ? <>{plural(left.length, 'request')} still running.</> : <>Nothing is in flight now.</>}
        </>
      ) });
    }
  }

  const cut = run.requests.filter((r) => r.fate === 'cut');
  const exit = run.killed ? (
    <>
      {sec(run.exitAt)}: the {run.grace} s grace period is over, so the orchestrator sends <span className="hl bad">SIGKILL</span>. It can't be caught or ignored: the process
      dies with exit code {run.exitCode}.{' '}
      {cut.length ? <span className="hl bad">{plural(cut.length, 'request')} cut ({names(cut)}).</span> : <>Nothing was running, but the deploy waited the whole grace period.</>}
    </>
  ) : run.mode === 'none' ? null : (
    <>
      {sec(run.exitAt)}: with every request drained, the app closes its database pool and <span className="hl ok">exits 0</span>, {sec(SIGTERM_AT + run.grace - run.exitAt)} before
      the deadline.
    </>
  );
  if (exit) events.push({ t: run.exitAt, rank: 2, phase: 'exit', hold: 1.6, say: exit });
  events.sort((a, b) => a.t - b.t || a.rank - b.rank).forEach((e) => rec.snap(e.say, e.hold, { now: e.t, phase: e.phase }));

  const lost = run.requests.filter((r) => r.fate === 'cut' || r.fate === 'refused').length;
  rec.close(
    <>
      {lost === 0 ? <span className="hl ok">No request failed.</span> : <span className="hl bad">{plural(lost, 'request')} failed.</span>} Exit code {run.exitCode}
      {run.exitCode === 0 ? ' (clean)' : run.killed ? ' (128 + 9: SIGKILL)' : ' (128 + 15: SIGTERM)'}.{' '}
      {run.mode === 'pid1' ? <>Fix: the exec form of CMD, so the app is PID 1 and handles SIGTERM itself, or a tiny init (tini, docker run --init) that forwards it.</> : null}
    </>,
    2,
  );
  return rec.frames;
}

// ---- Zombies ---------------------------------------------------------------------

export interface ZombieFrame extends Frame {
  step: number;
}

export const psLines = (c: ChildCase, step: number) => [
  '  PID  PPID STAT CMD',
  ...procTable(c, step).map((p) => `${String(p.pid).padStart(5)} ${String(p.ppid).padStart(5)} ${p.state === 'zombie' ? 'Z   ' : 'S   '} ${p.name}${isZombie(p) ? ' <defunct>' : ''}`),
];

export function zombieFrames(c: ChildCase): ZombieFrame[] {
  const rec = createRecorder<ZombieFrame>({ step: 0 });
  rec.snap(<>The server (PID {PARENT_PID}) has started a worker child (PID {CHILD_PID}).</>, 1, { step: 0 });
  const zombie = (step: number) => procTable(c, step).some(isZombie);
  if (c === 'orphan') {
    rec.snap(<>The server exits first. Its child is an orphan, so the kernel re-parents it to PID 1 (its PPID is now 1).</>, 1.4, { step: 1 });
    rec.snap(<>When the worker exits, PID 1 collects its exit status, so no zombie is left: reaping orphans is part of init's job, and why a container's PID 1 needs to do it too.</>, 1.4, { step: 2 });
  } else {
    rec.snap(
      <>
        The worker exits. The kernel keeps its PID and exit status until the parent calls <code>wait()</code>: for now it is a{' '}
        <span className="hl">zombie</span> (<code>&lt;defunct&gt;</code> in ps), and the kernel sends the parent SIGCHLD.
      </>,
      1.4,
      { step: 1 },
    );
    rec.snap(
      c === 'reap' ? (
        <>The parent's SIGCHLD handler calls <code>waitpid()</code>, so the zombie is reaped and its PID freed.</>
      ) : (
        <>The parent ignores SIGCHLD and never calls <code>wait()</code>, so the zombie stays, holding its PID. Enough of them and the system runs out of PIDs.</>
      ),
      1.4,
      { step: 2 },
    );
  }
  rec.close(zombie(2) ? <>Still a zombie: exited, and not reaped by its parent.</> : <>No zombie left: every exited child was reaped.</>, 1.5);
  return rec.frames;
}
