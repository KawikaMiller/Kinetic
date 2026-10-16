import type { ReactNode } from 'react';
import { pctText, sig } from '../../core/format';
import type { Mat } from '../../core/vec';
import type { ScalingResult } from './scaling';
import { N, TOKENS, type ShuffleRow } from './tokens';
import { ITEM_NAMES, LEARNED_WEIGHT } from './lookup';
import { count, type CostInput, type Costs } from './cost';

const w2 = (v: number) => v.toFixed(2);

/** Indices of `weights` from largest to smallest (ties: lower index first). */
export const ranked = (weights: readonly number[]): number[] =>
  weights.map((_, i) => i).sort((a, b) => weights[b] - weights[a] || a - b);

export function headCaption(from: number, weights: readonly number[]): ReactNode {
  const [first, second] = ranked(weights);
  const word = (i: number) => `"${TOKENS[i]}" (token ${i + 1})`;
  return (
    <>
      Token {from + 1}, <b>{TOKENS[from]}</b>, spreads its attention over the six tokens: most on {word(first)} at <b>{w2(weights[first])}</b>, then {word(second)} at{' '}
      {w2(weights[second])}. The six weights add up to {w2(weights.reduce((a, b) => a + b, 0))}, and its output is that weighted sum of the value vectors.
    </>
  );
}

export function scaleCaption(r: ScalingResult): ReactNode {
  return (
    <>
      With d_k = {r.dk}, q·k of two random vectors has standard deviation <b>{sig(r.sd)}</b> in {r.dots.length.toLocaleString('en-US')} samples (theory: √{r.dk} = {sig(Math.sqrt(r.dk))}). Over 8 random keys the
      largest softmax weight averages <b>{w2(r.unscaledMax)}</b> unscaled and <b>{w2(r.scaledMax)}</b> after dividing by √d_k.
      {r.unscaledMax - r.scaledMax > 0.05 && ' A softmax that close to one-hot tends to pass little gradient to the other keys.'}
    </>
  );
}

export interface HeadsView {
  causal: boolean;
  positions: boolean;
  twoHeads: boolean;
  /** Head A's weights when two heads are on. */
  aWeights: Mat | null;
  shuffle: readonly ShuffleRow[] | null;
}

const argmax = (row: readonly number[]) => row.indexOf(Math.max(...row));

export function headsCaption(v: HeadsView): ReactNode {
  const parts: ReactNode[] = [];
  if (v.causal) parts.push('Causal mask: each token sees only itself and earlier tokens, so every weight above the diagonal is exactly 0.');
  if (v.twoHeads && v.aWeights) {
    if (!v.positions) {
      parts.push(
        `Head A reads only the position dimensions, and with no position code every token looks identical to it, so it can only spread its attention evenly${v.causal ? ' over the tokens the mask allows' : ` (1/${N} = ${w2(1 / N)} each)`}.`,
      );
    } else {
      const previous = v.aWeights.slice(1).map((row, i) => row[i]);
      const mean = previous.reduce((a, b) => a + b, 0) / previous.length;
      const wraps = argmax(v.aWeights[0]) !== 0 && !v.causal;
      parts.push(`Head A puts on average ${w2(mean)} of its weight on the previous token${wraps ? `; token 1 has none, so it points at token ${argmax(v.aWeights[0]) + 1} (the position code repeats every 6.28 steps)` : ''}.`);
    }
  }
  const headBIgnoresPosition = v.positions && !v.twoHeads;
  if (headBIgnoresPosition) {
    parts.push('The position code is on, but head B was hand-built to read only the word dimensions, so on its own it ignores position. Switch to Two heads so head A can use it.');
  }
  if (v.shuffle) {
    const kept = v.shuffle.filter((r) => r.same).length;
    parts.push(
      kept === v.shuffle.length
        ? headBIgnoresPosition
          ? `Shuffled: all ${v.shuffle.length} tokens kept their output, but only because head B ignores the position code by construction; this says nothing about position codes in general.`
          : `Shuffled: all ${v.shuffle.length} tokens kept the output they had, only in a new place, so this layer cannot tell the order.`
        : `Shuffled: ${kept} of ${v.shuffle.length} tokens kept their output, so this layer does use the order${v.causal && !v.positions ? ' (the causal mask itself carries order)' : ''}.`,
    );
  }
  if (parts.length === 0) parts.push('Head B looks at tokens with a similar word vector, such as the other "the". Switch things on, then shuffle the tokens.');
  return <>{parts.map((p, i) => <span key={i}>{p} </span>)}</>;
}

export interface LookupView {
  epoch: number;
  item: number;
  /** Weight on the query's own key now, and before training. */
  weight: number;
  start: number;
  loss: number;
  /** Does every one of the four queries put LEARNED_WEIGHT or more on its own key? */
  allLearned: boolean;
  /** Is the Blend slider above 0? The bars then show a mixed query, not the pure one the figures describe. */
  blended?: boolean;
}

export function lookupCaption(v: LookupView): ReactNode {
  const name = ITEM_NAMES[v.item];
  if (v.epoch === 0) {
    return <>Untrained: the query for item {name} spreads its attention nearly evenly ({pctText(v.weight, 0)} on {name}, about 1 in 4). Train W_q and W_k.</>;
  }
  return (
    <>
      Epoch {v.epoch}: the query for item {name} now puts <b>{pctText(v.weight, 0)}</b> of its weight on key {name}, from {pctText(v.start, 0)} before training; loss {sig(v.loss)}.{' '}
      {v.allLearned ? `Every query puts at least ${pctText(LEARNED_WEIGHT, 0)} on its own key: a lookup this toy learned.` : 'Not every query is there yet.'}
      {v.blended && ' The bars below show the blended query, so they differ from these figures, which are for the pure query.'}
    </>
  );
}

export function costCaption(input: CostInput, c: Costs): ReactNode {
  return (
    <>
      At n = {input.n.toLocaleString('en-US')} each head of each layer holds n² = <b>{count(c.weightsPerHead)}</b> attention weights; with {input.heads} heads and {input.layers} layers that is{' '}
      {count(c.weightsTotal)}. Q·Kᵀ alone is 2n²d = <b>{count(c.scoreFlops)}</b> floating-point operations per layer. Doubling n multiplies both by 4.
    </>
  );
}
