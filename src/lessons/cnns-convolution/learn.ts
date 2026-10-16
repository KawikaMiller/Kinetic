/**
 * Scene 3: a real tiny network (core/nn createConvNet: kernels, ReLU, global max pool, logistic
 * output) trained for real on seeded noisy bars. The learned kernels, curves, held-out accuracy
 * and the seed gallery all come from these runs.
 */
import { createConvNet, createSgd, type ConvNet } from '../../core/nn';
import { barsSet, type BarsSet, type Image } from './barsData';
import type { Kernel } from './convolve';

export const NOISE = 0.2;
export const TRAIN_DATA_SEED = 100;
export const HELD_OUT_SEED = 200;
export const TRAIN_COUNT = 24;
export const HELD_OUT_COUNT = 200;
export const RATE = 0.3;
export const EPOCHS_PER_FRAME = 3;
export const GALLERY_EPOCHS = 120;
export const GALLERY_SEEDS = 8;
/** A seed "learned" the task when its held-out accuracy reaches this. */
export const LEARNED_AT = 0.9;
export const KERNEL_COUNTS = [1, 2] as const;
export const KERNEL_SIZE = 3;
export const IMAGE_SIZE = 8;

export interface LearnConfig {
  kernels: number;
  seed: number;
}
export const LEARN_DEFAULT: LearnConfig = { kernels: 1, seed: 1 };

let cache: { train: BarsSet; held: BarsSet } | null = null;
const data = () => (cache ??= { train: barsSet(TRAIN_DATA_SEED, TRAIN_COUNT, NOISE), held: barsSet(HELD_OUT_SEED, HELD_OUT_COUNT, NOISE) });

export const accuracyOn = (net: ConvNet, set: BarsSet): number =>
  set.images.filter((image, i) => (net.predict(image) > 0.5 ? 1 : 0) === set.ys[i]).length / set.images.length;

export interface LearnRun {
  readonly config: LearnConfig;
  readonly net: ConvNet;
  readonly lossHistory: number[];
  readonly trainAccuracy: number[];
  epoch: number;
  advance(epochs: number): void;
  heldOut(): number;
  kernels(): Kernel[];
}

export function createLearnRun(config: LearnConfig): LearnRun {
  const { train, held } = data();
  const net = createConvNet({ size: IMAGE_SIZE, kernels: config.kernels, seed: config.seed });
  const sgd = createSgd({ learningRate: RATE });
  const run: LearnRun = {
    config,
    net,
    lossHistory: [net.loss(train)],
    trainAccuracy: [accuracyOn(net, train)],
    epoch: 0,
    advance(epochs) {
      for (let i = 0; i < epochs; i++) {
        sgd.step(net, train);
        run.epoch++;
        run.lossHistory.push(net.loss(train));
        run.trainAccuracy.push(accuracyOn(net, train));
      }
    },
    heldOut: () => accuracyOn(net, held),
    kernels: () => Array.from({ length: config.kernels }, (_, k) => net.kernel(k)),
  };
  return run;
}

export interface GalleryEntry {
  seed: number;
  kernels: Kernel[];
  heldOut: number;
}

/** Train `count` consecutive seeds from `firstSeed` for `epochs` each. */
export function trainGallery(kernels: number, firstSeed: number, count = GALLERY_SEEDS, epochs = GALLERY_EPOCHS): GalleryEntry[] {
  return Array.from({ length: count }, (_, i) => {
    const run = createLearnRun({ kernels, seed: firstSeed + i });
    run.advance(epochs);
    return { seed: firstSeed + i, kernels: run.kernels(), heldOut: run.heldOut() };
  });
}

export const learnedShare = (entries: readonly GalleryEntry[]): number => entries.filter((e) => e.heldOut >= LEARNED_AT).length;

/** What the network says about an image: the probability of a vertical bar, and each kernel's ReLU map. */
export function applyLearned(net: ConvNet, image: Image) {
  return { p: net.predict(image), maps: Array.from({ length: net.kernelCount }, (_, k) => net.featureMap(image, k)) };
}
