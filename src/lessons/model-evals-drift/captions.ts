/** Captions: every number from the model on screen. Plain strings, so tests can read them. */
import { plural } from '../../core/format';
import type { StreamSpread } from './falseAlarm';
import type { Evaluation, GateRule, GateVerdict } from './gate';
import type { Alarms } from './stream';
import { ACCURACY_ALARM } from './stream';
import type { Kind } from './world';
import type { LeakResult } from './leak';

export const pct1 = (share: number) => `${(share * 100).toFixed(1)}%`;
const dayText = (d: number | null) => (d === null ? 'never' : `day ${d}`);

export const KIND_LABEL: Record<Kind, string> = { covariate: 'Covariate shift: the inputs move', concept: 'Concept drift: the rule changes' };

const falseNote = (a: Alarms) => (a.falseInputDays > 0 ? ` Before the shift they had already raised false alarms on ${plural(a.falseInputDays, 'day')}, which is not detection.` : '');

export function driftCaption(kind: Kind, day: number, sizePct: number, before: number, after: number, a: Alarms): string {
  if (sizePct === 0) return `No shift is applied, so accuracy stays near its baseline. An input alert would be a false alarm: ${plural(a.falseInputDays, 'day')} of the 40 raised one.`;
  const what = kind === 'covariate' ? 'the two input blobs drift towards each other' : 'the decision rule rotates while the inputs look the same';
  const concept = kind === 'concept' && a.input !== null ? ' The inputs are untouched under concept drift, so that alert is an ordinary false alarm, not detection.' : '';
  return `From day ${day}, ${what} (${sizePct}%). Mean accuracy falls from ${pct1(before)} to ${pct1(after)}. From the shift day on, the input monitors first fire on ${dayText(a.input)}; the accuracy alarm (below ${Math.round(ACCURACY_ALARM * 100)}%) on ${dayText(a.accuracy)}.${concept}${falseNote(a)}`;
}

export function delayCaption(kind: Kind, delay: number, shiftDay: number, a: Alarms): string {
  const input = a.input === null ? 'From the shift day on, the input monitors never fire' : `The input monitors fire on day ${a.input}`;
  const acc = a.accuracy === null ? 'the accuracy alarm does not fire within the 40 days' : `the accuracy alarm fires on day ${a.accuracy}, ${plural(a.accuracy - shiftDay, 'day')} after the damage began`;
  const why = kind === 'concept' ? (a.input === null ? ' Under concept drift the inputs look unchanged, so only the labels reveal the damage.' : ' Under concept drift the inputs look unchanged, so that input alert is an ordinary false alarm, and only the labels reveal the damage.') : '';
  return `${plural(delay, 'day')} of label delay, shift on day ${shiftDay}. ${input}; ${acc}.${why}${falseNote(a)}`;
}

export function falseCaption(metric: 'ks' | 'psi', threshold: number, rate: number, spread: StreamSpread): string {
  const days = 40 * rate;
  const every = rate === 0 ? 'no day in the clean streams' : `about one clean day in ${Math.max(1, Math.round(1 / rate))}`;
  const wide = `Streams differ a lot, because each shares one baseline: ${spread.zero} of ${spread.streams} had no alerting day, the median stream ${spread.median}, the worst ${spread.max}.`;
  return `On ${spread.streams} seeded streams with no drift at all, a ${metric === 'ks' ? 'KS' : 'PSI'} threshold of ${threshold.toFixed(2)} alerts on ${(rate * 100).toFixed(1)}% of days: ${every}, or ${days.toFixed(1)} days in a 40-day stream on average. ${wide} Measured, not assumed.`;
}

export function gateCaption(e: Evaluation, rule: GateRule, verdict: GateVerdict): string {
  const within = e.interval.lo <= 0 && e.interval.hi >= 0;
  const diff = `${e.difference >= 0 ? '+' : ''}${e.difference.toFixed(1)} points`;
  const band = `${e.interval.lo.toFixed(1)} to ${e.interval.hi.toFixed(1)}`;
  return `On ${plural(e.n, 'test example')}, v2 minus v1 is ${diff} with a 95% bootstrap interval of ${band} points: ${within ? 'that includes 0, so "v2 is better" is within noise' : 'that excludes 0'}. The ${rule === 'overall' ? 'overall-only' : 'slice-aware'} gate ${verdict.ship ? 'ships v2' : 'blocks v2'}: ${verdict.reason}.`;
}

export function leakCaption(leaked: boolean, r: LeakResult): string {
  return `${leaked ? 'The test items were added to the training set' : 'The test items are held out'}. The memoriser scores ${pct1(r.memoriser.test)} on the test set and ${pct1(r.memoriser.fresh)} on fresh data; the logistic model ${pct1(r.logistic.test)} and ${pct1(r.logistic.fresh)}.`;
}
