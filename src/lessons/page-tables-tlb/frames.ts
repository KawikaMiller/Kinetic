/** Step-player frames: one per page-table level read, and one per TLB access. */
import { createRecorder } from '../../core/recorder';
import type { Frame } from '../../core/types';
import { WALK_INTRO, accessCaption, stepCaption, tlbSummary, walkSummary } from './captions';
import type { WalkResult } from './paging';
import type { TlbConfig, TlbRun } from './tlb';

export interface WalkFrame extends Frame {
  /** How many levels have been read. */
  read: number;
}

export function walkFrames(result: WalkResult, tables: number): WalkFrame[] {
  const r = createRecorder<WalkFrame>({ read: 0 });
  r.snap(WALK_INTRO);
  result.steps.forEach((step, k) => r.snap(stepCaption(step, k), 1, { read: k + 1 }));
  r.close(walkSummary(result, tables), 2);
  return r.frames;
}

export interface TlbFrame extends Frame {
  /** Index of the access shown, or -1 before the first one. */
  i: number;
}

export function tlbFrames(cfg: TlbConfig, run: TlbRun): TlbFrame[] {
  const r = createRecorder<TlbFrame>({ i: -1 });
  r.snap('A TLB caches recent translations (page number to frame), not data. Each access looks its page up; a miss costs a walk.');
  run.steps.forEach((step, i) => r.snap(accessCaption(step, cfg, run), step.hit ? 0.5 : 1, { i }));
  r.close(tlbSummary(cfg, run), 2);
  return r.frames;
}
