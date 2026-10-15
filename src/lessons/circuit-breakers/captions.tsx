import type { ReactNode } from 'react';
import {
  BASE_BACKOFF, MAX_RETRIES, MIN_CALLS, OPEN_FOR, PROBES, THREADS, TIMEOUT, TRIP_RATIO, WINDOW, type BreakerState, type Insight, type Mode,
} from './sim';

/** The fault the "B has a bad day" button injects, and the healthy state "Heal B" restores. */
export const HEALTHY = { fail: 3, latency: 120 };
export const BAD_DAY = { fail: 60, latency: 700 };

const pct = (ratio: number) => `${Math.round(ratio * 100)}%`;

/** The waits of the three retries: up to 0.2 s, 0.4 s, 0.8 s. */
const backoffCaps = () => Array.from({ length: MAX_RETRIES }, (_, i) => `${BASE_BACKOFF * 2 ** i} s`);

export const MODE_LABEL: Record<Mode, string> = { naive: 'Naive retries', backoff: 'Backoff + jitter', breaker: 'Circuit breaker' };

export const modeCaption = (mode: Mode): ReactNode => {
  if (mode === 'naive') {
    return <><span className="hl bad">Naive retries</span>: on any failure, retry immediately, up to {MAX_RETRIES} times. Sounds helpful. Now give B a bad day.</>;
  }
  if (mode === 'backoff') {
    const [a, b, c] = backoffCaps();
    return <><span className="hl violet">Exponential backoff + jitter</span>: wait a random time up to {a}, {b}, {c} before each retry. Retries stop arriving in lockstep.</>;
  }
  return (
    <>
      <span className="hl ok">Circuit breaker</span> (plus backoff): once at least {MIN_CALLS} calls are on record and {pct(TRIP_RATIO)} or more of
      the last {WINDOW} have failed, stop calling B for a while and serve a fallback.
    </>
  );
};

export const introCaption = () => (
  <>Users hit <b>Service A</b>, which calls <b>Service B</b> for every request. Everything's healthy. {modeCaption('naive')}</>
);

export const badDayCaption = () => (
  <>
    <span className="hl bad">B is having a bad day</span>: {BAD_DAY.fail}% of calls fail and each takes about {BAD_DAY.latency / 1000} s even before it is
    overloaded. A's timeout is {TIMEOUT} s. Watch what A does to B.
  </>
);

export const healCaption = () => <><span className="hl ok">B is fixed</span>. Does the system recover on its own?</>;

export const transitionCaption = (to: BreakerState): ReactNode => {
  if (to === 'open') {
    return (
      <>
        Breaker <span className="hl bad">OPEN</span>: {pct(TRIP_RATIO)} or more of the recent calls failed. For {OPEN_FOR} s, A fails fast with a
        fallback instead of calling B, and B gets room to recover.
      </>
    );
  }
  if (to === 'half') return <><span className="hl">HALF-OPEN</span>: {OPEN_FOR} s are up. Let {PROBES} probe requests through to test whether B has recovered.</>;
  return <>All {PROBES} probes succeeded, so the breaker <span className="hl ok">CLOSED</span>. Normal traffic flows to B again.</>;
};

export const insightCaption = (i: Insight): ReactNode => {
  if (i.kind === 'cascade') {
    return (
      <>
        <span className="hl bad">Cascade</span>: all {THREADS} of A's threads are tied up (waiting on B or waiting to retry), so A now fails its own users. B's
        problem became A's problem.
      </>
    );
  }
  if (i.kind === 'storm') {
    return (
      <>
        <span className="hl bad">Retry storm</span>: B is getting {i.ratio.toFixed(1)}× the user traffic. Every retry is extra load on a service that's
        already struggling.
      </>
    );
  }
  return (
    <>
      B is healthy again, but still buried under <b>{i.conc}</b> calls, {i.orphans} of them for requests A already gave up on. That backlog keeps it from
      recovering.
    </>
  );
};
