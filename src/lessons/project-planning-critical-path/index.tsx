import type { LessonModule } from '../../core/types';
import { FACTS as F } from './facts';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'The ship date is set by the longest chain of dependent tasks, the critical path; tasks off it have slack that is shared along a chain, and the date reacts to people and uncertainty in ways the chain explains.',
    what: `A project is a graph of tasks that wait for each other. A forward pass finds each task's earliest start and finish, a backward pass finds its latest, and slack is the difference. Tasks with zero slack form the critical path, ${F.critical} of ${F.tasks} tasks in the preset, taking ${F.length} working days. You edit durations and dependencies (a cycle is refused with its loop named), crash a task and watch a second chain take over, share the tasks among one to six engineers against two lower bounds and a brute-force optimum, try a toy about adding people late, and simulate duration ranges to see criticality indices and merge bias. The tasks and numbers are invented.`,
    analogy: 'A road trip with several cars that must all reach the same house: the date the house is full is set by the slowest car, and a faster car that was already early changes nothing. Add a passenger to the slowest car at the last minute and you may spend more time loading than you save.',
    useCases: [
      'Finding which tasks a delay would push into the ship date, and which have room',
      'Deciding where extra effort shortens the project and where it is wasted',
      'Explaining why a plan with many parallel branches finishes later than any single branch suggests',
      'Answering a request to add people to a late project',
    ],
    why: 'Plans fail on the longest chain, not the longest task list. Knowing that slack is shared and that cutting a critical task has limits stops effort going to tasks that cannot move the date, and gives you the numbers to argue about people and risk instead of opinions.',
    watch: 'On The critical path and Crashing tasks, a task with zero slack is yellow, a task with slack is blue with a faint grey extension for its slack, a task that became critical after your change is orange, the selected task is violet, and the project end is a green diamond. On People each engineer has a plain tone (amber, pink, sky, orange, violet, grey) and a yellow outline marks a critical task. In Adding people late the blue line is the days to finish, the green line marks the earliest finish and the grey line is one person alone. In Uncertainty the blue bars are simulated project lengths, runs that meet the plan are green, and the yellow line is their average.',
  },
  tryThis: [
    `The critical path, from a fresh load: the project is ${F.length} days and ${F.critical} of ${F.tasks} tasks are critical (${F.chain}). Press "Add dependency" with the pickers as they are: Release before Design is refused, "${F.cycleError}" Then click UI, press "Longer by a day" twice: the project stays ${F.uiSlipLength} days, and clicking Polish now reads ${F.polishSlackAfterSlip} days of slack, because the two share one ${F.uiSlack}-day float.`,
    `Crashing tasks, from a fresh load (API, change 0): drag the change to -3. Cutting API from 5 to 2 days moves the end to day ${F.apiCutLength}, not ${F.apiCutNaive}, and ${F.newlyCritical} turn orange: a second chain took over.`,
    `People, from a fresh load (${F.engineers} engineers): the list schedule finishes on day ${F.listMakespan}, the lower bounds are ${F.criticalPath} and ${F.workShare}, and brute force finds ${F.optimum}. Drag to 1 engineer: it takes ${F.oneEngineer} days, the sum of all the work.`,
    `Adding people late, from a fresh load: one person finishes in ${F.brooksOne} days, the earliest finish is ${F.brooksBestDays} days with ${F.brooksBest} people, and from ${F.brooksLaterAt} people the date is later than with one.`,
    `Uncertainty, from a fresh load: the plan says ${F.length} days but the simulated average is ${F.riskMean}. API is on a longest chain in ${F.apiCriticality}% of runs and Schema in ${F.schemaCriticality}%.`,
  ],
  keyIdeas: [
    `The critical path is the longest chain by duration, not the hardest tasks: in the preset ${F.critical} of ${F.tasks} tasks have zero slack, and a task with slack can start late by that much, shared along its chain (UI and Polish share ${F.uiSlack} days).`,
    `Cutting a critical task moves the date only until a second chain becomes critical: cutting API by 3 days saves ${F.apiSaved} in this model, ending at day ${F.apiCutLength}, because ${F.newlyCritical} is as long.`,
    `More engineers cannot beat the critical path (${F.criticalPath} days) or the work shared evenly, and a simple list rule can trail the best schedule (day ${F.listMakespan} against ${F.optimum} on ${F.engineers} engineers). In the invented toy for adding people late, the best team is ${F.brooksBest}, and ${F.brooksLaterAt} people finish later than one: Brooks's rule of thumb is one view, not a law.`,
    `Durations are ranges: the plan says ${F.length} days and the simulated average is ${F.riskMean}, because where chains merge the later one counts, so the merge finishes later on average than either chain alone.`,
  ],
  quiz: [
    {
      q: 'Which tasks are on the critical path of a project?',
      options: [
        'The chain of dependent tasks with the longest total duration, whichever tasks they are',
        'The hardest tasks, because difficult work is what usually delays a release',
        'The most important tasks, because the business cares most about those',
        'The tasks with the most dependents, because a delay in them reaches the most work',
      ],
      answer: 0,
      why: `It is defined by duration along a chain. In the preset ${F.critical} of ${F.tasks} tasks have zero slack, and the shortest of them, Release at 1 day, is on it while the 4-day UI task is not.`,
    },
    {
      q: 'UI has 2 days of slack. It slips by 3 days. What happens to the end date?',
      options: [
        'It does not move, because UI is off the critical path and tasks that are off that path never matter to the date',
        'It moves by 3 days, because any slip in a task moves the end by the same amount',
        'It moves by 1 day, because the slack absorbs 2 of the 3 days and the rest reaches the end',
        'It moves by 2 days, because the slack is added to the slip instead of absorbing it',
      ],
      answer: 2,
      why: `Slack is room, not immunity. In the preset a 3-day slip on UI moves the end by ${F.uiSlipThreeMoves} day, and the first 2 days used up the float that UI shares with Polish.`,
    },
    {
      q: 'Cutting a critical task by 3 days moves the end by only 2. What is the most likely reason in this lesson\'s preset?',
      options: [
        'The 3-day cut was partly cancelled by a coordination cost that grows with the size of the team',
        'Another chain, UI then Polish, was nearly as long and became the critical path',
        'Cutting a task never saves its full time, because estimates are always padded a little',
        'The calendar skips weekends, which hides one of the days that the cut was supposed to save',
      ],
      answer: 1,
      why: `Cutting API from 5 to 2 days ends the project on day ${F.apiCutLength}, not ${F.apiCutNaive}: ${F.newlyCritical} became critical. Past that point the date moves again when the other chain is cut too.`,
    },
    {
      q: 'A project is late. In the lesson\'s invented toy, what does the curve for adding people look like?',
      options: [
        'It falls steadily, because each person added can take a share of the remaining work and so finish it sooner',
        'It falls to a minimum and then rises, so past some team size the date is later than with fewer people',
        'It stays flat, because people add speed and coordination cost in the same amounts',
        'It rises from the first person added, because newcomers never produce anything useful',
      ],
      answer: 1,
      why: `With the defaults one person takes ${F.brooksOne} days, ${F.brooksBest} people take ${F.brooksBestDays}, and ${F.brooksLaterAt} people take longer than one. The parameters are invented, and Brooks's rule of thumb is one view.`,
    },
  ],
};

export default lesson;
