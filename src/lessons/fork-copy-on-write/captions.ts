/** Captions, every number from the model on screen. Plain strings, so tests can read them. */
import { bytes } from '../../core/format';
import { PAGE_BYTES, type Mmu } from './mmu';
import { POOL_FRAMES, sharedFrameCount } from './view';
import type { ShareState } from './share';

export const size = (b: number) => (b === 0 ? '0 B' : bytes(b, { dp: 1 }));
export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function worldCaption(m: Mmu): string {
  const shared = sharedFrameCount(m);
  const last = m.log.at(-1)?.text;
  const broken = m.broken ? ' The fault handler is broken: it writes through shared pages without copying.' : '';
  return `${plural(m.alive.length, 'process', 'processes')} alive, ${plural(shared, 'frame')} shared, ${m.framesInUse} of ${POOL_FRAMES} frames in use, ${plural(m.copiedPages, 'page')} copied (${size(m.copiedPages * PAGE_BYTES)}).${broken} ${last ? `Last: ${last}.` : 'Press Fork, then click a page to write it.'}`;
}

export function shareCaption(s: ShareState): string {
  const [parent, child] = s.mmu.alive;
  if (!child) return `One process so far; fork() has not been called. The shared file offset is ${s.offset}.`;
  const last = s.reads.at(-1);
  return `fork() returned ${parent.forkReturn} in the parent and ${child.forkReturn} in the child, which has ${plural(child.threads, 'thread')} of the parent's ${parent.threads}. The one open file's offset is ${s.offset}${last ? `, after P${last.pid} read bytes ${last.from} to ${last.to}` : ''}, the same for both.`;
}
