import { describe, expect, it } from 'vitest';
import { barsAt } from '../../core/gantt';
import { expectCaption } from '../../core/testing/captions';
import { choose, enumeratePaths, findEnding, startWalk, type Walk } from '../../core/scenario';
import { LANES, readouts, timelineBars } from './bars';
import { momentCaption, outcomeCaption, replayIntro, replaySummary, responseCaption } from './captions';
import { incidentLog } from './logs';
import { CAUSES, FAILED, MINUTES, PEOPLE, SAMPLE_PATH, SCENARIOS, TRUST, outcomeRows, rateAt, timelineOf, type Cause } from './model';

const play = (cause: Cause, ids: readonly string[]): Walk => ids.reduce((w, id) => choose(SCENARIOS[cause], w, id), startWalk(SCENARIOS[cause]));

describe('try-this entries, from the default state (cause: bad deploy), as written', () => {
  it('try-this 1: SEV2, all roles, roll back ends at minute 10 with 4,000 failed; undoing and investigating first gives minute 13 and 5,200', () => {
    const a = play('deploy', ['sev2', 'roles-all', 'rollback']);
    expect(findEnding(SCENARIOS.deploy, a.at)?.id).toBe('resolved');
    expect([a.meters[MINUTES], a.meters[FAILED]]).toEqual([10, 4000]);
    const b = play('deploy', ['sev2', 'roles-all', 'investigate', 'rollback']);
    expect([b.meters[MINUTES], b.meters[FAILED]]).toEqual([13, 5200]);
  });

  it('try-this 2: on a slow dependency a rollback changes nothing for 4 minutes, the flag cuts errors to 120, and the only ending is contained', () => {
    const afterRollback = play('dependency', ['sev2', 'roles-all', 'rollback']);
    expect(afterRollback.meters[MINUTES]).toBe(10);
    expect(rateAt(timelineOf('dependency', ['sev2', 'roles-all', 'rollback']), 10)).toBe(400);
    const flagged = timelineOf('dependency', ['sev2', 'roles-all', 'rollback', 'flag']);
    expect(rateAt(flagged, flagged.end)).toBe(120);
    expect(new Set(enumeratePaths(SCENARIOS.dependency).map((p) => p.endingId))).toEqual(new Set(['degraded']));
  });

  it('try-this 3: skipping the roles puts the rollback at minute 12 and trust at 74, against minute 10 and 81 with all roles', () => {
    const skipped = play('deploy', ['sev2', 'roles-none', 'rollback']);
    expect([skipped.meters[MINUTES], skipped.meters[TRUST]]).toEqual([12, 74]);
    const full = play('deploy', ['sev2', 'roles-all', 'rollback']);
    expect([full.meters[MINUTES], full.meters[TRUST]]).toEqual([10, 81]);
  });

  it('try-this 4: the sample replay is detected at 4, acknowledged at 6, mitigated and resolved at 13', () => {
    const tl = timelineOf('deploy', SAMPLE_PATH.deploy);
    expect(readouts(tl, tl.end)).toEqual({ detect: 4, acknowledge: 6, mitigate: 13, resolve: 13 });
  });

  it('try-this 5: on a bad deploy, rolling back first is best at 4,000 and failing over first costs 2,800 more', () => {
    const rows = outcomeRows().filter((r) => r.cause === 'deploy');
    const best = rows.reduce((a, b) => (b.failed < a.failed ? b : a));
    expect([best.first, best.failed]).toEqual(['rollback', 4000]);
    expect(rows.find((r) => r.first === 'failover')!.failed - best.failed).toBe(2800);
  });
});

describe('the story keeps its premises in every state', () => {
  it('shows no cause before the learner has acted: the three scenarios share the same prompt and choice effects at the first two nodes', () => {
    const [a, ...rest] = CAUSES.map((c) => SCENARIOS[c].nodes.slice(0, 2).map((n) => [n.prompt, n.choices.map((x) => [x.id, x.label, x.effects])]));
    for (const r of rest) expect(r).toEqual(a);
  });

  it('shows the same effects for every cause on the first action node, so the preview cannot give the cause away', () => {
    const first = CAUSES.map((c) => SCENARIOS[c].nodes.find((n) => n.id === 'act-comms-none')!.choices.map((x) => [x.id, x.effects]));
    expect(first[1]).toEqual(first[0]);
    expect(first[2]).toEqual(first[0]);
  });

  it('keeps people pulled in and trust inside their meters for every severity and role pair', () => {
    for (const cause of CAUSES) {
      for (const p of enumeratePaths(SCENARIOS[cause])) {
        expect(p.meters[PEOPLE]).toBeLessThanOrEqual(14);
        expect(p.meters[TRUST]).toBeLessThanOrEqual(100);
      }
    }
  });
});

describe('the replay', () => {
  const tl = timelineOf('deploy', ['sev2', 'roles-no-comms', 'investigate', 'rollback']);

  it('always logs the 14:02 deploy, for every cause, and reveals the finding only after an investigation', () => {
    for (const cause of CAUSES) {
      const withInvestigation = incidentLog(cause, timelineOf(cause, ['sev2', 'roles-all', 'investigate']));
      const without = incidentLog(cause, timelineOf(cause, ['sev2', 'roles-all', 'flag']));
      expect(withInvestigation.find((r) => r.id === 'deploy')?.at).toBe('14:02');
      expect(without.find((r) => r.id === 'deploy')?.at).toBe('14:02');
      expect(withInvestigation.some((r) => String(r.text).startsWith('finding:'))).toBe(true);
      expect(without.some((r) => String(r.text).startsWith('finding:'))).toBe(false);
    }
  });

  it('draws the page and the alert as instants, and no status updates without a communications lead', () => {
    const bars = timelineBars(tl, tl.end);
    expect(bars.filter((b) => b.start === b.end && b.lane !== 'comms').map((b) => [b.lane, b.start])).toEqual(
      expect.arrayContaining([['detect', 4], ['ack', 6]]),
    );
    expect(bars.some((b) => b.lane === 'comms')).toBe(false);
    expect(timelineBars(timelineOf('deploy', ['sev2', 'roles-all', 'rollback']), 10).filter((b) => b.lane === 'comms')).toHaveLength(1);
    for (const b of bars) expect(LANES.map((l) => l.id)).toContain(b.lane);
  });

  it('reveals bars progressively: nothing of the rollback before it starts, a progress fraction while it runs, the whole bar once it has ended', () => {
    const all = timelineBars(tl, 0);
    const rollback = tl.segments.find((s) => s.kind === 'rollback')!;
    const id = `seg-${tl.segments.indexOf(rollback)}`;
    expect(barsAt(all, rollback.start - 1).some((b) => b.id === id)).toBe(false);
    expect(barsAt(all, rollback.start + 1).find((b) => b.id === id)!.progress).toBeCloseTo(1 / 4);
    expect(barsAt(all, rollback.end).find((b) => b.id === id)!.progress).toBeUndefined();
  });

  it('counts failed requests in each caption from the timeline, at the first, a middle and the last minute', () => {
    expect(expectCaption(replayIntro(tl))).toContain('400 of every 1,000');
    expect(expectCaption(momentCaption(tl, 4))).toContain('1,600 failed requests');
    expect(expectCaption(momentCaption(tl, 6))).toContain('2,400 requests have failed');
    expect(expectCaption(replaySummary(tl))).toContain('5,200 requests failed in all');
    expect(expectCaption(replaySummary(tl))).toContain('mitigated at minute 13');
  });

  it('says not resolved, never "resolved", for a path that only contained the errors', () => {
    const contained = timelineOf('dependency', ['sev2', 'roles-all', 'flag', 'escalate']);
    expect(expectCaption(replaySummary(contained))).toContain('not resolved');
    expect(expectCaption(replaySummary(contained))).toContain('mitigated at minute 8');
  });
});

describe('the scene captions', () => {
  it('writes the decision at the start, the choice and its reason after a move, and the ending with its cost', () => {
    const s = SCENARIOS.deploy;
    expect(expectCaption(responseCaption(s, 'deploy', startWalk(s)))).toContain('What severity do you declare');
    const mid = play('deploy', ['sev2']);
    expect(expectCaption(responseCaption(s, 'deploy', mid))).toContain('You chose "SEV2');
    const end = play('deploy', ['sev2', 'roles-all', 'rollback']);
    const text = expectCaption(responseCaption(s, 'deploy', end));
    expect(text).toContain('The errors are gone');
    expect(text).toContain('minute 10');
    expect(text).toContain('4,000 failed requests');
  });

  it('names the best and the worst first move for the cause, and how your own move compares', () => {
    const rows = outcomeRows();
    const text = expectCaption(outcomeCaption(rows, 'deploy', 'failover'));
    expect(text).toContain('best first action is to roll back: 4,000');
    expect(text).toContain('worst is to fail over: 6,800');
    expect(text).toContain('2,800 more');
    expect(expectCaption(outcomeCaption(rows, 'deploy', 'rollback'))).toContain('was the best one');
  });
});
