import type { LessonModule } from '../../core/types';
import { alertRows } from './alerts';
import { judge, pageMinutes } from './rules';
import { Stage } from './Stage';
import { BLIP_COUNT, INCIDENTS, WEEK } from './week';

const cpuDefault = judge(pageMinutes(WEEK.cpu, 80, 0));
const noWait = judge(pageMinutes(WEEK.errors, 1, 0));
const twoMinutes = judge(pageMinutes(WEEK.errors, 1, 2));
const longWait = judge(pageMinutes(WEEK.errors, 1, 15));
const symptom = alertRows().find((r) => r.id === 'symptom')!.verdict;
const shortest = INCIDENTS.reduce((a, b) => (b.length < a.length ? b : a));

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'Page on pain, not noise: an alert that wakes a person should mean users are hurt now and a person can act; everything else is a ticket or a dashboard.',
    what: 'You tune an alert rule (a metric, a threshold, and how long it must hold) over one synthetic week with three real incidents and plenty of noise, and read off its pages, its false pages and the incidents it missed. You then compare cause alerts (CPU, disk, a pod restart) with a symptom alert on the error ratio, and add the one cause alert with lead time, a disk-full prediction that raises a ticket. Last, you route twelve invented alerts to a page, a ticket or a dashboard and total the night pages that routing would cause. The week, the alerts and the numbers are all made up, and thresholds are not recommendations. The burn-rate maths belongs to `slos-error-budgets`.',
    analogy: 'Like a smoke alarm that goes off whenever you make toast: after a week you take out the battery, and then it is silent on the night the house is actually on fire.',
    useCases: [
      'Deciding whether a CPU or disk threshold should page someone or only open a ticket',
      'Choosing how long a condition must hold before an alert fires, and what that delay costs',
      'Finding the alerts that fire all the time and teach the on-call to ignore the pager',
      'Making sure every alert that pages has a runbook someone can follow at night',
    ],
    why: 'A pager that rings for nothing trains people to ignore it. Fewer, better alerts are how you keep the one that matters loud, and how you keep on-call something people can sustain.',
    watch: 'The CPU line is blue and the error ratio is yellow; each real incident is a red band, drawn at least an hour wide so the short ones show, and the violet line is your threshold. A green dot is a page during an incident, an orange dot a page with no incident, and a hollow red dot marks an incident that was never paged. In the alert rows, green and orange diamonds are the same pages and a blue diamond is a ticket. On the triage board a green line says the routing matches the rubric and a red one says it does not. Dashed chips say what is simulated or illustrative; solid-bordered labels say a claim is common practice.',
  },
  tryThis: [
    'The rule starts at CPU above 80% for one minute: it pages 20 times in the week, none during an incident, and misses all three. Switch the metric to the checkout error ratio (it starts at 1%) and raise For at least to 3 minutes: 3 pages, all during incidents.',
    'On the error ratio above 1% with no wait, the rule pages 18 times and 15 are false. Raise For at least to 2 minutes: the one-minute blips stop paging and 3 pages are left.',
    'On Symptom vs cause, the symptom alert pages 3 times, all during incidents, and the CPU alert pages 20 times with none. Add the disk-full prediction: it raises one ticket about four hours before the disk fills.',
    'On the Triage board, every alert starts as a page: 70 pages a week. Press Page on pain: 15 a week, and the night pages fall from about 23 to 5.',
  ],
  keyIdeas: [
    'Page on symptoms users feel; a cause such as high CPU is a ticket or a dashboard unless it is hurting someone now.',
    'A for-duration filters out blips but delays real pages by about that long, and misses an incident shorter than the wait.',
    'More alerts are not safer: in this week a rule that pages on CPU spikes catches none of the three incidents.',
    'A cause alert with lead time, such as a disk-full prediction, belongs in a ticket: someone can act before anyone is hurt.',
  ],
  quiz: [
    {
      q: 'A rule fired 61 times last week and none of those pages was during an incident. What do you do with it?',
      options: [
        'Keep it paging, since an alert that fires is safer than one that stays quiet',
        'Silence it for a week and look at it again after the next real incident',
        'Move it to a ticket or dashboard, or change it so a page means a user is hurt',
        'Add more people to the rota so that each person gets fewer of the pages',
      ],
      answer: 2,
      why: `In this lesson’s week the CPU rule pages ${cpuDefault.pages} times, ${cpuDefault.useful} during an incident, and misses ${cpuDefault.missed.length} of ${INCIDENTS.length}. Noise teaches people to ignore the pager, and more people just share the noise.`,
    },
    {
      q: 'Which alert should wake someone at 02:00?',
      options: [
        'CPU above 80% on a batch machine for one minute during the nightly run',
        'The checkout error ratio above its threshold for a few minutes',
        'A pod restarted once in the last hour on a single node',
        'A certificate that expires in six days from today',
      ],
      answer: 1,
      why: `A human has to act now and users are hurt now: the symptom alert paged ${symptom.pages} times, ${symptom.useful} of them during an incident. The others can wait for working hours or need no one.`,
    },
    {
      q: 'You raise the for-duration on the error-ratio rule (error ratio above 1%) from none to two minutes. What changes in this week?',
      options: [
        'The one-minute blips stop paging, and the real incidents still page',
        'The real incidents stop paging, because they are shorter than two minutes',
        'Nothing changes, because the threshold decides the pages and not the wait',
        'The rule pages more often, because every blip now counts twice',
      ],
      answer: 0,
      why: `With no wait the rule pages ${noWait.pages} times, ${noWait.falsePages} of them false, because of the ${BLIP_COUNT} one-minute blips. With a 2-minute wait it pages ${twoMinutes.pages} times, each during an incident.`,
    },
    {
      q: 'What does a longer for-duration cost?',
      options: [
        'Nothing, since a rule that waits is strictly safer than one that fires at once',
        'It pages later by about that long, and an incident shorter than the wait is missed',
        'It makes every page a false one, because the condition has already cleared by the time it fires',
        'It changes which metric the rule watches, so the threshold has to be reset to match it',
      ],
      answer: 1,
      why: `A 15-minute wait pages ${longWait.timeToPage[0]} minutes into the first incident instead of ${noWait.timeToPage[0]}, and misses the ${shortest.name.toLowerCase()}, which lasts ${shortest.length} minutes.`,
    },
  ],
};

export default lesson;
