import { describe, expect, it } from 'vitest';
import { ALICE_START, BOB_START, PROGRAMS, TOTAL, TRANSFER, crashPoints, recover, run, total, type Mode } from './model';

const MODES: Mode[] = ['none', 'txn'];

describe('running the transfer to the end', () => {
  it('moves exactly the transfer in both modes', () => {
    for (const mode of MODES) {
      const end = run(mode).at(-1)!;
      expect([end.alice, end.bob]).toEqual([ALICE_START - TRANSFER, BOB_START + TRANSFER]);
      expect(end.told).toBe(true);
      expect(run(mode)).toHaveLength(PROGRAMS[mode].length + 1);
    }
  });
});

describe('with a transaction and a log', () => {
  const disks = run('txn');

  it('rollback leaves no partial write: after a crash at any step, recovery gives all or nothing', () => {
    for (const k of crashPoints('txn')) {
      const { disk } = recover('txn', disks[k]);
      expect(total(disk)).toBe(TOTAL);
      if (disks[k].committed) expect([disk.alice, disk.bob]).toEqual([ALICE_START - TRANSFER, BOB_START + TRANSFER]);
      else expect([disk.alice, disk.bob]).toEqual([ALICE_START, BOB_START]);
    }
  });

  it('logs every change before its page changes (the write-ahead rule)', () => {
    for (const d of disks) {
      if (d.alice !== ALICE_START) expect(d.wal.some((r) => r.account === 'alice')).toBe(true);
      if (d.bob !== BOB_START) expect(d.wal.some((r) => r.account === 'bob')).toBe(true);
    }
  });

  it('only tells the client "done" after COMMIT is on disk', () => {
    for (const d of disks) if (d.told) expect(d.committed).toBe(true);
  });

  it('undoes only what reached a page, and redoes only what is behind', () => {
    // crash after Alice's page was written, before COMMIT: one UNDO, for Alice
    expect(recover('txn', disks[3]).touched).toEqual(['alice']);
    // crash before any page changed: nothing to undo
    expect(recover('txn', disks[2]).action).toBe('nothing');
    // crash after COMMIT, before Bob's page: one REDO, for Bob (Alice's page is already right)
    expect(recover('txn', disks[5]).touched).toEqual(['bob']);
    expect(recover('txn', disks[6]).touched).toEqual(['bob']);
  });

  it('recovery is idempotent: recovering a recovered disk changes nothing', () => {
    for (const k of crashPoints('txn')) {
      const once = recover('txn', disks[k]).disk;
      const twice = recover('txn', once);
      expect(twice.action).toBe('nothing');
      expect([twice.disk.alice, twice.disk.bob]).toEqual([once.alice, once.bob]);
    }
  });
});

describe('without a transaction', () => {
  it('a crash between the two writes loses the money for good, and nothing else does', () => {
    const disks = run('none');
    for (const k of crashPoints('none')) {
      const { action, disk } = recover('none', disks[k]);
      expect(action).toBe('no-log');
      expect(total(disk)).toBe(k === 2 ? TOTAL - TRANSFER : TOTAL);
    }
  });
});
