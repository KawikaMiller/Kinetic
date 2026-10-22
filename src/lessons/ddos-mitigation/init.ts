import { defaultInput, type OriginInput } from './origin';
import { ATTACK_RANGE, EXTRA_RANGE, SKEW_RANGE, THRESHOLD_RANGE } from './pops';
import { FLOOD_RANGE, type Mode } from './syn';

/** Each scene's opening state is a pure function: a test switches through all three and checks it against the try-this text. */

export const initialOrigin = (): OriginInput => defaultInput('volumetric');

export interface PopsUi {
  attack: number;
  skewPct: number;
  extra: number;
  threshold: number;
  seed: number;
}

export const initialPops = (): PopsUi => ({ attack: ATTACK_RANGE.default, skewPct: SKEW_RANGE.default, extra: EXTRA_RANGE.default, threshold: THRESHOLD_RANGE.default, seed: 0 });

export interface SynUi {
  mode: Mode;
  flood: number;
  seed: number;
}

export const initialSyn = (): SynUi => ({ mode: 'plain', flood: FLOOD_RANGE.default, seed: 0 });
