import { describe, expect, it } from 'vitest';
import { aesRoundTrip, asymDemo, sha256Many } from './crypto';
import { MESSAGE, RELEASE, TAMPERED } from './keyModel';
import { SHA256 } from './testVectors';
import { toHex } from '../../core/crypto';

describe('SHA-256 (lanes ① and ②)', () => {
  it('matches the published empty-string vector and node’s own SHA-256', async () => {
    const inputs = Object.keys(SHA256);
    const out = await sha256Many(inputs);
    expect(out[inputs.indexOf('')]).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(out).toEqual(inputs.map((i) => SHA256[i]));
    for (const h of out) expect(h).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('AES-256-GCM (lane ③)', () => {
  it('really encrypts and decrypts the message', async () => {
    const r = (await aesRoundTrip(MESSAGE))!;
    expect(r.decrypted).toBe(MESSAGE);
    expect(r.keyHex).toHaveLength(64); // 256-bit key
    expect(r.ivHex).toHaveLength(24); // 96-bit nonce
    expect(r.cipherHex).toHaveLength((MESSAGE.length + 16) * 2); // ciphertext + 16-byte tag
    expect(r.cipherHex).not.toContain(toHex(new TextEncoder().encode(MESSAGE)));
  });

  it('a fresh key every time, so the same message never gives the same ciphertext', async () => {
    const [a, b] = await Promise.all([aesRoundTrip(MESSAGE), aesRoundTrip(MESSAGE)]);
    expect(a!.cipherHex).not.toBe(b!.cipherHex);
  });
});

describe('RSA-OAEP and ECDSA (lane ④)', () => {
  it('the card’s ciphertext is real: RSA-2048 output that decrypts back to the message', async () => {
    const d = (await asymDemo(MESSAGE, RELEASE, TAMPERED))!;
    expect(d.cipherHex).toHaveLength(512); // 2048-bit modulus = 256 bytes
    expect(d.decrypted).toBe(MESSAGE);
  });

  it('the signature verifies for the release and fails for the tampered text, as the badges show', async () => {
    const d = (await asymDemo(MESSAGE, RELEASE, TAMPERED))!;
    expect(d.valid).toBe(true);
    expect(d.tamperedValid).toBe(false);
    expect(d.sigHex).toHaveLength(128); // P-256 r‖s
  });
}, 20_000);
