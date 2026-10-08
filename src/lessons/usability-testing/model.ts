/**
 * A fictional checkout prototype with three planted usability problems, and simulated test
 * participants with seeded behaviour. Real sessions are messier; the point is the shape of what
 * a test shows: who hits which problem, what it costs them, what a biased session hides, and
 * how quickly new participants stop finding new problems.
 */
import { mulberry32 } from '../../core/random';

export type ProblemId = 'icon' | 'continue' | 'coupon';
export type ElementId = 'title' | 'image' | 'icon' | 'continue' | 'coupon' | 'apply' | 'card' | 'pay';

export interface Cell {
  r: number;
  c: number;
}

export const GRID = { rows: 8, cols: 10 } as const;

/** Where each part of the prototype sits on the grid: inclusive row and column ranges. */
export const ELEMENTS: Record<ElementId, { label: string; rows: readonly [number, number]; cols: readonly [number, number] }> = {
  title: { label: 'Checkout', rows: [0, 0], cols: [0, 9] },
  image: { label: 'Blue mug', rows: [1, 2], cols: [0, 3] },
  icon: { label: 'Icon button', rows: [2, 2], cols: [8, 9] },
  continue: { label: 'Continue', rows: [4, 4], cols: [6, 9] },
  coupon: { label: 'Coupon code', rows: [5, 5], cols: [0, 6] },
  apply: { label: 'Apply', rows: [5, 5], cols: [7, 9] },
  card: { label: 'Card number', rows: [6, 6], cols: [0, 9] },
  pay: { label: 'Pay', rows: [7, 7], cols: [6, 9] },
};

export interface Problem {
  id: ProblemId;
  label: string;
  /** The chance a participant runs into it. */
  p: number;
  /** The chance a participant who ran into it gives up. */
  abandon: number;
  /** Seconds lost when it is hit and the participant sorts it out alone. */
  cost: number;
  /** What the participant says, thinking aloud. */
  say: string;
  /** What a facilitator who helps says instead of letting them struggle. */
  help: string;
}

/** Their mean is 0.31, Nielsen and Landauer's average. The single numbers are the lesson's own. */
export const PROBLEMS: readonly Problem[] = [
  { id: 'icon', label: 'Unlabelled icon button', p: 0.5, abandon: 0.15, cost: 9, say: "I'm not sure what this icon does.", help: 'Try the button in the top right.' },
  { id: 'continue', label: 'Continue looks disabled', p: 0.33, abandon: 0.4, cost: 12, say: 'It looks greyed out. Is it broken?', help: 'That Continue button works; press it.' },
  { id: 'coupon', label: 'Coupon box looks like payment', p: 0.1, abandon: 0.1, cost: 8, say: 'Is this where I put my card?', help: 'The card number goes in the field below.' },
];
export const PROBLEM_IDS: readonly ProblemId[] = PROBLEMS.map((p) => p.id);
export const MEAN_HIT_RATE = PROBLEMS.reduce((sum, p) => sum + p.p, 0) / PROBLEMS.length;

export const MAX_PARTICIPANTS = 8;
/** How many participants the found-problems curve runs, so rare problems have a chance to show. */
export const CURVE_PARTICIPANTS = 15;
export const DEFAULT_PARTICIPANTS = 5;
export const NIELSEN_LANDAUER_L = 0.31;
const SEED_BASE = 17;
const SEED_STEP = 1013;

/** Share of sessions a toggled-on bias contaminates. */
export const CONTAMINATION_RATE = 0.6;
/** Seconds a hesitation lasts when the facilitator helps. */
export const HELPED_SECONDS = 4;
/** The share of participants who say "yes, easy" in a survey, whatever they did. */
export const SURVEY_YES_RATE = 0.85;

export interface Bias {
  leading: boolean;
  helping: boolean;
}
export const NO_BIAS: Bias = { leading: false, helping: false };
export type Contamination = 'leading' | 'helping';

export type StepKind = 'click' | 'hesitate' | 'error' | 'backtrack' | 'giveup' | 'done';
export interface Step {
  kind: StepKind;
  element: ElementId;
  at: Cell;
  /** Seconds since the participant started. */
  t: number;
  problem?: ProblemId;
  say?: string;
  speaker?: 'participant' | 'facilitator';
}

export interface Session {
  id: number;
  hits: Record<ProblemId, boolean>;
  contaminated: Contamination[];
  /** Would this participant have given up with no help and no leading? */
  wouldHaveGivenUp: boolean;
  steps: Step[];
  /** What they tick in a survey, whatever they did. */
  surveyYes: boolean;
}

interface Rolls {
  hit: number[];
  abandon: number[];
  aim: number[];
  leading: number;
  helping: number;
  survey: number;
}

/** Every random number a participant could need, always drawn in the same order, so a toggle never reshuffles who hit what. */
function rollsFor(id: number): Rolls {
  const rnd = mulberry32(SEED_BASE + id * SEED_STEP);
  const take = (n: number) => Array.from({ length: n }, rnd);
  const hit = take(PROBLEMS.length);
  const abandon = take(PROBLEMS.length);
  const aim = take(Object.keys(ELEMENTS).length);
  return { hit, abandon, aim, leading: rnd(), helping: rnd(), survey: rnd() };
}

/** Which problems participant `id` runs into. Independent of any bias setting. */
export function hitsOf(id: number): Record<ProblemId, boolean> {
  const { hit } = rollsFor(id);
  return Object.fromEntries(PROBLEMS.map((p, i) => [p.id, hit[i] < p.p])) as Record<ProblemId, boolean>;
}

const ELEMENT_IDS = Object.keys(ELEMENTS) as ElementId[];
const CLICK_S = 3;
const LOOK_S = 4;
const ERROR_S = 2;
const BACKTRACK_S = 2;
const GIVE_UP_S = 8;
const PAY_S = 6;
const LEADING_SAY = 'Yeah, that was easy.';

export function runSession(id: number, bias: Bias = NO_BIAS): Session {
  const rolls = rollsFor(id);
  const hits = hitsOf(id);
  const contaminated: Contamination[] = [];
  if (bias.leading && rolls.leading < CONTAMINATION_RATE) contaminated.push('leading');
  if (bias.helping && rolls.helping < CONTAMINATION_RATE) contaminated.push('helping');
  const helped = contaminated.includes('helping');
  const leading = contaminated.includes('leading');

  const steps: Step[] = [];
  let t = 0;
  const cellOf = (element: ElementId): Cell => {
    const roll = rolls.aim[ELEMENT_IDS.indexOf(element)];
    const { rows, cols } = ELEMENTS[element];
    const rowRoll = (roll * 997) % 1;
    return { r: rows[0] + Math.floor(rowRoll * (rows[1] - rows[0] + 1)), c: cols[0] + Math.floor(roll * (cols[1] - cols[0] + 1)) };
  };
  const add = (kind: StepKind, element: ElementId, dt: number, extra: Partial<Step> = {}) => {
    t += dt;
    steps.push({ kind, element, at: cellOf(element), t, ...extra });
  };
  /** The participant's own words, or the polite ones a leading question gets. */
  const words = (p: Problem): Pick<Step, 'say' | 'speaker'> =>
    helped ? { say: p.help, speaker: 'facilitator' } : { say: leading ? LEADING_SAY : p.say, speaker: 'participant' };

  let wouldHaveGivenUp = false;
  /** True when the participant stops here: they gave up, and nobody talked or helped them out of it. */
  const quits = (p: Problem, element: ElementId): boolean => {
    if (rolls.abandon[PROBLEMS.indexOf(p)] >= p.abandon) return false;
    wouldHaveGivenUp = true;
    if (contaminated.length) return false;
    add('giveup', element, GIVE_UP_S, { problem: p.id });
    return true;
  };

  const [icon, cont, coupon] = PROBLEMS;
  add('click', 'image', LOOK_S);

  if (hits.icon) {
    add('hesitate', 'icon', helped ? HELPED_SECONDS : icon.cost, { problem: 'icon', ...words(icon) });
    if (quits(icon, 'icon')) return finish();
    if (!helped) {
      add('error', 'image', ERROR_S, { problem: 'icon' });
      add('backtrack', 'icon', BACKTRACK_S, { problem: 'icon' });
    }
  }
  add('click', 'icon', CLICK_S);

  if (hits.continue) {
    add('hesitate', 'continue', helped ? HELPED_SECONDS : cont.cost, { problem: 'continue', ...words(cont) });
    if (quits(cont, 'continue')) return finish();
    if (!helped) {
      add('error', 'title', ERROR_S, { problem: 'continue' });
      add('backtrack', 'continue', BACKTRACK_S, { problem: 'continue' });
    }
  }
  add('click', 'continue', CLICK_S);

  if (hits.coupon) {
    add('error', 'coupon', coupon.cost - ERROR_S - BACKTRACK_S, { problem: 'coupon', ...words(coupon) });
    if (!helped) add('error', 'apply', ERROR_S, { problem: 'coupon' });
    if (quits(coupon, 'apply')) return finish();
    add('backtrack', 'card', BACKTRACK_S, { problem: 'coupon' });
  }
  add('click', 'card', CLICK_S);
  add('click', 'pay', PAY_S);
  add('done', 'pay', 0);
  return finish();

  function finish(): Session {
    return { id, hits, contaminated, wouldHaveGivenUp, steps, surveyYes: rolls.survey < SURVEY_YES_RATE };
  }
}

export const runSessions = (n: number, bias: Bias = NO_BIAS): Session[] => Array.from({ length: n }, (_, i) => runSession(i + 1, bias));

export interface SessionStats {
  success: boolean;
  seconds: number;
  errors: number;
  backtracks: number;
  hesitations: number;
}

/** Everything the results table shows, read off the replay's steps. */
export function sessionStats(s: Session): SessionStats {
  const count = (kind: StepKind) => s.steps.filter((x) => x.kind === kind).length;
  return {
    success: s.steps[s.steps.length - 1].kind === 'done',
    seconds: s.steps[s.steps.length - 1].t,
    errors: count('error'),
    backtracks: count('backtrack'),
    hesitations: count('hesitate'),
  };
}

export const hitList = (s: Session): ProblemId[] => PROBLEM_IDS.filter((p) => s.hits[p] && s.steps.some((x) => x.problem === p));

export interface Summary {
  n: number;
  successRate: number;
  /** Success among sessions nobody biased; null when there are none. */
  cleanSuccessRate: number | null;
  contaminated: number;
  meanSeconds: number;
  totalErrors: number;
}

export function summarize(sessions: readonly Session[]): Summary {
  const stats = sessions.map(sessionStats);
  const clean = sessions.filter((s) => !s.contaminated.length);
  const rate = (xs: readonly Session[]) => xs.filter((s) => sessionStats(s).success).length / xs.length;
  return {
    n: sessions.length,
    successRate: sessions.length ? rate(sessions) : 0,
    cleanSuccessRate: clean.length ? rate(clean) : null,
    contaminated: sessions.length - clean.length,
    meanSeconds: sessions.length ? stats.reduce((sum, x) => sum + x.seconds, 0) / sessions.length : 0,
    totalErrors: stats.reduce((sum, x) => sum + x.errors, 0),
  };
}

/** Clicks per cell across sessions: every click, and every wrong click. */
export function heatmap(sessions: readonly Session[]): number[][] {
  const grid = Array.from({ length: GRID.rows }, () => Array<number>(GRID.cols).fill(0));
  for (const s of sessions) for (const step of s.steps) if (step.kind === 'click' || step.kind === 'error') grid[step.at.r][step.at.c]++;
  return grid;
}

/** The problems found once the first `k` participants have run: a problem is found when a participant ran into it (one who gave up early never reaches the later problems). */
export function foundAfter(sessions: readonly Session[], k: number): ProblemId[] {
  return PROBLEM_IDS.filter((p) => sessions.slice(0, k).some((s) => hitList(s).includes(p)));
}

/** Nielsen and Landauer's model: with each problem found by a participant with probability L, n participants find 1 - (1 - L)^n of them. */
export const nielsenLandauer = (l: number, n: number): number => 1 - (1 - l) ** n;
/** The same, averaged over the prototype's three problems, each with its own probability. */
export const expectedFound = (n: number): number => PROBLEMS.reduce((sum, p) => sum + nielsenLandauer(p.p, n), 0) / PROBLEMS.length;
/** Participants for the model to reach `target` (whole participants). */
export const participantsFor = (l: number, target: number): number => Math.ceil(Math.log(1 - target) / Math.log(1 - l));

export interface MethodResults {
  n: number;
  /** Survey: how many ticked "easy to find". */
  surveyYes: number;
  /** Analytics: sessions that clicked in the coupon box, and sessions that paid. */
  couponClicks: number;
  paid: number;
  /** Moderated test: the words of everyone who ran into the coupon box. */
  quotes: { participant: number; say: string }[];
}

/** What each method reports about "will people find the coupon box?" for the same participants. */
export function methodResults(sessions: readonly Session[]): MethodResults {
  const touched = (s: Session) => s.steps.some((x) => x.problem === 'coupon');
  return {
    n: sessions.length,
    surveyYes: sessions.filter((s) => s.surveyYes).length,
    couponClicks: sessions.filter((s) => s.steps.some((x) => x.element === 'coupon')).length,
    paid: sessions.filter((s) => sessionStats(s).success).length,
    quotes: sessions.filter(touched).flatMap((s) => s.steps.filter((x) => x.problem === 'coupon' && x.say).map((x) => ({ participant: s.id, say: x.say! }))),
  };
}
