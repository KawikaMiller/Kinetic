import { describe, expect, it } from 'vitest';
import { expectCaption } from '../../core/testing/captions';
import { ACCESS_LOG, POLICIES, RESOURCES, allowedPairs, blastRadius, keepsServiceWorking, suggestPolicy, totalPairs } from './account';
import { blastCaption, credCaption } from './captions';
import { exposures } from './credentials';

describe('blast caption, for every policy and both compromise states', () => {
  const options = [...POLICIES.map((p) => p.statements), suggestPolicy(ACCESS_LOG)];
  it('states the radius, the allowed actions and whether the service works, all from the model', () => {
    for (const statements of options) {
      for (const compromised of [false, true]) {
        const text = expectCaption(blastCaption(statements, compromised));
        const n = blastRadius(statements).length;
        expect(text).toContain(`${n} of ${RESOURCES.length} resources`);
        expect(text).toContain(`allowed ${allowedPairs(statements)} of ${totalPairs} actions`);
        expect(text.includes('The service would break')).toBe(!keepsServiceWorking(statements, ACCESS_LOG));
        expect(text.includes('If reports-api is compromised')).toBe(compromised);
      }
    }
  });
});

describe('credential caption', () => {
  it('says nothing about a copy before the leak, and the true remaining time after it', () => {
    for (let leak = 1; leak < 20; leak++) {
      for (let now = 0; now <= 60; now += 3) {
        const text = expectCaption(credCaption(leak, 10, now));
        if (now < leak) {
          expect(text).toContain(`minute ${leak}`);
          expect(text).not.toContain('still works for');
          continue;
        }
        const e = exposures(leak, 10);
        expect(text.includes('no longer')).toBe(leak + e.role <= now || leak + e.vault <= now);
        if (leak + e.role > now) expect(text).toContain('more');
      }
    }
  });
});
