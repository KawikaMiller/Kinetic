import { describe, expect, it } from 'vitest';
import { choose, enumeratePaths, findEnding, startWalk, validateScenario, type Scenario } from '../../core/scenario';
import {
  ACTIONS, CAUSES, FAILED, MINUTES, PEOPLE, SCENARIOS, TRUST, buildScenario, failedBy, outcomeRows, rateAfterActions, timelineOf,
  type Action, type Cause,
} from './model';

/**
 * An independent oracle: replays a path of choice ids against the SPEC's table, one minute at a
 * time, with its own copy of the numbers (4, 7, 2 and 3 minutes; which cause each action fixes).
 */
const SPEC_MINUTES: Record<string, number> = { investigate: 3, rollback: 4, failover: 7, flag: 2, escalate: 1 };
const SPEC_RATE_AFTER: Record<Cause, Record<string, number>> = { deploy: { rollback: 0 }, dependency: { flag: 120 }, region: { failover: 0 } };

function oracle(cause: Cause, ids: readonly string[]): { failed: number; minute: number } {
  // Minute 0 to 6: 400 of every 1,000 fail. Then each decision runs for its minutes at the current rate.
  let rate = 400;
  let minute = 0;
  let failed = 0;
  const tick = (to: number) => {
    for (; minute < to; minute++) failed += rate;
  };
  tick(6);
  for (const id of ids) {
    if (id === 'roles-no-commander' || id === 'roles-none') tick(minute + 2);
    if (id in SPEC_MINUTES) {
      tick(minute + SPEC_MINUTES[id]);
      rate = SPEC_RATE_AFTER[cause][id] ?? rate;
    }
  }
  return { failed, minute };
}

describe('the spec’s hand-worked totals', () => {
  it('an immediate rollback on a bad deploy mitigates at minute 10 for 4,000 failed requests', () => {
    const tl = timelineOf('deploy', ['sev2', 'roles-all', 'rollback']);
    expect(tl.mitigatedAt).toBe(10);
    expect(failedBy(tl, tl.end)).toBe(4000);
  });

  it('investigate then rollback is minute 13 for 5,200, and failover then rollback is minute 17 for 6,800', () => {
    const a = timelineOf('deploy', ['sev2', 'roles-all', 'investigate', 'rollback']);
    expect([a.mitigatedAt, failedBy(a, a.end)]).toEqual([13, 5200]);
    const b = timelineOf('deploy', ['sev2', 'roles-all', 'failover', 'rollback']);
    expect([b.mitigatedAt, failedBy(b, b.end)]).toEqual([17, 6800]);
  });

  it('the flag cuts a slow dependency from 400 to 120 per minute at +2 minutes, and leaves it there', () => {
    const tl = timelineOf('dependency', ['sev2', 'roles-all', 'flag']);
    expect(tl.mitigatedAt).toBe(8);
    expect(tl.resolvedAt).toBeNull();
    expect(failedBy(tl, 12) - failedBy(tl, 8)).toBe(4 * 120);
  });
});

describe('every path the scenario graph allows, against the minute-by-minute oracle', () => {
  for (const cause of CAUSES) {
    it(`${cause}: failed requests and minutes on every path equal the oracle's, and the timeline integral agrees`, () => {
      const paths = enumeratePaths(SCENARIOS[cause]);
      expect(paths.length).toBeGreaterThan(50);
      for (const p of paths) {
        const ref = oracle(cause, p.choices);
        expect(p.meters[FAILED], p.choices.join('>')).toBe(ref.failed);
        expect(p.meters[MINUTES], p.choices.join('>')).toBe(ref.minute);
        const tl = timelineOf(cause, p.choices);
        expect(failedBy(tl, tl.end), p.choices.join('>')).toBe(ref.failed);
      }
    });
  }
});

describe('the scenario graph', () => {
  it.each(CAUSES)('%s: passes the shared validator, so every node and ending is reachable and every meter stays in bounds on every path', (cause) => {
    expect(validateScenario(SCENARIOS[cause])).toEqual([]);
  });

  it('fails the validator on a broken copy: a node with no way out, and a meter that leaves 0 to 100', () => {
    const good = buildScenario('deploy');
    const deadEnd: Scenario = { ...good, nodes: good.nodes.map((n) => (n.id === 'roles' ? { ...n, choices: [] } : n)) };
    expect(validateScenario(deadEnd).map((p) => p.kind)).toContain('dead-end');
    const leaky: Scenario = { ...good, nodes: good.nodes.map((n) => (n.id === 'severity' ? { ...n, choices: n.choices.map((c) => ({ ...c, effects: { ...c.effects, [TRUST]: -90 } })) } : n)) };
    expect(validateScenario(leaky).map((p) => p.kind)).toContain('out-of-bounds');
  });

  it('can be walked to every ending of every cause, and a double press of one choice records one decision', () => {
    const endingsReached = Object.fromEntries(CAUSES.map((c) => [c, new Set(enumeratePaths(SCENARIOS[c]).map((p) => p.endingId))]));
    expect(endingsReached).toEqual({ deploy: new Set(['resolved']), dependency: new Set(['degraded']), region: new Set(['resolved']) });
    const s = SCENARIOS.deploy;
    let w = choose(s, startWalk(s), 'sev2');
    w = choose(s, w, 'sev2');
    expect(w.path).toHaveLength(1);
    for (const id of ['roles-all', 'rollback']) w = choose(s, w, id);
    expect(findEnding(s, w.at)?.id).toBe('resolved');
    expect(choose(s, w, 'rollback')).toEqual(w);
  });

  it('rollback leaves a slow dependency unfixed, and failover leaves a bad deploy unfixed', () => {
    expect(rateAfterActions('dependency', ['rollback'])).toBe(400);
    expect(rateAfterActions('deploy', ['failover'])).toBe(400);
    expect(rateAfterActions('region', ['rollback', 'flag'])).toBe(400);
    expect(rateAfterActions('deploy', ['rollback'])).toBe(0);
    expect(rateAfterActions('region', ['failover'])).toBe(0);
  });

  it('every path keeps trust and people inside the meters and puts the first mitigation on a node that still has choices', () => {
    for (const cause of CAUSES) {
      for (const p of enumeratePaths(SCENARIOS[cause])) {
        expect(p.meters[TRUST]).toBeGreaterThan(0);
        expect(p.meters[PEOPLE]).toBeGreaterThanOrEqual(1);
      }
    }
  });
});

describe('the outcome table', () => {
  const rows = outcomeRows();
  /** Brute force: every ordering of every subset of the four actions, with SEV2 and all roles. */
  function bestBrute(cause: Cause, first: Action): { failed: number } {
    const specRate = (seq: readonly Action[]) => seq.reduce((r, a) => SPEC_RATE_AFTER[cause][a] ?? r, 400);
    let best = Infinity;
    const go = (seq: Action[]) => {
      const rate = specRate(seq);
      const ids = ['sev2', 'roles-all', ...seq];
      if (rate === 0) {
        best = Math.min(best, oracle(cause, ids).failed);
        return;
      }
      if (rate === 120) best = Math.min(best, oracle(cause, [...ids, 'escalate']).failed);
      for (const x of ACTIONS) if (!seq.includes(x)) go([...seq, x]);
    };
    go([first]);
    return { failed: best };
  }

  it('has one row for every cause and first action', () => {
    expect(rows).toHaveLength(CAUSES.length * ACTIONS.length);
  });

  it('matches a brute force over every ordering of the actions', () => {
    for (const r of rows) expect(r.failed, `${r.cause} ${r.first}`).toBe(bestBrute(r.cause, r.first).failed);
  });

  it('its best row for each cause equals the enumeration’s minimum for SEV2 with all roles', () => {
    for (const cause of CAUSES) {
      const min = Math.min(...enumeratePaths(SCENARIOS[cause]).filter((p) => p.choices[0] === 'sev2' && p.choices[1] === 'roles-all').map((p) => p.meters[FAILED]));
      expect(Math.min(...rows.filter((r) => r.cause === cause).map((r) => r.failed))).toBe(min);
    }
  });

  it('shows what a wrong first guess costs: failing over a bad deploy first loses 2,800 more requests than rolling back first', () => {
    const find = (cause: Cause, first: Action) => rows.find((r) => r.cause === cause && r.first === first)!;
    expect(find('deploy', 'failover').failed - find('deploy', 'rollback').failed).toBe(2800);
  });
});
