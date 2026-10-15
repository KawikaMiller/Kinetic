/**
 * The words the lesson uses for what a run showed. "never halts" is only ever produced from a
 * certificate in the data (a repeated configuration, or a recorded argument); a run that merely
 * stopped at its limit is "did not halt within N steps".
 */
import { plural } from '../../core/format';
import type { Answer, Verdict } from './predictors';
import type { Truth } from './machines';

export const cutoffPhrase = (steps: number) => `did not halt within ${steps.toLocaleString('en-US')} steps`;

type Certificate = Extract<Truth, { kind: 'loops' }>['certificate'];

export const certifiedLoopPhrase = (c: Certificate) =>
  c.kind === 'repeat'
    ? `never halts: the configuration after step ${c.at} is the one after step ${c.first}`
    : 'never halts: by the recorded argument';

export const truthPhrase = (t: Truth) => (t.kind === 'halts' ? `halts after ${plural(t.steps, 'step')}` : certifiedLoopPhrase(t.certificate));

/** What a predictor's answer rests on, in words. UNKNOWN is said to be no claim. */
export function answerPhrase(a: Answer, o: { modelledD?: boolean } = {}): string {
  if (a.basis === 'fixed') return `${a.verdict}, whatever the machine`;
  if (a.basis === 'ran-to-halt') return 'HALTS: it stopped within the limit';
  if (a.basis === 'repeat') return `LOOPS: a configuration came back at step ${a.at}`;
  const limit = cutoffPhrase(a.limit ?? 0);
  // The D row is not a run: D's call to the predictor contains D again, so the nested simulation is modelled, not executed.
  if (o.modelledD && a.verdict !== 'UNKNOWN') return `${a.verdict}: a guess; a predictor that simulates D would not finish within ${a.limit?.toLocaleString('en-US')} steps (modelled, not run)`;
  return a.verdict === 'UNKNOWN' ? `UNKNOWN: ${limit}, so no claim` : `${a.verdict}: a guess, because it ${limit}`;
}

export const verdictTone = (verdict: Verdict, right: boolean) => (verdict === 'UNKNOWN' ? 'dim' : right ? 'ok' : 'bad');
