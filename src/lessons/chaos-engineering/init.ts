/** What each scene opens in (pure), and the sentences their captions and panels are built from. */
import { decimal, integer, pctText } from '../../core/format';
import {
  BROKEN_SEED, GAME_ABORT, INSTANCES, SERVICES, defaultCard, downSet, radiusOf, workingFaultSets, DEFAULT_FALLBACKS, checkoutWorks,
  type Abort, type Card, type Experiment, type Fallbacks, type Fault, type Service,
} from './model';

export interface MapState {
  fallbacks: Fallbacks;
  killed: Service | null;
}
export const initialMap = (): MapState => ({ fallbacks: { ...DEFAULT_FALLBACKS }, killed: null });

/** The learner's card: the abort thresholds are always set, and `abortOn` says whether the card has a way out. */
export interface ExperimentState {
  /** `card.abort` holds the thresholds even while the abort is off, so the "no way out" warning knows what it would have taken. */
  card: Card & { abort: Abort };
  abortOn: boolean;
}
export const initialExperiment = (): ExperimentState => ({ card: { ...defaultCard(), abort: GAME_ABORT }, abortOn: true });

/** The card as it runs: with or without its abort condition. */
export const runnable = (s: ExperimentState): Card => ({ ...s.card, abort: s.abortOn ? s.card.abort : null });

export interface GameState {
  seed: number;
  recsFallback: boolean;
}
export const initialGame = (): GameState => ({ seed: BROKEN_SEED, recsFallback: false });
export const gameFallbacks = (g: GameState): Fallbacks => ({ recs: g.recsFallback, cache: true });

export const faultText = (f: Fault, exposure: number): string => {
  const what = f.kind === 'kill' ? `kill ${f.k} of ${INSTANCES} instances of ${f.target}` : `inject errors on ${pctText(f.p, 0)} of ${f.target}`;
  return `${what} with ${pctText(exposure, 0)} of traffic exposed`;
};

export function mapCaption(m: MapState): string {
  if (m.killed === null) return 'Click a service to kill all four of its instances and see the blast radius: the services that end up down, by the dependency rules on screen.';
  const down = downSet([m.killed], m.fallbacks);
  const works = checkoutWorks(down);
  return `Killing ${m.killed} takes ${down.size} of ${SERVICES.length} services down (${[...down].join(', ')}); checkout ${works ? 'still works' : 'fails'}.`;
}

export const radiusRows = (fallbacks: Fallbacks) => SERVICES.map((s) => ({ service: s, radius: radiusOf(s, fallbacks) }));
export const setsText = (fallbacks: Fallbacks): string => `${workingFaultSets(fallbacks)} of ${2 ** SERVICES.length}`;

export function outcomeText(e: Experiment, card: Card): string {
  const { outcome } = e;
  if (outcome.kind === 'aborted') return `aborted at tick ${outcome.tick}`;
  const where = `for this fault, this exposure and these 100 ticks`;
  return outcome.kind === 'held'
    ? `hypothesis held (${decimal(e.meanSuccess * 100, 2)}% against ${decimal(card.hypothesis * 100, 1)}%), ${where}`
    : `hypothesis refuted (${decimal(e.meanSuccess * 100, 2)}% against ${decimal(card.hypothesis * 100, 1)}%), ${where}`;
}

/** The refusal shown when the card has no way out: it still runs, and says what that costs. */
export function noAbortWarning(e: Experiment, abort: Abort): string | null {
  const wouldAbort = e.ticks.some((t) => t.success < abort.belowShare && t.faultOn);
  return wouldAbort ? `No abort condition: this experiment runs to the end however bad it gets: ${integer(e.failedTotal)} failed requests.` : null;
}

export const hypothesisBelowAbort = (card: Card): boolean => card.abort !== null && card.hypothesis < card.abort.belowShare;

export function experimentCaption(s: ExperimentState, e: Experiment): string {
  const warning = s.abortOn ? null : noAbortWarning(e, s.card.abort);
  return `${faultText(s.card.fault, s.card.exposure)}: ${outcomeText(e, s.card)}; ${integer(e.failedTotal)} failed requests. ${warning ?? ''}`.trim();
}

const FLOOR_STEP = 0.05;
const FLOOR_MARGIN = 0.01;

/** The bottom of a success plot: below the lowest observed success and every threshold, rounded down to a tidy step, never below zero. */
export function successFloor(e: Experiment, ...thresholds: number[]): number {
  const lowest = Math.min(...e.ticks.map((t) => t.success), ...thresholds);
  return Math.max(0, Number((Math.floor((lowest - FLOOR_MARGIN) / FLOOR_STEP) * FLOOR_STEP).toFixed(2)));
}
