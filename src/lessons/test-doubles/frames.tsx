import type { ReactNode } from 'react';
import type { Frame } from '../../core/types';
import { BUG_DEP, DEP_NAME, isFlakyRun, runConfig, type Bug, type Call, type Config, type Kind, type TestRun, type Verdict } from './model';

export interface CallFrame extends Frame {
  /** Index of the call in flight, or null before the first call and on the result frame. */
  call: number | null;
  /** The result is shown (the last frame). */
  done: boolean;
}

export const BUG_LABEL: Record<Bug, string> = {
  none: 'No bug',
  email: 'Email never sent',
  tax: 'Tax rounding wrong',
  twice: 'Charges twice',
};
/** What a double needs to be able to see to catch each bug. */
const NEEDS: Record<Exclude<Bug, 'none'>, string> = {
  email: 'whether send() was called at all',
  tax: 'the real tax code: it never runs it',
  twice: 'how many times charge() was called',
};

const KIND_TEXT: Record<Kind, string> = { dummy: 'dummy', stub: 'stub', fake: 'fake', mock: 'mock', spy: 'spy', real: 'real service' };
const short = (s: string, n = 64) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

function callCaption(c: Call): ReactNode {
  const how = c.by === 'real' || c.by === 'spy'
    ? <> {c.by === 'spy' ? 'The spy records it and passes it to the real service' : 'The real service answers'}{c.ms ? ` after ${c.ms} ms over the network` : ''}{c.dep === 'clock' ? ': a different time every run' : ''}.</>
    : c.by === 'dummy' ? <> It&apos;s a <b>dummy</b>, which must never be called: it throws.</>
      : c.by === 'mock' ? <> The <b>mock</b> records it, to check against its expectations at the end.</>
        : c.by === 'fake' ? <> The <b>fake</b> does real work in memory: no network.</>
          : c.dep === 'email' ? <> The <b>stub</b> does nothing and returns nothing: it only stops the call from failing.</>
            : <> The <b>stub</b> returns its canned answer, whatever it&apos;s asked.</>;
  return <>checkout calls <code>{DEP_NAME[c.dep]}.{c.method}({short(c.args)})</code>.{how}</>;
}

/** Why a red run with no planted bug is red. */
function ownFault(r: TestRun, cfg: Config, run: number): string {
  if (r.trace.some((c) => c.by === 'dummy')) return 'a dummy was called, so a dummy was the wrong stand-in for this path';
  if ((cfg.gateway === 'real' || cfg.gateway === 'spy') && isFlakyRun(run)) return 'the real gateway timed out (its flakiness is scripted: every 4th run)';
  return 'the test itself is wrong';
}

export function resultCaption(r: TestRun, cfg: Config, bug: Bug, run: number, v: Verdict | null): ReactNode {
  const head = r.passed ? <span className="hl ok">✓ passed</span> : <span className="hl bad">✗ failed</span>;
  if (bug === 'none') {
    return r.passed
      ? <>{head} in {r.ms} ms. Plant a bug to see whether these doubles would notice it.</>
      : <>{head}: {r.error}. No bug is planted, so this red is the test&apos;s own problem: {ownFault(r, cfg, run)}.</>;
  }
  const dep = BUG_DEP[bug];
  if (v === 'caught') return <>{head}: {r.error}. <span className="hl ok">Caught</span>: the same test passes without the bug.</>;
  if (v === 'broken') {
    const without = runConfig(cfg, 'none', run);
    return r.passed
      ? <>{head} with the bug planted, but it fails without it ({ownFault(without, cfg, run)}): a test that passes only when the code is broken catches nothing.</>
      : <>{head}: {r.error}. But it fails without the bug too ({ownFault(without, cfg, run)}), so it hasn&apos;t caught anything.</>;
  }
  return <>{head}, with the bug planted: <span className="hl bad">shipped</span>. A {KIND_TEXT[cfg[dep]]} {DEP_NAME[dep]} can&apos;t see {NEEDS[bug]}.</>;
}

/** Frame 0 sets up, one frame per call, then the result. */
export function callFrames(r: TestRun, result: ReactNode): CallFrame[] {
  return [
    { call: null, done: false, say: <>The test builds its stand-ins, then calls checkout(cart, deps).</> },
    ...r.trace.map((c, i): CallFrame => ({ call: i, done: false, say: callCaption(c) })),
    { call: null, done: true, say: result, hold: 2 },
  ];
}

/** The over-mocking scene's verdict, from what the run actually reported. */
export function overMockCaption(r: TestRun, gateway: 'mock' | 'fake', refactor: boolean): ReactNode {
  if (r.passed) {
    return gateway === 'mock'
      ? <><span className="hl ok">✓ passed</span>, yet checkout sends <code>currencyCode</code>, which the real gateway rejects with a 400. The mocks only prove that checkout calls them the way the test&apos;s author assumed.</>
      : <><span className="hl ok">✓ passed</span>.</>;
  }
  const err = r.error ?? '';
  if (err.includes('unexpected call')) {
    return <><span className="hl bad">✗ failed</span>: {err}.{refactor ? ' The refactor didn’t change what checkout returns, only how it asks: the mock is coupled to the implementation.' : ''}</>;
  }
  if (err.includes('currency')) {
    return <><span className="hl bad">✗ failed</span>: {err}. The fake enforces one rule of the real API (the currency field), so it catches the integration bug that the mock copied.</>;
  }
  return <><span className="hl bad">✗ failed</span>: {err}.</>;
}
