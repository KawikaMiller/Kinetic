import type { LessonModule } from '../../core/types';
import { ACK_MIN, ACTION_MINUTES, CONFLICT_DELAY_MIN, DEGRADED_RATE, ONSET_RATE, outcomeRows, type Action, type Cause } from './model';
import { Stage } from './Stage';

const ROWS = outcomeRows();
const row = (cause: Cause, first: Action) => ROWS.find((r) => r.cause === cause && r.first === first)!;
const fmt = (n: number) => n.toLocaleString('en-US');

const rollbackFirst = row('deploy', 'rollback');
const investigateFirst = row('deploy', 'investigate');
const failoverFirst = row('deploy', 'failover');

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'When production is failing, stop the damage first and understand it second: pick a cheap, reversible action that fits the evidence, give people clear roles, and keep customers told.',
    what: 'You play the on-call engineer in one invented incident. You declare a severity, assign the four roles of an incident team, then choose actions, while a hidden cause decides which of them works: a bad deploy, a slow dependency or one region down. Each choice moves four meters (failed requests, minutes, customer trust, people pulled in) and shows its reason. A timeline replay then lines up detect, acknowledge, mitigate and resolve beside the log, and a table shows every first action against every cause. The incident, numbers and log lines are all invented.',
    analogy: 'Like a first-aid responder at a road accident: stop the bleeding before working out how the crash happened, and let one person direct everyone else.',
    useCases: [
      'Getting checkout working again after a release, before anyone has written a root cause',
      'Deciding between a rollback, a failover and a feature switch when the cause is not yet known',
      'Running a long incident with someone deciding, someone typing and someone telling customers',
      'Reading an incident timeline to see where the minutes went',
    ],
    why: 'Most of the cost of an incident is paid while it is still running. The habits that shorten it are small and learnable: act on cheap, reversible options, name who decides, and keep customers informed while you work.',
    watch: 'Meters are blue until they cross the red mark on their bar, then turn red. In the timeline replay a red bar is time spent failing before anyone knew, a yellow bar is an action in progress, a green one worked, an orange one changed nothing for this cause, and blue marks the page, a finding or a status update; diamonds are single moments. In the table, a yellow-edged row is your own first move and a green number is the fewest failed requests for that cause. Dashed chips say what is invented; solid-bordered labels say whether a claim is common practice or one view.',
  },
  tryThis: [
    'With the cause on Bad deploy, pick SEV2, assign all four roles, then roll back: it ends at minute 10 with 4,000 failed requests. Undo twice, then investigate first and roll back: minute 13, 5,200.',
    'Switch the hidden cause to Slow dependency, pick SEV2, assign all four roles and roll back. It changes nothing for this cause and costs 4 minutes. Then switch the flag off the recommendations feature: errors fall to 120, and the story can only end as contained, not fixed.',
    'With the cause on Bad deploy, pick SEV2, then choose Skip the roles and roll back. It ends at minute 12 instead of 10, and customer trust ends at 74 instead of 81.',
    'Open Timeline replay without finishing the story and press play: the sample path investigates first, so the errors are detected at minute 4, acknowledged at minute 6, and mitigated and resolved at minute 13.',
    'Open Every first move with the cause on Bad deploy: rolling back first is best at 4,000 failed requests, and failing over first costs 2,800 more.',
  ],
  keyIdeas: [
    'Mitigate first, understand second is common practice, not a law: the first action should be cheap, reversible and matched to what the evidence shows.',
    'A mitigation can do nothing for the cause you actually have; in this model a rollback does not help a slow dependency, and failing over does not help a bad build.',
    'A degraded mitigation limits the damage while the cause remains, and saying so to customers is part of the job.',
    'Roles exist so that one person decides, one types and one tells customers; skipping them costs minutes and trust in this model.',
  ],
  quiz: [
    {
      q: 'A deploy finished two minutes before checkout errors began, and rolling it back is cheap and easy to undo. What does the on-call do first?',
      options: [
        'Find the root cause first, because a rollback could destroy the evidence',
        'Roll back the deploy now and keep investigating while it takes effect',
        'Try whichever fix comes to mind and keep going until the errors stop',
        'Wait for a second alert, because one alert is not enough to act on',
      ],
      answer: 1,
      why: `In this lesson’s model a rollback on a bad deploy mitigates at minute ${rollbackFirst.mitigatedAt} for ${fmt(rollbackFirst.failed)} failed requests, while investigating first reaches minute ${investigateFirst.mitigatedAt} for ${fmt(investigateFirst.failed)}, and failing over first (a wrong guess that costs ${ACTION_MINUTES.failover} minutes) ${fmt(failoverFirst.failed)}.`,
    },
    {
      q: 'What does the incident commander do in the usual incident-command structure?',
      options: [
        'Types the commands that mitigate the problem while the others watch',
        'Writes the customer updates for the status page and answers questions',
        'Decides who does what and keeps the whole picture, but does not debug',
        'Records every decision with its time so a later review can follow it',
      ],
      answer: 2,
      why: `The commander decides, the operations lead types, the communications lead tells customers and the scribe records, a structure borrowed from emergency services (common practice). In the story, skipping the commander lost ${CONFLICT_DELAY_MIN} minutes to two responders acting at once, at ${ONSET_RATE} failures per 1,000.`,
    },
    {
      q: `A flag cut a slow dependency from ${ONSET_RATE} to ${DEGRADED_RATE} failures per 1,000, and no action in your hands removes the rest. What now?`,
      options: [
        'Keep rolling back and failing over until the errors reach zero',
        'Switch the flag off again, since a mitigation that leaves errors failed',
        'Declare it resolved, because the error rate is far lower than before',
        'Keep the flag on, tell customers what is degraded and hand the rest to the owner',
      ],
      answer: 3,
      why: 'A degraded mitigation limits the damage while the cause remains. The story ends as contained, not fixed: the owner of the dependency has the rest, and customers hear what is still wrong.',
    },
    {
      q: `Two reports of the same incident give ${investigateFirst.mitigatedAt} minutes and ${investigateFirst.mitigatedAt - ACK_MIN} minutes to mitigate. What can explain the gap?`,
      options: [
        'One counts from the onset of the errors and the other from the page being acknowledged',
        'One of the two reports used a faster mitigation than the other, so it is the better one',
        'The longer one included the time spent writing the postmortem afterwards',
        'The shorter one only counts the minutes in which nobody was failing',
      ],
      answer: 0,
      why: `Definitions of detect, acknowledge, mitigate and resolve vary by organisation. Here the page was acknowledged at minute ${ACK_MIN}, so a count from the acknowledgement is ${ACK_MIN} minutes shorter than one from the onset.`,
    },
  ],
};

export default lesson;
