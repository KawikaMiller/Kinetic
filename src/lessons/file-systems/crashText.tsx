import type { ReactNode } from 'react';
import type { CrashPoint, Home, Mode, Problem, Write } from './crash';

export const HOME_NAME: Record<Home, string> = { D: 'data block', I: 'inode', B: 'bitmap' };

export const writeLabel = (w: Write) => (w.kind === 'commit' ? 'commit' : w.kind === 'log' ? `log ${w.what}` : `${w.what} home`);

export const PROBLEM_TEXT: Record<Problem, string> = {
  'stale-data': 'the inode points at a block that never got the new data, so the file now ends in old bytes from a deleted file',
  leak: 'the bitmap marks the block used but no inode points at it: a leaked block',
  'double-use': 'the inode uses a block the bitmap still calls free, so it could be handed to another file too',
};

export const MODE_NAME: Record<Mode, string> = { none: 'no journal', journal: 'data=journal', ordered: 'data=ordered', writeback: 'data=writeback' };

export function crashCaption(mode: Mode, p: CrashPoint, total: number): ReactNode {
  const { outcome, before } = p;
  const when = p.k === 0 ? <>before any write</> : p.k === total ? <>after all {total} writes</> : <>after write {p.k} of {total}</>;
  const recovery =
    mode === 'none' ? (
      <>There is no journal to replay.</>
    ) : before.committed ? (
      <>The commit record is on disk, so recovery replays the logged blocks.</>
    ) : before.log.length > 0 ? (
      <>No commit record, so recovery throws the logged blocks away.</>
    ) : (
      <>The journal is empty, so there's nothing to replay.</>
    );
  const verdict = outcome.complete ? (
    <>
      <span className="hl ok">Survived:</span> the append is complete and consistent.
    </>
  ) : outcome.problems.length === 0 ? (
    <>
      <span className="hl orange">Lost:</span> the append is lost, but the file system is consistent: it's as if the write never happened.
    </>
  ) : (
    <>
      <span className="hl bad">Inconsistent:</span> {outcome.problems.map((x) => PROBLEM_TEXT[x]).join('; and ')}.
    </>
  );
  return (
    <>
      Power cut {when} ({MODE_NAME[mode]}). {recovery} {verdict}
    </>
  );
}
