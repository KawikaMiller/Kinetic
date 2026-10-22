/**
 * Scene 5: "when will it be done?", an invented conversation. The schedule-risk numbers are computed from the same
 * Monte Carlo as scene 2 (pinned to the named constants below, never to scene 2's sliders); the trust numbers are
 * invented and say so on screen.
 */
import type { Choice, Ending, Meter, Node, Scenario } from '../../core/scenario';
import { chanceBy, percentileOf, simulateTotal, sumFacts, sumSpec, TASK_MEDIANS } from './model';

/** The project in the story: the first eight tasks of scene 2, with correlated overruns (a shared unfamiliar framework). */
export const STORY = { n: 8, sigma: 0.6, rho: 0.5, seed: 7, hopeDay: 40, cutTasks: 2 } as const;

const medians = TASK_MEDIANS.slice(0, STORY.n);
const keptMedians = [...medians].sort((a, b) => a - b).slice(0, STORY.n - STORY.cutTasks);

const fullSpec = sumSpec(STORY.n, STORY.sigma, STORY.rho, STORY.seed);
const fullRun = simulateTotal(fullSpec);
const keptSpec = { ...fullSpec, medians: keptMedians };
const keptRun = simulateTotal(keptSpec);

const pctOf = (share: number) => Math.round(share * 100);
const sumMedians = sumFacts(fullSpec, fullRun).sumMedians;
const p80 = Math.round(percentileOf(fullRun, 0.8));
const p50 = Math.round(percentileOf(fullRun, 0.5));
const keptSumMedians = sumFacts(keptSpec, keptRun).sumMedians;

export const dateDay = Math.round(sumMedians);

/** The risk a choice leaves: the chance the team misses the day the manager ends up planning around. */
export const RISK = {
  date: pctOf(1 - chanceBy(fullRun, dateDay)),
  range: pctOf(1 - chanceBy(fullRun, p80)),
  unknowable: pctOf(1 - chanceBy(fullRun, STORY.hopeDay)),
  scope: pctOf(1 - chanceBy(keptRun, STORY.hopeDay)),
} as const;

/** Days of buffer between the day the manager plans around and the sum of the medians for the work kept. */
export const SLACK = {
  date: dateDay - dateDay,
  range: p80 - dateDay,
  unknowable: STORY.hopeDay - dateDay,
  scope: STORY.hopeDay - Math.round(keptSumMedians),
} as const;

/** Invented: how much the manager's trust moves in the first conversation. Not measured from anyone. */
export const TRUST = { date: 3, range: -2, unknowable: -1, scope: -3 } as const;

/** Invented: what the week-four news does, whichever first answer was given. */
export const WEEK_FOUR = {
  tell: { trust: 1, risk: 5, slack: 0 },
  wait: { trust: -3, risk: 12, slack: -2 },
  cut: { trust: -1, risk: -5, slack: 2 },
  add: { trust: 0, risk: 3, slack: -3 },
} as const;

export const METER = { trust: 'trust', risk: 'risk', slack: 'slack' } as const;

const maxSlack = Math.max(SLACK.range, SLACK.scope, SLACK.unknowable) + WEEK_FOUR.cut.slack;
const minSlack = Math.min(SLACK.date, SLACK.unknowable) + WEEK_FOUR.add.slack;

export const METERS: readonly Meter[] = [
  { id: METER.trust, label: "The manager's trust", start: 6, min: 0, max: 10, bad: { below: 3 }, unit: ' of 10' },
  { id: METER.risk, label: 'Chance of missing the planned day', start: 0, min: 0, max: 100, bad: { above: 50 }, unit: '%' },
  { id: METER.slack, label: 'Team slack against the median plan', start: 0, min: Math.min(0, minSlack), max: maxSlack, bad: { below: 5 }, unit: ' days' },
];

const NEXT = 'week-four';

const first: Choice[] = [
  {
    id: 'one-date', label: `Give one date: day ${dateDay}`, to: NEXT,
    effects: { [METER.trust]: TRUST.date, [METER.risk]: RISK.date, [METER.slack]: SLACK.date },
    because: `Day ${dateDay} is the sum of the eight medians. The manager has a number, but in this model only ${100 - RISK.date}% of runs finish by it, so you start with a ${RISK.date}% chance of missing and no buffer.`,
  },
  {
    id: 'range', label: `Give a range: day ${p50} to ${p80}, about 80% sure by day ${p80}`, to: NEXT,
    effects: { [METER.trust]: TRUST.range, [METER.risk]: RISK.range, [METER.slack]: SLACK.range },
    because: `Day ${p80} is the 80th percentile of the simulated total, so ${RISK.range}% of runs miss it and there are ${SLACK.range} days of buffer over the median plan. The manager hoped for day ${STORY.hopeDay}, so trust takes an invented hit.`,
  },
  {
    id: 'unknowable', label: 'Say it cannot be known', to: NEXT,
    effects: { [METER.trust]: TRUST.unknowable, [METER.risk]: RISK.unknowable, [METER.slack]: SLACK.unknowable },
    because: `True that no date is certain, but it hands the manager no number, so they plan around their own hope of day ${STORY.hopeDay}: ${RISK.unknowable}% of runs miss it, with ${SLACK.unknowable} days of buffer.`,
  },
  {
    id: 'scope', label: `Ask which scope can move: cut ${STORY.cutTasks} tasks, keep day ${STORY.hopeDay}`, to: NEXT,
    effects: { [METER.trust]: TRUST.scope, [METER.risk]: RISK.scope, [METER.slack]: SLACK.scope },
    because: `With the ${STORY.cutTasks} largest tasks cut, ${RISK.scope}% of runs miss day ${STORY.hopeDay} and there are ${SLACK.scope} days of buffer. The price is the cut work: the manager has to agree to lose it, so trust moves by an invented ${TRUST.scope}.`,
  },
];

const weekFour = (id: keyof typeof WEEK_FOUR, label: string, to: string, because: string): Choice => ({
  id: `w4-${id}`, label, to,
  effects: { [METER.trust]: WEEK_FOUR[id].trust, [METER.risk]: WEEK_FOUR[id].risk, [METER.slack]: WEEK_FOUR[id].slack },
  because,
});

const nodes: Node[] = [
  { id: 'ask', prompt: `"When will it be done?" Eight tasks, shared unfamiliar tooling (overruns arrive together), and a manager who is hoping for day ${STORY.hopeDay}. What do you say?`, choices: first },
  {
    id: NEXT,
    prompt: 'Four weeks in, two tasks overran together because of the shared tooling. What now?',
    choices: [
      weekFour('tell', 'Tell the manager now, with a new range', 'told', 'An early update costs a hard conversation but leaves time to act. Invented effects: small trust gain, a little risk added by the news.'),
      weekFour('wait', 'Wait a week to see if it recovers', 'waited', 'Sometimes it does. When it does not, the manager hears it later with less room to move. Invented effects: trust falls, risk and lost slack rise.'),
      weekFour('cut', 'Propose cutting scope now', 'trimmed', 'Cutting early recovers days and lowers risk, at the cost of the cut work. Invented effects.'),
      weekFour('add', 'Add two people to the late tasks', 'staffed', 'New people need onboarding before they help, so slack drops first. Invented effects: a little risk, three days of lost slack.'),
    ],
  },
];

const endings: Ending[] = [
  { id: 'told', title: 'You told them early', text: 'The manager heard the news at week four with time to choose. Every earlier answer left you in a different position when you said it.' },
  { id: 'waited', title: 'You waited a week', text: 'The news arrived later and the options narrowed. Whether the wait was a mistake depends on the first answer you gave.' },
  { id: 'trimmed', title: 'You cut scope early', text: 'Some work is gone and the date is safer. Whether that was a good trade is the manager\'s call as much as yours.' },
  { id: 'staffed', title: 'You added people', text: 'Onboarding ate days before the new people produced any. In this toy, adding people is a trade, not a rescue.' },
];

export const MANAGER: Scenario = { start: 'ask', meters: METERS, nodes, endings };

export const PROVENANCE_NOTE = 'an invented conversation: the schedule risk is computed from this lesson\'s own simulation, but the trust and week-four effects are made-up numbers';
