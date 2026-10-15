import type { LessonModule } from '../../core/types';
import { ALL_AT_ONCE, FAULT_REGION, FLEET, PEAK_DELAY, REGIONS, REGION_SIZE, TIMEOUT_OK, TIMEOUT_RANGE, TIMEOUT_TYPO, allAtOnceWith, bakeThresholds, changeOf, planFrom, simulate, type ChangeId, type Plan } from './model';
import { DEFAULT_PLAN } from './plan';
import { Stage } from './Stage';

const staged = (o: Partial<Pick<Plan, 'bake' | 'gate' | 'validate' | 'autoRollback'>> = {}): Plan =>
  planFrom(DEFAULT_PLAN.stages, { bake: DEFAULT_PLAN.bake, gate: DEFAULT_PLAN.gate, validate: DEFAULT_PLAN.validate, autoRollback: DEFAULT_PLAN.autoRollback, ...o });
const run = (id: ChangeId, plan: Plan) => simulate(changeOf(id), plan);

const crashAll = run('crash', ALL_AT_ONCE);
const regionAll = run('region', ALL_AT_ONCE);
const crashStaged = run('crash', staged());
const peakShort = run('peak', staged());
const peakLong = run('peak', staged({ bake: 25 }));
const regionStaged = run('region', staged());
const validationOn = run('validation', staged({ validate: true }));
const validationOff = run('validation', staged());
const crashAllSafe = run('crash', allAtOnceWith(DEFAULT_PLAN));
const peakAllSafe = run('peak', allAtOnceWith(DEFAULT_PLAN));
const peakBake = bakeThresholds(changeOf('peak'), staged());
const peakMidBake = run('peak', staged({ bake: peakBake.beforeAll! }));
const fmt = (n: number) => n.toLocaleString('en-US');

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'A config change is a deployment: it can take everything down in a minute, so ship it in stages, check it before it ships, watch it with a gate, and be able to take it back.',
    what: `You push four invented config changes to a simulated fleet of ${FLEET} servers in ${REGIONS.length} regions: one that fails the schema check, one that crashes on load, one that is bad only at peak and one that is bad for a single region’s data. First everywhere at once, then through stages you choose (a canary, one region, half, then all) with a bake time and a health gate, with validation and rollback you can switch. Every plan is scored in one unit, server-minutes affected, and a calendar view lays the same plan on a UTC timeline beside each region’s peak. The fleet, traffic and numbers are simulated and invented.`,
    analogy: 'Like repainting a road: you do one lane first and watch the traffic before closing the rest, and you keep the old paint ready.',
    useCases: [
      'Changing a timeout, a pool size or a routing table without a full release',
      'Checking a value against a schema before it can reach any server',
      'Choosing how long to wait between stages, and what the gate looks at',
      'Reading an outage report where a configuration change reached everything at once',
    ],
    why: 'Config changes skip the code review, tests and rollout that code gets, and they are quick to write, so one wrong value can reach everything fast. The same habits that protect code releases protect config: stages, gates, checks and a way back.',
    watch: 'Each square is a server and each row a region. A grey outlined square has not been reached, a green one has the change and is healthy, a red one is failing and a blue one has been rolled back; a yellow ring marks the stage being baked, and an orange outline means validation refused the change so no server was touched. On the schedule, violet hatched bars are stages baking, yellow diamonds are a stage landing, green is a gate passing, red is the rollout being stopped and amber bars are a region’s peak. Dashed chips say what is simulated or illustrative.',
  },
  tryThis: [
    `The change starts as Crashes on load. Pushed everywhere at once, ${FLEET} servers fail for 25 minutes: ${fmt(crashAll.serverMinutes)} server-minutes. Switch to Bad for one region’s data: ${REGION_SIZE} servers, ${fmt(regionAll.serverMinutes)}.`,
    `On Staged, the default plan (canary, one region, half, then all, a ${DEFAULT_PLAN.bake} minute bake, a gate and automatic rollback) costs ${crashStaged.serverMinutes} server-minutes for Crashes on load: the gate stops it at the canary. Read the stat beside it: the same push all at once with that gate and rollback costs ${crashAllSafe.serverMinutes}, so the gate and rollback account for most of the drop from the ${fmt(crashAll.serverMinutes)} of scene 1, and staging for the rest.`,
    `On Staged, pick Bad only at peak. With the ${DEFAULT_PLAN.bake} minute bake all ${FLEET} servers get it first and it costs ${peakShort.serverMinutes}; drag Bake to ${peakBake.beforeAll} and the gate stops it before everyone has it; drag it to 25 and it stops at the canary for ${peakLong.serverMinutes}.`,
    `On Staged, pick Fails validation: the gate stops it at the canary for ${validationOff.serverMinutes} server-minutes. Switch Validate before push on: it is refused and nothing ships, so 0.`,
    `On Staged, pick Bad for one region’s data. The canary, one region and half all pass, because the broken region only gets it at the last stage: ${regionStaged.serverMinutes} server-minutes.`,
  ],
  keyIdeas: [
    'A config change is a deployment: it deserves a check before it ships, a staged rollout, a watching gate and a rollback.',
    `In this model the gate keeps watching every server it has reached, so staging helps once the watching before the last stage lands (the earlier stages together) outlasts the time the change takes to show itself. For the ${PEAK_DELAY}-minute change, a bake under ${peakBake.beforeAll} minutes lets it reach all ${FLEET}, ${peakBake.beforeAll} or more stops it short of everyone, and ${peakBake.atFirstStage} or more stops it at the canary.`,
    'A canary tells you about the servers it runs on, so a fault confined to one region can pass the early stages until that region gets it.',
    'Count the damage in one unit across strategies, here server-minutes from the minute a server fails until the rollback reaches it.',
  ],
  quiz: [
    {
      q: `A change takes ${PEAK_DELAY} minutes to show itself, and the rollout bakes each stage for ${DEFAULT_PLAN.bake} minutes. Does staging protect you?`,
      options: [
        'Yes, because staged is safe whatever the bake time is',
        'Far less than it could, because every stage lands before the gate sees a problem',
        'Yes, because the first stage is only one server and cannot hurt',
        'No, because a gate cannot stop a change once it has landed anywhere',
      ],
      answer: 1,
      why: `In this lesson’s model that rollout reaches all ${peakShort.reached} servers before the gate sees a problem and costs ${peakShort.serverMinutes} server-minutes: staging still helps, since an all-at-once push with the same gate and automatic rollback costs ${peakAllSafe.serverMinutes}, but far less than it could. The gate watches every server reached, so what counts is the watching time before the last stage lands, not each bake against the delay: a bake of ${peakBake.beforeAll} minutes stops it at ${peakMidBake.reached} servers for ${peakMidBake.serverMinutes}, and 25 stops it at the canary for ${peakLong.serverMinutes}.`,
    },
    {
      q: `A config change sets a timeout of ${TIMEOUT_TYPO} where ${fmt(TIMEOUT_OK)} was meant, and the schema allows ${fmt(TIMEOUT_RANGE.min)} to ${fmt(TIMEOUT_RANGE.max)}. What does validating before the push do?`,
      options: [
        'It lets the change ship, then rolls it back when servers fail',
        'It refuses the change before any server has it, so nothing is affected',
        'It ships the change to the canary first, to see whether it breaks',
        'It fixes the value to the nearest one the schema allows, then ships it',
      ],
      answer: 1,
      why: `A refusal is not an outage: in the model it costs ${validationOn.serverMinutes} server-minutes, while shipping it costs ${validationOff.serverMinutes} even with a gate. Validation catches what the schema describes, and a value that passes can still crash a service.`,
    },
    {
      q: `A change is bad only for ${REGIONS[FAULT_REGION]}, and the canary is one server in ${REGIONS[0]}. What does the gate see at the canary?`,
      options: [
        'A failure, because the whole fleet shares one configuration file',
        'Nothing wrong, because the canary does not run where the fault is',
        'A failure, because a canary always fails first when a change is bad',
        'Nothing at all, because the gate only starts at the last stage',
      ],
      answer: 1,
      why: `The broken region receives the change at the last stage, so the canary, one region and half each pass. In the model that costs ${regionStaged.serverMinutes} server-minutes, caught as soon as the whole fleet has it.`,
    },
    {
      q: 'Why does the lesson score every plan in server-minutes?',
      options: [
        'Because it counts every server that fails once and ignores how long it stayed failing',
        'Because it uses the same unit for every strategy: each failing server from its first failure to the rollback',
        'Because it only counts the servers a gate protected, which is the fair measure for a rollout',
        'Because a minute of failure on one server is worth the same as an hour on another',
      ],
      answer: 1,
      why: `Comparing plans needs one unit. Everything at once, as scene 1 pushes it (no gate, rollback by hand), costs ${fmt(crashAll.serverMinutes)} server-minutes for a crash and the default staged plan ${crashStaged.serverMinutes}. The unit is the same but the plans differ in more than staging: the same push all at once with the default’s gate and automatic rollback costs ${crashAllSafe.serverMinutes}, which is why the staged scene shows that number beside its own.`,
    },
  ],
};

export default lesson;
