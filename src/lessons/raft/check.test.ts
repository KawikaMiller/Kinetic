import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../core/random';
import {
  applyAction, BROKEN_RULE, BROKEN_SEED, buildSchedule, checkSeeds, describeCheck, FAULT_MS, runSchedule, SCHEDULE_DUPLICATE,
  SCHEDULE_LOSS, SCHEDULE_SEEDS, SETTLE_MS, TICK_MS,
} from './check';
import { N, Raft } from './sim';

const BROKEN: (keyof typeof BROKEN_SEED)[] = ['commit-without-majority', 'vote-without-log-check'];

/** An independent agreement check, written separately from SafetyMonitor: committed prefixes never disagree. */
function committedPrefixesAgree(raft: Raft): boolean {
  for (let a = 0; a < N; a += 1) {
    for (let b = a + 1; b < N; b += 1) {
      const upTo = Math.min(raft.nodes[a].commit, raft.nodes[b].commit);
      for (let i = 0; i < upTo; i += 1) {
        const x = raft.nodes[a].log[i];
        const y = raft.nodes[b].log[i];
        if (!x || !y || x.id !== y.id || x.term !== y.term) return false;
      }
    }
  }
  return true;
}

describe('the real rules, over seeded fault schedules', () => {
  it(`hold every property after every event on all ${SCHEDULE_SEEDS} seeds (loss ${SCHEDULE_LOSS}, duplication ${SCHEDULE_DUPLICATE}, crashes, partitions)`, () => {
    const summary = checkSeeds('raft');
    expect(summary.seeds).toBe(SCHEDULE_SEEDS);
    expect(summary.failures).toBe(0);
    expect(summary.events).toBeGreaterThan(SCHEDULE_SEEDS * 500);
  });

  it('also hold on 400 further seeds, so the 200 are not a lucky window', () => {
    for (let seed = SCHEDULE_SEEDS + 1; seed <= SCHEDULE_SEEDS + 400; seed += 1) {
      expect(runSchedule(seed, 'raft').violation, `seed ${seed}`).toBeNull();
    }
  });

  it('agree on committed prefixes at every tick, by a second implementation of the check', () => {
    for (let seed = 1; seed <= SCHEDULE_SEEDS; seed += 1) {
      const actions = buildSchedule(seed);
      const raft = new Raft({ rnd: mulberry32(seed), loss: SCHEDULE_LOSS, duplicate: SCHEDULE_DUPLICATE });
      let next = 0;
      for (let t = 0; t < FAULT_MS + SETTLE_MS; t += TICK_MS) {
        while (next < actions.length && actions[next].at <= t) applyAction(raft, actions[next++]);
        raft.step(TICK_MS);
        expect(committedPrefixesAgree(raft), `seed ${seed} at ${raft.now} ms`).toBe(true);
      }
    }
  });

  it('are not passing by doing nothing: most seeds commit entries (liveness is a separate claim)', () => {
    let committing = 0;
    for (let seed = 1; seed <= SCHEDULE_SEEDS; seed += 1) if (runSchedule(seed, 'raft').committed > 0) committing += 1;
    expect(committing).toBeGreaterThan(SCHEDULE_SEEDS * 0.9);
  });

  it('build the same schedule for the same seed, and a different one for another', () => {
    expect(buildSchedule(9)).toEqual(buildSchedule(9));
    expect(buildSchedule(9)).not.toEqual(buildSchedule(10));
    expect(buildSchedule(9).every((a) => a.at <= FAULT_MS + SETTLE_MS)).toBe(true);
  });
});

describe.each(BROKEN)('the planted bug %s', (variant) => {
  const results = Array.from({ length: SCHEDULE_SEEDS }, (_, i) => runSchedule(i + 1, variant));
  const failing = results.filter((r) => r.violation);

  it('breaks the property the lesson names, on the lowest failing seed the lesson pins', () => {
    expect(failing[0].seed).toBe(BROKEN_SEED[variant]);
    expect(failing[0].violation?.rule).toBe(BROKEN_RULE[variant]);
  });

  it('is not trivially everywhere: it fails on some seeds, at most 90% of them, and every lower seed passes', () => {
    expect(failing.length).toBeGreaterThan(0);
    expect(failing.length).toBeLessThanOrEqual(SCHEDULE_SEEDS * 0.9);
    expect(results.slice(0, BROKEN_SEED[variant] - 1).every((r) => !r.violation)).toBe(true);
  });

  it('fails for the stated reason on every failing seed', () => {
    expect(new Set(failing.map((r) => r.violation?.rule))).toEqual(new Set([BROKEN_RULE[variant]]));
  });

  it('passes the same seeds under the real rules', () => {
    for (const r of failing.slice(0, 40)) expect(runSchedule(r.seed, 'raft').violation, `seed ${r.seed}`).toBeNull();
  });

  it('prints the same numbers the run produced', () => {
    const summary = checkSeeds(variant);
    expect(summary.failures).toBe(failing.length);
    expect(describeCheck(summary)).toContain(`${failing.length} of ${SCHEDULE_SEEDS} seeds`);
    expect(describeCheck(summary)).toContain(`Lowest failing seed ${BROKEN_SEED[variant]}: ${BROKEN_RULE[variant]}`);
  });
});

describe('the report sentence', () => {
  it('says "sampled, not exhaustive" when nothing broke', () => {
    const text = describeCheck(checkSeeds('raft'));
    expect(text).toContain('Sampled, not exhaustive');
    expect(text).toContain('not a proof');
  });
});
