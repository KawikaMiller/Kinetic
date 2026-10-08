import { describe, expect, it } from 'vitest';
import { expectCaption } from '../../core/testing/captions';
import { buildFrames, chargedText, toneOf } from './frames';
import { BODY, FAILURES, OTHER_BODY, TTL_H, charges, duplicateRows, raceScenario, retryScenario, reuseScenario, type Step } from './model';

const text = (n: Parameters<typeof expectCaption>[0]) => expectCaption(n).replace(/\s+/g, ' ');

/** Every "charged N" a caption states equals the ledger at that step, and only duplicates are red. */
function checkAll(steps: Step[]) {
  const frames = buildFrames(steps, 'intro');
  expect(frames).toHaveLength(steps.length + 2);
  frames.slice(1, -1).forEach((f) => {
    const s = steps[f.at];
    const t = text(f.say);
    const n = charges(s.server);
    const claims = [...t.matchAll(/charged (once|twice|\d+ times)/g)].map((m) => m[0]);
    for (const c of claims) expect(c).toBe(chargedText(n));
    if (s.kind === 'charged') expect(toneOf(s)).toBe(duplicateRows(s.server).length ? 'bad' : 'ok');
  });
  const end = text(frames[frames.length - 1].say);
  expect(end).toContain(chargedText(charges(steps[steps.length - 1].server)));
  return end;
}

describe('captions follow the ledger, in every combination', () => {
  for (const { id } of FAILURES)
    for (const key of [true, false])
      for (let fails = 1; fails <= 3; fails++)
        it(`${id}, key ${key}, fails ${fails}`, () => {
          const steps = retryScenario(id, key, fails);
          const end = checkAll(steps);
          expect(end).toContain('The client ended with 201 Created.');
          if (key) expect(end).toContain('charged once');
        });
  it('the race, with and without claiming the key first', () => {
    expect(checkAll(raceScenario(true))).toContain('charged once');
    expect(checkAll(raceScenario(false))).toContain('charged twice');
  });
  for (const after of [0.1, 1, TTL_H, TTL_H + 1, 72])
    for (const body of [BODY, OTHER_BODY])
      it(`reuse after ${after} h with ${body === BODY ? 'the same' : 'a different'} body`, () => {
        const steps = reuseScenario(after, body);
        const end = checkAll(steps);
        if (body === OTHER_BODY && after <= TTL_H) expect(end).toContain('without a success response');
        if (body === BODY && after > TTL_H) {
          expect(end).toContain('charged twice');
          expect(end).toContain('one payment');
          expect(end).toContain('duplicate');
        }
        if (body === OTHER_BODY && after > TTL_H) {
          // The review's repro: after expiry a different amount is a new payment, not a duplicate.
          expect(end).toContain('two different payments');
          expect(end).toContain('€25.00 and €99.00');
          expect(end).not.toContain('one payment');
          expect(end).not.toContain('the duplicate');
          expect(duplicateRows(steps[steps.length - 1].server)).toEqual([]);
          const row2 = text(buildFrames(steps, 'x').find((f) => f.at >= 0 && f.at < steps.length && steps[f.at].kind === 'charged' && charges(steps[f.at].server) === 2)!.say);
          expect(row2).toContain('a different payment');
          expect(row2).not.toContain('for one payment');
        }
      });
});

describe('message colours', () => {
  it('lost requests and responses are red, replays violet, refusals orange', () => {
    const lost = retryScenario('response-lost', true, 1);
    expect(lost.filter((s) => s.lost).map(toneOf)).toEqual(['bad']);
    expect(toneOf(lost[lost.length - 1])).toBe('violet');
    expect(retryScenario('client-timeout', true, 1).filter((s) => s.kind === 'reject').map(toneOf)).toEqual(['orange']);
    expect(toneOf(retryScenario('request-lost', true, 1)[0])).toBe('bad');
  });
});
