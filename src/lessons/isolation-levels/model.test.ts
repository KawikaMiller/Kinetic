import { describe, expect, it } from 'vitest';
import {
  allRuns, ANOMALY_IDS, deriveMatrix, interleavings, interleavingCounts, LEVEL_IDS, MATRIX, outcomeOf, programLengths, runSchedule,
  type AnomalyId, type Level, type Tx,
} from './model';

/** n choose k, by the multiplicative formula (an independent count of interleavings). */
const choose = (n: number, k: number) => {
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return Math.round(r);
};

const finalState = (anomaly: AnomalyId, level: Level, schedule: readonly Tx[]) => {
  const run = runSchedule(anomaly, level, schedule);
  return Object.fromEntries(run.db.rows.map((r) => [r.key, run.db.committed(r.key)]));
};

describe('interleavings', () => {
  it('number n!/(a!b!) and each keeps both transactions in their own order', () => {
    for (const [a, b] of [[1, 1], [2, 2], [3, 1], [3, 3], [2, 3]] as const) {
      const all = interleavings(a, b);
      expect(all).toHaveLength(choose(a + b, a));
      expect(new Set(all.map((s) => s.join(''))).size).toBe(all.length);
      for (const s of all) expect(s.filter((t) => t === 'T1')).toHaveLength(a);
    }
  });

  it('cover the toy transactions of every anomaly: 6, 3, 3, 6 and 20 of them', () => {
    expect(interleavingCounts()).toEqual({ dirty: 6, nonrepeat: 3, phantom: 3, lost: 6, skew: 20 });
    for (const a of ANOMALY_IDS) expect(allRuns(a, 'ru')).toHaveLength(choose(programLengths(a)[0] + programLengths(a)[1], programLengths(a)[0]));
  });
});

describe('the anomaly-by-level table the lesson shows', () => {
  it('is what enumerating every interleaving of the two toy transactions gives, at every level', () => {
    expect(deriveMatrix()).toEqual(MATRIX);
  });

  it('breaks when the stated model is broken: snapshot levels that do not stop a second writer allow the lost update', () => {
    const broken = deriveMatrix({ firstWriterWins: false });
    expect(broken.lost.si).toBe('happens');
    expect(broken).not.toEqual(MATRIX);
  });

  it('breaks when Serializable stops checking for dependency cycles: write skew happens there too', () => {
    const broken = deriveMatrix({ cycleCheck: false });
    expect(broken.skew.ser).toBe('happens');
    expect(broken).not.toEqual(MATRIX);
  });

  it('each stronger level prevents at least what the weaker one prevents (a happens cell never follows a prevented one)', () => {
    const rank = { happens: 0, aborted: 1, prevented: 1 } as const;
    for (const a of ANOMALY_IDS) {
      const ranks = LEVEL_IDS.map((l) => rank[MATRIX[a][l]]);
      expect(ranks).toEqual([...ranks].sort((x, y) => x - y));
    }
  });
});

describe('what the engine guarantees, checked independently of the table', () => {
  it('at Read Committed and above no read returns a version that was rolled back', () => {
    for (const level of ['rc', 'si', 'ser'] as const) {
      for (const r of allRuns('dirty', level)) for (const v of r.readFrom.T2) expect(v.st, level).not.toBe('x');
    }
    expect(allRuns('dirty', 'ru').some((r) => r.readFrom.T2.some((v) => v.st === 'x'))).toBe(true);
  });

  it('at the snapshot levels a transaction reading twice gets the same answer in every interleaving', () => {
    for (const level of ['si', 'ser'] as const) {
      for (const r of allRuns('nonrepeat', level)) expect(r.mine.T1.second).toBe(r.mine.T1.first);
      for (const r of allRuns('phantom', level)) expect(r.mine.T1.recounted).toBe(r.mine.T1.counted);
    }
  });

  it('at Serializable every interleaving ends in the state of some serial order of the two transactions', () => {
    for (const anomaly of ANOMALY_IDS) {
      const [a, b] = programLengths(anomaly);
      const serialStates = [
        finalState(anomaly, 'ser', [...Array<Tx>(a).fill('T1'), ...Array<Tx>(b).fill('T2')]),
        finalState(anomaly, 'ser', [...Array<Tx>(b).fill('T2'), ...Array<Tx>(a).fill('T1')]),
      ].map((s) => JSON.stringify(s));
      for (const schedule of interleavings(a, b)) {
        const run = runSchedule(anomaly, 'ser', schedule);
        const finished = run.status.T1 !== 'aborted' && run.status.T2 !== 'aborted';
        // Only runs in which both transactions finished must match a serial order; an aborted one is retried by the app.
        if (finished) expect(serialStates, `${anomaly} ${schedule.join('')}`).toContain(JSON.stringify(finalState(anomaly, 'ser', schedule)));
      }
    }
  });

  it('write skew at Snapshot needs both reads before either commit; run one after the other it cannot happen', () => {
    const sequential = runSchedule('skew', 'si', ['T1', 'T1', 'T1', 'T2', 'T2', 'T2']);
    expect(sequential.present).toBe(false);
    const overlapped = runSchedule('skew', 'si', ['T1', 'T2', 'T1', 'T2', 'T1', 'T2']);
    expect(overlapped.present).toBe(true);
  });

  it('the lost update at Read Committed needs both reads before either write', () => {
    expect(runSchedule('lost', 'rc', ['T1', 'T2', 'T1', 'T2']).present).toBe(true);
    expect(runSchedule('lost', 'rc', ['T1', 'T1', 'T2', 'T2']).present).toBe(false);
    expect(runSchedule('lost', 'rc', ['T1', 'T1', 'T2', 'T2']).db.committed('likes')).toBe('12');
  });

  it('outcomeOf separates "prevented" from "prevented by aborting"', () => {
    expect(outcomeOf('dirty', 'rc')).toBe('prevented');
    expect(outcomeOf('lost', 'si')).toBe('aborted');
  });
});
