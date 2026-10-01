import type { ReactNode } from 'react';
import { duration, humanDuration } from '../../core/format';
import { BUGS, SPEC, type Bug, type Layer } from './model';
import type { RunStats } from './sim';

const CAUGHT_BY: Record<Layer, string> = {
  unit: 'Fast, and it points at the exact function.',
  integration: 'It narrows the problem to how two real pieces fit together.',
  e2e: 'It says checkout broke, not where: the hunt for the cause starts now.',
};

/** Suite time for captions: '10ms' early on, '17 min' later. */
const elapsed = (seconds: number) => (seconds < 60 ? duration(seconds) : humanDuration(seconds));

export const layerName = (l: Layer) => (l === 'e2e' ? 'E2E' : SPEC[l].label.toLowerCase());
const flakyNote = (n: number) => `${n} flaky failure${n > 1 ? 's' : ''}`;
/** Where the flaky failures came from, when E2E tests account for any of them. */
const flakyFrom = (flaky: number, e2e: number) => {
  if (!e2e) return '';
  if (e2e === flaky) return flaky === 1 ? ', from an E2E test' : ', all from E2E tests';
  return `, ${e2e} of them from E2E tests`;
};

/** Caption for pressing Run with every layer at 0: nothing runs, so nothing can fail. */
export function emptySuiteCaption(planted: Bug | null): ReactNode {
  const bug = BUGS.find((b) => b.id === planted);
  if (!bug) return <>There are no tests to run. An empty suite never goes red, and it proves nothing.</>;
  return (
    <>
      There are no tests to run, so <span className="hl bad">the {bug.label.toLowerCase()} shipped</span> ({bug.example}). An empty
      suite never goes red: green only means the tests you have passed.
    </>
  );
}

/** The "Last run" stat's text. */
export function resultLabel(s: RunStats | null): string {
  if (!s || s.total === 0) return '–';
  if (s.running) return `${s.done}/${s.total}`;
  if (s.failed) return 'red: bug';
  if (s.escaped) return s.flaky ? 'red, bug shipped' : 'green, bug shipped';
  return s.flaky ? `red: ${s.flaky} flaky` : 'green';
}

/** The "Last run" stat's colour: a shipped bug is bad whatever colour the build was. */
export function resultColor(s: RunStats | null): string {
  if (!s || s.total === 0 || s.running) return 'var(--muted)';
  if (s.failed || s.escaped) return 'var(--bad)';
  return s.flaky ? 'var(--hi)' : 'var(--ok)';
}

/** The closing caption for a finished run. */
export function finishedCaption(s: RunStats): ReactNode {
  if (s.failed && s.firstFailLayer) {
    return (
      <>
        <span className="hl bad">Caught</span> by {s.firstFailLayer === 'unit' ? 'a' : 'an'} {layerName(s.firstFailLayer)} test, {elapsed(s.firstFailAt ?? 0)} into the run.{' '}
        {CAUGHT_BY[s.firstFailLayer]}
        {s.flaky > 0 && <> Plus {flakyNote(s.flaky)} muddying the signal.</>}
      </>
    );
  }
  if (s.escaped && s.planted) {
    const bug = BUGS.find((b) => b.id === s.planted)!;
    return (
      <>
        <span className="hl bad">The {bug.label.toLowerCase()} shipped</span> ({bug.example}): this suite has no {layerName(bug.layer)} tests,
        the layer that would catch it.{' '}
        {s.flaky > 0 ? (
          <>The build went red, but only from {flakyNote(s.flaky)}, so it looks like noise and gets re-run.</>
        ) : (
          <>The build is green anyway: green only means the tests you have passed.</>
        )}
      </>
    );
  }
  if (s.flaky) {
    const e2e = s.flakyByLayer.e2e;
    return (
      <>
        <span className="hl">Red, but nothing is broken</span>: {flakyNote(s.flaky)}
        {flakyFrom(s.flaky, e2e)}. Someone presses "re-run" and learns to ignore red builds. That's the real cost of flaky tests.
      </>
    );
  }
  return <>All green. Rerun a few times: with more E2E tests, green gets rarer even though the code never changes.</>;
}
