import type { HeatValue } from '../../components/Plot2D';
import { clamp } from '../../core/math';
import type { Cls } from './model';

/** The two classes' colours: blue is --info, violet is --violet (classes, not good or bad). */
export const CLASS_TONE = ['info', 'violet'] as const;
export const DOT_R = 3.6;

export const regionOf = (c: Cls, intensity: number): HeatValue => ({ tone: CLASS_TONE[c], intensity });

/** A training point's radius from its AdaBoost weight: area grows with weight, n·w = 1 is the normal size. */
export const radiusFromWeight = (w: number, n: number) => clamp(DOT_R * Math.sqrt(w * n), 1.6, 13);
