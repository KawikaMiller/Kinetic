/**
 * Scene 3's scenario: an invented review of the invented session-storage proposal. Every effect
 * is an invented number, written to show a trade-off rather than to measure one. The scenario is
 * data for the pure engine in scenario.ts.
 */
import type { ClaimKind } from '../../core/provenance';
import type { Choice, Scenario } from './scenario';

export const CLARITY = 'clarity';
export const DAYS = 'days';
export const SURPRISE = 'surprise';

export const PROPOSAL: Scenario = {
  start: 'length',
  meters: [
    { id: CLARITY, label: 'Decision clarity', start: 6, min: 0, max: 12, bad: { below: 5 } },
    { id: DAYS, label: 'Days to a decision', start: 0, min: 0, max: 30, bad: { above: 5 }, unit: 'days' },
    { id: SURPRISE, label: 'Surprise at implementation time', start: 5, min: 0, max: 14, bad: { above: 6 } },
  ],
  nodes: [
    {
      id: 'length',
      prompt: 'Your design doc for moving session storage out of the monolith is drafted. How long do you make the version you circulate?',
      choices: [
        {
          id: 'short',
          label: 'A one-page doc',
          to: 'objectors-short',
          effects: { [CLARITY]: 3, [DAYS]: 1, [SURPRISE]: 3 },
          because: 'Reviewers read a short doc to the end and decide quickly, but what it leaves out can come back during implementation.',
        },
        {
          id: 'long',
          label: 'A twelve-page doc',
          to: 'objectors-long',
          effects: { [CLARITY]: -1, [DAYS]: 5, [SURPRISE]: -2 },
          because: 'More ground is covered, so fewer surprises later, but the ask is harder to find and review takes longer.',
        },
      ],
    },
    {
      id: 'objectors-short',
      prompt: 'The one-pager is ready. The on-call team and the platform team are the likely objectors. When do you bring them in?',
      choices: objectorChoices('objectors-short'),
    },
    {
      id: 'objectors-long',
      prompt: 'The twelve-pager is ready. The on-call team and the platform team are the likely objectors. When do you bring them in?',
      choices: objectorChoices('objectors-long'),
    },
    {
      id: 'dissent-early',
      prompt: 'The on-call team has been in the room from the start and still disagrees about the failover design. Do you record that in the doc?',
      choices: dissentChoices('early'),
    },
    {
      id: 'dissent-late',
      prompt: 'After circulation the on-call team objects to the failover design. Do you record that in the doc?',
      choices: dissentChoices('late'),
    },
    {
      id: 'dissent-none',
      prompt: 'You circulated without inviting the likely objectors. Someone on the platform team now disagrees with the failover design. Do you record that in the doc?',
      choices: dissentChoices('none'),
    },
  ],
  endings: [
    { id: 'early-recorded', title: 'Aligned early, disagreement on the page', text: 'The objectors helped shape the doc and their remaining disagreement is written next to the decision.' },
    { id: 'early-unrecorded', title: 'Aligned early, disagreement left out', text: 'The objectors were in the room, but the doc reads as if nobody disagreed.' },
    { id: 'late-recorded', title: 'Rework after circulation, disagreement on the page', text: 'The doc was changed in response to late objections, and the remaining disagreement is on the page.' },
    { id: 'late-unrecorded', title: 'Rework after circulation, disagreement left out', text: 'The doc was reworked after late objections, and the disagreement that remained is not in it.' },
    { id: 'none-recorded', title: 'Circulated cold, disagreement on the page', text: 'Nobody was consulted first, and the disagreement that surfaced is recorded in the doc.' },
    { id: 'none-unrecorded', title: 'Circulated cold, disagreement left out', text: 'Nobody was consulted first, and the disagreement that surfaced is not in the doc.' },
  ],
};

/** The same three timing choices follow either length; only the node they leave from differs. */
function objectorChoices(from: string): Choice[] {
  return [
    {
      id: `${from}-early`,
      label: 'Invite them before you circulate',
      to: 'dissent-early',
      effects: { [CLARITY]: 1, [DAYS]: 4, [SURPRISE]: -2 },
      because: 'Early conversations cost days now and bring their objections into the doc before anyone else reads it.',
    },
    {
      id: `${from}-late`,
      label: 'Wait until it is circulated',
      to: 'dissent-late',
      effects: { [CLARITY]: -1, [DAYS]: 4, [SURPRISE]: -1 },
      because: 'Their objections arrive after others have formed a view, so the doc is reworked in public.',
    },
    {
      id: `${from}-none`,
      label: 'Do not invite them',
      to: 'dissent-none',
      effects: { [SURPRISE]: 3 },
      because: 'Nothing is spent now, and whatever they would have said turns up when the system is being built.',
    },
  ];
}

function dissentChoices(timing: string): Choice[] {
  return [
    {
      id: `${timing}-record`,
      label: 'Record the dissent in the doc',
      to: `${timing}-recorded`,
      effects: { [CLARITY]: 1, [DAYS]: 2, [SURPRISE]: -1 },
      because: 'Writing it down costs a short discussion, and the people who decide can see what was disputed.',
    },
    {
      id: `${timing}-skip`,
      label: 'Leave it out',
      to: `${timing}-unrecorded`,
      effects: { [CLARITY]: -1, [SURPRISE]: 2 },
      because: 'The doc stays tidy and the decision is faster, but the disagreement is still real and reappears later.',
    },
  ];
}

/** What kind of claim each choice’s `because` is: every one is a view or common practice, none is a measurement. */
export const BECAUSE_CLAIM: Readonly<Record<string, ClaimKind>> = {
  short: 'view',
  long: 'view',
  'objectors-short-early': 'practice',
  'objectors-long-early': 'practice',
  'objectors-short-late': 'view',
  'objectors-long-late': 'view',
  'objectors-short-none': 'view',
  'objectors-long-none': 'view',
  'early-record': 'practice',
  'late-record': 'practice',
  'none-record': 'practice',
  'early-skip': 'view',
  'late-skip': 'view',
  'none-skip': 'view',
};
