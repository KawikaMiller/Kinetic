import { describe, expect, it } from 'vitest';
import { nodeDigest, nodeRandomBase64url } from '../../core/testing/nodeCrypto';
import { ATTACKER_VERIFIER, VICTIM_VERIFIER } from './model';
import { isValidVerifier, s256, VERIFIER_LENGTH } from './pkce';

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
