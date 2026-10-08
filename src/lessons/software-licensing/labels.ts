import type { Tone } from '../../core/tone';
import type { DepStatus, DepVerdict } from './resolver';

export const STATUS_TONE: Record<DepStatus, Tone> = { ok: 'ok', violet: 'violet', bad: 'bad', dim: 'dim' };

export const STATUS_WORD: Record<DepStatus, string> = {
  ok: 'notices only',
  violet: 'copyleft triggered',
  bad: 'conflict or no permission',
  dim: 'nothing triggered',
};

/** The status chip's words: a status that rests on a contested combination says so. */
export function statusWord(v: Pick<DepVerdict, 'status' | 'contested'>): string {
  if (v.contested && v.status === 'bad') return 'likely conflict (contested)';
  if (v.contested && v.status === 'violet') return 'copyleft likely triggered (contested)';
  return STATUS_WORD[v.status];
}
