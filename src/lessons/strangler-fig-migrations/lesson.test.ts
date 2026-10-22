import { describe, expect, it } from 'vitest';
import { choose, redMeters, startWalk } from '../../core/scenario';
import { expectCaption } from '../../core/testing/captions';
import { sceneElements, sharedSceneComponents } from '../../core/testing/sceneKeys';
import { facadeCaption, ledgerCaption, lossText, rateText, storyCaption } from './captions';
import { FACTS, STEPS } from './facts';
import lesson from './index';
import { initialFacade, observeCached, pathRows, readout, setMinutes, setMode, setShare } from './model';
import { OPENING } from './opening';
import { METER, MIGRATION } from './scenario';

const NO_JUNK = /NaN|undefined|\[object|Infinity/;

describe('scenes', () => {
  it('every scene component carries its own key and none is shared', () => {
    const els = sceneElements('strangler-fig-migrations');
    expect(els).toHaveLength(3);
    expect(els.every((e) => e.keyed)).toBe(true);
    expect(sharedSceneComponents('strangler-fig-migrations')).toEqual([]);
  });

  it('every scene opens on its documented state: all routes Off, dual-write off, zero minutes, seed 7, the full ledger', () => {
    expect(OPENING.scene).toBe('facade');
    expect(Object.values(OPENING.facade.settings).every((s) => s.mode === 'off' && !s.dualWrite && s.share === 100)).toBe(true);
    expect(OPENING.facade.minutes).toBe(0);
    expect(OPENING.facade.seed).toBe(7);
    expect(OPENING.facade.notice).toBeNull();
    expect(OPENING.ledger.filter).toBe('all');
    expect(readout(OPENING.facade).errorRate).toBe(0);
  });
});

describe('try-this entries, in written order from the default state', () => {
  it('try-this 1: search at Serve 100% reads 0.11% and loses no writes', () => {
    expect(rateText(readout(STEPS.searchServed).errorRate)).toBe('0.11%');
    expect(readout(STEPS.searchServed).lostTotal).toBe(0);
    expect(lesson.tryThis[0]).toContain('reads 0.11%');
  });

  it('try-this 2: checkout in Shadow keeps 0.11% and mismatches about 39 a minute, 6.50% of 600', () => {
    const r = readout(STEPS.checkoutShadow);
    expect([rateText(r.errorRate), Math.round(r.mismatchPerMin), rateText(r.mismatchRate!), r.mirroredPerMin]).toEqual(['0.11%', 39, '6.50%', 600]);
    expect(lesson.tryThis[1]).toContain('stays 0.11%');
    expect(lesson.tryThis[1]).toContain('about 39 a minute, 6.50% of 600');
  });

  it('try-this 3: checkout Serve at 100% and 60 minutes reads 0.50% and the banner loses 720 writes', () => {
    const r = readout(STEPS.checkoutServed);
    expect(rateText(r.errorRate)).toBe('0.50%');
    expect(r.lostTotal).toBe(720);
    expect(lossText('checkout', r.lostTotal)).toBe('Rolling back checkout now loses 720 writes that exist only in the new store: there is no safe way back.');
    expect(expectCaption(facadeCaption(STEPS.checkoutServed, r, observeCached(STEPS.checkoutServed)))).toContain('Rolling back checkout now loses 720 writes');
    expect(lesson.tryThis[2]).toContain('reads 0.50%');
    expect(lesson.tryThis[2]).toContain('loses 720 writes');
  });

  it('try-this 4: dual-write on for checkout reads 0 lost and the banner is gone', () => {
    const r = readout(STEPS.dual);
    expect(r.lostTotal).toBe(0);
    expect(expectCaption(facadeCaption(STEPS.dual, r, observeCached(STEPS.dual)))).toContain('Rolling back loses no writes');
    expect(lesson.tryThis[3]).toContain('read 0');
  });

  it('try-this 5: choosing a1, b3, c1 reads incidents 1, weeks 24, strain 4, unknowns 4 with no meter red', () => {
    let w = startWalk(MIGRATION);
    for (const id of ['a1', 'b3', 'c1']) {
      w = choose(MIGRATION, w, id);
      expect(redMeters(MIGRATION, w.meters)).toEqual([]);
    }
    expect([w.meters[METER.incidents], w.meters[METER.weeks], w.meters[METER.strain], w.meters[METER.surprises]]).toEqual([1, 24, 4, 4]);
    expect(lesson.tryThis[4]).toContain('incidents 1, weeks 24, strain 4, unknowns ahead 4');
  });
});

describe('captions across the control cross product', () => {
  it('the facade caption is clean for every mode, share and minutes extreme, and names the loss it computes', () => {
    for (const mode of ['off', 'shadow', 'serve'] as const) {
      for (const share of [10, 100] as const) {
        for (const minutes of [0, 60, 120, 125]) {
          const f = setMinutes(setShare(setMode(setMode(initialFacade(), 'checkout', mode), 'search', 'serve'), 'checkout', share), minutes);
          const r = readout(f);
          const text = expectCaption(facadeCaption(f, r, observeCached(f)));
          expect(text).not.toMatch(NO_JUNK);
          expect(text.includes('now loses')).toBe(r.lostTotal > 0);
          expect(text).toContain(rateText(r.errorRate));
        }
      }
    }
    expect(expectCaption(facadeCaption(initialFacade(), readout(initialFacade()), observeCached(initialFacade())))).toContain('Every route is Off');
  });

  it('the story caption reads the ledger and names the red meters', () => {
    expect(expectCaption(storyCaption(MIGRATION, startWalk(MIGRATION)))).toContain('Nothing is in the red');
    const w = choose(MIGRATION, startWalk(MIGRATION), 'a4');
    const text = expectCaption(storyCaption(MIGRATION, w));
    expect(text).toContain('One weekend, one cutover');
    expect(text).toContain('Incidents 6, weeks 24, strain 5, unknowns still ahead 0');
    expect(text).toContain('In the red: customer-visible incidents.');
  });

  it('the ledger caption counts what the table shows', () => {
    const rows = pathRows(MIGRATION);
    const text = expectCaption(ledgerCaption(MIGRATION, rows, 5));
    expect(text).toContain('28 paths in all, 5 shown');
    expect(text).toContain('5 paths go through no red meter');
    expect(text).toContain('No path is best on every meter');
  });
});

describe('the story', () => {
  it('has no ending marked correct, best or successful', () => {
    for (const e of MIGRATION.endings) expect(`${e.title} ${e.text}`).not.toMatch(/\b(correct|best|right answer|wrong|success|succeeded)\b/i);
  });

  it('states every reason as a condition, and its figures agree with the effects', () => {
    for (const c of MIGRATION.nodes.flatMap((n) => n.choices)) expect(c.because, c.id).toMatch(/^If /);
    const a2 = MIGRATION.nodes[0].choices.find((c) => c.id === 'a2')!;
    expect(a2.because).toContain('four unknowns');
    expect(-a2.effects![METER.surprises]!).toBe(4);
    expect(MIGRATION.nodes[0].choices.find((c) => c.id === 'a1')!.label).toContain('22%');
  });
});

describe('the text quotes what the model computes', () => {
  it('quotes the facts from the model: key ideas and quiz name the same numbers', () => {
    expect(lesson.keyIdeas[1]).toContain(`about ${FACTS.mismatchPerMin} requests a minute differ (${FACTS.mismatchRate})`);
    expect(lesson.keyIdeas[2]).toContain(`${FACTS.lost} writes`);
    expect(lesson.keyIdeas[3]).toContain(`of ${FACTS.paths} paths, ${FACTS.calmPaths} keep every meter out of the red`);
    expect(FACTS.paths).toBe(28);
    expect(FACTS.calmPaths).toBe(5);
    expect(lesson.quiz[2].options[lesson.quiz[2].answer]).toContain('0.305 percent: 0.11 from search plus 0.195 from checkout');
    expect(lesson.quiz[3].options[lesson.quiz[3].answer]).toContain('720 writes');
    expect(lesson.quiz[3].options[3]).toContain('360 writes');
    expect(FACTS.lostHalf).toBe(360);
  });

  it('has one "it depends" question that names its X and one misconception question', () => {
    expect(lesson.quiz[0].options[lesson.quiz[0].answer]).toMatch(/^It depends: low risk favours .* early learning favours/);
    expect(lesson.quiz[1].q).toContain('shadow mode');
  });
});
