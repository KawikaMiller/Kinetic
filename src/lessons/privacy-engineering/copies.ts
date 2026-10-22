/**
 * Where one fictional user's record lives, and what a deletion request leaves behind. The person, the address
 * and every retention window are invented and illustrative: this is engineering education, not legal advice.
 */

export type CopyId = 'primary' | 'search' | 'cache' | 'logs' | 'analytics' | 'backups' | 'processor' | 'training';

export interface Copy {
  id: CopyId;
  label: string;
  holds: string;
  /** Days after the request when the copy goes away by itself (its own retention); null when it never does. */
  expiry: number | null;
  /** Days the fan-out deletion queue takes to reach it; null when nothing wires it to the queue. */
  queueLag: number | null;
  /** Holds the data encrypted under the user's own key, so destroying that key makes it unreadable. */
  keyed: boolean;
  /** Not made at all when data minimisation is on (the email is not logged, the row is not copied to analytics). */
  minimisable: boolean;
  /** A legal hold keeps it. */
  heldByLaw: boolean;
}

/** The backup retention window, illustrative. */
export const BACKUP_RETENTION_DAYS = 35;
/** The shortest retention the "retention TTLs" strategy sets on a copy. */
export const TTL_CAP_DAYS = 30;
export const MAX_DAY = 90;

export const COPIES: readonly Copy[] = [
  { id: 'primary', label: 'Primary database', holds: 'the account row', expiry: null, queueLag: 0, keyed: true, minimisable: false, heldByLaw: true },
  { id: 'search', label: 'Search index', holds: 'name and address for lookup', expiry: null, queueLag: 1, keyed: true, minimisable: false, heldByLaw: false },
  { id: 'cache', label: 'Cache', holds: 'the rendered profile', expiry: 1, queueLag: 0, keyed: false, minimisable: false, heldByLaw: false },
  { id: 'logs', label: 'Application logs', holds: 'the address in login lines', expiry: 30, queueLag: null, keyed: false, minimisable: true, heldByLaw: false },
  { id: 'analytics', label: 'Analytics warehouse', holds: 'a copy of the row for reports', expiry: 90, queueLag: 7, keyed: true, minimisable: true, heldByLaw: false },
  { id: 'backups', label: 'Backups', holds: 'the whole database, as written', expiry: BACKUP_RETENTION_DAYS, queueLag: null, keyed: true, minimisable: false, heldByLaw: true },
  { id: 'processor', label: 'Third-party processor', holds: 'the address, for email delivery', expiry: 60, queueLag: 14, keyed: false, minimisable: false, heldByLaw: false },
  { id: 'training', label: 'ML training set', holds: 'the row, in a dataset snapshot', expiry: null, queueLag: 30, keyed: false, minimisable: false, heldByLaw: false },
];

export type Strategy = 'primary' | 'queue' | 'shred' | 'ttl';
export const STRATEGY_ORDER: readonly Strategy[] = ['primary', 'queue', 'shred', 'ttl'];
export const STRATEGY_LABEL: Record<Strategy, string> = {
  primary: 'Delete from the primary only',
  queue: 'Fan-out deletion queue',
  shred: 'Crypto-shredding',
  ttl: 'Retention TTLs',
};
export const STRATEGY_ABOUT: Record<Strategy, string> = {
  primary: 'the usual naive version: the primary row goes and nothing else is touched',
  queue: 'a job tells every wired store to delete the record, each on its own schedule',
  shred: 'the data is encrypted under a per-user key; destroying the key makes the encrypted copies unreadable',
  ttl: `the primary row goes, and every other copy is given a retention of at most ${TTL_CAP_DAYS} days`,
};

export type Status = 'readable' | 'deleted' | 'unreadable' | 'held' | 'absent';

export interface Scenario {
  strategy: Strategy;
  /** Days since the deletion request. */
  day: number;
  legalHold: boolean;
  minimise: boolean;
}

export interface CopyState {
  copy: Copy;
  status: Status;
  /** The day it stops being readable (0 = at once), or null when it never does under this scenario. */
  goneOn: number | null;
}

/** The day a copy stops holding readable data under a scenario (ignoring the legal hold and minimisation), or null. */
export function goneDay(copy: Copy, strategy: Strategy, shreddable: boolean): number | null {
  const own = copy.expiry;
  const earliest = (...days: (number | null)[]): number | null => days.reduce<number | null>((best, d) => (d === null ? best : best === null ? d : Math.min(best, d)), null);
  switch (strategy) {
    case 'primary':
      return copy.id === 'primary' ? 0 : own;
    case 'queue':
      return earliest(copy.queueLag, own);
    case 'shred':
      return copy.keyed && shreddable ? 0 : own;
    case 'ttl':
      return copy.id === 'primary' ? 0 : earliest(own, TTL_CAP_DAYS);
  }
}

/** Every copy's state on a day. */
export function stateOf({ strategy, day, legalHold, minimise }: Scenario): CopyState[] {
  // A legal hold stops the user's key being destroyed (the held copies are encrypted under it).
  const shreddable = !legalHold;
  return COPIES.map((copy) => {
    if (minimise && copy.minimisable) return { copy, status: 'absent' as const, goneOn: null };
    if (legalHold && copy.heldByLaw) return { copy, status: 'held' as const, goneOn: null };
    const gone = goneDay(copy, strategy, shreddable);
    if (gone === null || day < gone) return { copy, status: 'readable' as const, goneOn: gone };
    const unreadable = strategy === 'shred' && copy.keyed && shreddable;
    return { copy, status: unreadable ? ('unreadable' as const) : ('deleted' as const), goneOn: gone };
  });
}

export const countStatus = (states: readonly CopyState[], s: Status): number => states.filter((x) => x.status === s).length;
