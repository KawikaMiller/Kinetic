// Pure model behind the transactions lesson: a $100 transfer run step by step, with or
// without a write-ahead log, and what recovery does with the disk after a crash.

export type Mode = 'none' | 'txn';
export type Letter = 'A' | 'C' | 'I' | 'D';
export type Account = 'alice' | 'bob';

export interface WalRec {
  id: number;
  text: string;
  kind: 'begin' | 'update' | 'commit' | 'undo' | 'redo';
  /** For an update: the account and its old and new value. */
  account?: Account;
  before?: number;
  after?: number;
}

/** Everything on disk (and what the client has heard) after some step. */
export interface Disk {
  alice: number;
  bob: number;
  wal: WalRec[];
  committed: boolean;
  /** The client has been told "done". */
  told: boolean;
}

export const ALICE_START = 500;
export const BOB_START = 300;
export const TRANSFER = 100;
/** The consistency rule: money only moves, so the total never changes. */
export const TOTAL = ALICE_START + BOB_START;
export const TXN_ID = 42;

export const PROGRAMS: Record<Mode, string[]> = {
  none: ['read Alice: $500', 'Alice = 400   (write to disk)', 'Bob = 400     (write to disk)', 'reply "done"'],
  txn: [
    'BEGIN',
    'log: Alice 500 → 400',
    'Alice = 400   (write page)',
    'log: Bob 300 → 400',
    'COMMIT        (flush log to disk)',
    'reply "done"',
    'Bob = 400     (page written later)',
  ],
};

export const LETTER_NAMES: Record<Letter, string> = {
  A: 'Atomicity',
  C: 'Consistency',
  I: 'Isolation',
  D: 'Durability',
};

type Step = (d: Disk, rec: (r: Omit<WalRec, 'id'>) => WalRec[]) => Disk;

const STEPS: Record<Mode, Step[]> = {
  none: [
    (d) => d,
    (d) => ({ ...d, alice: d.alice - TRANSFER }),
    (d) => ({ ...d, bob: d.bob + TRANSFER }),
    (d) => ({ ...d, told: true }),
  ],
  txn: [
    (d, rec) => ({ ...d, wal: rec({ text: `BEGIN tx ${TXN_ID}`, kind: 'begin' }) }),
    (d, rec) => ({ ...d, wal: rec({ text: `tx${TXN_ID} Alice ${ALICE_START}→${ALICE_START - TRANSFER}`, kind: 'update', account: 'alice', before: ALICE_START, after: ALICE_START - TRANSFER }) }),
    (d) => ({ ...d, alice: d.alice - TRANSFER }),
    (d, rec) => ({ ...d, wal: rec({ text: `tx${TXN_ID} Bob ${BOB_START}→${BOB_START + TRANSFER}`, kind: 'update', account: 'bob', before: BOB_START, after: BOB_START + TRANSFER }) }),
    (d, rec) => ({ ...d, wal: rec({ text: `COMMIT tx ${TXN_ID}`, kind: 'commit' }), committed: true }),
    (d) => ({ ...d, told: true }),
    (d) => ({ ...d, bob: d.bob + TRANSFER }),
  ],
};

const START: Disk = { alice: ALICE_START, bob: BOB_START, wal: [], committed: false, told: false };

/** The disk after each step: index 0 is before anything ran, index k after program line k. */
export function run(mode: Mode): Disk[] {
  let id = 1;
  const out = [START];
  for (const step of STEPS[mode]) {
    const d = out[out.length - 1];
    out.push(step(d, (r) => [...d.wal, { ...r, id: id++ }]));
  }
  return out;
}

export const total = (d: Disk) => d.alice + d.bob;
export const consistent = (d: Disk) => total(d) === TOTAL;

export type RecoveryAction = 'no-log' | 'redo' | 'undo' | 'nothing';

export interface Recovery {
  action: RecoveryAction;
  /** The accounts each REDO or UNDO record touched. */
  touched: Account[];
  disk: Disk;
}

/**
 * Restart after a crash with `disk` as it was. Without a log nothing can be done. With
 * one: a COMMIT means every logged change is redone where its page is behind; no COMMIT
 * means every logged change that reached its page is undone from the old value.
 */
export function recover(mode: Mode, disk: Disk): Recovery {
  if (mode === 'none') return { action: 'no-log', touched: [], disk };
  let id = Math.max(0, ...disk.wal.map((r) => r.id)) + 1;
  const updates = disk.wal.filter((r) => r.kind === 'update');
  const next = { ...disk, wal: [...disk.wal] };
  const touched: Account[] = [];
  for (const u of updates) {
    const account = u.account!;
    const name = account === 'alice' ? 'Alice' : 'Bob';
    if (disk.committed && next[account] !== u.after) {
      next[account] = u.after!;
      next.wal.push({ id: id++, text: `REDO ${name} → ${u.after}`, kind: 'redo' });
      touched.push(account);
    } else if (!disk.committed && next[account] === u.after) {
      next[account] = u.before!;
      next.wal.push({ id: id++, text: `UNDO ${name} → ${u.before}`, kind: 'undo' });
      touched.push(account);
    }
  }
  const action: RecoveryAction = touched.length ? (disk.committed ? 'redo' : 'undo') : 'nothing';
  return { action, touched, disk: next };
}

/** The steps a learner can crash after: any but the last. */
export const crashPoints = (mode: Mode) => Array.from({ length: PROGRAMS[mode].length - 1 }, (_, i) => i + 1);
