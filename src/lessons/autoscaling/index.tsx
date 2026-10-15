import type { LessonModule } from '../../core/types';
import { sig } from '../distributions/fmt';
import {
  CONTROLLER_DEFAULT, FLASH, INSTANCE_RPS, MAX_INSTANCES, SCENE_DEFAULT, ceilDiv, runFleet, type Controller,
} from './model';
import { Stage } from './Stage';

const run = (preset: Parameters<typeof runFleet>[0], over: Partial<Controller> = {}) => runFleet(preset, { ...CONTROLLER_DEFAULT, ...over }, SCENE_DEFAULT.seed);

const FLASH_DEFAULT = run('flash').summary;
const FLASH_SLOW = run('flash', { warmupMin: 8 }).summary;
const NEEDED = ceilDiv(FLASH.base * FLASH.factor * 100, INSTANCE_RPS * CONTROLLER_DEFAULT.targetPct);
const NOISY_CALM = run('noisy').summary.flaps;
const NOISY_JITTERY = run('noisy', { cooldownOut: 0, cooldownIn: 0 }).summary.flaps;
const DAILY_REACTIVE = run('daily').summary.violationMinutes;
const PREDICTIVE_DAILY = run('daily', { policy: 'predictive' }).summary.violationMinutes;
const SCHEDULED_DAILY = run('daily', { policy: 'scheduled' }).summary.violationMinutes;
const PREDICTIVE_FLASH = run('flash', { policy: 'predictive' }).summary.violationMinutes;
const WARM = CONTROLLER_DEFAULT.warmupMin;

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'An autoscaler is a control loop that reacts after the load has moved and whose new capacity arrives after a warm-up, so it lags; its settings decide whether the lag costs you dropped requests, an overshoot or a flapping fleet.',
    what: `Target tracking asks for ⌈current × metric ÷ target⌉ instances, so a fleet at 90% against a 60% target grows by half. The loop reads a metric, decides, and the instances it launches serve only after a warm-up, so a spike is dropped until they arrive and, if warming instances count as current while the metric still reads the old fleet, the controller keeps asking for more and overshoots. Cooldowns stop it flapping on noise. Scheduled and predictive policies move the capacity ahead of load that repeats, and a fleet that follows the load costs less than one sized for the peak.`,
    analogy: 'A heater with a thermostat in another room and a slow boiler: it only reacts once the cold has reached the thermostat, and the heat takes minutes to arrive. Turn the response up too far and it overshoots; remove its pause and it clicks on and off.',
    useCases: [
      'Choosing a target utilisation, warm-up allowance and cooldowns for a web or worker fleet',
      'Explaining why a flash sale drops requests even though autoscaling is on',
      'Deciding when a schedule or a forecast beats a purely reactive policy',
      'Putting a price on following the load against sizing for the peak',
    ],
    why: 'Autoscaling is sold as protection from spikes, and the lag is what decides whether it is. Knowing where the lag comes from lets you set warm-up and cooldowns on purpose, spot a flapping or overshooting loop in a graph, and choose a schedule or a forecast for load that repeats.',
    watch: 'A reactive loop: the blue line is offered load, the green line ready capacity, the dashed violet line the instances paid for, which includes the ones still warming (not yet serving), and a red band is dropped load. The yellow rule is the minute shown. In the instance lanes a hatched violet bar is an instance warming and a green bar an instance serving. The meter is green within the target, orange above it and red past 90% or when load is dropped. Scheduled and predictive: a green cell is the cheapest policy with no violations on that traffic, a red cell has violation minutes, and the yellow outline is the run drawn below. The bill: green is a bill with no violation minutes, red a saving that cost violation minutes.',
  },
  tryThis: [
    `In A reactive loop at the defaults, a flash spike with a ${WARM} minute warm-up drops load for ${WARM + 1} minutes: ${FLASH_DEFAULT.violationMinutes} violation minutes and ${sig(FLASH_DEFAULT.dropped)} requests dropped, before ${NEEDED} instances carry it.`,
    `Set Warm-up to 8: the violation minutes grow to ${FLASH_SLOW.violationMinutes}, one for each minute that capacity is late.`,
    `Turn Warming instances to "count as current": the fleet overshoots to its ${MAX_INSTANCES} maximum, though ${NEEDED} instances carry the spike.`,
    `Pick the noisy traffic, then set both cooldowns to 0: flapping goes from ${NOISY_CALM} reversals to ${NOISY_JITTERY}.`,
    `In Scheduled and predictive, the daily wave has a steep morning rush: reactive has ${DAILY_REACTIVE} violation minutes on it, scheduled ${SCHEDULED_DAILY} and predictive ${PREDICTIVE_DAILY}. Pick the flash spike: predictive has ${PREDICTIVE_FLASH}, because yesterday had no spike.`,
  ],
  keyIdeas: [
    'A reactive autoscaler is late by design: it acts after the metric moves and its new instances serve after the warm-up, so in this model a spike drops requests for the warm-up plus a minute.',
    'Target tracking is ⌈current × metric ÷ target⌉, computed on whole percents: the float 3 × 0.1 ÷ 0.3 is 1.0000000000000002, which a ceiling rounds up to 2.',
    'In this model, counting warming instances as current while the metric reads just the ready ones makes the loop ask for more each minute, and near-zero cooldowns let noise make the fleet flap.',
    `In this model scheduled and predictive scaling help where the load repeats and climbs faster than the warm-up: on the daily rush the reactive loop has ${DAILY_REACTIVE} violation minutes and predictive ${PREDICTIVE_DAILY}, and on a spike that yesterday lacked predictive is no help. On noisy traffic a lower count is padding, not forecasting.`,
  ],
  quiz: [
    {
      q: 'A flash spike quadruples load within a minute, and new instances take 5 minutes to warm up. What happens in the first minutes?',
      options: [
        'Load above the ready capacity is dropped until the new instances serve',
        'Autoscaling absorbs the spike, since it reacts as fast as the load moves',
        'The new instances take over at once, since a launch is immediate',
        'The extra load waits in a queue, since a queue loses no requests',
      ],
      answer: 0,
      why: 'The controller sees the spike after it happens and its instances serve after the warm-up, so for those minutes capacity is what it was before. In this model the excess is dropped; a real system queues it or sheds it, and either way users wait.',
    },
    {
      q: 'Why can a controller that counts warming instances as current overshoot after a spike?',
      options: [
        'The metric still reads the old ready fleet, so each minute it asks for more',
        'Warming instances burn more CPU than ready ones, so the metric rises',
        'The cooldown outlasts the warm-up, so every launch is doubled',
        'The target is too low, so the formula wants extra instances anyway',
      ],
      answer: 0,
      why: 'The utilisation it reads comes from ready instances, so it stays high while the new ones warm up. Multiplying that high number by a count that now includes the warming instances grows the request each minute, until the maximum.',
    },
    {
      q: 'A team sets both cooldowns to zero to react faster. What do they see on noisy traffic?',
      options: [
        'More flapping and more violation minutes, since it scales in on each dip',
        'Fewer violations, since the loop now reacts to each change in load',
        'The same fleet, since cooldowns only matter for a flash spike',
        'A steadier fleet, since it follows the load more closely',
      ],
      answer: 0,
      why: 'Without a pause the loop acts on noise: it scales in on a low minute, is short on the next high one and scales out again. In this model that costs fewer instance-minutes but several times the violation minutes, and each reversal pays warm-up for capacity that is then removed.',
    },
    {
      q: 'Why does predictive scaling not help with a flash spike?',
      options: [
        'It provisions from yesterday\'s load, and yesterday had no spike',
        'It is slower than a reactive loop, since it waits for a forecast',
        'It cannot launch beyond the maximum that a reactive loop can reach',
        'It ignores the warm-up, so its instances arrive too late',
      ],
      answer: 0,
      why: 'Predictive scaling copies yesterday\'s shape ahead of time, which is exactly right for load that repeats and blind to load that does not. It also has no history on day 1, so in this model it starts on day 2.',
    },
  ],
};

export default lesson;
