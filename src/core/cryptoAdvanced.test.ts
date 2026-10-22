import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  aesGcmDecrypt, aesGcmEncrypt, ecdhDerive, ecdhImportPrivate, ecdhImportPublicPoint, ecdhKeyPair, enc, exportPrivateScalar, exportPublicPoint, hexToBytes, hkdf, HKDF_MAX_BYTES,
  toHex,
} from './crypto';
import { mul, P256 } from './ecc';
import { mulberry32 } from './random';
import { nodeAesGcmOpen, nodeAesGcmSeal, nodeEcdhPublic, nodeEcdhSecret, nodeHkdf } from './testing/nodeCrypto';

afterEach(() => vi.unstubAllGlobals());

const seededBytes = (rnd: () => number, n: number) => Uint8Array.from({ length: n }, () => Math.floor(rnd() * 256));

describe('hkdf', () => {
  it('RFC 5869 test case 1 (typed from memory, and verified against node:crypto hkdfSync below)', async () => {
    const ikm = new Uint8Array(22).fill(0x0b);
    const salt = hexToBytes('000102030405060708090a0b0c');
    const info = hexToBytes('f0f1f2f3f4f5f6f7f8f9');
    const okm = '3cb25f25faacd57a90434f64d0362f2a2d2d0a90cf1a5a4c5db02d56ecc4c5bf34007208d5b887185865';
    expect(toHex((await hkdf(ikm, salt, info, 42))!)).toBe(okm);
    expect(toHex(nodeHkdf(ikm, salt, info, 42))).toBe(okm);
  });

  it('equals node:crypto hkdfSync on 100 seeded inputs, empty salt and info included', async () => {
    const rnd = mulberry32(99);
    for (let i = 0; i < 100; i++) {
      const ikm = seededBytes(rnd, 1 + Math.floor(rnd() * 64));
      const salt = seededBytes(rnd, i % 5 === 0 ? 0 : Math.floor(rnd() * 40));
      const info = seededBytes(rnd, i % 7 === 0 ? 0 : Math.floor(rnd() * 40));
      const length = 1 + Math.floor(rnd() * 120);
      expect(toHex((await hkdf(ikm, salt, info, length))!)).toBe(toHex(nodeHkdf(ikm, salt, info, length)));
    }
  });

  it('refuses a length outside 1..8160', async () => {
    const one = new Uint8Array(1);
    for (const bad of [0, -1, 1.5, HKDF_MAX_BYTES + 1]) await expect(hkdf(one, one, one, bad)).rejects.toThrow(/hkdf: length/);
    expect((await hkdf(one, one, one, HKDF_MAX_BYTES))!.length).toBe(HKDF_MAX_BYTES);
  });
});

describe('AES-GCM', () => {
  const key = seededBytes(mulberry32(1), 32);
  const iv = seededBytes(mulberry32(2), 12);
  const aad = enc.encode('header');
  const message = enc.encode('hello, kinetic');

  it('round-trips, appends a 16-byte tag, and equals the node:crypto seal for all three key sizes', async () => {
    for (const keyLength of [16, 24, 32]) {
      const k = key.slice(0, keyLength);
      const sealed = (await aesGcmEncrypt(k, iv, message, aad))!;
      expect(sealed).toHaveLength(message.length + 16);
      expect(toHex(sealed)).toBe(toHex(nodeAesGcmSeal(k, iv, message, aad)));
      expect(toHex((await aesGcmDecrypt(k, iv, sealed, aad))!)).toBe(toHex(message));
    }
    const noAad = (await aesGcmEncrypt(key, iv, message))!;
    expect(toHex((await aesGcmDecrypt(key, iv, noAad))!)).toBe(toHex(message));
  });

  it('the node:crypto open oracle returns the plaintext for the real seal and null for a wrong key, wrong aad or a flipped bit', () => {
    const sealed = nodeAesGcmSeal(key, iv, message, aad);
    expect(toHex(nodeAesGcmOpen(key, iv, sealed, aad)!)).toBe(toHex(message));
    expect(nodeAesGcmOpen(key.map((b) => b ^ 1), iv, sealed, aad)).toBeNull();
    expect(nodeAesGcmOpen(key, iv, sealed, new Uint8Array(aad.length + 1))).toBeNull();
    expect(nodeAesGcmOpen(key, iv, sealed)).toBeNull();
    const flipped = Uint8Array.from(sealed);
    flipped[0] ^= 1;
    expect(nodeAesGcmOpen(key, iv, flipped, aad)).toBeNull();
  });

  it('REJECTS a flipped bit anywhere in ciphertext or tag (200 seeded flips) with the real OperationError', async () => {
    const sealed = (await aesGcmEncrypt(key, iv, message, aad))!;
    const rnd = mulberry32(7);
    for (let i = 0; i < 200; i++) {
      const bad = sealed.slice();
      bad[Math.floor(rnd() * bad.length)] ^= 1 << Math.floor(rnd() * 8);
      await expect(aesGcmDecrypt(key, iv, bad, aad)).rejects.toMatchObject({ name: 'OperationError' });
    }
  });

  it('REJECTS a wrong key, a wrong nonce and a changed associated-data byte', async () => {
    const sealed = (await aesGcmEncrypt(key, iv, message, aad))!;
    const wrongKey = key.slice();
    wrongKey[0] ^= 1;
    await expect(aesGcmDecrypt(wrongKey, iv, sealed, aad)).rejects.toMatchObject({ name: 'OperationError' });
    const wrongIv = iv.slice();
    wrongIv[11] ^= 1;
    await expect(aesGcmDecrypt(key, wrongIv, sealed, aad)).rejects.toMatchObject({ name: 'OperationError' });
    await expect(aesGcmDecrypt(key, iv, sealed, enc.encode('headeR'))).rejects.toMatchObject({ name: 'OperationError' });
    await expect(aesGcmDecrypt(key, iv, sealed)).rejects.toMatchObject({ name: 'OperationError' });
  });

  it('refuses a key or nonce of the wrong length before touching Web Crypto', async () => {
    await expect(aesGcmEncrypt(new Uint8Array(10), iv, message)).rejects.toThrow('aesGcmEncrypt: key is 10 bytes, expected 16, 24 or 32');
    await expect(aesGcmDecrypt(key, new Uint8Array(8), message)).rejects.toThrow('aesGcmDecrypt: nonce is 8 bytes, expected 12');
  });
});

describe('ECDH on P-256', () => {
  it('both parties derive the same 32-byte secret, and a third key derives a different one', async () => {
    const [a, b, c] = [await ecdhKeyPair(), await ecdhKeyPair(), await ecdhKeyPair()];
    const ab = (await ecdhDerive(a!.privateKey, b!.publicKey))!;
    const ba = (await ecdhDerive(b!.privateKey, a!.publicKey))!;
    expect(ab).toHaveLength(32);
    expect(toHex(ab)).toBe(toHex(ba));
    expect(toHex((await ecdhDerive(c!.privateKey, a!.publicKey))!)).not.toBe(toHex(ab));
  });

  it('keeps the private key non-extractable by default and readable when asked', async () => {
    const locked = (await ecdhKeyPair())!;
    await expect(exportPrivateScalar(locked.privateKey)).rejects.toThrow();
    const open = (await ecdhKeyPair({ extractable: true }))!;
    const d = (await exportPrivateScalar(open.privateKey))!;
    const pub = (await exportPublicPoint(open.publicKey))!;
    expect(mul(P256, d, P256.G).point).toEqual(pub);
  });

  it('imports seeded scalars and agrees with node:crypto ECDH on the shared secret', async () => {
    const rnd = mulberry32(31);
    const scalar = () => BigInt(`0x${toHex(seededBytes(rnd, 31))}`) + 1n;
    for (let i = 0; i < 5; i++) {
      const [da, db] = [scalar(), scalar()];
      const [pa, pb] = [mul(P256, da, P256.G).point!, mul(P256, db, P256.G).point!];
      const priv = (await ecdhImportPrivate(da, pa))!;
      const peer = (await ecdhImportPublicPoint(pb))!;
      const secret = toHex((await ecdhDerive(priv, peer))!);
      const nodeSecret = nodeEcdhSecret('prime256v1', da, nodeEcdhPublic('prime256v1', db));
      expect(secret).toBe(nodeSecret);
      expect(secret).toBe(mul(P256, da, pb).point!.x.toString(16).padStart(64, '0'));
    }
  });
});

describe('every helper is null without crypto.subtle', () => {
  it('resolves null (and the pure validations still run first where they take no key)', async () => {
    vi.stubGlobal('crypto', {});
    const fakeKey = {} as CryptoKey;
    const bytes = new Uint8Array(16);
    expect(await ecdhKeyPair()).toBeNull();
    expect(await ecdhKeyPair({ extractable: true })).toBeNull();
    expect(await ecdhDerive(fakeKey, fakeKey)).toBeNull();
    expect(await exportPublicPoint(fakeKey)).toBeNull();
    expect(await exportPrivateScalar(fakeKey)).toBeNull();
    expect(await ecdhImportPublicPoint({ x: 1n, y: 2n })).toBeNull();
    expect(await ecdhImportPrivate(1n, { x: 1n, y: 2n })).toBeNull();
    expect(await hkdf(bytes, bytes, bytes, 16)).toBeNull();
    expect(await aesGcmEncrypt(bytes, new Uint8Array(12), bytes)).toBeNull();
    expect(await aesGcmDecrypt(bytes, new Uint8Array(12), bytes)).toBeNull();
    await expect(hkdf(bytes, bytes, bytes, 0)).rejects.toThrow('hkdf: length');
  });
});
