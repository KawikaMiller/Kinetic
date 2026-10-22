/**
 * Scene 5: a stakeholder asks for an urgent item mid-quarter. Invented. The value each choice leaves is computed
 * from the same cost-of-delay model as the other scenes (value delivered over a 13-week quarter); trust is an
 * invented number and the scene says so.
 */
import type { Ending, Meter, Node, Scenario } from '../../core/scenario';
import { CAPACITY, ITEMS, finishTimes, orderBy, valueBy, withinCapacity, type Item } from './model';

export const QUARTER_WEEKS = CAPACITY.default;
export const URGENT: Item = { id: 'urgent', label: 'Partner demo feature', impact: 12, effort: 4 };
/** Invented: the small piece captures this share of the urgent item's impact in one week. */
export const SPLIT = { share: 0.4, effort: 1 };

const baseIds = withinCapacity(ITEMS, QUARTER_WEEKS);
const base = ITEMS.filter((i) => baseIds.includes(i.id));

/** Value over the quarter of doing `items` in this order, counting only what is live by the end of the quarter. */
const valueOf = (items: readonly Item[], order: readonly string[]) => valueBy(items, order, QUARTER_WEEKS);
const weeksOf = (items: readonly Item[]) => items.reduce((s, i) => s + i.effort, 0);

const baseOrder = orderBy(base, 'ratio');
export const BASE_VALUE = valueOf(base, baseOrder);
export const BASE_WEEKS = weeksOf(base);

/** The lowest-ratio item that is in the quarter: the one a swap names. */
export const SWAP_OUT = base.find((i) => i.id === baseOrder[baseOrder.length - 1])!;

const withItem = (items: readonly Item[], extra: Item, first: boolean) => {
  const all = [...items, extra];
  return { all, order: first ? [extra.id, ...orderBy(items, 'ratio')] : orderBy(all, 'ratio') };
};

const addFirst = withItem(base, URGENT, true);
const swapped = withItem(base.filter((i) => i.id !== SWAP_OUT.id), URGENT, false);
const piece: Item = { id: 'piece', label: `${URGENT.label}, small piece`, impact: URGENT.impact * SPLIT.share, effort: SPLIT.effort };
const splitPlan = withItem(base, piece, false);

const baseFinish = finishTimes(base, baseOrder);
/** How many of the committed items now finish on a different week, or fall out of the plan. */
const changedCount = (items: readonly Item[], order: readonly string[]) => {
  const f = finishTimes(items, order);
  return base.filter((i) => f[i.id] === undefined || f[i.id] !== baseFinish[i.id]).length;
};

export const OUTCOMES = {
  add: { value: valueOf(addFirst.all, addFirst.order), weeks: weeksOf(addFirst.all), changed: changedCount(addFirst.all, addFirst.order) },
  swap: { value: valueOf(swapped.all, swapped.order), weeks: weeksOf(swapped.all), changed: changedCount(swapped.all, swapped.order) },
  no: { value: BASE_VALUE, weeks: BASE_WEEKS, changed: 0 },
  split: { value: valueOf(splitPlan.all, splitPlan.order), weeks: weeksOf(splitPlan.all), changed: changedCount(splitPlan.all, splitPlan.order) },
} as const;

/** Invented: how the stakeholder's trust moves. */
export const TRUST = { add: 2, swap: -1, no: -2, split: 1 } as const;

export const METER = { value: 'value', trust: 'trust', load: 'load', changed: 'changed' } as const;

const top = Math.ceil(Math.max(...Object.values(OUTCOMES).map((o) => o.value)) + 10);
export const METERS: readonly Meter[] = [
  { id: METER.value, label: 'Value delivered this quarter', start: BASE_VALUE, min: 0, max: top, bad: { below: BASE_VALUE } },
  { id: METER.trust, label: "The stakeholder's trust", start: 6, min: 0, max: 10, bad: { below: 4 }, unit: ' of 10' },
  { id: METER.changed, label: 'Committed items that move or drop', start: 0, min: 0, max: base.length, bad: { above: 3 } },
  { id: METER.load, label: 'Weeks of work committed', start: BASE_WEEKS, min: 0, max: BASE_WEEKS + URGENT.effort + 1, bad: { above: QUARTER_WEEKS }, unit: ' weeks' },
];

const effects = (key: keyof typeof OUTCOMES) => ({
  [METER.value]: OUTCOMES[key].value - BASE_VALUE,
  [METER.trust]: TRUST[key],
  [METER.load]: OUTCOMES[key].weeks - BASE_WEEKS,
  [METER.changed]: OUTCOMES[key].changed,
});

const nodes: Node[] = [
  {
    id: 'ask',
    prompt: `Halfway through planning, a stakeholder asks for "${URGENT.label}" this quarter: ${URGENT.impact} a week of value once live, ${URGENT.effort} weeks of work. The quarter is ${QUARTER_WEEKS} weeks and already full. What do you do?`,
    choices: [
      {
        id: 'add', label: 'Add it first and let the others slip', to: 'added', effects: effects('add'),
        because: `Everything else finishes ${URGENT.effort} weeks later (${OUTCOMES.add.changed} committed items move) and some of it no longer finishes inside the quarter: value delivered moves by ${OUTCOMES.add.value - BASE_VALUE} and the load is ${OUTCOMES.add.weeks} weeks against ${QUARTER_WEEKS}. The stakeholder is happy now (an invented ${TRUST.add}).`,
      },
      {
        id: 'swap', label: `Swap it for ${SWAP_OUT.label} (${SWAP_OUT.impact} a week, ${SWAP_OUT.effort} weeks)`, to: 'swapped', effects: effects('swap'),
        because: `The urgent item goes in by its own ratio and ${SWAP_OUT.label}, the lowest ratio in the plan, comes out: value moves by ${OUTCOMES.swap.value - BASE_VALUE} and the load is ${OUTCOMES.swap.weeks} weeks, with ${OUTCOMES.swap.changed} committed items moving or dropping. Whoever wanted ${SWAP_OUT.label} loses it, which is why trust moves by an invented ${TRUST.swap}.`,
      },
      {
        id: 'no', label: 'Say no and show the cost-of-delay table', to: 'declined', effects: effects('no'),
        because: `The plan and its ${BASE_VALUE} of value stay as they are, no committed item moves, and the stakeholder sees what each existing item is worth per week of delay. Trust takes an invented ${TRUST.no}.`,
      },
      {
        id: 'split', label: `Split it: a ${SPLIT.effort}-week piece now`, to: 'split', effects: effects('split'),
        because: `An invented ${Math.round(SPLIT.share * 100)}% of the impact arrives after ${SPLIT.effort} week. In this model value moves by ${OUTCOMES.split.value - BASE_VALUE} and the load is ${OUTCOMES.split.weeks} weeks, one over the quarter, with ${OUTCOMES.split.changed} committed items moving. Splitting is not always possible.`,
      },
    ],
  },
];

const endings: Ending[] = [
  { id: 'added', title: 'You added it and let others slip', text: 'The urgent item ships first. Everything behind it moved, and the plan is over its load.' },
  { id: 'swapped', title: 'You swapped it in', text: 'The quarter stays full and one named item is out. The trade was made in the open, with numbers.' },
  { id: 'declined', title: 'You said no with the table', text: 'The plan is intact and the stakeholder knows its price. Whether they accept the answer is up to them.' },
  { id: 'split', title: 'You shipped a small piece', text: 'Part of the benefit arrives now and the rest waits. The quarter is a week over.' },
];

export const STAKEHOLDER: Scenario = { start: 'ask', meters: METERS, nodes, endings };

export const PROVENANCE_NOTE = 'an invented request: the value each option leaves is computed from this lesson\'s cost-of-delay model, and the trust effects are made-up numbers';
