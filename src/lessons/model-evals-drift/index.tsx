import type { LessonModule } from '../../core/types';
import { pct1 } from './captions';
import { KS_STEP_NEAR_CRITICAL, delayFacts, driftFacts, gateFacts, leakFacts } from './facts';
import { PINNED_SEEDS, pinnedFalseRates } from './pinned';
import { DETECT_WITHIN_DAYS } from './seedStats';
import { DELAY_SHIFT, DRIFT_DEFAULT } from './settings';
import { Stage } from './Stage';

const drift = driftFacts();
const delay = delayFacts();
// Measured figures, pinned (a test recomputes them) so the lesson does not simulate 200 streams when it loads.
const fa = pinnedFalseRates();
const gt = gateFacts();
const leak = leakFacts();
const n = (v: number) => v.toLocaleString('en-US');
const dayOf = (d: number | null) => (d === null ? 'no day' : `day ${d}`);
const sign = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}`;
const rate = (v: number) => `${(v * 100).toFixed(1)}%`;

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'A model can go wrong with no change to its code: the world moves, the labels that would reveal it arrive late, and a quiet input monitor can hide a rule that has changed, so you watch inputs, outputs and labels, and gate a release on slices and noise, not one number.',
    what: 'A small logistic model is trained, then watched for 40 days. A covariate shift moves the inputs (PSI and the KS statistic notice at once) while concept drift changes the rule linking inputs to labels, which those monitors cannot see; accuracy shows it only when the labels arrive. Every alert threshold trades late detection against false alarms on days when nothing changed, which you can measure on clean streams. Before shipping a new version, a bootstrap interval says whether its gain is noise, and a slice-aware gate catches a group that got worse inside a better average.',
    analogy: 'A smoke detector that sniffs the air (inputs) is fast but cannot tell you the fire brigade has moved house; the report that the brigade is late (labels) arrives only when someone needs them.',
    useCases: [
      'Choosing what to monitor for a model in production',
      'Setting alert thresholds without paging the team on every wobble',
      'Deciding whether a new model version is really better before release',
      'Spotting a leaked test set behind a suspiciously good score',
    ],
    why: 'Models rot silently: dashboards of inputs stay green while the labels say otherwise, and a release that wins on average can hurt one group. Knowing which signal sees which failure, and how noisy each is, turns monitoring and release gates into decisions instead of folklore.',
    watch:
      'Plots show accuracy, PSI and KS per day. The yellow rule is the shift day, green dots healthy days and red dots days below the accuracy alarm line, violet curves the monitors against their baseline, a red dashed rule the input alert, and an orange dashed rule the accuracy alarm that fires late by the label delay. In the gate table orange is segment A and blue segment B; violet marks a difference within noise, green a gain and red a regression. The violet curve in the false-alarm plot is the measured rate and the yellow rule your threshold.',
  },
  tryThis: [
    `In "Drift", the default shifts the inputs from day ${DRIFT_DEFAULT.day}: mean accuracy falls from ${pct1(drift.before)} to ${pct1(drift.after)} and the input monitors fire on ${dayOf(drift.alarms.input)}. Switch Kind to Concept drift: at this seed the input monitors stay ${drift.concept.alarms.input === null ? 'silent' : 'on'} while mean accuracy falls to ${pct1(drift.concept.after)}. Then change the seed: the covariate shift trips an input monitor within ${DETECT_WITHIN_DAYS} days on ${PINNED_SEEDS.covariateDetected} of ${PINNED_SEEDS.streams} seeds, while under concept drift ${PINNED_SEEDS.conceptInputAlert} of ${PINNED_SEEDS.streams} streams still raise an input alert, a false alarm, because the inputs are unchanged.`,
    `In "Labels arrive late", concept drift starts on day ${DELAY_SHIFT.day} and labels take 7 days: the input monitors stay silent and the accuracy alarm fires on ${dayOf(delay.seven.accuracy)}. Set Label delay to 0 and it fires on ${dayOf(delay.zero.accuracy)}. Switch Kind to Covariate shift and the input monitors fire on ${dayOf(delay.covariate.input)}.`,
    `In "False alarms", a KS threshold of 0.08 alerts on ${rate(fa.start)} of days in streams where nothing changed, about ${fa.days.toFixed(1)} days in 40. Raise it to ${KS_STEP_NEAR_CRITICAL.toFixed(2)}, the 5% critical value: ${rate(fa.ksAt011)}. Switch to PSI at 0.10: ${rate(fa.psiWatch)}; at 0.25: ${rate(fa.psiAlert)}.`,
    `In "The eval gate", with ${n(gt.open.n)} test examples v2 is ${sign(gt.open.difference)} points better with an interval of ${gt.open.interval.lo.toFixed(1)} to ${gt.open.interval.hi.toFixed(1)}, which includes 0, and the overall-only gate ships it. Switch to the slice-aware gate: it blocks, because segment B falls ${gt.sliceDrop(gt.open).toFixed(1)} points. At ${n(gt.big.n)} examples the interval is ${gt.big.interval.lo.toFixed(1)} to ${gt.big.interval.hi.toFixed(1)} and the slice-aware gate still blocks.`,
    `In "Leakage", with the test items held out the memoriser scores ${pct1(leak.off.memoriser.test)} on the test set and ${pct1(leak.off.memoriser.fresh)} on fresh data. Switch to Leaked: ${pct1(leak.on.memoriser.test)} on the test set, ${pct1(leak.on.memoriser.fresh)} on fresh data.`,
  ],
  keyIdeas: [
    `Input monitors need no labels and, in this model, trip within ${DETECT_WITHIN_DAYS} days of a covariate shift on ${PINNED_SEEDS.covariateDetected} of ${PINNED_SEEDS.streams} seeds, but under concept drift the inputs are unchanged, so they cannot tell it from no drift at all: accuracy against labels is what shows the damage.`,
    'Accuracy can be computed once labels arrive and not before, so its alarm trails the damage by the label delay; monitor inputs, outputs and labels together.',
    'Each alert threshold trades speed against false alarms, and the false-alarm rate on a clean stream is something to measure, not assume.',
    'A better average can hide a slice that got worse, and a gain smaller than its bootstrap interval is within noise; a held-out test set that leaks into training measures memory, not skill.',
  ],
  quiz: [
    {
      q: 'Labels arrive 7 days late. After a shift, which monitor fires first, and what kind of drift can it miss?',
      options: [
        'The input monitors, within days of a covariate shift; they cannot see concept drift, where the inputs look unchanged',
        'The accuracy alarm, on the day of the shift, because labels are the earliest signal; it misses covariate shift',
        'The input monitors, but only after 7 days, because every monitor waits for the labels of the same batch',
        'The accuracy alarm, 7 days after the shift; it misses concept drift, where the labels were the same all along',
      ],
      answer: 0,
      why: `With a 7-day delay under concept drift the input monitors stayed ${delay.seven.input === null ? 'silent' : 'on'} and the accuracy alarm fired on ${dayOf(delay.seven.accuracy)}, ${delay.seven.accuracy === null ? 'never' : delay.seven.accuracy - DELAY_SHIFT.day} days after the damage began. Under covariate shift the input monitors fired on ${dayOf(delay.covariate.input)}. That is the default seed: across ${PINNED_SEEDS.streams} seeds, ${PINNED_SEEDS.conceptInputAlert} concept-drift streams still raised an input alert after the shift, a false alarm, since the inputs are untouched.`,
    },
    {
      q: 'You lower the KS alert threshold to catch drift sooner. What does it cost?',
      options: [
        'More alerts on days when nothing changed: at 0.08, over a quarter of clean days alert in these streams',
        'Nothing in the clean streams, because a lower threshold only matters on days that really contain a shift',
        'Later detection of real drift, since a lower threshold needs more days of data before it can fire at all',
        'The accuracy alarm stops firing, because both alarms share one threshold in a monitored pipeline',
      ],
      answer: 0,
      why: `On ${n(40 * 200)} seeded clean days a KS threshold of 0.08 alerted on ${rate(fa.start)}, against ${rate(fa.ksAt011)} at ${KS_STEP_NEAR_CRITICAL.toFixed(2)}. A low threshold buys speed with false alarms, which is how a team learns to ignore pages.`,
    },
    {
      q: `On ${n(gt.open.n)} test examples v2 is ${sign(gt.open.difference)} points better, with an interval of ${gt.open.interval.lo.toFixed(1)} to ${gt.open.interval.hi.toFixed(1)}. What does that show?`,
      options: [
        'The gain is within noise at this test size; a larger test set narrows the interval and can settle it',
        'v2 is better, since the difference is above zero and a positive average is enough to ship it',
        'v2 is worse, because the lower end of the interval is below zero and that end is the true value',
        'Nothing, since a bootstrap needs a second model trained on a different random seed to mean anything at all',
      ],
      answer: 0,
      why: `The interval includes 0, so ${sign(gt.open.difference)} points could be noise. At ${n(gt.big.n)} examples it is ${gt.big.interval.lo.toFixed(1)} to ${gt.big.interval.hi.toFixed(1)}: a gain this size needs a large test set to separate from luck.`,
    },
    {
      q: `v2 is better overall but segment B falls ${gt.sliceDrop(gt.open).toFixed(1)} points. Which release rule blocks it?`,
      options: [
        'A rule that checks every slice, since an overall average can hide one group getting worse',
        'A rule on the overall accuracy alone, since a group that falls is already counted in the average',
        'A rule that waits for a larger test set, since a slice cannot be measured on a small sample',
        'No rule can block it, because a version that wins on the overall average is better for every group',
      ],
      answer: 0,
      why: `Overall v2 is ${sign(gt.open.difference)} points, so the overall-average gate ${gt.overall.ship ? 'ships' : 'blocks'} it; the slice-aware gate ${gt.slices.ship ? 'ships' : 'blocks'} it (${gt.slices.reason}). The slice is a 30% minority, so the average hid it.`,
    },
    {
      q: 'A memoriser scores 100% on a test set that was copied into its training data. What does that show?',
      options: [
        'Only that it recalled items it had seen; fresh data shows what it can really do, and that is lower',
        'That the model has learned the task perfectly and should be released before the data changes',
        'That the test set was too easy, so a harder test set from the same data would score the same',
        'That memorising helps in general, since a model that has seen more items must have learned more of the task',
      ],
      answer: 0,
      why: `Leaked, the memoriser scores ${pct1(leak.on.memoriser.test)} on the test set and ${pct1(leak.on.memoriser.fresh)} on fresh data; the logistic model barely moves (${pct1(leak.on.logistic.test)} against ${pct1(leak.on.logistic.fresh)}) because it cannot memorise ${leak.on.trainSize} points. In this model a held-out set that feeds training stops measuring skill.`,
    },
  ],
};

export default lesson;