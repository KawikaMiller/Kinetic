import { describe, expect, it } from 'vitest';
import { expectCaption } from '../../core/testing/captions';
import { buildFrames } from './frames';
import lesson from './index';
import {
  ANOMALY_IDS, interleavings, LEVEL_IDS, MATRIX, programLengths, rowsOf, runSchedule, scriptedRun, verdictOf, type AnomalyId, type Level,
} from './model';

const cells = ANOMALY_IDS.flatMap((a) => LEVEL_IDS.map((l) => [a, l] as const));
const captions = (a: AnomalyId, l: Level) => buildFrames(a, l).map((f) => expectCaption(f.say));
const last = (a: AnomalyId, l: Level) => {
  const frames = buildFrames(a, l);
  return frames[frames.length - 1];
};

describe('the scripted run of every cell', () => {
  it('has one frame per step plus the intro, a first frame with the initial table, and captions without glued sentences', () => {
    for (const [a, l] of cells) {
      const frames = buildFrames(a, l);
      expect(frames.length, `${a} ${l}`).toBe(scriptedRun(a, l).steps.length + 1);
      expect(frames[0].rows).toEqual(rowsOf(a));
      expect(frames[0].ops).toEqual([]);
      captions(a, l);
    }
  });

  it('shows the anomaly where the table says it happens, an abort where it says aborted, and neither where it says prevented', () => {
    for (const [a, l] of cells) {
      const expected = { happens: 'anomaly', aborted: 'aborted', prevented: 'prevented' } as const;
      expect(verdictOf(a, l), `${a} ${l}`).toBe(expected[MATRIX[a][l]]);
    }
  });

  it('puts the verdict banner on the last frame only, red for the anomaly and green otherwise', () => {
    for (const [a, l] of cells) {
      const frames = buildFrames(a, l);
      expect(frames.slice(0, -1).every((f) => f.verdict === null), `${a} ${l}`).toBe(true);
      expect(frames[frames.length - 1].verdict?.tone, `${a} ${l}`).toBe(MATRIX[a][l] === 'happens' ? 'bad' : 'ok');
    }
  });

  it('highlights, in every frame, versions that exist and were read by the transaction whose step it is', () => {
    for (const [a, l] of cells) {
      for (const f of buildFrames(a, l)) {
        for (const s of f.saw) {
          const row = f.rows.find((r) => r.key === s.key);
          expect(row?.versions[s.idx], `${a} ${l}`).toBeDefined();
          expect(s.who).toBe(f.ops[f.ops.length - 1].who);
        }
      }
    }
  });

  it('grows the op lane one op per frame, in the order of the schedule', () => {
    for (const [a, l] of cells) {
      const frames = buildFrames(a, l);
      frames.forEach((f, i) => expect(f.ops).toHaveLength(i));
    }
  });
});

describe('hand-worked outcomes', () => {
  it('dirty read: at Read Uncommitted T2 reads $200 and approves; at Read Committed it reads $100 and the loan is denied', () => {
    const ru = scriptedRun('dirty', 'ru').steps;
    expect([ru[1].result, ru[3].result]).toEqual(['$200', 'approved']);
    const rc = scriptedRun('dirty', 'rc').steps;
    expect([rc[1].result, rc[3].result]).toEqual(['$100', 'denied']);
    expect(captions('dirty', 'ru')[2]).toContain('uncommitted $200');
    expect(captions('dirty', 'rc')[2]).toContain('reads $100');
    expect(last('dirty', 'ru').rows[0].versions.map((v) => `${v.v}:${v.st}`)).toEqual(['$100:c', '$200:x']);
  });

  it('non-repeatable read: T1 reads $100 then $100 at Snapshot, $100 then $200 at Read Committed, both from the right versions', () => {
    const si = scriptedRun('nonrepeat', 'si').steps;
    expect([si[0].result, si[2].result]).toEqual(['$100', '$100']);
    expect([si[0].saw[0].idx, si[2].saw[0].idx]).toEqual([0, 0]);
    const rc = scriptedRun('nonrepeat', 'rc').steps;
    expect([rc[0].result, rc[2].result]).toEqual(['$100', '$200']);
    expect(rc[2].saw[0].idx).toBe(1);
  });

  it('phantom read: the new row is hidden from T1 at Snapshot, so both counts are 2; at Read Committed the second count is 3', () => {
    const si = scriptedRun('phantom', 'si').steps;
    expect([si[0].result, si[2].result]).toEqual(['2', '2']);
    expect(si[2].hidden).toEqual(['carol']);
    const rc = scriptedRun('phantom', 'rc').steps;
    expect(rc[2].result).toBe('3');
    expect(rc[2].hidden).toEqual([]);
  });

  it('lost update: at Read Committed the counter ends at 11; at Snapshot T2 is aborted, retries, and it ends at 12', () => {
    const rc = scriptedRun('lost', 'rc');
    expect(rc.db.committed('likes')).toBe('11');
    expect(rc.steps).toHaveLength(4);
    const si = scriptedRun('lost', 'si');
    expect(si.steps[3].result).toBe('ERROR: could not serialize');
    expect(si.steps[3].aborted).toBe(true);
    expect(si.steps[4].result).toBe('ok');
    expect(si.db.committed('likes')).toBe('12');
    expect(captions('lost', 'si')[5]).toContain('reads 11 and writes 12');
    expect(last('lost', 'si').rows[0].versions.map((v) => `${v.v}:${v.by}:${v.st}`)).toEqual(['10:T0:c', '11:T1:c', '12:T2:c']);
  });

  it('write skew: at Snapshot both leave and nobody is on call; at Serializable T2 is aborted and Bob stays', () => {
    const si = scriptedRun('skew', 'si');
    expect(['alice', 'bob'].map((k) => si.db.committed(k))).toEqual(['false', 'false']);
    expect(captions('skew', 'si')[6]).toContain('Zero doctors on call');
    const ser = scriptedRun('skew', 'ser');
    expect(ser.steps[5].aborted).toBe(true);
    expect(['alice', 'bob'].map((k) => ser.db.committed(k))).toEqual(['false', 'true']);
    expect(captions('skew', 'ser')[6]).toContain('T2 is aborted');
  });

  it('the cycle check is what stops write skew: without it Serializable has an interleaving where both finish and nobody is on call', () => {
    const broken = interleavings(...programLengths('skew')).map((s) => runSchedule('skew', 'ser', s, { cycleCheck: false }));
    expect(broken.some((r) => r.present)).toBe(true);
  });
});

describe('try-this, from the default state (Dirty read, Read Uncommitted)', () => {
  it('try-this 1: the default run has T2 read the uncommitted $200 and approve; Read Committed denies', () => {
    expect(verdictOf('dirty', 'ru')).toBe('anomaly');
    expect(scriptedRun('dirty', 'ru').steps[3].result).toBe('approved');
    expect(verdictOf('dirty', 'rc')).toBe('prevented');
    expect(lesson.tryThis[0]).toContain('uncommitted $200');
  });

  it('try-this 2: Non-repeatable read at Repeatable Read / Snapshot shows T1 reading the older version both times', () => {
    const steps = scriptedRun('nonrepeat', 'si').steps;
    expect(steps.filter((s) => s.who === 'T1').map((s) => s.saw[0].idx)).toEqual([0, 0]);
    expect(steps.filter((s) => s.who === 'T1').map((s) => s.result)).toEqual(['$100', '$100']);
  });

  it('try-this 3: Lost update at Repeatable Read / Snapshot aborts T2, and the app retries it', () => {
    const run = scriptedRun('lost', 'si');
    expect(run.steps.some((s) => s.who === 'T2' && s.aborted)).toBe(true);
    expect(run.steps[run.steps.length - 1].sql).toMatch(/^retry/);
  });

  it('try-this 4: Write skew at Snapshot leaves nobody on call; at Serializable T2 is aborted instead', () => {
    expect(verdictOf('skew', 'si')).toBe('anomaly');
    expect(scriptedRun('skew', 'si').present).toBe(true);
    expect(verdictOf('skew', 'ser')).toBe('aborted');
    expect(scriptedRun('skew', 'ser').steps.some((s) => s.who === 'T2' && s.aborted)).toBe(true);
  });
});
