import type { Tone } from '../../core/tone';
import type { DepStatus } from './resolver';

export const STATUS_TONE: Record<DepStatus, Tone> = { ok: 'ok', violet: 'violet', bad: 'bad', dim: 'dim' };

export const STATUS_WORD: Record<DepStatus, string> = {
  ok: 'notices only',
  violet: 'copyleft triggered',
  bad: 'conflict or no permission',
  dim: 'nothing triggered',
};
