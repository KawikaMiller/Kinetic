import { describe, expect, it } from 'vitest';
import { toHex } from '../../core/crypto';
import { nodeDigest, nodeRandomBase64url, nodeRandomBytes } from '../../core/testing/nodeCrypto';
import { ATTACKER_VERIFIER, VICTIM_VERIFIER } from './model';
import { isValidVerifier, s256, sha256, VERIFIER_LENGTH } from './pkce';

const enc = new TextEncoder();


describe('sha256', () => {
  it('matches the NIST vectors for "", "abc" and the 448-bit message', () => {
    expect(toHex(sha256(enc.encode('')))).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(toHex(sha256(enc.encode('abc')))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(toHex(sha256(enc.encode('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq')))).toBe(
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
    );
  });

  it('matches node:crypto on every length from 0 to 200 bytes (the padding edge cases around 55, 56, 63, 64 included)', () => {
    for (let len = 0; len <= 200; len++) {
      const data = nodeRandomBytes(len);
      expect(toHex(sha256(data)), `length ${len}`).toBe(nodeDigest('sha256', data));
    }
  });

  it('matches node:crypto on a 100,000-byte message (many blocks)', () => {
    const data = nodeRandomBytes(100_000);
    expect(toHex(sha256(data))).toBe(nodeDigest('sha256', data));
  });
});

describe('the PKCE S256 transform', () => {
  it('turns the specification\'s example code_verifier into its published code_challenge', () => {
    expect(s256('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
  });

  it('equals base64url of node:crypto\'s SHA-256, with no padding, for random verifiers', () => {
    for (let i = 0; i < 50; i++) {
      const verifier = nodeRandomBase64url(32);
      expect(s256(verifier)).toBe(nodeDigest('sha256', verifier, 'base64url'));
      expect(s256(verifier)).not.toContain('=');
    }
  });

  it('the lesson\'s fake verifiers are 43 to 128 characters from the allowed set, and differ', () => {
    for (const v of [VICTIM_VERIFIER, ATTACKER_VERIFIER]) {
      expect(isValidVerifier(v), v).toBe(true);
      expect(v.length).toBeGreaterThanOrEqual(VERIFIER_LENGTH.min);
    }
    expect(VICTIM_VERIFIER).not.toBe(ATTACKER_VERIFIER);
    expect(isValidVerifier('short')).toBe(false);
    expect(isValidVerifier('a'.repeat(129))).toBe(false);
    expect(isValidVerifier(`${'a'.repeat(43)}!`)).toBe(false);
  });
});
