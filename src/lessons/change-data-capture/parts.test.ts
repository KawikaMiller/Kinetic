import { describe, expect, it } from 'vitest';
import {
  POLL_END_MS, POLL_EVERY_MS, POLL_SEEDS, lowestPollingDeleteMiss, lowestPollingLateMiss, pollSeeded, pollTimesEvery, pollingRun, seededLateTxs, seededPollTxs, tableAt, twoInterleaved,
} from './polling';
import { DISK_BUDGET_BYTES, MAX_TICKS, RECOVERY_RECORDS, RECORD_BYTES, SEGMENT_RECORDS, WRITES_PER_TICK, retentionAt, retentionSeries } from './retention';
import {
  SCAN_START_MS, SCAN_STEP_MS, buildSnapshotCluster, SNAPSHOT_END_MS, SNAPSHOT_ROWS, SNAP_SEEDS, evaluateSnapshot, initialRows, lowestSnapshotFailure, scanTimeOf, seededWrites, snapshotDivergence,
} from './snapshot';

describe('snapshot then stream, on the same harness', () => {
  it('streaming from where the snapshot began never loses a change, on 200 seeded write schedules, and ends equal to the source', () => {
    for (const seed of SNAP_SEEDS) {
      const r = evaluateSnapshot({ seed, from: 'snapshot', writes: seededWrites(seed) });
      expect(r.message, `seed ${seed}`).toBeNull();
    }
  });

  it('streaming from where the log is now loses changes: the lowest failing seed is 0', () => {
    expect(lowestSnapshotFailure('now')).toBe(0);
    expect(lowestSnapshotFailure('snapshot')).toBeUndefined();
  });

  it('for the stated reason: a write reached a row the scan had already read, and writes before the scan reached a row are harmless (independent counterfactual)', () => {
    const writes = seededWrites(0);
    const lost = writes.filter((w) => scanTimeOf(w.key) < w.at && w.at < SNAPSHOT_END_MS);
    expect(lost.length).toBeGreaterThan(0);
    expect(evaluateSnapshot({ seed: 0, from: 'now', writes }).ok).toBe(false);
    const early = writes.filter((w) => w.at <= scanTimeOf(w.key));
    expect(evaluateSnapshot({ seed: 0, from: 'now', writes: early }).ok).toBe(true);
    expect(evaluateSnapshot({ seed: 0, from: 'snapshot', writes }).ok).toBe(true);
  });

  it('the hand-built schedule of the spec: row 7 written just after the scan read it', () => {
    const writes = [{ at: scanTimeOf(7) + 15, key: 7, row: { status: 'paid', amount: 101 } }];
    const bad = evaluateSnapshot({ seed: 1, from: 'now', writes });
    expect(snapshotDivergence(bad.cluster.snapshot())).toContain('key 7');
    expect(evaluateSnapshot({ seed: 1, from: 'snapshot', writes }).ok).toBe(true);
    expect(evaluateSnapshot({ seed: 1, from: 'now', writes: [] }).ok).toBe(true);
  });

  it('a mid-run loss is not the end state: two writes to row 7 (50 and 100 ms) leave a loss at the stop and equal rows at 500 ms', () => {
    const writes = [{ at: 50, key: 7, row: { status: 'paid', amount: 101 } }, { at: 100, key: 7, row: { status: 'paid', amount: 102 } }];
    const r = evaluateSnapshot({ seed: 1, from: 'now', writes });
    expect(r.loss).toContain('key 7');
    expect(r.end).toBeNull();
    // independent read of the same run: both grids hold row 7 as S 102 at 500 ms
    const full = buildSnapshotCluster({ seed: 1, from: 'now', writes });
    full.run({ until: SNAPSHOT_END_MS });
    const snap = full.snapshot();
    const src = (snap.nodes.db.state as { rows: Record<number, { amount: number }> }).rows[7];
    const mine = (snap.nodes.newbie.state as unknown as { rows: Record<number, { amount: number }> }).rows[7];
    expect([src.amount, mine.amount]).toEqual([102, 102]);
  });

  it('writes to the same key are what let a loss heal: some seeded schedules have a loss mid-run and equal rows at the end', () => {
    const healed = SNAP_SEEDS.filter((seed) => { const r = evaluateSnapshot({ seed, from: 'now', writes: seededWrites(seed) }); return r.loss !== null && r.end === null; });
    expect(healed.length).toBeGreaterThan(0);
    for (const seed of healed) {
      const writes = seededWrites(seed);
      const keys = writes.map((w) => w.key);
      expect(keys.some((k, i) => keys.indexOf(k) !== i), `seed ${seed}`).toBe(true);
    }
  });

  it('the scan reads one row every step and the snapshot holds the twelve rows', () => {
    expect(Object.keys(initialRows())).toHaveLength(SNAPSHOT_ROWS);
    expect(scanTimeOf(SNAPSHOT_ROWS) - scanTimeOf(1)).toBe((SNAPSHOT_ROWS - 1) * SCAN_STEP_MS);
    expect(scanTimeOf(1)).toBe(SCAN_START_MS + 1);
  });
});

describe('polling an updated_at column', () => {
  it('sees an insert and an update, but a hard delete leaves the row in the copy, and a late commit with an older timestamp is skipped', () => {
    const early = pollingRun(twoInterleaved(13), pollTimesEvery(POLL_EVERY_MS, POLL_END_MS), POLL_END_MS);
    expect(early.misses).toEqual([]);
    const late = pollingRun(twoInterleaved(25), pollTimesEvery(POLL_EVERY_MS, POLL_END_MS), POLL_END_MS);
    expect(late.misses).toEqual([{ key: 1, why: 'late' }]);
    const del = pollingRun([...twoInterleaved(13), { txid: 3, begin: 100, commit: 102, stmts: [{ op: 'delete', key: 2 }] }], pollTimesEvery(POLL_EVERY_MS, POLL_END_MS), POLL_END_MS);
    expect(del.misses).toEqual([{ key: 2, why: 'delete' }]);
  });

  it('the table at a time is the committed state with updated_at set to the statement time (hand-worked)', () => {
    const txs = twoInterleaved(25);
    expect(tableAt(txs, 20)).toEqual({ 2: { status: 'new', amount: 20, updatedAt: 12 } });
    expect(tableAt(txs, 25)[1]).toEqual({ status: 'new', amount: 50, updatedAt: 10 });
  });

  it('delete misses: the lowest failing seed is 0, and the missing row is one the source deleted', () => {
    expect(lowestPollingDeleteMiss()).toBe(0);
    const r = pollSeeded(0, 'delete');
    const miss = r.misses.find((m) => m.why === 'delete')!;
    expect(r.source[miss.key]).toBeUndefined();
    expect(r.copy[miss.key]).toBeDefined();
    expect(seededPollTxs(0).some((t) => t.stmts.some((s) => s.op === 'delete' && s.key === miss.key))).toBe(true);
  });

  it('late-commit misses with no deletes at all: the lowest failing seed is 0, and a transaction with an older stamp committed after a newer stamp was seen', () => {
    expect(lowestPollingLateMiss()).toBe(0);
    const txs = seededLateTxs(0);
    expect(txs.every((t) => t.stmts.every((s) => s.op !== 'delete'))).toBe(true);
    const r = pollSeeded(0, 'late');
    const key = r.misses[0].key;
    const missed = txs.filter((t) => t.stmts.some((s) => s.key === key)).some((t) => txs.some((o) => o.txid !== t.txid && o.begin > t.begin && o.commit < t.commit && pollTimesEvery(POLL_EVERY_MS, POLL_END_MS).some((p) => p >= o.commit && p < t.commit)));
    expect(missed).toBe(true);
  });

  it('with every transaction committing before the next poll and no deletes, polling is right: the failures are the two named gaps', () => {
    const tight = seededLateTxs(0).map((t) => ({ ...t, commit: t.begin + 1 }));
    const aligned = pollingRun(tight.map((t) => ({ ...t, begin: Math.ceil(t.begin / 10) * 10 - 1, commit: Math.ceil(t.begin / 10) * 10 - 1 })), pollTimesEvery(10, 200), 200);
    expect(aligned.misses).toEqual([]);
    expect(POLL_SEEDS).toHaveLength(200);
  });
});

describe('what the log costs', () => {
  it('with a slot the source keeps everything after the reader\'s saved position (hand-worked at tick 100)', () => {
    const p = retentionAt({ slot: true, lagRecords: 100, deadAt: 30 }, 100);
    expect(p.written).toBe(WRITES_PER_TICK * 100);
    expect(p.saved).toBe(WRITES_PER_TICK * 30 - 100);
    const need = p.written - p.saved;
    expect(p.retainedRecords).toBe(Math.ceil(need / SEGMENT_RECORDS) * SEGMENT_RECORDS);
    expect(p.bytes).toBe(p.retainedRecords * RECORD_BYTES);
    expect(p.overBudget).toBe(p.bytes > DISK_BUDGET_BYTES);
    expect(p.resumable).toBe(true);
  });

  it('a living reader keeps the retained log at its lag; a dead one makes it grow without bound while a slot exists', () => {
    const alive = retentionSeries({ slot: true, lagRecords: 100, deadAt: MAX_TICKS + 1 });
    expect(Math.max(...alive.map((p) => p.retainedRecords))).toBeLessThanOrEqual(RECOVERY_RECORDS + SEGMENT_RECORDS);
    const dead = retentionSeries({ slot: true, lagRecords: 100, deadAt: 10 });
    for (let i = 20; i < dead.length; i++) expect(dead[i].retainedRecords).toBeGreaterThanOrEqual(dead[i - 1].retainedRecords);
    expect(dead.at(-1)!.overBudget).toBe(true);
  });

  it('with no slot the log stays small but a reader that died cannot resume', () => {
    const p = retentionAt({ slot: false, lagRecords: 100, deadAt: 30 }, 100);
    expect(p.retainedRecords).toBeLessThanOrEqual(RECOVERY_RECORDS);
    expect(p.overBudget).toBe(false);
    expect(p.resumable).toBe(false);
    expect(retentionAt({ slot: false, lagRecords: 100, deadAt: 30 }, 30).resumable).toBe(true);
  });
});
