/**
 * Scene 2: a feedback conversation, invented. Your own hours are computed from the board's constants (doing the
 * task yourself costs what the board says it costs); clarity, trust, ownership and delivery effects are made-up
 * numbers and the scene says so.
 */
import type { Ending, Meter, Node, Scenario } from '../../core/scenario';
import { CAPACITY_HOURS, TASKS, doHours } from './model';

/** The task the teammate missed twice. */
const MISSED = TASKS.find((t) => t.id === 'report')!;
export const SOLVE_HOURS = doHours(MISSED);
export const HOURS = { vague: 0.5, sbi: 1.5, solve: SOLVE_HOURS, ask: 1, daily: 3, checkpoint: 1, trust: 0 } as const;

export const METER = { clarity: 'clarity', trust: 'trust', ownership: 'ownership', hours: 'hours', delivery: 'delivery' } as const;

/** Past this many of your own hours in one conversation's fallout, the week is in trouble (invented). */
export const HOURS_RED = 10;

export const METERS: readonly Meter[] = [
  { id: METER.clarity, label: 'Clarity about what to change', start: 4, min: 0, max: 10, bad: { below: 3 } },
  { id: METER.trust, label: 'Their trust in you', start: 6, min: 0, max: 10, bad: { below: 3 } },
  { id: METER.ownership, label: 'Their ownership of the work', start: 4, min: 0, max: 10, bad: { below: 3 } },
  { id: METER.hours, label: 'Your hours spent', start: 0, min: 0, max: CAPACITY_HOURS, bad: { above: HOURS_RED }, unit: ' h' },
  { id: METER.delivery, label: 'Delivered this week', start: 0, min: 0, max: 15, bad: { below: 0 } },
];

const nodes: Node[] = [
  {
    id: 'miss',
    prompt: `A teammate has now missed a deadline twice on "${MISSED.label.toLowerCase()}". You have a few minutes with them. What do you do?`,
    choices: [
      {
        id: 'vague', label: 'Say "we need to be more on top of deadlines"', to: 'next',
        effects: { [METER.clarity]: 1, [METER.hours]: HOURS.vague },
        because: 'It is quick and kind, and it names nothing they could change: clarity barely moves. Invented effects, except the hours, which are a short chat.',
      },
      {
        id: 'sbi', label: 'Name the situation, the behaviour and the impact', to: 'next',
        effects: { [METER.clarity]: 4, [METER.trust]: 1, [METER.ownership]: 1, [METER.hours]: HOURS.sbi, [METER.delivery]: 2 },
        because: 'Situation-Behaviour-Impact (common practice; the model is credited to the Center for Creative Leadership, from memory, check the source) gives them something specific to act on. It costs a prepared conversation.',
      },
      {
        id: 'solve', label: 'Take the task back and do it yourself', to: 'next',
        effects: { [METER.trust]: -1, [METER.ownership]: -2, [METER.hours]: HOURS.solve, [METER.delivery]: 8 },
        because: `It is the fastest way to get it delivered this week: ${HOURS.solve} of your hours is the board's own cost of doing this task, and it moves delivery the most. The price is their ownership, and the same thing happens next time.`,
      },
      {
        id: 'ask', label: 'Ask questions first: what got in the way?', to: 'next',
        effects: { [METER.clarity]: 2, [METER.trust]: 2, [METER.ownership]: 2, [METER.hours]: HOURS.ask },
        because: 'You may learn the blocker was not effort at all. Invented effects: it builds trust and ownership, and delivers nothing this week.',
      },
    ],
  },
  {
    id: 'next',
    prompt: 'The next deadline for them is two weeks away. How do you follow up?',
    choices: [
      {
        id: 'daily', label: 'Check in every day', to: 'checked',
        effects: { [METER.ownership]: -1, [METER.hours]: HOURS.daily, [METER.delivery]: 3 },
        because: `Close watching catches slips early and costs ${HOURS.daily} of your hours; people tend to read it as low trust (invented effect on ownership).`,
      },
      {
        id: 'checkpoint', label: 'Agree one checkpoint halfway', to: 'checkpointed',
        effects: { [METER.clarity]: 1, [METER.ownership]: 1, [METER.hours]: HOURS.checkpoint, [METER.delivery]: 2 },
        because: 'One agreed look at the half-way point keeps the surprise small without watching every day. Invented effects.',
      },
      {
        id: 'trust', label: 'Say nothing more and trust them', to: 'trusted',
        effects: { [METER.trust]: 1, [METER.ownership]: 1, [METER.hours]: HOURS.trust },
        because: 'It costs nothing and signals trust. If the first conversation left things unclear, nothing here catches a third miss: nothing is delivered this step.',
      },
    ],
  },
];

const endings: Ending[] = [
  { id: 'checked', title: 'You watched closely', text: 'Delivery is safer and your hours are spent. Whether that was right depends on what you did in the first conversation.' },
  { id: 'checkpointed', title: 'You agreed one checkpoint', text: 'The surprise is smaller and your cost is modest. It works best when the first conversation made the change clear.' },
  { id: 'trusted', title: 'You left it with them', text: 'It costs you nothing now. It builds ownership if the problem was understood, and risks a third miss if it was not.' },
];

export const FEEDBACK: Scenario = { start: 'miss', meters: METERS, nodes, endings };

export const PROVENANCE_NOTE = "an invented conversation: your hours come from the board's costs, every other effect is a made-up number, and no real person behaves this way by rule";
