/** Every number the lesson text quotes, computed from the model at the default state. */
import { DESIGN_DEFAULT, measured, population } from './folklore';
import { OPENING } from './opening';
import { POWER_DEFAULT, daysToReach, parseTraffic, sampleSize, simulatedPower, POWER_SEED, type PowerSpec } from './power';
import { GUARDRAIL_DEFAULT, change, firstBreach, generateSeries } from './series';
import { BEHAVIOUR_NEEDS, NEEDS, SOLUTIONS, cheapestFull, needShare } from './tree';

const request = SOLUTIONS.find((s) => s.id === 'csv')!;
const best = cheapestFull();
const calm = generateSeries(OPENING.series.seed, false);
const pushed = generateSeries(OPENING.series.seed, true);
const breach = firstBreach(pushed, GUARDRAIL_DEFAULT)!;
const spec: PowerSpec = { baseline: POWER_DEFAULT.baseline, lift: POWER_DEFAULT.lift, alpha: POWER_DEFAULT.alpha, power: POWER_DEFAULT.power };
const traffic = parseTraffic(POWER_DEFAULT.traffic);
const n = sampleSize(spec);
const halfN = sampleSize({ ...spec, lift: spec.lift / 2 });
const tiny = sampleSize({ ...spec, lift: 0.5 });
const people = population();
const fair = { log: 'uses', window: 30, cohort: 'active' } as const;
const pct = (x: number) => Math.round(x * 100);

export const FACTS = {
  requestEffort: request.effort,
  requestParts: BEHAVIOUR_NEEDS.filter((c) => request.covers.includes(c)).length,
  behaviourParts: BEHAVIOUR_NEEDS.length,
  requestShare: pct(needShare(request)),
  needs: NEEDS.length,
  bestName: best.label.toLowerCase(),
  bestEffort: best.effort,
  signupsChange: pct(change(calm.signups)),
  activeChange: Math.round(change(calm.active) * 100),
  retentionChange: Math.round(change(calm.retention) * 100),
  pushedSignups: pct(change(pushed.signups)),
  pushedTickets: pct(change(pushed.tickets)),
  breachMetric: breach.metric,
  breachWeek: breach.week,
  ticketsGuardrail: GUARDRAIL_DEFAULT.tickets,
  n,
  halfN,
  tinyN: tiny,
  ratioHalf: (halfN / n).toFixed(1),
  days: daysToReach(n, traffic.ok ? traffic.value : 1).toFixed(2),
  tinyDays: Math.round(daysToReach(tiny, traffic.ok ? traffic.value : 1)),
  simulatedPower: pct(simulatedPower(spec, n, POWER_SEED)),
  badShare: pct(measured(people, DESIGN_DEFAULT)),
  fairShare: pct(measured(people, fair)),
} as const;
