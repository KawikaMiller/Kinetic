import { createRecorder } from '../../core/recorder';
import type { Frame } from '../../core/types';
import { APP_RANGE, CI_MONTH, DEV_MONTH, install, MONTHS, TINY_DATE, type Install } from './deps';

export type Where = 'dev' | 'ci';

export interface LockFrame extends Frame {
  /** Registry state: what has been published by this month. */
  month: number;
  dev: Install | null;
  ci: Install | null;
  /** The lockfile on disk (committed to git), if any. */
  lock: string | null;
  /** Which machine is acting in this frame. */
  active: Where | null;
  /** Test result per machine, once they've run. */
  devTests: 'pass' | 'fail' | null;
  ciTests: 'pass' | 'fail' | null;
}

const outcome = (i: Install) => (i.broken ? 'fail' : 'pass');

/** The same package.json installed on a laptop in April and in CI in June, with or without a lockfile. */
export function lockFrames(useLock: boolean): LockFrame[] {
  const rec = createRecorder<LockFrame>(
    { month: DEV_MONTH - 1, dev: null, ci: null, lock: null, active: null, devTests: null, ciTests: null },
    { transient: { active: null } },
  );

  rec.snap(
    <>
      <code>package.json</code> asks for <span className="hl violet">tiny-date {APP_RANGE}</span>: any 1.x from 1.4.2
      up. {useLock ? <>This team commits its lockfile.</> : <>This team doesn't commit a lockfile.</>}
    </>,
  );

  const dev = install(APP_RANGE, DEV_MONTH, null);
  rec.snap(
    <>
      {MONTHS[DEV_MONTH]}: you run <code>npm install</code>. The newest match on the registry is{' '}
      <span className="hl">{dev.version}</span>, so that's what you get. Tests pass.
    </>,
    1.5,
    { month: DEV_MONTH, dev, active: 'dev', devTests: outcome(dev) },
  );

  if (useLock) {
    rec.snap(
      <>
        npm writes <code>package-lock.json</code>, pinning the <b>exact</b> version it resolved ({dev.version}) and its
        integrity hash. It gets committed with the code.
      </>,
      1.3,
      { lock: dev.version, active: 'dev' },
    );
  }

  const regression = TINY_DATE.find((r) => r.broken)!;
  rec.snap(
    <>
      {MONTHS[regression.month]}: tiny-date publishes <span className="hl bad">{regression.version}</span>, a MINOR bump, so
      it matches {APP_RANGE}. It has a regression: {regression.note}.
    </>,
    1.5,
    { month: CI_MONTH },
  );

  const ci = install(APP_RANGE, CI_MONTH, useLock ? dev.version : null);
  rec.snap(
    useLock ? (
      <>
        CI runs <code>npm ci</code>: it installs exactly what the lockfile says, <span className="hl ok">{ci.version}</span>,
        ignoring newer matches. Same code as your laptop. Green.
      </>
    ) : (
      <>
        CI runs <code>npm install</code> with no lockfile, so it resolves the range again today and gets{' '}
        <span className="hl bad">{ci.version}</span>. The tests fail on code nobody on the team changed.
      </>
    ),
    1.8,
    { ci, active: 'ci', ciTests: outcome(ci) },
  );

  // Its own frame, so the CI step keeps its caption.
  rec.snap(
    useLock ? (
      <>
        The lockfile made both installs identical. When you <i>want</i> 1.5.0, you run <code>npm update</code> in a PR and
        CI tests the upgrade on purpose. Switch the lockfile off to see the other timeline.
      </>
    ) : (
      <>
        "Works on my machine, broken in CI": same <code>package.json</code>, different code. Commit{' '}
        <code>package-lock.json</code> and use <code>npm ci</code> in CI. Switch the lockfile on and replay.
      </>
    ),
    2.5,
  );
  return rec.frames;
}
