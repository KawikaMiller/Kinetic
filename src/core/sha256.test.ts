import { describe, expect, it } from 'vitest';
import { toHex } from './crypto';
import { mulberry32 } from './random';
import { sha256 } from './sha256';
import { nodeDigest, nodeRandomBytes } from './testing/nodeCrypto';

const enc = new TextEncoder();
const hex = (data: Uint8Array) => toHex(sha256(data));

describe('sha256 against the NIST vectors and node:crypto', () => {
  it('matches the published vectors for "", "abc" and the 448-bit message', () => {
    expect(hex(enc.encode(''))).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(hex(enc.encode('abc'))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(hex(enc.encode('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq'))).toBe('248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1');
  });

  it('matches node:crypto on every length from 0 to 200 bytes (the padding edges around 55, 56, 63 and 64 included)', () => {
    for (let len = 0; len <= 200; len++) {
      const data = nodeRandomBytes(len);
      expect(hex(data), `length ${len}`).toBe(nodeDigest('sha256', data));
    }
  });

  it('matches node:crypto on 200 seeded inputs of lengths 0 to 300', () => {
    const rnd = mulberry32(5);
    for (let i = 0; i < 200; i++) {
      const data = Uint8Array.from({ length: Math.floor(rnd() * 301) }, () => Math.floor(rnd() * 256));
      expect(hex(data), `input ${i}`).toBe(nodeDigest('sha256', data));
    }
  });

  it('matches node:crypto on a 100,000-byte message (many blocks)', () => {
    const data = nodeRandomBytes(100_000);
    expect(hex(data)).toBe(nodeDigest('sha256', data));
  });

  it("matches the platform's crypto.subtle", async () => {
    const data = enc.encode('merkle');
    expect(hex(data)).toBe(toHex(await crypto.subtle.digest('SHA-256', data)));
  });
});
