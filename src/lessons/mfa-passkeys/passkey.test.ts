import { describe, expect, it } from 'vitest';
import { Authenticator, LOOKALIKE_ORIGIN, REAL_ORIGIN, makeProof, signedData, verifyAssertion } from './passkey';

const challenge = (n: number) => Uint8Array.from({ length: 16 }, (_, i) => (i * 7 + n) & 255);

describe('origin-bound assertions', () => {
  it('a signature over (challenge, real origin) verifies for the real origin only', async () => {
    const a = new Authenticator();
    const pub = (await a.register(REAL_ORIGIN))!;
    for (let n = 0; n < 8; n++) {
      const c = challenge(n);
      const sig = (await a.assert(REAL_ORIGIN, c))!;
      expect(await verifyAssertion(pub, sig, c, REAL_ORIGIN)).toBe(true);
      expect(await verifyAssertion(pub, sig, c, LOOKALIKE_ORIGIN)).toBe(false);
      expect(await verifyAssertion(pub, sig, challenge(n + 100), REAL_ORIGIN)).toBe(false);
    }
  });

  it('the authenticator produces no assertion for an origin it has no credential for', async () => {
    const a = new Authenticator();
    await a.register(REAL_ORIGIN);
    expect(a.hasCredentialFor(LOOKALIKE_ORIGIN)).toBe(false);
    expect(await a.assert(LOOKALIKE_ORIGIN, challenge(1))).toBeNull();
  });

  it('a credential made for the look-alike is a different key, which the real server does not trust', async () => {
    const a = new Authenticator();
    const realPub = (await a.register(REAL_ORIGIN))!;
    await a.register(LOOKALIKE_ORIGIN);
    const c = challenge(3);
    const fakeSig = (await a.assert(LOOKALIKE_ORIGIN, c))!;
    expect(await verifyAssertion(realPub, fakeSig, c, REAL_ORIGIN)).toBe(false);
  });

  it('signed data is challenge, a separator, then the origin', () => {
    expect(Array.from(signedData(new Uint8Array([1, 2]), 'ab'))).toEqual([1, 2, 0, 97, 98]);
  });

  it('the lesson proof states the same facts', async () => {
    const p = (await makeProof())!;
    expect(p.signature.length).toBe(64);
    expect(p.signatureHex.length).toBe(128);
    expect(p.verifiesForReal).toBe(true);
    expect(p.verifiesForLookalike).toBe(false);
    expect(p.lookalikeAssertion).toBeNull();
  });
});
