import { describe, expect, it } from 'vitest';
import {
  aesBlockEncrypt, aesCbcRawDecrypt, aesCbcRawEncrypt, ecdsaKeyPair, ecdsaSign, ecdsaVerify, enc, hexToBytes, hmac, hmacSha256, hotp, toHex, totp,
} from './crypto';

const fill = (byte: number, n: number) => new Uint8Array(n).fill(byte);

describe('hmac', () => {
  // RFC 4231 §4: HMAC-SHA-256 test cases 1, 2, 3 and 6 (a key longer than the block)
  const rfc4231: [Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>, string][] = [
    [fill(0x0b, 20), enc.encode('Hi There'), 'b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7'],
    [enc.encode('Jefe'), enc.encode('what do ya want for nothing?'), '5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843'],
    [fill(0xaa, 20), fill(0xdd, 50), '773ea91e36800e46854db8ebd09181a72959098b3ef8c122d9635514ced565fe'],
    [fill(0xaa, 131), enc.encode('Test Using Larger Than Block-Size Key - Hash Key First'), '60e431591ee0b67f0d8a26aacbf5b77f8e0bc6213728c5140546040f0ee37f54'],
  ];

  it('matches the RFC 4231 HMAC-SHA-256 vectors', async () => {
    for (const [key, data, expected] of rfc4231) expect(await hmac(key, data, { hash: 'SHA-256', out: 'hex' })).toBe(expected);
  });

  it('matches the RFC 2202 HMAC-SHA-1 vector and returns bytes on request', async () => {
    expect(await hmac(fill(0x0b, 20), enc.encode('Hi There'), { hash: 'SHA-1', out: 'hex' })).toBe('b617318655057264e28bc0b6fb378c8ef146be00');
    const bytes = await hmac(enc.encode('Jefe'), enc.encode('what do ya want for nothing?'), { hash: 'SHA-256', out: 'bytes' });
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(toHex(bytes!)).toBe(rfc4231[1][2]);
  });

  it('keeps hmacSha256 (the string helper) unchanged', async () => {
    expect(await hmacSha256('Jefe', 'what do ya want for nothing?', 'hex')).toBe(rfc4231[1][2]);
    expect(await hmacSha256('Jefe', 'what do ya want for nothing?', 'b64url')).toBe('W9zBRr9gdU5qBCQmCJV1x1oAPwidJzmDnexYuWTsOEM');
  });
});

describe('hotp / totp', () => {
  // RFC 4226 appendix D: counters 0..9 with the ASCII key "12345678901234567890"
  const ascii20 = enc.encode('12345678901234567890');
  it('matches the RFC 4226 HOTP vectors', async () => {
    const expected = ['755224', '287082', '359152', '969429', '338314', '254676', '287922', '162583', '399871', '520489'];
    for (let c = 0; c < 10; c++) expect(await hotp(ascii20, c)).toBe(expected[c]);
  });

  // RFC 6238 appendix B: 8 digits, 30-second steps, one key per hash
  const times = [59, 1111111109, 1111111111, 1234567890, 2000000000, 20000000000];
  it('matches the RFC 6238 TOTP vectors for SHA-1', async () => {
    const expected = ['94287082', '07081804', '14050471', '89005924', '69279037', '65353130'];
    for (let i = 0; i < times.length; i++) expect(await totp(ascii20, times[i], { digits: 8 })).toBe(expected[i]);
  });

  it('matches the RFC 6238 TOTP vectors for SHA-256', async () => {
    const ascii32 = enc.encode('12345678901234567890123456789012');
    const expected = ['46119246', '68084774', '67062674', '91819424', '90698825', '77737706'];
    for (let i = 0; i < times.length; i++) expect(await totp(ascii32, times[i], { digits: 8, hash: 'SHA-256' })).toBe(expected[i]);
  });

  it('the code holds for a whole 30-second step, then changes', async () => {
    expect(await totp(ascii20, 60)).toBe(await totp(ascii20, 89));
    expect(await totp(ascii20, 89)).not.toBe(await totp(ascii20, 90));
  });
});

describe('aesBlockEncrypt', () => {
  it('matches FIPS-197 appendix C.1 (AES-128)', async () => {
    const out = await aesBlockEncrypt(hexToBytes('000102030405060708090a0b0c0d0e0f'), hexToBytes('00112233445566778899aabbccddeeff'));
    expect(toHex(out!)).toBe('69c4e0d86a7b0430d8cdb78070b4c55a');
  });

  it('matches FIPS-197 appendix C.3 (AES-256)', async () => {
    const key = hexToBytes('000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f');
    expect(toHex((await aesBlockEncrypt(key, hexToBytes('00112233445566778899aabbccddeeff')))!)).toBe('8ea2b7ca516745bfeafc49904b496089');
  });

  it('is deterministic: equal blocks give equal ciphertext (why ECB leaks)', async () => {
    const key = fill(7, 16);
    const a = await aesBlockEncrypt(key, fill(0x41, 16));
    const b = await aesBlockEncrypt(key, fill(0x41, 16));
    expect(a).toEqual(b);
    expect(a).toHaveLength(16);
  });

  it('refuses anything but one 16-byte block', async () => {
    await expect(aesBlockEncrypt(fill(0, 16), fill(0, 15))).rejects.toThrow(RangeError);
  });
});

describe('hexToBytes', () => {
  it('reads either case and round-trips through toHex', () => {
    expect([...hexToBytes('00ff7fA0')]).toEqual([0, 255, 127, 160]);
    expect(hexToBytes('')).toEqual(new Uint8Array(0));
    const all = Uint8Array.from({ length: 256 }, (_, i) => i);
    expect(hexToBytes(toHex(all))).toEqual(all);
  });
  it('refuses odd lengths and anything that is not hex, instead of guessing', () => {
    for (const bad of ['abc', '0g', 'zz', '0x00', '00 11', '-1']) expect(() => hexToBytes(bad), bad).toThrow(RangeError);
  });
});

describe('aesCbcRawEncrypt / aesCbcRawDecrypt (no padding)', () => {
  // NIST SP 800-38A F.2.1 / F.2.2: CBC-AES128.
  const KEY = hexToBytes('2b7e151628aed2a6abf7158809cf4f3c');
  const IV = hexToBytes('000102030405060708090a0b0c0d0e0f');
  const PLAIN = hexToBytes('6bc1bee22e409f96e93d7e117393172a' + 'ae2d8a571e03ac9c9eb76fac45af8e51' + '30c81c46a35ce411e5fbc1191a0a52ef' + 'f69f2445df4f9b17ad2b417be66c3710');
  const CIPHER = '7649abac8119b246cee98e9b12e9197d' + '5086cb9b507219ee95db113a917678b2' + '73bed6b8e3c1743b7116e69e22229516' + '3ff1caa1681fac09120eca307586e1a7';
  it('matches SP 800-38A F.2.1 with no padding block, and F.2.2 decrypts it back', async () => {
    const ct = (await aesCbcRawEncrypt(KEY, IV, PLAIN))!;
    expect(ct.length).toBe(PLAIN.length);
    expect(toHex(ct)).toBe(CIPHER);
    expect(toHex((await aesCbcRawDecrypt(KEY, IV, hexToBytes(CIPHER)))!)).toBe(toHex(PLAIN));
  });
  it('decrypts a tampered ciphertext to garbled bytes instead of throwing a padding error', async () => {
    const bad = hexToBytes(CIPHER);
    bad[40] ^= 0x01; // block 2
    const out = (await aesCbcRawDecrypt(KEY, IV, bad))!;
    expect(out.length).toBe(PLAIN.length);
    expect(out[40 + 16] ^ PLAIN[40 + 16]).toBe(0x01); // the same bit flips in the next block
    expect(toHex(out.slice(0, 32))).toBe(toHex(PLAIN.slice(0, 32))); // blocks before are untouched
  });
  it('handles an empty message and refuses partial blocks', async () => {
    expect((await aesCbcRawEncrypt(KEY, IV, new Uint8Array(0)))!.length).toBe(0);
    expect((await aesCbcRawDecrypt(KEY, IV, new Uint8Array(0)))!.length).toBe(0);
    await expect(aesCbcRawEncrypt(KEY, IV, new Uint8Array(15))).rejects.toThrow(RangeError);
    await expect(aesCbcRawDecrypt(KEY, IV, new Uint8Array(17))).rejects.toThrow(RangeError);
  });
});

describe('ecdsa', () => {
  it('signs and verifies; one flipped byte in the message or the signature fails', async () => {
    const pair = (await ecdsaKeyPair())!;
    const msg = enc.encode('release v1.4.2');
    const sig = (await ecdsaSign(pair.privateKey, msg))!;
    expect(sig).toHaveLength(64);
    expect(await ecdsaVerify(pair.publicKey, sig, msg)).toBe(true);

    const tamperedMsg = msg.slice();
    tamperedMsg[3] ^= 0x01;
    expect(await ecdsaVerify(pair.publicKey, sig, tamperedMsg)).toBe(false);

    const tamperedSig = sig.slice();
    tamperedSig[10] ^= 0x01;
    expect(await ecdsaVerify(pair.publicKey, tamperedSig, msg)).toBe(false);
  });

  it("another key pair's public key rejects the signature", async () => {
    const [a, b] = await Promise.all([ecdsaKeyPair(), ecdsaKeyPair()]);
    const msg = enc.encode('hello');
    const sig = (await ecdsaSign(a!.privateKey, msg))!;
    expect(await ecdsaVerify(b!.publicKey, sig, msg)).toBe(false);
  });
});
