import type { ReactNode } from 'react';
import { pctText, sig } from '../../core/format';
import {
  DIVERGED_LOSS, FORWARD_CUT, type DatasetId, type NeuronStats, type NeuronWeights, type UnitNumbers,
} from './model';

const pct = (share: number) => pctText(share, 0);

export function neuronCaption(weights: NeuronWeights, dataset: DatasetId, stats: NeuronStats): ReactNode {
  const atCeiling = stats.accuracy >= stats.best - 1e-9;
  return (
    <>
      With w = (<b>{sig(weights.w1)}</b>, <b>{sig(weights.w2)}</b>) and b = <b>{sig(weights.b)}</b> the loss is <b>{sig(stats.loss)}</b> and{' '}
      <b>{pct(stats.accuracy)}</b> of the points sit on the right side of the line.{' '}
      {atCeiling
        ? `That matches the best any straight line reaches on this data (${pct(stats.best)}).`
        : `The best straight line on this data reaches ${pct(stats.best)}.`}
      {dataset === 'xor' && ` One neuron draws one line, so ${pct(stats.best)} is its ceiling on XOR.`}
    </>
  );
}

const pair = (a: number, b: number) => `(${sig(a)}, ${sig(b)})`;

export interface ForwardCaptionInput {
  numbers: UnitNumbers;
  /** XOR label of the input when it is one of the four corners, else null. */
  label: 0 | 1 | null;
}

export function forwardCaption({ numbers, label }: ForwardCaptionInput): ReactNode {
  const reading = numbers.out > FORWARD_CUT ? 1 : 0;
  return (
    <>
      Input {pair(numbers.x[0], numbers.x[1])}: the hidden pre-activations are z = {pair(numbers.z[0], numbers.z[1])}, ReLU keeps h ={' '}
      {pair(numbers.h[0], numbers.h[1])}, and the output is <b>{sig(numbers.out)}</b>.{' '}
      {label === null
        ? 'This is not one of the four corners, so XOR has no label for it.'
        : `Read at ${FORWARD_CUT}, that is class ${reading}; XOR says class ${label}, so the network is ${reading === label ? 'right' : 'wrong'} here.`}
    </>
  );
}

export interface TrainCaptionInput {
  epoch: number;
  loss: number;
  accuracy: number;
  startLoss: number;
  divergedAt: number | null;
  /** Hidden ReLU units that are negative on every training point. */
  dead: number;
  hiddenUnits: number;
  activation: string;
}

export function trainCaption(s: TrainCaptionInput): ReactNode {
  if (s.divergedAt !== null) {
    return (
      <>
        <span className="hl bad">Diverged at epoch {s.divergedAt}</span>: the loss passed {DIVERGED_LOSS} (or stopped being a number), so training stopped, and plotting it
        would only show a wall. A smaller learning rate or less momentum keeps the steps from overshooting.
      </>
    );
  }
  if (s.epoch === 0) {
    return (
      <>
        Untrained: the loss is {sig(s.loss)} and {pct(s.accuracy)} of the points are right. Press Step or Play to run full-batch gradient descent, one epoch at a time.
      </>
    );
  }
  const trend = s.loss < s.startLoss ? 'fell' : 'rose';
  return (
    <>
      Epoch {s.epoch}: the loss {trend} from {sig(s.startLoss)} to <b>{sig(s.loss)}</b> and <b>{pct(s.accuracy)}</b> of the points are right.
      {s.dead > 0 && ` ${s.dead} of ${s.hiddenUnits} hidden ReLU units are dead: negative on every point, so they pass no gradient.`}
    </>
  );
}
