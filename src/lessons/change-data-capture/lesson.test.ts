import { describe, expect, it } from 'vitest';
import { expectCaption } from '../../core/testing/captions';
import { correctStrictlyLongest } from '../../core/testing/quiz';
import { sceneElements, sharedSceneComponents } from '../../core/testing/sceneKeys';
import { SAFE_FLAGS, type Scenario, type Stmt } from './cdc';
import { pollingText, replayCaption, retentionText, seedVerdict, snapshotText, tailCaption, traceLine } from './captions';
import { insertFacts, pollFacts, replayFacts, retentionFacts, rollbackFacts, seedPins, snapshotFacts } from './facts';
import lesson from './index';
import { retentionAt } from './retention';
import {
  MAX_OPS, REPLAY_OPEN, REPLAY_OPS, SNAPSHOT_OPEN, TAIL_OPEN, consumerCell, fateOf, dbOf, isRefusal, logRows, makeTx, producerPaused, redeliveries, replay, sourceCell, syncedCount,
} from './view';
import { MAX_KEY } from './cdc';

const text = (n: Parameters<typeof expectCaption>[0]) => expectCaption(n);
const row = { status: 'new', amount: 40 };

describe('scene switches', () => {
  it('every scene is its own keyed component', () => {
    expect(sceneElements('change-data-capture')).toHaveLength(4);
    expect(sharedSceneComponents('change-data-capture')).toEqual([]);
    expect(sceneElements('change-data-capture').every((e) => e.keyed)).toBe(true);
  });

  it('each scene opens on the state its try-this assumes', () => {
    expect(TAIL_OPEN).toMatchObject({ now: 0, key: 3, status: 'new', amount: 40 });
    expect(REPLAY_OPEN.flags).toEqual(SAFE_FLAGS);
    expect(REPLAY_OPEN.now).toBe(0);
    expect(SNAPSHOT_OPEN).toMatchObject({ now: 0, from: 'snapshot' });
    const quiet = replay({ seed: 1, ops: [], faults: [], flags: SAFE_FLAGS, loss: 0, duplicate: 0 }, 0);
    expect(syncedCount(quiet.snap)).toBe(3);
  });
});

describe('try-this entries, from each scene\'s default state, as written', () => {
  it('try-this 1: insert row 3 then 60 ms is 3 of 3 in sync, 2 log records, saved position LSN 2', () => {
    expect(insertFacts()).toEqual({ synced: 3, saved: 2, records: 2 });
    expect(lesson.tryThis[0]).toContain('3 of 3 consumers are in sync, the log holds 2 records');
    expect(lesson.tryThis[0]).toContain('saved position is LSN 2');
  });

  it('try-this 2: the rollback leaves 7 log records, no consumer applies it, and 3 of 3 stay in sync', () => {
    const f = rollbackFacts();
    expect(f).toMatchObject({ synced: 3, records: 7, rolledBackApplied: false, rolledBackTx: [3] });
    expect(lesson.tryThis[1]).toContain('holds 7 records');
  });

  it('try-this 3: a connector kill at 50 ms repeats 3 deliveries, 3 of 3 in sync idempotent and 0 of 3 blind', () => {
    const f = replayFacts();
    expect(f.quiet).toEqual({ synced: 3, repeated: 0 });
    expect(f.idem).toEqual({ synced: 3, repeated: 3 });
    expect(f.blind.synced).toBe(0);
    expect(lesson.tryThis[2]).toContain('3 deliveries repeat');
    expect(lesson.tryThis[2]).toContain('3 of 3 consumers are in sync');
    expect(lesson.tryThis[2]).toContain('and 0 of 3 are');
  });

  it('try-this 4: the scene opens on the pinned seed and the pins are named in the text', () => {
    const pins = seedPins();
    expect(pins).toEqual({ blind: 0, blindNoisy: 0, ackBefore: 2 });
    expect(lesson.tryThis[3]).toContain('opens on seed 0');
    expect(lesson.tryThis[3]).toContain('S2 breaks on seed 0');
    expect(lesson.tryThis[3]).toContain('Load seed 2');
  });

  it('try-this 5: row 7 differs when streaming from now, equal from the snapshot start; the poller misses row 1 until the slow commit is at 13 ms', () => {
    const s = snapshotFacts();
    expect(s.goodMissing).toBeNull();
    expect(s.badMissing).toContain('key 7');
    const p = pollFacts();
    expect(p.late).toEqual([{ key: 1, why: 'late' }]);
    expect(p.early).toEqual([]);
    expect(p.withDelete).toEqual([{ key: 2, why: 'delete' }]);
    expect(lesson.tryThis[4]).toContain('differs: the new consumer differs from the source at key 7');
    expect(lesson.tryThis[4]).toContain('row 1 is missing');
  });
});

describe('operations the buttons make', () => {
  const rows = { 3: row };
  it('refuses a transaction with no statements, an out-of-range id, an existing insert and a missing update or delete', () => {
    const msg = (stmts: Stmt[]) => { const r = makeTx(stmts, 'commit', 1, rows, MAX_KEY); return isRefusal(r) ? r.refused : null; };
    expect(msg([])).toContain('no statements');
    expect(msg([{ op: 'insert', key: 0, row }])).toContain(`1 to ${MAX_KEY}`);
    expect(msg([{ op: 'insert', key: MAX_KEY + 1, row }])).toContain(`1 to ${MAX_KEY}`);
    expect(msg([{ op: 'insert', key: 3, row }])).toContain('already exists');
    expect(msg([{ op: 'update', key: 4, row }])).toContain('does not exist');
    expect(msg([{ op: 'delete', key: 4 }])).toContain('does not exist');
    expect(msg([{ op: 'insert', key: 4, row }, { op: 'update', key: 4, row }])).toBeNull();
    expect(msg([{ op: 'delete', key: 3 }, { op: 'update', key: 3, row }])).toContain('does not exist');
  });

  it('pauses the producer buttons at 64 events in flight', () => {
    const snap = (inflight: number) => ({ nodes: { connector: { state: { kind: 'conn', saved: 0, cursor: 0, inflight, emitted: 0 } } } }) as unknown as Parameters<typeof producerPaused>[0];
    expect(producerPaused(snap(63))).toBe(false);
    expect(producerPaused(snap(64))).toBe(true);
    expect(MAX_OPS).toBe(30);
  });
});

describe('what the scenes draw', () => {
  it('log rows are green for committed, dim and marked never emitted for rolled back, with the saved position row in violet', () => {
    const s: Scenario = { seed: 1, ops: [{ at: 0, tx: { txid: 1, outcome: 'commit', stmts: [{ op: 'insert', key: 1, row }] } }, { at: 0, tx: { txid: 2, outcome: 'rollback', stmts: [{ op: 'update', key: 1, row: { status: 'paid', amount: 1 } }] } }], faults: [], flags: SAFE_FLAGS, loss: 0, duplicate: 0 };
    const { snap } = replay(s, 80);
    const rows = logRows(snap);
    expect(fateOf(dbOf(snap).log, 2)).toBe('rolled-back');
    expect(rows.filter((r) => r.tone === 'ok').map((r) => String(r.text))).toEqual(['tx 1 insert key 1: none to new 40', 'tx 1 commit']);
    expect(rows.filter((r) => r.tone === 'dim').every((r) => /rolled back|rollback/.test(String(r.text)))).toBe(true);
    expect(rows.filter((r) => r.tone === 'violet')).toHaveLength(1);
    expect(String(rows.find((r) => r.tone === 'violet')!.text)).toContain(`LSN ${(snap.nodes.connector.state as { saved: number }).saved}`);
  });

  it('a consumer cell is green when it equals the source and yellow when it is behind', () => {
    const quiet = replay({ seed: 1, ops: [{ at: 0, tx: { txid: 1, outcome: 'commit', stmts: [{ op: 'insert', key: 1, row }] } }], faults: [], flags: SAFE_FLAGS, loss: 0, duplicate: 0 }, 0);
    expect(consumerCell(quiet.snap, 'cache', 1, 0).tone).toBe('hi');
    const done = replay({ seed: 1, ops: [{ at: 0, tx: { txid: 1, outcome: 'commit', stmts: [{ op: 'insert', key: 1, row }] } }], faults: [], flags: SAFE_FLAGS, loss: 0, duplicate: 0 }, 80);
    expect(consumerCell(done.snap, 'cache', 1, 0)).toMatchObject({ tone: 'ok', text: 'N' });
    expect(sourceCell({ 1: row }, 1, 1)).toMatchObject({ text: '40' });
    expect(consumerCell(done.snap, 'cache', 2, 0)).toMatchObject({ tone: 'dim', fill: 'outline' });
  });
});

describe('captions are computed from the model', () => {
  it('the tail caption names records, saved position, events in flight and consumers in sync, at the slider extremes', () => {
    for (const t of [0, 25, 500]) {
      const { snap } = replay({ seed: 1, ops: REPLAY_OPS, faults: [], flags: SAFE_FLAGS, loss: 0, duplicate: 0 }, t);
      const c = text(tailCaption(snap, t, null));
      const log = (snap.nodes.db.state as { log: unknown[] }).log.length;
      expect(c).toContain(`At ${t} ms: ${log} log record`);
      expect(c).toContain(`${syncedCount(snap)} of 3 consumers in sync`);
    }
  });

  it('the replay caption counts repeated deliveries and names the apply and acknowledge settings', () => {
    const s: Scenario = { seed: 1, ops: REPLAY_OPS, faults: [{ kind: 'crash-connector', at: 50 }], flags: { ...SAFE_FLAGS, idempotent: false }, loss: 0, duplicate: 0 };
    const { snap, trace } = replay(s, 500);
    const c = text(replayCaption(snap, 500, trace, s.flags));
    expect(c).toContain(`${redeliveries(trace)} event deliveries repeated so far`);
    expect(c).toContain('blind apply, acknowledging after applying');
    expect(c).toContain('behind:');
    const ok = replay({ ...s, faults: [], flags: SAFE_FLAGS }, 500);
    expect(text(replayCaption(ok.snap, 500, ok.trace, SAFE_FLAGS))).toContain('every consumer matches the source');
  });

  it('the verdict text names the rule and message, or says all three hold', () => {
    expect(text(seedVerdict(7, null, null))).toContain('S1, S2 and S3 hold');
    expect(text(seedVerdict(7, 'S2', 'x is wrong'))).toBe('Seed 7: S2 is broken: x is wrong.');
  });

  it('the polling, snapshot and retention sentences state what the model found', () => {
    const p = pollFacts();
    expect(text(pollingText({ source: {}, copy: {}, misses: p.late, lastSeen: 0 }))).toContain('row 1 never arrived');
    expect(text(pollingText({ source: {}, copy: {}, misses: p.withDelete, lastSeen: 0 }))).toContain('row 2 was deleted at the source and is still in the copy');
    expect(text(pollingText({ source: {}, copy: {}, misses: [], lastSeen: 0 }))).toContain('equals the source');
    expect(text(snapshotText('now', 'x'))).toContain('Streaming from where the log is when the snapshot ends: at the end x.');
    expect(text(snapshotText('snapshot', null))).toContain('ends equal to the source');
    const r = retentionFacts();
    expect(text(retentionText(r.late, true))).toContain('over the disk budget');
    expect(text(retentionText(r.open, true))).not.toContain('over the disk budget');
    expect(text(retentionText(r.noSlot, false))).toContain('cannot resume');
    expect(text(retentionText(retentionAt({ slot: false, lagRecords: 0, deadAt: 200 }, 10), false))).toContain('can still resume');
  });

  it('trace lines carry time, kind and the message label', () => {
    const { trace } = replay({ seed: 1, ops: REPLAY_OPS, faults: [], flags: SAFE_FLAGS, loss: 0, duplicate: 0 }, 30);
    const ev = trace.find((r) => r.payload?.type === 'event')!;
    expect(traceLine(ev)).toContain('event');
    expect(traceLine(ev)).toContain(`${ev.t} ms`);
  });
});

describe('lesson content', () => {
  it('has five try-this entries and five questions', () => {
    expect(lesson.tryThis).toHaveLength(5);
    expect(lesson.quiz).toHaveLength(5);
  });
  it('the correct quiz option is the strictly longest in at most half of the questions', () => {
    expect(correctStrictlyLongest(lesson.quiz)).toBeLessThanOrEqual(Math.floor(lesson.quiz.length / 2));
  });
});
