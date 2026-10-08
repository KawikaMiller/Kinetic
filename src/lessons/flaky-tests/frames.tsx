import type { ReactNode } from 'react';
import { pct, plural } from '../../core/format';
import { exactGreen, quarantinedFlakes, unfixedSources, type BatchSummary, type Config, type Run } from './sim';

/** Before anything has run. */
export const introCaption = (): ReactNode => (
  <>Ten checkout tests, five of them with a planted flake. Press <b>Run ×100</b> to run the suite 100 times, each run with its own seed.</>
);

/** A toggle flipped with no batch on screen: what changed and the new exact chance. */
export const toggleCaption = (what: string, on: boolean, exact: number): ReactNode => (
  <>{what}: {on ? 'on' : 'off'}. The exact chance a run is green is now {pct(exact, 1)}. Press <b>Run ×100</b> to watch it.</>
);

/** After a batch (or after a toggle re-ran the same 100 seeds): every number from the summary. */
export function batchCaption(s: BatchSummary, cfg: Config): ReactNode {
  const green = s.pass + s.retried;
  const exact = exactGreen(cfg);
  const parked = quarantinedFlakes(cfg).length;
  const head = <>{green} of {s.runs} runs green (the exact chance per run is {pct(exact, 1)}{parked ? `, not counting the ${plural(parked, 'quarantined flaky test')}` : ''}).</>;
  const parkedNote = parked ? <> {plural(parked, 'quarantined test')} still {parked === 1 ? 'flakes' : 'flake'}; the build just ignores {parked === 1 ? 'it' : 'them'}.</> : null;
  const retried = s.retried > 0 ? (
    <> <span className="hl orange">{s.retried}</span> of them went green only after a retry.</>
  ) : null;
  const hidden = s.realBugsHidden > 0 ? (
    <> The real race in reserveStock tripped in <span className="hl bad">{plural(s.realBugsHidden, 'run')}</span> without being reported
      as a failure: the bug is still there, and customers will hit it.</>
  ) : s.realBugsCaught > 0 ? (
    <> {s.realBugsCaught} red {s.realBugsCaught === 1 ? 'run was' : 'runs were'} the real race in reserveStock: a product bug, not a test bug.</>
  ) : null;
  if (s.fail === 0 && s.retried === 0 && s.realBugsHidden === 0) {
    const clean = unfixedSources(cfg).length === 0;
    return <>{head} All {s.runs} passed first time{clean ? ': nothing left can flake.' : exact === 1 ? ': nothing left can fail the build.' : ', but the exact chance says this batch was lucky.'}{parkedNote}</>;
  }
  return <>{head}{retried}{hidden}{parkedNote}</>;
}

/** One line per test of a run, for the console under the grid. */
export function runLines(run: Run): { text: string; tone: 'ok' | 'bad' | 'orange' | 'muted' }[] {
  return run.tests.map((t) => {
    const first = t.attempts[0];
    if (t.quarantined) {
      const what = t.outcome === 'failed' ? `failed, ignored: ${t.attempts[t.attempts.length - 1].reason}` : t.outcome === 'retried' ? 'passed on a retry' : 'passed';
      return { text: `◌ ${t.id} (quarantined) ${what}`, tone: 'muted' };
    }
    if (t.outcome === 'passed') return { text: `✓ ${t.id}`, tone: 'ok' };
    if (t.outcome === 'retried') {
      return { text: `↻ ${t.id} passed on retry ${t.attempts.length - 1}; first try: ${first.reason}`, tone: 'orange' };
    }
    const tries = t.attempts.length > 1 ? ` (all ${t.attempts.length} tries)` : '';
    return { text: `✗ ${t.id}${tries}: ${t.attempts[t.attempts.length - 1].reason}`, tone: 'bad' };
  });
}

/** Verdict for one selected run, from its status. */
export function runCaption(run: Run): ReactNode {
  const failed = run.tests.filter((t) => t.outcome === 'failed' && !t.quarantined);
  const where = <>Run with seed <b>{run.seed}</b></>;
  if (run.status === 'pass') return <>{where} passed first time.{run.realBugHidden ? ' The real race tripped, but its test is quarantined.' : ''}</>;
  if (run.status === 'retried') {
    return <>{where} is <span className="hl orange">green after a retry</span>.{run.realBugHidden ? <> One of the retried failures was the <span className="hl bad">real race</span>: the retry hid a product bug.</> : ' The retry hid a flake.'}</>;
  }
  const race = run.tests.find((t) => t.source === 'race')!;
  const hiddenRace = run.realBugHidden ? (
    <> The real race tripped too, but {race.quarantined ? 'its test is quarantined' : 'passed on a retry'}, so it isn&apos;t in the list.</>
  ) : null;
  return <>{where} is <span className="hl bad">red</span>: {failed.map((t) => t.id).join(', ')} failed.{hiddenRace} Replay the seed to get the same order and the same draws back.</>;
}

/** What Replay shows: the run is a pure function of its seed, so the outcome is the same. */
export function replayCaption(run: Run): ReactNode {
  const outcome = run.status === 'pass' ? 'passed first time' : run.status === 'retried' ? 'went green after a retry' : 'failed';
  return <>Replayed seed <b>{run.seed}</b>: the same test order, the same draws and the same outcome (it {outcome}). The whole run is a function of its
    seed, so &quot;it failed once on CI&quot; becomes a failure you can rerun.</>;
}
