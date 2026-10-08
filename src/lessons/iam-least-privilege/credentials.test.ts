import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ROTATION_MIN, KEY_ROTATION_MINUTES, ROLE_MINUTES, exposure, exposures, expiresAt, isValid, laneBars, vaultCredentialAt, vaultCredentials,
} from './credentials';

describe('a credential and the lesson clock', () => {
  it('is valid from issue up to, not including, expiry', () => {
    const c = { issuedAt: 5, ttl: 15 };
    expect(isValid(c, 4)).toBe(false);
    expect(isValid(c, 5)).toBe(true);
    expect(isValid(c, 19)).toBe(true);
    expect(isValid(c, 20)).toBe(false);
    expect(expiresAt(c)).toBe(20);
  });

  it('exposure after a leak is the time left, and zero once dead', () => {
    const c = { issuedAt: 0, ttl: ROLE_MINUTES };
    for (let leak = 0; leak < 30; leak++) expect(exposure(c, leak)).toBe(leak < ROLE_MINUTES ? ROLE_MINUTES - leak : 0);
  });
});

describe('exposure of the three credential styles', () => {
  it('the role stops working on its own: leak time plus exposure is the lifetime', () => {
    for (let leak = 0; leak < ROLE_MINUTES; leak++) expect(leak + exposures(leak, DEFAULT_ROTATION_MIN).role).toBe(ROLE_MINUTES);
  });

  it('the long-lived key stays valid far beyond anything on the clock', () => {
    for (let leak = 0; leak < 60; leak++) expect(exposures(leak, DEFAULT_ROTATION_MIN).key).toBe(KEY_ROTATION_MINUTES - leak);
    expect(exposures(5, 10).key).toBeGreaterThan(100 * exposures(5, 10).role);
  });

  it('the vault credential matches a minute-by-minute brute force for every rotation period and leak time', () => {
    for (const rotation of [5, 10, 15, 20, 30]) {
      const creds = vaultCredentials(rotation, 90);
      for (let leak = 0; leak < 60; leak++) {
        const leaked = creds.find((c) => isValid(c, leak))!;
        let minutes = 0;
        while (isValid(leaked, leak + minutes)) minutes++;
        expect(exposures(leak, rotation).vault).toBe(minutes);
        expect(vaultCredentialAt(rotation, leak)).toEqual(leaked);
      }
    }
  });

  it('vault credentials tile the timeline with no gap or overlap', () => {
    const creds = vaultCredentials(10, 60);
    expect(creds.length).toBe(6);
    creds.forEach((c, i) => {
      expect(c.issuedAt).toBe(i * 10);
      if (i > 0) expect(expiresAt(creds[i - 1])).toBe(c.issuedAt);
    });
  });
});

describe('lane bars', () => {
  it('tile each lane from 0 to the end of the clock with no gap or overlap, for every leak time and clock reading', () => {
    for (const rotation of [5, 10, 30]) {
      for (let leak = 1; leak <= 55; leak += 3) {
        for (let now = 0; now <= 60; now += 5) {
          const bars = laneBars(leak, rotation, now);
          for (const lane of ['key', 'role', 'vault'] as const) {
            const mine = bars.filter((b) => b.lane === lane).sort((a, b) => a.start - b.start);
            expect(mine[0].start).toBe(0);
            expect(mine.at(-1)!.end).toBe(60);
            mine.forEach((b, i) => {
              expect(b.end).toBeGreaterThan(b.start);
              if (i > 0) expect(b.start).toBe(mine[i - 1].end);
            });
          }
        }
      }
    }
  });

  it('a leaked copy exists only once the clock has reached the leak, and starts at the leak', () => {
    for (let now = 0; now <= 60; now++) {
      const copies = laneBars(7, 10, now).filter((b) => b.tone !== 'info');
      expect(copies.length > 0).toBe(now >= 7);
      for (const c of copies) expect(c.start).toBe(7);
    }
  });

  it('the copy is bad until its credential expires and dim afterwards; the key copy never expires on this clock', () => {
    for (let now = 7; now <= 60; now++) {
      const by = (lane: string) => laneBars(7, 10, now).find((b) => b.lane === lane && b.tone !== 'info')!;
      expect(by('key').tone).toBe('bad');
      expect(by('role').tone).toBe(now < ROLE_MINUTES ? 'bad' : 'dim');
      expect(by('vault').tone).toBe(now < 10 ? 'bad' : 'dim');
    }
  });

  it('the copy in the role and vault lanes ends exactly leak + exposure from the model', () => {
    for (let leak = 1; leak < 15; leak++) {
      const e = exposures(leak, 10);
      const end = (lane: string) => laneBars(leak, 10, leak).find((b) => b.lane === lane && b.tone !== 'info')!.end;
      expect(end('role')).toBe(leak + e.role);
      expect(end('vault')).toBe(leak + e.vault);
    }
  });
});
