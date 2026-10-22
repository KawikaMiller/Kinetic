import { bytes, pctText } from '../../core/format';
import { adapterParams, adapterShare, crossoverRank, fullParams, memoryLines } from './memory';
import { FLOOR_NOISE, TOLERANCE, TRAIN_STEPS, belowFloor, optimumRelative, type TrainRun } from './lora';
import { BITS_CHOICES, type OutputError, type Scheme } from './quant';

const n = (x: number) => x.toLocaleString('en-US');
const gb = (x: number) => bytes(x, { base: 1000, dp: 2 });

/** The gap to the floor as the stat shows it: signed, with float noise printed as zero. */
export const gapText = (run: TrainRun): string => pctText(Math.abs(run.gap) <= FLOOR_NOISE ? 0 : run.gap, 3);

export const adapterCaption = (dIn: number, dOut: number, r: number): string => {
  const adapter = adapterParams(dIn, dOut, r);
  const full = fullParams(dIn, dOut);
  const share = adapterShare(dIn, dOut, r);
  const bigger = adapter > full;
  const base = `A ${n(dOut)} x ${n(dIn)} matrix has ${n(full)} parameters; a rank-${n(r)} adapter has ${n(adapter)}, ${pctText(share, share < 0.001 ? 3 : 2)} of them.`;
  if (!bigger) return base;
  if (adapterParams(dIn, dOut, 1) > full) return `${base} At every rank the adapter is bigger than the matrix.`;
  return `${base} Past rank ${crossoverRank(dIn, dOut).toLocaleString('en-US', { maximumFractionDigits: 1 })} the adapter is bigger than the matrix.`;
};

export const memoryCaption = (params: number, fraction: number): string => {
  const m = memoryLines(params, fraction);
  return `For ${(params / 1e9).toFixed(1)} billion parameters and ${pctText(fraction, 2)} of them in adapters: training everything takes ${gb(m.full)}, a frozen 16-bit base with adapters ${gb(m.lora)}, a 4-bit base with adapters ${gb(m.quantised)} (activations and scales excluded).`;
};

export const floorCaption = (r: number, run: TrainRun): string => {
  const floor = `The best rank-${r} update leaves ${pctText(optimumRelative(r), 3)} of the target's energy (the truncated SVD, a floor).`;
  if (belowFloor(run)) {
    return `${floor} Gradient descent reached ${pctText(run.final, 3)} after ${n(TRAIN_STEPS)} steps, BELOW the floor by ${pctText(-run.gap, 3)}: no rank-${r} update can do that, so this run is a bug.`;
  }
  const trained = run.withinTolerance
    ? `Gradient descent reaches ${pctText(run.final, 3)} after ${n(TRAIN_STEPS)} steps, within ${TOLERANCE} of the floor (as a share of the target's energy) and not below it (checked to ${FLOOR_NOISE.toExponential(0)}).`
    : `Still above the optimum after ${n(TRAIN_STEPS)} steps: gradient descent is at ${pctText(run.final, 3)} against a floor of ${pctText(run.optimum, 3)}.`;
  return `${floor} ${trained}`;
};

export const schemeName = (s: Scheme): string => (s.kind === 'tensor' ? 'per-tensor' : `per-group of ${s.size}`);

export const quantCaption = (bits: number, scheme: Scheme, outlier: boolean, err: OutputError, zeroed: number, ordinary: number): string => {
  const head = `At ${bits} bits ${schemeName(scheme)}${outlier ? ' with one outlier' : ''}, the relative output error of one toy layer on 200 seeded inputs is ${pctText(err.rms, 1)}.`;
  return `${head} ${zeroed} of the ${ordinary} ordinary weights round to zero.`;
};

export const BITS_LABELS = BITS_CHOICES.map((b) => ({ value: b as number, label: `${b} bits` }));
