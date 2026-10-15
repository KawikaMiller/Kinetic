import type { ReactNode } from 'react';
import { KEYS, MAX_VERSIONS, openSlots, readRows, tally, viewOf, type Db, type Op, type Outcome, type Who } from './engine';
import { classifyAll, snapshotText } from './view';

/** An operation in words, for the replay's captions. */
export function opText(op: Op): string {
  const who = (w: Who) => (w === 'auto' ? 'autocommit' : `T${w}`);
  switch (op.kind) {
    case 'begin': return 'BEGIN';
    case 'select': return `${who(op.who)} SELECT`;
    case 'update': return `${who(op.who)} UPDATE ${op.key} = ${op.value}`;
    case 'delete': return `${who(op.who)} DELETE ${op.key}`;
    case 'insert': return `${who(op.who)} INSERT ${op.key} = ${op.value}`;
    case 'commit': return `T${op.who} COMMIT`;
    case 'rollback': return `T${op.who} ROLLBACK`;
    case 'vacuum': return op.broken ? 'broken VACUUM' : 'VACUUM';
  }
}

export const rowsText = (rows: Partial<Record<(typeof KEYS)[number], number>>): string =>
  KEYS.map((k) => (rows[k] === undefined ? `${k} (no row)` : `${k} = ${rows[k]}`)).join(', ');

const hl = (cls: string, text: ReactNode): ReactNode => <span className={`hl ${cls}`}>{text}</span>;

/** What the table on screen says, for the viewer selected: what they read, and how many versions they can see. */
export function workbenchCaption(db: Db, who: Who, scene: 'versions' | 'vacuum', last: { status: Outcome['status']; text: string } | null): ReactNode {
  const { self, snap } = viewOf(db, who);
  const reads = rowsText(readRows(db, self, snap));
  const visible = classifyAll(db, who).filter((v) => v.tone === 'ok').length;
  const t = tally(db);
  const viewer = who === 'auto' ? 'An autocommit statement' : openSlots(db).includes(who) ? `T${who}` : `T${who} (not open)`;
  return (
    <>
      {viewer} would read {reads}: {visible} of the {t.total} {t.total === 1 ? 'version is' : 'versions are'} visible to it, because {snapshotText(db, who)}.
      {scene === 'vacuum' ? <> {t.dead === 0 ? 'No version is dead.' : <>{hl('bad', `${t.dead} dead`)} {t.dead === 1 ? 'version' : 'versions'} could be removed now.</>}{t.pinned > 0 ? <> {hl('violet', `${t.pinned} more`)} {t.pinned === 1 ? 'is' : 'are'} kept because an open snapshot may still need {t.pinned === 1 ? 'it' : 'them'}.</> : null} The table holds {t.total} of {MAX_VERSIONS} versions.</> : null}
      {last ? <> Last action: {last.status === 'ok' ? last.text : hl('orange', last.text)}.</> : null}
    </>
  );
}
