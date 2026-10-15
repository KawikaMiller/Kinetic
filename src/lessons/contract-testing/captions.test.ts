import { describe, expect, it } from 'vitest';
import { expectCaption } from '../../core/testing/captions';
import { consumerCaption, costCaption, deployCaption, meaningCaption, providerCaption } from './captions';
import { START_CHOICE } from './choices';
import type { MatcherType } from './contract';
import { DEFAULT_CONSUMER, FIELDS, coverage, matcherFits, type ConsumerOptions, type Field } from './consumer';
import { SERVICES, costOf, maxEdges } from './cost';
import { START_WORLD, providerGate, releaseProvider, setConsumerLive } from './deploy';
import { CHANGES, handle, type ChangeId } from './provider';

const ALL: ConsumerOptions = { showEmail: true, showPlan: true };
const OPTIONS: ConsumerOptions[] = [DEFAULT_CONSUMER, { showEmail: true, showPlan: false }, { showEmail: false, showPlan: true }, ALL];

describe('consumer captions follow the contract the learner wrote', () => {
  it('flag exactly the missing, extra and too-loose fields, for every option and every subset of named fields', () => {
    const matchers: MatcherType[] = ['integer', 'any'];
    for (const o of OPTIONS) {
      for (let mask = 0; mask < 32; mask++) {
        for (const m of matchers) {
          const chosen: Partial<Record<Field, MatcherType>> = Object.fromEntries(FIELDS.filter((_, i) => mask & (1 << i)).map((f) => [f, m]));
          const text = expectCaption(consumerCaption(o, chosen));
          const named = Object.keys(chosen) as Field[];
          const { missing, extra } = coverage(named, o);
          expect(text.includes('could remove'), `${mask} ${m}`).toBe(missing.length > 0);
          expect(text.includes('never read'), `${mask} ${m}`).toBe(extra.length > 0);
          expect(text.includes('lets through a value'), `${mask} ${m}`).toBe(named.some((f) => !matcherFits(f, chosen[f]!, o).fits));
        }
      }
    }
  });

  it('pins the default and the email case', () => {
    expect(consumerCaption(DEFAULT_CONSUMER, START_CHOICE)).toBe(
      'The page reads id, name and amount. Your contract: it names exactly what the page reads, each with a matcher the page survives.',
    );
    expect(consumerCaption({ showEmail: true, showPlan: false }, START_CHOICE)).toBe(
      'The page reads id, name, email and amount. Your contract: the page also reads email, so a provider could remove it unnoticed.',
    );
  });
});

describe('provider captions count what the screen counts', () => {
  it('state the mismatch counts of the contract and of the full-schema test, for every subset of changes', () => {
    const ids = CHANGES.map((c) => c.id);
    for (const o of [DEFAULT_CONSUMER, ALL]) {
      for (let mask = 0; mask < 1 << ids.length; mask++) {
        const changes = new Set<ChangeId>(ids.filter((_, i) => mask & (1 << i)));
        const text = expectCaption(providerCaption(o, changes));
        expect(text).toContain(`${changes.size} change${changes.size === 1 ? '' : 's'} applied`);
        expect(text.includes('every field the consumer reads is still there'), `${mask}`).toBe(text.includes('the contract reports 0 mismatches'));
      }
    }
    expect(handle(new Set()).status).toBe(200);
  });

  it('pins removing the unused email: the contract reports 0, the full-schema test 1', () => {
    expect(providerCaption(DEFAULT_CONSUMER, new Set<ChangeId>(['remove-email']))).toBe(
      '1 change applied: the contract reports 0 mismatches (every field the consumer reads is still there with the right type), while a full-schema test would report 1 mismatch.',
    );
  });
});

describe('deploy and meaning captions', () => {
  it('say what the gate says for the starting world, and after the learner changes it', () => {
    expect(deployCaption(START_WORLD)).toBe(
      "Provider v2 cannot go out: consumer v2's contract fails ($.body.email: expected string, got nothing). 1 live consumer blocking it.",
    );
    const off = setConsumerLive(START_WORLD, 1, false);
    expect(deployCaption(off)).toContain('Provider v2 can go out');
    expect(providerGate(off, 1).ok).toBe(true);
    expect(deployCaption(releaseProvider({ ...off, liveProvider: 1 }, 'add-nickname'))).toContain('Provider v3 can go out');
  });

  it('says the contract passes and the page charges $0.25 for dollars, $25.00 for cents', () => {
    expect(meaningCaption(true, DEFAULT_CONSUMER)).toBe('Cents to dollars: the contract passes, and the page renders "#42 | ADA | charge $0.25".');
    expect(meaningCaption(false, DEFAULT_CONSUMER)).toBe('The unchanged provider: the contract passes, and the page renders "#42 | ADA | charge $25.00".');
  });

  it('states the cost counts at the slider extremes', () => {
    for (const n of [SERVICES.min, 8, SERVICES.max]) {
      for (const e of [1, n, maxEdges(n)]) {
        const c = costOf(n, e);
        expect(expectCaption(costCaption(n, e))).toContain(`an end-to-end run needs ${c.e2eDeployed} deployed together`);
        expect(costCaption(n, e)).toContain(`${c.verifications} dependency edge`);
      }
    }
  });
});
