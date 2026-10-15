import type { Tone } from '../../core/tone';
import { MAX_VERSIONS, committedBefore, horizon, nameOf, openSlots, removable, tally, viewOf, visible, type Db, type Snapshot, type Version, type Who } from './engine';

/** A row's rail: its tone and the reason in a word or two. */
export interface RowView {
  tone: Tone;
  label: string;
}

/** Rows the version table shows at once (the lesson's table is at most this tall on a phone). */
export const PAGE_ROWS = 8;

/**
 * What each version looks like to `who`: visible (green), dead to everyone (red: VACUUM may remove it), or kept for a
 * reason that is not "dead" (dim: too new, not yet committed, or replaced but still needed by an older open snapshot).
 */
export function classifyAll(db: Db, who: Who, dead: ReadonlySet<number> = new Set(removable(db).map((v) => v.vid))): RowView[] {
  const { self, snap } = viewOf(db, who);
  return db.versions.map((v): RowView => {
    if (visible(db, v, self, snap)) return { tone: 'ok', label: 'visible' };
    if (dead.has(v.vid)) return { tone: 'bad', label: db.txs[v.xmin].status === 'aborted' ? 'dead: creator aborted' : 'dead: nobody can see it' };
    const creator = db.txs[v.xmin];
    if (creator.status === 'active') return { tone: 'dim', label: `uncommitted (${nameOf(db, v.xmin)})` };
    if (!(v.xmin === self || committedBefore(db, v.xmin, snap))) return { tone: 'dim', label: 'too new for this snapshot' };
    return { tone: 'dim', label: 'old: an open snapshot still needs it' };
  });
}

/** Versions kept only because an open snapshot might still read them: replaced for a new reader, creator committed, not removable. */
export function pinnedVids(db: Db): Set<number> {
  const fresh = viewOf(db, 'auto').snap;
  const dead = new Set(removable(db).map((v) => v.vid));
  return new Set(db.versions.filter((v) => !dead.has(v.vid) && !visible(db, v, null, fresh) && db.txs[v.xmin].status === 'committed' && v.xmax !== null).map((v) => v.vid));
}

/** The window of versions on screen: the newest PAGE_ROWS, or an older page when `back` pages have been turned. */
export function pageOf(total: number, back: number): { from: number; to: number; pages: number } {
  const pages = Math.max(1, Math.ceil(total / PAGE_ROWS));
  const clamped = Math.min(back, pages - 1);
  const to = total - clamped * PAGE_ROWS;
  return { from: Math.max(0, to - PAGE_ROWS), to, pages };
}

/** "sees ids below 9 except 5 and 7": the snapshot in words, or what a new statement would take. */
export function snapshotText(db: Db, who: Who): string {
  const { snap, held } = viewOf(db, who);
  const except = snap.active.length ? ` except ${snap.active.map((x) => `x${x}`).join(' and ')} (still running then)` : '';
  const base = `ids below x${snap.xmax} that had committed${except}`;
  return who === 'auto' ? `a new snapshot each statement: ${base}` : held ? `its snapshot sees ${base}` : openSlots(db).includes(who) ? `no snapshot yet; the next statement would see ${base}` : `T${who} is not open; a new snapshot would see ${base}`;
}

/** The oldest open snapshot as a sentence for the horizon marker, or why there is none. */
export function horizonText(db: Db): string {
  const h: Snapshot | null = horizon(db);
  if (!h) return 'no open snapshot: every dead version can go';
  const owner = Object.values(db.txs).find((t) => t.status === 'active' && t.snapshot === h)!;
  return `the oldest open snapshot is ${nameOf(db, owner.xid)}'s, taken after ${h.seq} ${h.seq === 1 ? 'commit' : 'commits'}`;
}

export const tableSizeText = (db: Db): string => {
  const t = tally(db);
  return `${t.total} of ${MAX_VERSIONS} versions: ${t.live} live, ${t.dead} dead, ${t.pinned} kept for an open snapshot, ${t.pending} uncommitted`;
};

export const versionCell = (v: Version) => ({ key: v.key, value: v.value, xmin: `x${v.xmin}`, xmax: v.xmax === null ? '–' : `x${v.xmax}` });
