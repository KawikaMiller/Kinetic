/** Each scene's opening state, as a pure function of nothing, so a test can switch through every scene. */
import {
  DEFAULT_OPTIONS, POOL_SCENE_KERNEL, kernelOf, presetImage, NOISE_LEVELS, BAR_COLUMNS, type ConvOptions, type ImagePresetId, type KernelPresetId,
} from './convolve';
import { LEARN_DEFAULT } from './learn';
import type { LayerKind } from './stack';

export const convOpening = () => ({
  image: presetImage('vbar'),
  preset: 'vbar' as ImagePresetId | null,
  noise: NOISE_LEVELS[0] as number,
  kernel: kernelOf('sobelX'),
  kernelPreset: 'sobelX' as KernelPresetId | null,
  options: { ...DEFAULT_OPTIONS } as ConvOptions,
});

export const poolOpening = () => ({ column: BAR_COLUMNS[0] as number, shift: 1, kernel: POOL_SCENE_KERNEL.map((r) => [...r]) });

export const learnOpening = () => ({ config: { ...LEARN_DEFAULT }, image: presetImage('vbar') });

export const stackOpening = () => ({ layers: ['conv', 'conv', 'conv'] as LayerKind[], mode: 'field' as 'field' | 'pixel', output: [0, 0] as [number, number], pixel: [8, 8] as [number, number] });
