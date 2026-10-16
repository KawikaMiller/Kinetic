/** The numbers the try-this entries quote, computed from each scene's default state by the same model the scenes draw. */
import { size } from './captions';
import { forkShare, openingShare, readShared } from './share';
import { DEFAULT_USES, usesView } from './usesView';
import { DEFAULT_WRITE_BYTE, hex2, naiveForkBytes, openingWorld } from './view';
import { PAGE_BYTES } from './mmu';

export function forkFacts() {
  const m = openingWorld('fork');
  const before = m.framesInUse;
  m.fork(1);
  return { framesBefore: before, framesAfter: m.framesInUse, copied: m.copiedPages, entries: m.forkedEntries, naive: size(naiveForkBytes(m)) };
}

/** Scene 2 opens after the fork; the try-this writes the default byte to page 3 of the child. */
export const WRITE_PAGE = 3;
export function writeFacts() {
  const m = openingWorld('write');
  const parentBefore = m.read(1, WRITE_PAGE)!;
  m.write(2, WRITE_PAGE, DEFAULT_WRITE_BYTE);
  return { framesInUse: m.framesInUse, copiedBytes: size(m.copiedPages * PAGE_BYTES), childReads: hex2(m.read(2, WRITE_PAGE)!), parentReads: hex2(m.read(1, WRITE_PAGE)!), parentBefore: hex2(parentBefore) };
}

export function brokenFacts() {
  const m = openingWorld('write');
  m.broken = true;
  m.write(2, WRITE_PAGE, DEFAULT_WRITE_BYTE);
  return { parentReads: hex2(m.read(1, WRITE_PAGE)!), violation: m.invariantViolation() };
}

export function snapshotFacts() {
  const small = usesView(DEFAULT_USES);
  const huge = usesView({ ...DEFAULT_USES, huge: true });
  return { smallPages: small.stats[0].value, smallGrowth: small.stats[1].value, expected: small.stats[3].value, hugePages: huge.stats[0].value, hugeGrowth: huge.stats[1].value };
}

export function shareFacts() {
  let s = forkShare(openingShare(), 1);
  const [parent, child] = s.mmu.alive;
  s = readShared(s, parent.pid)!;
  s = readShared(s, child.pid)!;
  return { parentReturn: parent.forkReturn, childReturn: child.forkReturn, childThreads: child.threads, parentThreads: parent.threads, offset: s.offset };
}
