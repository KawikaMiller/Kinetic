import type { Tone } from '../../core/tone';
import type { StructureId, WorkloadId, WorkloadResult } from './workloads';

export const STRUCTURES: { id: StructureId; label: string }[] = [
  { id: 'array', label: 'Array' },
  { id: 'gap', label: 'Gap buffer' },
  { id: 'rope', label: 'Rope' },
];

/** The workload and text size the last scene opens on. */
export const DEFAULT_WORKLOAD: WorkloadId = 'type';
export const DEFAULT_SIZE = 1000;

export const withCommas = (v: number) => Math.round(v).toLocaleString('en-US');

/** The tone of one structure on one workload: the best is --ok, the single worst --bad, in between neutral. Computed from the touches. */
export const toneIn = (r: WorkloadResult, s: StructureId): Tone => (r.winners.includes(s) ? 'ok' : r.loser === s ? 'bad' : 'info');
