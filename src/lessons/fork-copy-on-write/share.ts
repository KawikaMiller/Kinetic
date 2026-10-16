/** Scene 4: what fork does and does not share, as a small model: return values, threads and one open file's offset. */
import { Mmu, PAGES } from './mmu';
import { POOL_FRAMES } from './view';

/** Bytes a read of the shared file takes, and the file's length. */
export const FD_READ_BYTES = 4;
export const FILE_BYTES = 32;

export interface ShareState {
  mmu: Mmu;
  /** The offset of the one open file description both processes' fd 3 refer to after a fork. */
  offset: number;
  reads: { pid: number; from: number; to: number }[];
}

export function openingShare(): ShareState {
  const mmu = new Mmu(PAGES, POOL_FRAMES);
  mmu.spawn();
  return { mmu, offset: 0, reads: [] };
}

export function forkShare(s: ShareState, pid: number): ShareState {
  const mmu = s.mmu.clone();
  mmu.fork(pid);
  return { ...s, mmu };
}

/** A read(3, buf, 4) by `pid`: both processes share the offset, so it advances for both. Null at the end of the file. */
export function readShared(s: ShareState, pid: number): ShareState | null {
  if (s.offset >= FILE_BYTES) return null;
  const to = Math.min(FILE_BYTES, s.offset + FD_READ_BYTES);
  return { ...s, offset: to, reads: [...s.reads, { pid, from: s.offset, to }] };
}

export interface ShareRow {
  thing: string;
  parent: string;
  child: string;
  verdict: 'shared' | 'copied' | 'differs';
}

/** The comparison table, for the first process and (once forked) its child. */
export function shareRows(s: ShareState): ShareRow[] {
  const [parent, child] = s.mmu.alive;
  const none = '(no child yet)';
  return [
    { thing: 'fork() returned', parent: parent.forkReturn === null ? 'not called yet' : String(parent.forkReturn), child: child ? String(child.forkReturn) : none, verdict: 'differs' },
    { thing: 'process id', parent: String(parent.pid), child: child ? String(child.pid) : none, verdict: 'differs' },
    { thing: 'threads that exist', parent: String(parent.threads), child: child ? String(child.threads) : none, verdict: 'differs' },
    { thing: 'memory pages', parent: 'copy-on-write', child: child ? 'copy-on-write' : none, verdict: 'copied' },
    { thing: 'file descriptor 3', parent: `offset ${s.offset}`, child: child ? `offset ${s.offset}` : none, verdict: 'shared' },
  ];
}
