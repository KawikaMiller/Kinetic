import { createElement, Fragment } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { sagaFrames, twoPcFrames, type DtFrame } from './frames';
import { sagaScene, type SagaCase } from './sagaSteps';
import type { SagaStyle, SagaVariant } from './saga';
import { checkSeeds, crashEveryStep, describeTwoPcCheck, EARLY_COMMIT_SEED } from './twoPcCheck';
import { sceneOptions } from './twoPcSteps';

const text = (f: DtFrame) => renderToStaticMarkup(createElement(Fragment, null, f.say)).replace(/<[^>]+>/g, '').replace(/&#x27;/g, "'");
const SEEDS = Array.from({ length: 200 }, (_, i) => i + 1);
const SCENE_SEEDS = SEEDS.slice(0, 60);
const STYLES: SagaStyle[] = ['orch', 'chor'];
const VARIANTS: SagaVariant[] = ['idempotent', 'no-key'];
const CASES: SagaCase[] = ['happy', 'fail'];
const resultType = (f: DtFrame) => (f.row?.payload as { type?: string } | undefined)?.type;

describe('2PC captions are read from the run, not assumed', () => {
  it('the coordinator that crashed before deciding restarts to "no decision was written", for every seed', () => {
    let seen = 0;
    for (const seed of SCENE_SEEDS) {
      for (const faults of [false, true]) {
        const frames = twoPcFrames(sceneOptions('crash-before', seed, 'real', faults));
        for (const f of frames.filter((x) => x.row?.kind === 'restart')) {
          seen += 1;
          // With loss the run's own timing can make the decision before the crash: the caption follows the log either way.
          if (!faults) expect(f.facts.loggedAtCrash, `seed ${seed}`).toBeNull();
          const logged = f.facts.loggedAtCrash as string | null;
          if (logged) expect(text(f), `seed ${seed}`).toContain(logged.toUpperCase() + ' was decided');
          else expect(text(f), `seed ${seed}`).toContain('No decision was ever written');
          expect(text(f).includes('was decided'), `seed ${seed}`).toBe(logged !== null);
        }
      }
    }
    expect(seen).toBeGreaterThan(30);
  });

  it('the coordinator that crashed after deciding restarts to the decision it logged', () => {
    let seen = 0;
    for (const seed of SCENE_SEEDS) {
      const frames = twoPcFrames(sceneOptions('crash-after', seed, 'real', false));
      for (const f of frames.filter((x) => x.row?.kind === 'restart')) {
        seen += 1;
        expect(f.facts.loggedAtCrash, `seed ${seed}`).not.toBeNull();
        expect(text(f), `seed ${seed}`).toContain(`${String(f.facts.loggedAtCrash).toUpperCase()} was decided`);
      }
    }
    expect(seen).toBeGreaterThan(30);
  });

  it('"crashes before deciding" is before the decision even when Rules is broken (early commit decides on the second YES)', () => {
    let seen = 0;
    for (const seed of SCENE_SEEDS) {
      const frames = twoPcFrames(sceneOptions('crash-before', seed, 'early-commit', false));
      for (const f of frames.filter((x) => x.row?.kind === 'crash')) {
        seen += 1;
        expect(f.facts.decision, `seed ${seed}`).toBeNull();
        expect(text(f), `seed ${seed}`).toContain('before deciding');
      }
    }
    expect(seen).toBeGreaterThan(30);
  });

  it('a lost first request gives a one-frame run whose caption says so, and no other run says it', () => {
    let lost = 0;
    for (const seed of SEEDS) {
      const frames = twoPcFrames(sceneOptions('happy', seed, 'real', true));
      const says = frames.some((f) => text(f).includes('lost on the network'));
      expect(says, `seed ${seed}`).toBe(frames.length === 1);
      if (frames.length === 1) lost += 1;
    }
    expect(lost).toBeGreaterThan(0);
  });

  it('the planted-bug scene folds the endless resend frames: a short run that still reaches the violation', () => {
    const frames = twoPcFrames(sceneOptions('no', EARLY_COMMIT_SEED, 'early-commit', true));
    expect(frames.length).toBeLessThan(40);
    expect(frames.some((f) => f.violation)).toBe(true);
  });

  it('the check states liveness separately: crash runs that end with a participant still prepared', () => {
    const crashes = crashEveryStep('real', 3);
    const seeds = checkSeeds('real', 20);
    expect(crashes.blockedRuns).toBeGreaterThan(0);
    expect(describeTwoPcCheck(seeds, crashes)).toContain(`Liveness is a separate claim: ${crashes.blockedRuns} of ${crashes.runs} crash runs`);
  });
});

describe('saga captions never contradict the Consistency stat, on 200 seeds of every scene', () => {
  const frameSets = function* () {
    for (const kase of CASES)
      for (const style of STYLES)
        for (const variant of VARIANTS)
          for (const faults of [false, true])
            for (const seed of SEEDS) yield { kase, style, variant, faults, seed, frames: sagaFrames(sagaScene(kase, style, seed, variant, faults)) };
  };

  it('never says "agrees again" or "eventually consistent" on a frame whose stat is inconsistent or partial', () => {
    let claims = 0;
    for (const { kase, style, variant, faults, seed, frames } of frameSets()) {
      for (const f of frames) {
        const t = text(f);
        if (!/agrees again|Eventually consistent|^Done\./.test(t)) continue;
        claims += 1;
        const label = `${kase}/${style}/${variant}/faults ${faults}/seed ${seed}: "${f.consistency.label}"`;
        expect(f.facts.settled, label).toBe(1);
        expect(f.consistency.label, label).toMatch(/^(consistent|nothing yet)/);
      }
    }
    expect(claims).toBeGreaterThan(500);
  });

  it('choreography "Step 3 fails" on seeds 52, 58, 70 and 91 (clean network): the result frame arrives before the refund and says so', () => {
    for (const seed of [52, 58, 70, 91]) {
      const frames = sagaFrames(sagaScene('fail', 'chor', seed, 'idempotent', false));
      const result = frames.find((f) => resultType(f) === 'result')!;
      expect(result.facts.settled, `seed ${seed}`).toBe(0);
      expect(text(result), `seed ${seed}`).not.toContain('agrees again');
      expect(text(result), `seed ${seed}`).toContain(result.consistency.label);
      const last = frames.at(-1)!;
      expect(last.facts.settled, `seed ${seed}`).toBe(1);
      expect(text(last), `seed ${seed}`).toContain('simulated time');
    }
  });

  it('a run that ends inconsistent says nothing more arrives, and states the money still held when there is some', () => {
    let stuck = 0;
    let charged = 0;
    for (const { kase, style, variant, faults, seed, frames } of frameSets()) {
      const last = frames.at(-1)!;
      const label = `${kase}/${style}/${variant}/faults ${faults}/seed ${seed}`;
      if (last.facts.settled || frames.length === 1) {
        expect(text(last), label).not.toContain('Nothing more arrives');
        continue;
      }
      stuck += 1;
      expect(text(last), label).toContain('Nothing more arrives');
      expect(text(last), label).toContain(last.consistency.label);
      if (Number(last.facts.netDollars) > 0) {
        charged += 1;
        expect(text(last), label).toContain(`stays charged $${last.facts.netDollars}`);
      }
    }
    expect(stuck).toBeGreaterThan(0);
    expect(charged).toBeGreaterThan(0);
  });

  it('the stat never reads "partial: 3 of 3" without saying the order is not confirmed', () => {
    for (const { frames } of frameSets()) for (const f of frames) if (f.consistency.label.startsWith('partial: 3')) expect(f.consistency.label).toContain('not confirmed');
  });

  it('a duplicated charge request is captioned as a duplicate, with the key deciding what happens', () => {
    let dups = 0;
    for (const variant of VARIANTS) {
      for (const seed of SEEDS) {
        for (const f of sagaFrames(sagaScene('fail', 'orch', seed, variant, true))) {
          if (!f.row?.dup || resultType(f) !== 'charge') continue;
          dups += 1;
          expect(text(f)).toContain('duplicate copy');
          expect(text(f).includes('does not charge a second time')).toBe(variant === 'idempotent');
        }
      }
    }
    expect(dups).toBeGreaterThan(0);
  });
});
