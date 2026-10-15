import { describe, expect, it } from 'vitest';
import { hash32 } from '../../core/hash';
import { captionText as text } from '../../core/testing/captions';
import { correctStrictlyLongest } from '../../core/testing/quiz';
import { groupsCaption, partitionsCaption, replicationCaption, retentionCaption } from './captions';
import { RAISED_CONSUMERS, acksFacts, commitFacts, raiseFacts, repartitionFacts, retentionFacts } from './facts';
import { DEFAULT_CONSUMERS, DEFAULT_GROUP_PARTITIONS, DEFAULT_GROUP_SEED, MAX_CONSUMERS, advance, advanceBy, busyConsumers, crashAtWorstMoment, crashConsumer, ledger, newWorld, setConsumers, totalLag, type CommitPolicy } from './groups';
import lesson from './index';
import { DEFAULT_PARTITIONS, DEFAULT_SEED, KEY_SETS, appendKeys, burstKeys, newTopic, type Topic } from './partitioning';
import { DEFAULT_REPL, effectiveConfig, frameAt, runRepl } from './replView';
import { HORIZON_MS, type ReplConfig, type ScriptedFault } from './replication';
import {
  DEFAULT_KEPT_SEGMENTS, DEFAULT_POSITION, KEYS, MAX_KEPT_SEGMENTS, append, applyCompaction, applyRetention, preloaded, stateDiff, onDisk, type RetPolicy, type SegLog,
} from './retention';

const plain = (node: Parameters<typeof text>[0]) => text(node, { strict: true });

describe('try-this entries, from each scene\'s default state, as written', () => {
  it('try-this 1: a burst of the 5 user ids on 3 partitions, then a 4th: the keys that would move are the ones whose hash differs mod 3 and mod 4', () => {
    const sent = appendKeys(newTopic(DEFAULT_PARTITIONS), burstKeys(KEY_SETS[0], DEFAULT_SEED, 0));
    if (!sent.ok) throw new Error('refused');
    const keys = [...new Set(sent.topic.records.map((r) => r.key!))];
    const moved = keys.filter((k) => hash32(k) % 3 !== hash32(k) % 4);
    const f = repartitionFacts();
    expect([f.keys, f.moved]).toEqual([keys.length, moved.length]);
    expect(lesson.tryThis[0]).toContain(`${moved.length} of the ${keys.length} keys would now go to a different partition`);
    const c = plain(partitionsCaption({ ...sent.topic, p: 4 }));
    expect(c).toContain(`${moved.length} of ${keys.length} keys would now go to a different partition than their latest record`);
    expect(c).toContain('about 75% expected going from 3 to 4');
  });

  it('try-this 2: raising 2 consumers to 6 and stepping one tick runs the rebalance, 3 consumers get a partition, "assign P2 to c3" is logged, and 3 sit idle', () => {
    const f = raiseFacts();
    expect(f).toEqual({ busy: 3, idle: 3, ranRebalance: true, assigned: true });
    expect(lesson.tryThis[1]).toContain('the other 3 sit idle');
    const w = advance(setConsumers(newWorld({ p: DEFAULT_GROUP_PARTITIONS, consumers: DEFAULT_CONSUMERS, policy: 'after', seed: DEFAULT_GROUP_SEED }), RAISED_CONSUMERS));
    expect(w.groups[0].consumers.map((c) => [c.id, c.partitions])).toEqual([['c1', [0]], ['c2', [1]], ['c3', [2]], ['c4', []], ['c5', []], ['c6', []]]);
    expect(plain(groupsCaption(w))).toContain('6 consumers on 3 partitions: 3 can work');
    expect(plain(groupsCaption(w))).toContain('3 consumers sit idle');
  });

  it('try-this 3: crashing c1 at the worst moment ends with "Processed twice" at 1 under commit after, and "Skipped" at 1 under commit before', () => {
    const f = commitFacts();
    expect(f.after).toEqual({ duplicates: 1, skipped: 0 });
    expect(f.before).toEqual({ duplicates: 0, skipped: 1 });
    // The path the learner takes: crash, then Run until the counter moves.
    const start = (policy: CommitPolicy) => newWorld({ p: DEFAULT_GROUP_PARTITIONS, consumers: DEFAULT_CONSUMERS, policy, seed: DEFAULT_GROUP_SEED });
    let w = crashAtWorstMoment(start('after'), 'c1')!;
    expect(ledger(w.groups[0]).duplicates).toBe(0);
    let ticks = 0;
    while (ledger(w.groups[0]).duplicates < 1 && ticks < 60) {
      w = advance(w);
      ticks++;
    }
    expect(ledger(w.groups[0]).duplicates).toBe(1);
    expect(plain(groupsCaption(w))).toContain('1 record processed twice');
    const b = crashAtWorstMoment(start('before'), 'c1')!;
    expect(ledger(b.groups[0])).toMatchObject({ duplicates: 0, skipped: 1 });
    expect(plain(groupsCaption(b))).toContain('1 record committed but never processed');
    expect(lesson.tryThis[2]).toContain('"Processed twice" reaches 1');
  });

  it('try-this 4: the default replication scene loses r4 at offset 3 when the leader crashes; acks=all with min.insync=2 loses nothing and never acknowledges r4', () => {
    const f = acksFacts();
    expect(f.message).toBe('record r4 was acknowledged at offset 3 and is missing from leader b2');
    expect(f.safeOk).toBe(true);
    expect(f.safeR4).toBe('failed');
    expect(lesson.tryThis[3]).toContain(`${f.at} ms`);
    const run = runRepl(DEFAULT_REPL);
    const c = plain(replicationCaption({ config: DEFAULT_REPL.config, run, t: HORIZON_MS }));
    expect(c).toContain('1 acknowledged record missing from the leader: r4 at offset 3');
    expect(c).toContain(`The check fails at ${f.at} ms`);
  });

  it('try-this 5: retention moves the log start to 8 and the consumer at 2 is out of range; compaction keeps offsets 5, 10, 11 and 12 of 13 and the Map replay still matches', () => {
    const f = retentionFacts();
    expect(f).toMatchObject({ sent: 13, logStart: 8, position: 2, outOfRange: true, kept: [5, 10, 11, 12], compactionDiffers: [] });
    expect(lesson.tryThis[4]).toContain('offsets 5, 10, 11 and 12');
    const log = preloaded();
    expect(plain(retentionCaption({ policy: 'retention', log: applyRetention(log, DEFAULT_KEPT_SEGMENTS), position: DEFAULT_POSITION, keep: DEFAULT_KEPT_SEGMENTS }))).toContain('offset out of range');
    expect(plain(retentionCaption({ policy: 'compaction', log: applyCompaction(log), position: DEFAULT_POSITION, keep: DEFAULT_KEPT_SEGMENTS }))).toContain('the same state');
  });
});

describe('captions are computed from the model', () => {
  it('the partitions caption names the fullest tape, the share and the moved keys for every key set, partition count and burst', () => {
    for (const set of KEY_SETS) {
      for (let p = 1; p <= 6; p++) {
        const r = appendKeys(newTopic(p), burstKeys(set, 3, 0));
        if (!r.ok) throw new Error('refused');
        const t: Topic = r.topic;
        const counts = new Array<number>(p).fill(0);
        t.records.forEach((rec) => counts[rec.partition]++);
        const top = counts.indexOf(Math.max(...counts));
        const c = plain(partitionsCaption(t));
        expect(c, `${set.id} ${p}`).toContain(`the fullest is P${top} with ${Math.round((counts[top] / t.records.length) * 100)}% of them`);
        expect(c).not.toContain('would now go to');
      }
    }
    expect(plain(partitionsCaption(newTopic(4)))).toContain('An empty topic of 4 partitions');
  });

  it('the groups caption agrees with the world: lag, idle consumers, pause and the ledger, over every consumer count and many ticks', () => {
    for (let c = 1; c <= MAX_CONSUMERS; c++) {
      for (const policy of ['after', 'before'] as const) {
        let w = newWorld({ p: 3, consumers: c, policy, seed: 5 });
        for (let tick = 0; tick < 25; tick++) {
          if (tick === 10) w = crashConsumer(w, w.groups[0].consumers[0].id);
          const g = w.groups[0];
          const cap = plain(groupsCaption(w));
          const staying = g.consumers.filter((x) => !x.leaving).length;
          expect(cap, `C=${c} ${policy} t=${tick}`).toContain(`Total lag ${totalLag(g, w.logEnd)}, group B's ${totalLag(w.groups[1], w.logEnd)}`);
          expect(cap.includes('sit idle')).toBe(staying - busyConsumers(g) > 0);
          expect(cap.includes('is paused for the rebalance')).toBe(g.pause > 0);
          const led = ledger(g);
          expect(cap.includes('processed twice')).toBe(led.duplicates > 0);
          expect(cap.includes('committed but never processed')).toBe(led.skipped > 0);
          w = advance(w);
        }
      }
    }
  });

  const FAULT_SETS: ScriptedFault[][] = [[], ['crash-leader'], ['crash-leader', 'slow-b2', 'slow-b3'], ['slow-b2', 'slow-b3']];
  it('the replication caption agrees with the frame at every setting and replay time: leader, lost records and the verdict', () => {
    for (const acks of [0, 1, 'all'] as const) {
      for (const minIsr of [1, 2] as const) {
        for (const unclean of [false, true]) {
          for (const faults of FAULT_SETS) {
            const config: ReplConfig = { acks, minIsr, unclean };
            const run = runRepl({ ...DEFAULT_REPL, config, faults });
            for (const t of [0, 40, 70, 100, 130, 160, HORIZON_MS]) {
              const f = frameAt(run, t);
              const c = plain(replicationCaption({ config: effectiveConfig(config), run, t }));
              const id = `${acks}/${minIsr}/${unclean} ${faults.join('+')} @${t}`;
              expect(c.includes('acknowledged record') || c.includes('acknowledged records'), id).toBe(f.lost.length > 0);
              expect(c.includes('there is no live leader'), id).toBe(f.leader === null || !f.brokers[f.leader].up);
              expect(c.includes('Nothing acknowledged is lost'), id).toBe(run.verdict.ok && acks !== 0);
              expect(c.includes('The check fails at'), id).toBe(!run.verdict.ok);
              expect(c.includes('missing from the leader: ') || c.includes('are missing from the leader') || /r\d+ is missing from the leader/.test(c), id).toBe(f.lost.length > 0 || f.missing.length > 0);
              if (f.lost.length > 0) expect(c).toContain(`${f.lost.length} acknowledged`);
            }
          }
        }
      }
    }
  });

  it('the retention caption agrees with the log: policy sentence, Map replay verdict and the consumer\'s read, for every keep, position and policy', () => {
    const log = preloaded();
    for (const policy of ['retention', 'compaction'] as RetPolicy[]) {
      for (let keep = 1; keep <= MAX_KEPT_SEGMENTS; keep++) {
        const cleaned: SegLog = policy === 'retention' ? applyRetention(log, keep) : applyCompaction(log);
        for (let position = 0; position <= cleaned.history.length; position++) {
          const c = plain(retentionCaption({ policy, log: cleaned, position, keep }));
          const id = `${policy} keep=${keep} pos=${position}`;
          expect(c.includes('the same state'), id).toBe(stateDiff(cleaned).length === 0);
          expect(c.includes('offset out of range'), id).toBe(position < cleaned.logStart);
          expect(c.includes('is at the end of the log'), id).toBe(position >= cleaned.history.length);
          if (policy === 'retention') expect(c).toContain(`Retention keeps the newest ${keep}`);
        }
      }
    }
    let grown = preloaded();
    for (const k of KEYS) {
      const r = append(grown, k, null);
      if (r.ok) grown = r.log;
    }
    expect(onDisk(applyCompaction(grown)).some((r) => r.value === null)).toBe(true);
    expect(plain(retentionCaption({ policy: 'compaction', log: applyCompaction(grown), position: 0, keep: 2 }))).toContain('the same state');
  });
});

describe('the groups scene, walked: nothing hidden feeds a number', () => {
  it('the seed only changes what is produced, never how many consumers are busy or what the policies cost', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const w = advanceBy(newWorld({ p: 3, consumers: 4, policy: 'after', seed }), 30);
      expect(busyConsumers(w.groups[0])).toBe(3);
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
