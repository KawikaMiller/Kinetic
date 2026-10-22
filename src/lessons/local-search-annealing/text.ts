import { CELLS, GLOBAL_CELL, LANDSCAPE, acceptProbability, bestCell, formatProbability, wilsonInterval, type Batch, type Chain, type Mode, type Schedule } from './landscape';

/** Every sentence the stage prints from the model: pure, so the tests pin them and the try-this entries quote them. */

/** Below this a worse move is practically never taken, above it practically always: the two ends of the temperature scale. */
const HILL_LIKE = 1e-6;
const WALK_LIKE = 0.9;
/** The share of runs the annealing invariant asks for. */
export const INVARIANT_SHARE = 0.85;

export const isLocalMinimum = (cell: number): boolean =>
  [cell - 1, cell + 1].filter((c) => c >= 0 && c < CELLS).every((c) => LANDSCAPE[c] > LANDSCAPE[cell]);

const roundTo = (x: number, digits = 3): number => Number(x.toPrecision(digits));

/** What the temperature means for a move that is 1 worse. */
export function acceptanceNote(t: number): string {
  const p = acceptProbability(1, t);
  const verdict = p < HILL_LIKE ? ': this is hill climbing' : p > WALK_LIKE ? ': this is a random walk' : '';
  return `T = ${t}: a step that is 1 worse is accepted with probability e^-${roundTo(1 / t)} = ${formatProbability(p)}${verdict}`;
}

/** Worse cells accepted in the first `upTo` steps. */
export function uphillSoFar(chain: Chain, upTo: number): number {
  let n = 0;
  for (let k = 1; k <= upTo; k++) if (LANDSCAPE[chain.cells[k]] > LANDSCAPE[chain.cells[k - 1]]) n++;
  return n;
}

export function chainCaption(chain: Chain, cursor: number, mode: Mode, schedule: Schedule): string {
  const cell = chain.cells[cursor];
  const here = `cell ${cell} (value ${LANDSCAPE[cell]})`;
  if (cursor === 0) {
    const how = mode === 'hill' ? 'Hill climbing accepts a move only when the new cell is not worse, so it can only roll downhill.' : `${acceptanceNote(schedule.t0)}.`;
    return `Start at ${here}. ${how}`;
  }
  if (cursor < schedule.steps) {
    return `Step ${cursor} of ${schedule.steps}: at ${here}${mode === 'anneal' ? `, temperature ${chain.temps[cursor - 1].toFixed(3)}` : ''}; ${uphillSoFar(chain, cursor)} worse moves accepted so far.`;
  }
  const outcome = cell === GLOBAL_CELL ? 'It reached the global minimum.' : isLocalMinimum(cell) ? 'It is stuck in a local minimum: both neighbours are higher.' : 'It stopped away from a minimum.';
  return `Ended at ${here}; the global minimum is cell ${GLOBAL_CELL} (value ${LANDSCAPE[GLOBAL_CELL]}), and the best cell seen was ${bestCell(chain)}. ${outcome}`;
}

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

export function batchCaption(batch: Batch, hillSuccesses: number, hillTotal: number): string {
  const rate = batch.successes / batch.runs;
  const { low, high } = wilsonInterval(batch.successes, batch.runs);
  const holds = rate >= INVARIANT_SHARE;
  const base = `${batch.successes} of ${batch.runs} runs ended at the global minimum: ${pct(rate)}, with a 95% interval of ${pct(low)} to ${pct(high)}. Exact hill climbing from the ${hillTotal} starts: ${hillSuccesses} of ${hillTotal} (${pct(hillSuccesses / hillTotal)}).`;
  const check = `The check "annealing reaches the global minimum on at least ${pct(INVARIANT_SHARE)} of runs" ${holds ? 'holds' : 'fails'} here.`;
  if (holds || !batch.firstFailure) return `${base} ${check}`;
  const f = batch.firstFailure;
  return `${base} ${check} It misses on ${batch.runs - batch.successes} of ${batch.runs} seeds; the lowest failing seed is ${f.seed} (start cell ${f.start}, ends at cell ${f.end}).`;
}

export interface TourStatus {
  start: number;
  length: number;
  optimum: number;
  /** The last 2-opt move made by hand, if any. */
  lastMove: { i: number; j: number; delta: number } | null;
  moves: number;
  localOptimum: boolean;
  annealed: { accepted: number; uphill: number } | null;
}

const ratioWords = (length: number, optimum: number) =>
  length - optimum < 1e-9 ? 'which is the optimum' : `${(length / optimum).toFixed(3)} times the optimum`;

export function tourCaption(s: TourStatus): string {
  if (s.annealed) {
    return `Annealed 2-opt accepted ${s.annealed.accepted} reversals (${s.annealed.uphill} made the tour longer), then polished with 2-opt: length ${s.length.toFixed(2)}, ${ratioWords(s.length, s.optimum)} (${s.optimum.toFixed(2)}), from a start of ${s.start.toFixed(2)}.`;
  }
  if (!s.lastMove) return `The starting tour is ${s.start.toFixed(2)} long and the optimum is ${s.optimum.toFixed(2)}. Press Step to apply the first improving 2-opt move.`;
  const m = s.lastMove;
  const end = s.localOptimum ? ` No improving move remains: a 2-opt local optimum, ${ratioWords(s.length, s.optimum)}.` : '';
  return `Move ${s.moves}: reverse positions ${m.i + 1} to ${m.j} (delta ${m.delta.toFixed(2)}), so the length goes to ${s.length.toFixed(2)} from a start of ${s.start.toFixed(2)}.${end}`;
}

export function temperatureCaption(t: number, exactTopCell: number, distance: number): string {
  return `${acceptanceNote(t)}. At this temperature the long run is expected to spend ${pct(exactTopCell)} of its time in cell ${GLOBAL_CELL}; the total variation distance between the run and the exact distribution is ${distance.toFixed(3)}. Low temperatures mix slowly, so a short run may not have reached the distribution yet.`;
}
