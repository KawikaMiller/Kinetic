import { decimal } from '../../core/format';
import type { LessonModule } from '../../core/types';
import { initialExperiment, runnable } from './init';
import { Stage } from './Stage';
import { DEFAULT_FALLBACKS, SWEEP_SEEDS, defaultCard, evaluate, sweepGameDays, withFallbacks, type Card } from './model';

const defaultRun = evaluate(runnable(initialExperiment()));
const exposure1 = evaluate({ ...runnable(initialExperiment()), exposure: 0.01 });
const apiDown: Partial<Card> = { fault: { target: 'api', kind: 'kill', k: 4, p: 1 }, exposure: 1 };
const apiAborted = evaluate({ ...defaultCard(), ...apiDown });
const apiNone = evaluate({ ...defaultCard(), ...apiDown, abort: null });
const flaw = sweepGameDays(DEFAULT_FALLBACKS);
const fixed = sweepGameDays(withFallbacks(true, true));
const abortTick = apiAborted.outcome.kind === 'aborted' ? apiAborted.outcome.tick : null;

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'Chaos engineering is an experiment, not an act of vandalism: a hypothesis about steady state, a fault, a limited blast radius and a way to stop. A held hypothesis is a result about that fault, not a certificate.',
    what: 'You write down what normal looks like (checkout success stays at or above 99%), inject one fault on a small share of traffic, and watch. If the hypothesis fails you have found a weakness cheaply; if the damage passes the abort threshold you stop the experiment before customers pay for it. The graph of services shows why this finds real flaws: a recommendations widget that looks optional can take checkout down when its edge has no fallback.',
    analogy: 'A fire drill. You choose the time, limit it to one floor, appoint someone who can call it off, and write down what you expect before the alarm sounds. Pulling a random fire alarm on a busy day teaches little and risks a lot.',
    useCases: [
      'Planning a game day on a service you depend on, with a stated hypothesis and an abort condition',
      'Finding the soft dependency that is really hard: the widget whose failure takes the page down',
      'Choosing a blast radius, from a small share of traffic up to the whole fleet, as confidence grows',
      'Reading a chaos result honestly: what held, for which fault, at what exposure',
    ],
    why: 'Resilience claimed without being tested is a guess, and a test run without limits is an outage you caused yourself. Knowing the parts of a good experiment, and what a passing result does and does not show, is what lets a team practise failure on purpose and stay safe doing it.',
    watch:
      'In the graph a solid orange node is the service you killed, red nodes are the blast radius, a solid grey edge is a hard dependency and a dashed edge is a soft one: green if it has a fallback, red if it does not. In the experiment plot the blue line is observed checkout success, the green line is the hypothesis, the red line is the abort threshold and the violet band is the fault window. The chips say what is simulated, illustrative, a toy or from memory.',
  },
  tryThis: [
    'In "Read the map" click recs: the blast radius is recs, api and web, and checkout fails although recs is only a recommendations widget. Turn on "recs fallback" and the radius shrinks to recs alone.',
    'In "Read the map" click cache: nothing else goes down, because its edge has a fallback (a miss falls through to the database). The table lists every service with its radius.',
    `In "Design the experiment" run the default card (kill 1 of 4 db at 5% exposure, hypothesis 99%, abort 95% for 2 ticks): ${decimal(defaultRun.meanSuccess * 100, 2)}% against 99%, so the hypothesis is refuted and the run is not aborted. Set the exposure to 1%: ${decimal(exposure1.meanSuccess * 100, 2)}%, and it holds.`,
    `In "Design the experiment" pick target api, kill 4 of 4 instances and exposure 100%: the run aborts at tick ${abortTick} with ${apiAborted.failedTotal} failed requests. Switch the abort condition to None and the cost reads ${apiNone.failedTotal.toLocaleString('en-US')}.`,
    `In "A game day, seeded" with the recs flaw on, the rule breaks on ${flaw.withoutAbort.length} of ${SWEEP_SEEDS} seeds without an abort and on ${flaw.withAbort.length} with one. Give the recs edge a fallback: ${fixed.withoutAbort.length} without an abort, still not zero.`,
  ],
  keyIdeas: [
    'An experiment has four parts: a hypothesis about steady state, a fault, a blast radius, and an abort condition; without the last one it runs to the end however bad it gets, which in this model costs 12,000 failed requests for a dead api.',
    'A soft dependency with no fallback behaves as a hard one: in this model killing the recommendations service takes checkout down until its edge gets a fallback.',
    'A hypothesis that holds at 1% exposure says it held for that fault, that exposure and those 100 ticks; it does not show the system is resilient, and it does not predict 100% exposure.',
    'The abort threshold sits looser than the hypothesis on purpose: a missed hypothesis is information, while crossing the abort line means real damage to stop.',
  ],
  quiz: [
    {
      q: 'What turns "break something in production" into an experiment?',
      options: [
        'Running it on weekends, when fewer customers are online to notice',
        'A written hypothesis, a limited blast radius and an abort condition',
        'Choosing the busiest service so the result is as clear as possible',
        'Doing it unannounced so the team reacts as in a real outage',
      ],
      answer: 1,
      why: 'The method is what makes it an experiment: a stated expectation, a small exposure and a way to stop. Timing, a maximal blast radius and surprise do not add control, and the last two remove it.',
    },
    {
      q: 'Killing the recommendations service takes checkout down. What is the likeliest cause in this model?',
      options: [
        'Recommendations sits on the critical path by design, with no choice in it',
        'Its edge has no fallback, so a soft dependency behaves as a hard one',
        'The cache fell back to the database and overloaded it under the extra load',
        'The web tier depends on every service that the API happens to call',
      ],
      answer: 1,
      why: 'In the model the edge from the API to recommendations is soft but has no fallback, so the API goes down with it and takes the web tier along. Giving the edge a fallback shrinks the radius to recommendations alone.',
    },
    {
      q: 'An experiment held its hypothesis at 1% exposure. What may you conclude?',
      options: [
        'The system tolerates this fault at this exposure over this run',
        'The system is resilient to losing that service under any traffic mix',
        'The same result will hold at 100% exposure, only more strongly so',
        'No abort condition is needed for any later experiment on the system',
      ],
      answer: 0,
      why: 'A result covers the fault, the exposure and the run that produced it. Wider exposure or another traffic mix is a new experiment, and a passing one does not remove the need for an abort condition on the next.',
    },
    {
      q: 'Why does the abort threshold sit looser than the hypothesis?',
      options: [
        'A hypothesis miss is information; the abort stops real damage',
        'A looser threshold makes the abort fire more often, which is safer',
        'The two numbers are equal in a well-run experiment of this kind',
        'Abort thresholds are set by the customer contract, not by the team',
      ],
      answer: 0,
      why: 'Missing the hypothesis at 98.75% against 99% is a finding worth having and costs little. The abort line is where customers start to pay, so it is set lower; a looser threshold fires later, not more often.',
    },
    {
      q: 'Kill 1 of 4 db instances with 5% of traffic exposed. What is the expected checkout success?',
      options: [
        '75%, which is the share of instances that are still alive',
        '95%, which is the share of the traffic that is not exposed',
        '98.75%: one minus the exposed 5% times the lost 25%',
        '99.75%, which is the answer for 1% exposure instead of 5%',
      ],
      answer: 2,
      why: 'Just the exposed 5% of requests meet the fault, and of those a quarter lose their db instance: 1 - 0.05 x 0.25 = 0.9875. The other options forget the exposure, forget the fault size, or use the wrong exposure.',
    },
  ],
};

export default lesson;
