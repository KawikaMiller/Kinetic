import type { LessonModule } from '../../core/types';
import {
  DEFAULT_SCHEDULE, DEFAULT_SEED, DEFAULT_START, GLOBAL_CELL, LANDSCAPE, LOCAL_CELL, QUENCH_SCHEDULE, SEED_WINDOW, acceptProbability, exactHillClimbing, finalCell, formatProbability, runBatch, runChain,
} from './landscape';
import { Stage } from './Stage';
import { acceptanceNote } from './text';
import { MAP_POINTS, compareOnMaps, crossedSquareMap } from './tour';
import { tourLength, twoOpt } from '../../core/tsp';

const HILL = exactHillClimbing();
const DEFAULT_BATCH = runBatch(1, SEED_WINDOW, 'anneal', DEFAULT_SCHEDULE);
const QUENCH_BATCH = runBatch(1, SEED_WINDOW, 'anneal', QUENCH_SCHEDULE);
const MAPS = compareOnMaps(MAP_POINTS.default);
const SQUARE = crossedSquareMap();
const SQUARE_START = tourLength(SQUARE.dist, SQUARE.start);
const SQUARE_END = twoOpt(SQUARE.dist, SQUARE.start, { maxMoves: 1 }).length;
const HILL_RUN = runChain(DEFAULT_SEED, DEFAULT_START, 'hill', DEFAULT_SCHEDULE);
const ANNEAL_RUN = runChain(DEFAULT_SEED, DEFAULT_START, 'anneal', DEFAULT_SCHEDULE);

const pct = (x: number, total: number) => `${((x / total) * 100).toFixed(0)}%`;
const hillPct = pct(HILL.successes, HILL.total);
const defaultPct = pct(DEFAULT_BATCH.successes, DEFAULT_BATCH.runs);
const quenchPct = pct(QUENCH_BATCH.successes, QUENCH_BATCH.runs);

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'Hill climbing rolls downhill and stops in the first valley, while simulated annealing sometimes accepts a worse step at a temperature that falls over time, which lets it climb out: you run both on a landscape and on a tour.',
    what: `Local search improves one candidate by small moves. Hill climbing accepts a move just when the new cell is not worse, so it stops at a local minimum: on the lesson's 20-cell landscape it reaches the global minimum from ${HILL.successes} of ${HILL.total} starts. Simulated annealing also accepts a worse move with probability e^(-delta/T), where the temperature T falls a little each step. With a slow fall it escapes the valley (${defaultPct} of ${DEFAULT_BATCH.runs.toLocaleString('en-US')} seeded runs here), and with no temperature to speak of, a quench, it behaves like hill climbing (${quenchPct}). The same idea improves a tour: 2-opt reverses a segment whenever that shortens the tour, and the annealed version makes random reversals first.`,
    analogy: 'A hiker in fog who just keeps walking downhill stops at the bottom of the first valley; one who now and then climbs a little, less and less often as the day goes on, is likelier to find the deepest valley.',
    useCases: [
      'Laying out and scheduling problems, where the score has many local optima and an exact search is out of reach',
      'Improving a delivery or drilling route with 2-opt after a quick first tour',
      'Tuning many interacting settings (a timetable, a placement) by small swaps judged by one score',
      'Understanding why a search stalls in a local optimum and what random restarts or noise buy',
    ],
    why: 'Many hard optimisation problems cannot be solved exactly at scale, so engineers run local search and need to know when it will stall. The two knobs here, where the temperature starts and how fast it cools, decide whether a run escapes, and a measured success rate over many seeds is the honest way to compare them.',
    watch: 'On the landscape the bars are the score of each cell (lower is better): the green bar is the global minimum, the orange bar is the local minimum at cell 4, the yellow dot is the ball, a green ring marks the best cell seen and a dashed blue line is its trail. In the histogram the bars use the same colours for where runs ended. In the temperature scene the blue bars are the exact distribution and the violet bars the share of one seeded run. On the map the blue tour is yours and the dashed green one is the optimum.',
  },
  tryThis: [
    `In One ball press Run: the ball ends at cell ${finalCell(HILL_RUN)} (score ${LANDSCAPE[finalCell(HILL_RUN)]}), not cell ${GLOBAL_CELL} (score ${LANDSCAPE[GLOBAL_CELL]}).`,
    `Switch to Annealing and Run with the default seed ${DEFAULT_SEED}: the trail climbs over the ridge and the ball ends at cell ${finalCell(ANNEAL_RUN)}.`,
    `Drag T0 to ${QUENCH_SCHEDULE.t0} and Run: the ball is back at cell ${LOCAL_CELL}, and the line under the plot reads "${acceptanceNote(QUENCH_SCHEDULE.t0)}".`,
    `Open Over 1,000 seeds and press Run 1,000 seeds: about ${defaultPct} of the runs reach the global minimum, against the exact ${hillPct} for hill climbing.`,
    `Open 2-opt, keep the crossed square and press Step once: the length goes from ${SQUARE_START.toFixed(2)} to ${SQUARE_END.toFixed(2)}.`,
  ],
  keyIdeas: [
    `Hill climbing stops at a local minimum: from cell ${DEFAULT_START} it ends at cell ${LOCAL_CELL} on each of 200 seeds in the lesson's check, while the global minimum is cell ${GLOBAL_CELL}.`,
    `Annealing accepts a worse move with probability e^(-delta/T), so a falling temperature lets it climb out of a valley early and settle later: ${defaultPct} of ${DEFAULT_BATCH.runs.toLocaleString('en-US')} seeded runs reach the global minimum, against ${hillPct} for exact hill climbing.`,
    `The schedule is the lever: a quench with T0 = ${QUENCH_SCHEDULE.t0} behaves like hill climbing and reaches the global minimum on ${quenchPct} of the same seeds, and a finite run, even a slow one, can still stall.`,
    `2-opt reverses a tour segment when that shortens the tour and stops at a local optimum that need not be the best: on ${MAPS.maps} seeded ${MAP_POINTS.default}-point maps annealed 2-opt reached the optimum on ${MAPS.optimalAnnealed}, plain 2-opt on ${MAPS.optimalPlain}.`,
  ],
  quiz: [
    {
      q: 'A learner says: simulated annealing always finds the global optimum. What is the accurate version?',
      options: [
        'It always finds it, provided the starting temperature is above zero',
        'Slow cooling finds it with high probability, but a finite run can stall',
        'It never beats hill climbing, because accepting worse moves wastes steps',
        'It finds the global optimum only when started inside the right basin',
      ],
      answer: 1,
      why: `A worse move is accepted with a probability that shrinks as the temperature falls, so escape is likely, not certain, in a finite run: here ${defaultPct} of ${DEFAULT_BATCH.runs.toLocaleString('en-US')} runs end at the global minimum, and the rest do not. It does beat hill climbing, and needing the right basin describes hill climbing.`,
    },
    {
      q: 'At temperature 1, a move that makes the score 2 worse is accepted with what probability?',
      options: [
        'About 13.5 percent, which is e to the power minus 2',
        'About 2 percent, because the move is 2 worse and so is rare',
        'Exactly 50 percent, since a worse move is as likely as a better one',
        'About 86.5 percent, which is 1 minus e to the power minus 2',
      ],
      answer: 0,
      why: 'The Metropolis rule gives e^(-delta/T) = e^-2, about 0.135. The size of the step is divided by the temperature, so a larger temperature would raise it; 86.5 percent is the complement, the chance of refusing.',
    },
    {
      q: `Hill climbing from position ${DEFAULT_START} stops at position ${LOCAL_CELL} on the lesson's landscape. Why?`,
      options: [
        `Position ${LOCAL_CELL} is the lowest point on the whole landscape`,
        'The climber ran out of steps before it could reach the lowest point',
        `The landscape slopes upward from position ${DEFAULT_START}, so the climber never moves`,
        'Both neighbours are higher, so no single step improves it',
      ],
      answer: 3,
      why: `Cell ${LOCAL_CELL} has score ${LANDSCAPE[LOCAL_CELL]} and both neighbours have score ${LANDSCAPE[LOCAL_CELL - 1]}, so a move that is not worse has nowhere to go. The global minimum is cell ${GLOBAL_CELL}, the climber moved down first, and it stopped rather than ran out of steps.`,
    },
    {
      q: 'You cool from T = 4 to almost 0 within a handful of steps. What does the run resemble?',
      options: [
        'A random walk, because a low temperature accepts every proposed move',
        'An exhaustive search, since the falling temperature visits each state once',
        'Plain hill climbing: the ball freezes in the nearest basin as only downhill moves get accepted',
        'A search that is certain to find the optimum, because the temperature did start out high',
      ],
      answer: 2,
      why: `With almost no temperature a worse move is accepted with a probability near zero (${formatProbability(acceptProbability(1, QUENCH_SCHEDULE.t0))} for a step that is 1 worse), so the ball freezes in the nearest basin like hill climbing. The quench reached the global minimum on ${quenchPct} of ${QUENCH_BATCH.runs.toLocaleString('en-US')} seeds here. A high temperature is what accepts nearly each move.`,
    },
    {
      q: '2-opt reaches a tour where no single swap shortens it. Is the tour then optimal?',
      options: [
        'Yes, because no swap shortens it, so nothing shorter can exist anywhere',
        'Not necessarily: it is a local optimum, and sometimes longer than the best',
        'Yes, whenever the map has fewer than twenty points to visit in total',
        'No, but only because 2-opt can lengthen a tour while it is working',
      ],
      answer: 1,
      why: `No single reversal improving it makes the tour a 2-opt local optimum, which can still be longer than the best tour: on ${MAPS.maps} seeded ${MAP_POINTS.default}-point maps plain 2-opt reached the optimum on ${MAPS.optimalPlain} and missed it on ${MAPS.maps - MAPS.optimalPlain}. 2-opt shortens the tour at each move it makes, and no size rule applies.`,
    },
  ],
};

export default lesson;
