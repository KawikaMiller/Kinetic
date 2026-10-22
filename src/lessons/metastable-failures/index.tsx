import type { LessonModule } from '../../core/types';
import { fixParams, initialFix, phaseText } from './init';
import { Stage } from './Stage';
import { BROKEN_SEED, CAPACITY, FIX_RUN_TICKS, LONG_OUTAGE, RUN_TICKS, TRIGGER_START, collapseMechanism, crossoverLoad, defaultParams, effectiveLoad, phaseOf, runMeta, shedCrossover } from './model';

const base = { ...defaultParams(), seed: BROKEN_SEED };
const first = runMeta(base);
const mech = collapseMechanism(first);
const phaseAt = (trigger: number) => phaseOf(runMeta({ ...base, trigger }));
const fixRun = (over: Partial<ReturnType<typeof initialFix>>) => {
  const run = runMeta(fixParams({ ...initialFix(), ...over }), FIX_RUN_TICKS);
  return { run, ...phaseOf(run) };
};
const cancelled = fixRun({ cancel: true });
const jittered = fixRun({ jitterOn: true });
const longBudget = fixRun({ long: true, budgetOn: true });
const noRetries = phaseOf(runMeta({ ...base, retries: 0 }));

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'A short trigger can leave a system overloaded long after the trigger is gone, because retries and abandoned work keep feeding the overload. The fix is to break the loop, not to remove the trigger.',
    what: 'Normally an overload ends when its cause does. In a metastable failure the cause ends but the overload does not: requests wait so long that clients give up and retry, the server spends its capacity on work nobody is waiting for, and the retries keep the queue long enough that the next wave also gives up. Whether the loop can sustain itself comes down to arithmetic, blurred by noise near the edge: each request offers 1 + R arrivals when everything times out, and if that clearly exceeds capacity the backlog does not drain.',
    analogy: 'A traffic jam that outlives the accident. The crash is cleared, but the road is so full that drivers take side streets, merge badly and stop to let each other in, and the queue feeds itself until the road is closed or traffic is turned away.',
    useCases: [
      'Reading an incident where a brief dependency blip was followed by hours of degraded service',
      'Choosing retry counts, retry budgets and timeouts so retries cannot outweigh capacity',
      'Deciding where to cancel abandoned work and where to shed load before the queue is deep',
      'Telling a long outage that drains by itself from a metastable one that needs intervention',
    ],
    why: 'The usual reflex during an outage is to retry harder or wait it out: retrying harder feeds the loop, and waiting does not end it. Knowing that the sustaining effect, not the trigger, is what keeps the system down is what points you at the lever that works: cancelling work nobody waits for, capping retries, or shedding load.',
    watch:
      'Green is goodput, requests served while their client still waits; red is wasted work, capacity spent on abandoned requests; blue is new requests and orange is retries (a labelled category, not an error). The yellow line is the queue and the violet band is the trigger window. In the sweeps the blue dots are measured over 200 seeds, the dashed grey curve is no mitigation and the grey vertical line is the closed form. The chips say what is simulated, made up, a toy or from memory.',
  },
  tryThis: [
    `At the defaults (load ${base.lambda}, timeout ${base.timeout}, ${base.retries} retries, trigger ${base.trigger} ticks, seed ${BROKEN_SEED}) press Run ${RUN_TICKS} ticks: queue and arrivals jump during the violet band and then stay high; the phase reads "${phaseText(phaseOf(first).phase, phaseOf(first).recoveredAt)}", wasted work sits at ${CAPACITY} and arrivals near ${Math.round(mech.arrivals)} (${base.lambda} x ${1 + base.retries} = ${effectiveLoad(base.lambda, base.retries)}).`,
    `From the defaults set the trigger length d to 5: this seed recovers at tick ${phaseAt(5).recoveredAt}. Set d to 6 and then 7: the seed ends "${phaseText(phaseAt(6).phase, phaseAt(6).recoveredAt)}" at 6 and "${phaseText(phaseAt(7).phase, phaseAt(7).recoveredAt)}" at 7. The next scene's sweep measures how narrow the band between the two worlds is.`,
    `From the defaults set retries R to 0 and run: ${noRetries.phase === 'recovered' ? `recovered at tick ${noRetries.recoveredAt}` : noRetries.phase}, because with no retries nothing amplifies, and the sustain panel says "the queue drains on its own". Put R back to 3 and the loop returns.`,
    `In "What breaks the loop" at the defaults turn on "Skipped for free": recovered at tick ${cancelled.recoveredAt}, goodput back at 70. Turn it off and turn on "Backoff and jitter" (J = 4): ${jittered.phase === 'collapsed' ? 'still collapsed' : jittered.phase}.`,
    `In "What breaks the loop" turn on "Long outage" (d = ${LONG_OUTAGE}) and "Retry budget" (ratio 0.1): this seed recovers at tick ${longBudget.recoveredAt}, ${(longBudget.recoveredAt ?? 0) - (TRIGGER_START + LONG_OUTAGE)} ticks after the trigger, and the stat panel prints the drain-time formula next to it.`,
  ],
  keyIdeas: [
    'In this model a trigger of 5 ticks recovers on every seed tried and one of 6 ticks or more leaves most seeds collapsed at tick 200: the sustaining loop, not the trigger, keeps the overload alive.',
    `The loop can sustain itself when load x (1 + retries) reaches capacity, so with 3 retries and capacity ${CAPACITY} the crossover is a load of ${crossoverLoad(3)}; the sweep's dots climb through that point over a few units of load instead of jumping at it.`,
    `Cancelling abandoned work, capping retries with a budget and shedding load below a queue limit of about ${shedCrossover()} each break the loop in this model; a shedding limit above that leaves it collapsed, and backoff and jitter alone only move the tipping point.`,
    'A long outage that drains slowly is not metastable: the difference is whether the effective load is below capacity, in which case the backlog drains in about backlog / (capacity - effective load) ticks.',
  ],
  quiz: [
    {
      q: 'The capacity dip ends at tick 30, yet goodput is still near zero at tick 200. Why?',
      options: [
        'The server still has damage from the dip and needs a full restart',
        'Abandoned work and retries keep the queue longer than the timeout',
        'The load rose after the dip, so the system was simply overloaded',
        'The retries stopped after three attempts, which starved real clients',
      ],
      answer: 1,
      why: 'A queue longer than the timeout means a request is abandoned before it is served, and each abandoned request returns as a retry. The load did not rise and nothing is broken; the loop keeps itself alive.',
    },
    {
      q: 'Retries R = 3 and capacity 100. At what load can a collapse sustain itself?',
      options: [
        'Any load above zero, because retries multiply the load without any limit at all',
        'Only load above 100, the capacity of the server itself',
        'Load of 25 or more, where 4 attempts per request reach capacity',
        'Load of 75 or more, which is three quarters of the capacity',
      ],
      answer: 2,
      why: 'When everything times out each request offers 1 + R = 4 arrivals, so the queue sees 4 times the load. That reaches capacity at 100 / 4 = 25, well below the 100 a naive reading suggests.',
    },
    {
      q: 'Which change breaks the loop in this model?',
      options: [
        'Retrying faster, so clients get an answer before the queue grows',
        'Adding exponential backoff alone, since retries then arrive spread out',
        'Letting the server skip work whose client already gave up',
        'Raising the retry count so each client eventually gets an answer',
      ],
      answer: 2,
      why: 'Skipping abandoned work stops capacity being wasted on it. Faster or more retries add load, and backoff alone just moves the tipping point, as the sweep shows.',
    },
    {
      q: 'A retry budget of 10% is on and a 60-tick outage ends. What happens?',
      options: [
        'Goodput stays at zero for ever, exactly as it would without any budget',
        'Goodput returns at once, because retries are capped from this point on',
        'Goodput returns after the backlog drains, which takes a long time',
        'Goodput returns once the budget refills, after about ten ticks',
      ],
      answer: 2,
      why: 'The budget keeps the effective load below capacity, so the loop does not hold, but the backlog from the outage still has to drain: about 130 ticks here. That is a long outage, not a metastable one.',
    },
    {
      q: 'Load 70, R = 3, every attempt times out. About how many requests arrive per tick?',
      options: [
        '70, since each retry replaces the original request it came from',
        '140, which counts one retry for each request that arrives',
        '210, which counts the three retries but not the new requests',
        '280: the 70 new requests plus three generations of retries',
      ],
      answer: 3,
      why: 'The 70 new requests each return up to three more times, so 70 x 4 = 280 attempts a tick. Retries add to the load, they do not replace the attempts they follow.',
    },
  ],
};

export default lesson;
