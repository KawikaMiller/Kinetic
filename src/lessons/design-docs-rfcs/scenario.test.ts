import { describe, expect, it } from 'vitest';
import { expectCaption } from '../../core/testing/captions';
import { choose, enumeratePaths, findEnding, ledger, redMeters, startWalk, undo, validateScenario } from '../../core/scenario';
import { scenarioCaption } from './captions';
import { BECAUSE_CLAIM, CLARITY, DAYS, PROPOSAL, SURPRISE } from './proposal';

describe('the review scenario: every ending reachable, every path in bounds', () => {
  const paths = enumeratePaths(PROPOSAL);

  it('passes the shared validator', () => {
    expect(validateScenario(PROPOSAL)).toEqual([]);
  });

  it('passes the trade-off checks too (K4-9): no straw-man choice, no free path', () => {
    expect(validateScenario(PROPOSAL, { tradeoffs: true })).toEqual([]);
  });

  it('has 12 paths of three decisions, reaching every one of the six endings', () => {
    expect(paths).toHaveLength(12);
    for (const p of paths) expect(p.choices).toHaveLength(3);
    expect(new Set(paths.map((p) => p.endingId))).toEqual(new Set(PROPOSAL.endings.map((e) => e.id)));
  });

  it('keeps every meter inside its bounds on every path at the end and at each step, summed from the start with no clamping', () => {
    for (const p of paths) {
      for (const m of PROPOSAL.meters) {
        expect(p.meters[m.id]).toBeGreaterThanOrEqual(m.min);
        expect(p.meters[m.id]).toBeLessThanOrEqual(m.max);
      }
    }
  });

  it('puts at least one meter in the red on every path, so the best path is not free, while some path has just one', () => {
    const reds = paths.map((p) => redMeters(PROPOSAL, p.meters).length);
    expect(reds.every((n) => n >= 1)).toBe(true);
    expect(reds.some((n) => n === 1)).toBe(true);
  });

  it('starts with no meter in the red', () => {
    expect(redMeters(PROPOSAL, startWalk(PROPOSAL).meters)).toEqual([]);
  });

  it('gives every choice a reason and a claim label', () => {
    for (const node of PROPOSAL.nodes) {
      for (const c of node.choices) {
        expect(c.because.length, c.id).toBeGreaterThan(20);
        expect(BECAUSE_CLAIM[c.id], c.id).toBeDefined();
      }
    }
  });

  it('try-this 5: one page, objectors invited first, dissent recorded leaves only days to a decision in the red', () => {
    let w = startWalk(PROPOSAL);
    for (const id of ['short', 'objectors-short-early', 'early-record']) w = choose(PROPOSAL, w, id);
    expect(findEnding(PROPOSAL, w.at)!.id).toBe('early-recorded');
    expect(w.meters[CLARITY]).toBe(11);
    expect(w.meters[DAYS]).toBe(7);
    expect(w.meters[SURPRISE]).toBe(5);
    expect(redMeters(PROPOSAL, w.meters).map((m) => m.id)).toEqual([DAYS]);
    expect(expectCaption(scenarioCaption(PROPOSAL, w))).toContain('days to a decision 7 days');
  });

  it('undoes every path back to the start with the meters equal to the sum of the effects chosen', () => {
    for (const p of paths) {
      let w = startWalk(PROPOSAL);
      for (const id of p.choices) w = choose(PROPOSAL, w, id);
      let back = w;
      for (let k = p.choices.length - 1; k >= 0; k--) {
        back = undo(PROPOSAL, back);
        expect(back.path).toHaveLength(k);
        for (const m of PROPOSAL.meters) {
          const summed = ledger(PROPOSAL, back).reduce((s, r) => s + (r.choice.effects?.[m.id] ?? 0), m.start);
          expect(back.meters[m.id]).toBe(summed);
        }
      }
      expect(back).toEqual(startWalk(PROPOSAL));
    }
  });
});

describe('the scenario captions', () => {
  it('write a caption for each decision and ending from the walk', () => {
    expect(expectCaption(scenarioCaption(PROPOSAL, startWalk(PROPOSAL)))).toContain('How long do you make the version you circulate');
    const w = choose(PROPOSAL, startWalk(PROPOSAL), 'long');
    const text = expectCaption(scenarioCaption(PROPOSAL, w));
    expect(text).toContain('You chose "A twelve-page doc"');
    expect(text).toContain('When do you bring them in');
  });
});
