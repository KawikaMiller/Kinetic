import { describe, expect, it } from 'vitest';
import { nodeDigest, nodeHmac, nodeRandomBase64url, nodeRandomBytes } from './nodeCrypto';

const enc = new TextEncoder();

describe('core/testing/nodeCrypto', () => {
  it('digests match the NIST and RFC 4231 published vectors', () => {
    expect(nodeDigest('sha256', 'abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(nodeDigest('sha256', enc.encode(''), 'hex')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    // RFC 4231 test case 2
    expect(nodeHmac('sha256', 'Jefe', 'what do ya want for nothing?')).toBe('5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843');
  });

  it('random bytes have the size asked for and differ between calls; base64url has no padding', () => {
    expect(nodeRandomBytes(32)).toHaveLength(32);
    expect(nodeRandomBytes(32)).not.toEqual(nodeRandomBytes(32));
    expect(nodeRandomBase64url(32)).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });
});
