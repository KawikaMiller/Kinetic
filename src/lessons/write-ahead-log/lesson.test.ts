import { describe, expect, it } from 'vitest';
import { expectCaption } from '../../core/testing/captions';
import { correctStrictlyLongest } from '../../core/testing/quiz';
import { sceneElements, sharedSceneComponents } from '../../core/testing/sceneKeys';
import { checkpointCaption, crashReport, eventText, groupCaption, machineCaption, recoveryCaption, verdictText } from './captions';
import { CHECKPOINT_INTERVALS, DEFAULT_INTERVAL_INDEX, checkpointRun, groupCommit } from './cost';
import { checkpointFacts, costFacts, lowestFailing, presetCrash, seedFacts } from './facts';
import lesson from './index';
import { ACK_EARLY_SEED, COST_OPEN, CRASH_OPEN, MACHINE_OPEN, PRESETS, WAL_OFF_SEED, logRows, presetMachine } from './view';
import { applyOp, fresh, recoveryTimeline, runSeed } from './wal';

const text = (n: Parameters<typeof expectCaption>[0]) => expectCaption(n);

describe('scene switches', () => {
  it('every scene is its own keyed component, so none opens on another scene\'s state', () => {
    expect(sceneElements('write-ahead-log')).toHaveLength(3);
    expect(sharedSceneComponents('write-ahead-log')).toEqual([]);
    expect(sceneElements('write-ahead-log').every((e) => e.keyed)).toBe(true);
  });

  it('each scene\'s opening state is the one its try-this assumes', () => {
    expect(MACHINE_OPEN.policy).toEqual({ steal: true, force: false, enforceWal: true, ackBeforeFsync: false });
    expect(CRASH_OPEN).toMatchObject({ seed: WAL_OFF_SEED, enforceWal: true, ackBeforeFsync: false, secondCrash: false });
    expect(COST_OPEN).toMatchObject({ latencyMs: 0.5, committers: 8 });
    expect(CHECKPOINT_INTERVALS[DEFAULT_INTERVAL_INDEX]).toBe(0);
    expect(fresh(MACHINE_OPEN.policy).log).toEqual([]);
  });
});

describe('try-this entries, from each scene\'s default state, as written', () => {
  it('try-this 1: the committed-never-flushed preset is 0 on disk before the crash and 7 after, redo applied 1 record, nothing lost', () => {
    const f = presetCrash('winner');
    expect(f).toMatchObject({ disk3Before: 0, disk3After: 7, redone: 1, violations: [] });
    expect(lesson.tryThis[0]).toContain('page 3 is 0 on disk before the crash and 7 after, because redo applied 1 record');
  });

  it('try-this 2: the loser preset has page 3 = 7 on disk, redo skips 1 record, undo restores 0', () => {
    expect(presetCrash('loser')).toMatchObject({ disk3Before: 7, disk3After: 0, skipped: 1, undone: 1, violations: [] });
    expect(lesson.tryThis[1]).toContain('(page 3 is 7), redo skipped 1 record and undo put page 3 back to 0');
  });

  it('try-this 3: WAL rule off leaves 7 on page 3 and names atomicity; acknowledge-before-fsync acknowledges 1 commit and names durability', () => {
    const f = presetCrash('walOff');
    expect(f.violations.map((v) => v.rule)).toEqual(['A']);
    expect(lesson.tryThis[2]).toContain('page 3 holds 7 for a transaction that never committed');
    const m = presetMachine('walOff');
    expect(text(verdictText(crashReport(m, false), m.acked))).toContain('Atomicity broken');
    const e = presetMachine('ackEarly');
    expect(e.acked).toHaveLength(1);
    expect(text(verdictText(crashReport(e, false), e.acked))).toContain('Durability broken');
    expect(lesson.tryThis[2]).toContain('(1 acknowledged)');
  });

  it('try-this 4: seed 1 opens clean, WAL rule off gives 1 atomicity violation, seed 3 breaks durability with the early acknowledgement', () => {
    const f = seedFacts();
    expect(f.seed).toBe(CRASH_OPEN.seed);
    expect(f.safe).toEqual([]);
    expect(f.walOff.map((v) => v.rule)).toEqual(['A']);
    expect(f.ack.map((v) => v.rule)).toEqual(['D']);
    expect(f.ackSafe).toEqual([]);
    expect(lesson.tryThis[3]).toContain('opens on seed 1');
    expect(lesson.tryThis[3]).toContain('1 violation, atomicity');
    expect(lesson.tryThis[3]).toContain('Seed 3');
    expect(ACK_EARLY_SEED).toBe(3);
  });

  it('try-this 5: about 1,998 against 7,988 commits a second, and the worst-case scan falls from 24 to 8 records for 16 page writes', () => {
    const c = costFacts();
    expect([c.plain, c.grouped]).toEqual([1998, 7988]);
    const p = checkpointFacts();
    expect([p.none.worstScanned, p.every12.worstScanned, p.every12.pageWrites]).toEqual([24, 8, 16]);
    expect(lesson.tryThis[4]).toContain('about 1,998 commits a second');
    expect(lesson.tryThis[4]).toContain('about 7,988');
    expect(lesson.tryThis[4]).toContain('from 24 records to 8, for 16 page writes');
  });

  it('the quiz names the lowest failing seed the model finds', () => {
    expect(lesson.quiz[2].why).toContain(`seed ${lowestFailing({ enforceWal: false })} of 0 to 199`);
  });
});

describe('captions are computed from the model', () => {
  it('the machine caption names records, durable boundary, tail, dirty pages and the last event', () => {
    let m = fresh();
    expect(text(machineCaption(m))).toContain('0 log records, none durable');
    m = applyOp(m, { kind: 'write', tx: 1, page: 3, value: 7 });
    const c = text(machineCaption(m));
    expect(c).toContain('1 log record, none durable, 1 record still in memory; 1 dirty page');
    expect(c).toContain('T1 writes page 3 = 7');
    m = applyOp(m, { kind: 'fsync' });
    expect(text(machineCaption(m))).toContain('durable up to LSN 1');
    expect(text(machineCaption(m))).not.toContain('still in memory');
  });

  it('every preset\'s verdict states the counts the crash report holds', () => {
    for (const p of PRESETS) {
      const m = presetMachine(p.id);
      const r = crashReport(m, false);
      const c = text(verdictText(r, m.acked));
      expect(c).toContain(`redid ${r.redone} record`);
      expect(c.includes('Atomicity broken')).toBe(r.violations.some((v) => v.rule === 'A'));
      expect(c.includes('Durability broken')).toBe(r.violations.some((v) => v.rule === 'D'));
      expect(c.includes('equal a serial replay')).toBe(r.violations.length === 0);
    }
  });

  it('the log rows colour a committed transaction green, a loser red, the volatile tail dim, with a violet boundary row', () => {
    const m = [{ kind: 'write', tx: 1, page: 1, value: 4 }, { kind: 'commit', tx: 1 }, { kind: 'write', tx: 2, page: 2, value: 5 }, { kind: 'fsync' }, { kind: 'write', tx: 3, page: 3, value: 6 }].reduce((a, op) => applyOp(a, op as never), fresh());
    const rows = logRows(m);
    expect(rows.map((r) => r.tone)).toEqual(['ok', 'ok', 'bad', 'violet', 'dim']);
    expect(rows[3].text).toContain('LSN 1 to 3');
  });

  it('a torn record is orange and says it is ignored', () => {
    const m = [{ kind: 'write', tx: 1, page: 1, value: 4 }].reduce((a, op) => applyOp(a, op as never), fresh());
    const rows = logRows(m, m.log[0]);
    expect(rows.at(-1)).toMatchObject({ tone: 'orange' });
    expect(rows.at(-1)!.text).toContain('torn: ignored');
  });

  it('every frame of the recovery of seed 1 has a caption naming its step, with and without a second crash', () => {
    const r = runSeed(WAL_OFF_SEED, {}, { recrashAfter: null });
    for (const recrash of [null, 1]) {
      const t = recoveryTimeline(r.image, recrash);
      t.forEach((f, i) => {
        const c = text(recoveryCaption(f.event, f.crashed, i, t.length - 1));
        if (!f.crashed) expect(c).toContain(`Step ${i} of ${t.length - 1}`);
        if (f.event) expect(c).toContain(text(eventText(f.event)));
        expect(c.includes('Crash during recovery')).toBe(f.crashed);
      });
    }
  });

  it('the group and checkpoint captions quote the same numbers the stats show, at the slider extremes', () => {
    for (const [latency, committers] of [[0.1, 1], [12, 64], [0.5, 8]] as const) {
      const plain = groupCommit(latency, committers, false);
      const grouped = groupCommit(latency, committers, true);
      const c = text(groupCaption(latency, committers, plain, grouped));
      expect(c).toContain(`${Math.round(plain.throughput).toLocaleString('en-US')} commits a second`);
      expect(c).toContain(`${Math.round(grouped.throughput).toLocaleString('en-US')} when`);
    }
    for (const interval of CHECKPOINT_INTERVALS) {
      const run = checkpointRun(interval);
      const c = text(checkpointCaption(run));
      expect(c).toContain(`at most ${run.worstScanned} record`);
      expect(c.startsWith(interval === 0 ? 'No checkpoint' : `A checkpoint every ${interval} records`)).toBe(true);
    }
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
