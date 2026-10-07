import { beforeAll, describe, expect, it } from 'vitest';
import { ecdsaKeyPair, ecdsaSign, ecdsaVerify, enc, hexToBytes } from '../../core/crypto';
import { mulberry32 } from '../../core/random';
import { EXPECTED, LESSON_NOW, makeKeys, matchName, scenario, validate, type Keys, type Preset } from './pki';


let keys: Keys;
beforeAll(async () => {
  keys = (await makeKeys())!;
});

describe('chain validation', () => {
  it('returns exactly the documented reason for every preset', async () => {
    for (const preset of Object.keys(EXPECTED) as Preset[]) {
      const s = await scenario(preset, keys);
      const v = await validate(s.chain, s.store, s.host);
      expect([preset, v.reason]).toEqual([preset, EXPECTED[preset]]);
      // The walk stops at the first failure: only the last check can fail.
      expect(v.checks.slice(0, -1).every((c) => c.ok)).toBe(true);
      expect(v.checks.at(-1)!.ok).toBe(v.reason === null);
    }
  });

  it('a valid chain ends on the trust store, after verifying both signatures for real', async () => {
    const s = await scenario('valid', keys);
    const v = await validate(s.chain, s.store, s.host);
    expect(v.checks.filter((c) => c.id === 'signature').map((c) => c.cert)).toEqual([0, 1]);
    expect(v.checks.at(-1)).toMatchObject({ id: 'trust', ok: true });
  });

  it('self-signed: the signature is fine, trust is the problem', async () => {
    const s = await scenario('self-signed', keys);
    const v = await validate(s.chain, s.store, s.host);
    expect(v.checks.find((c) => c.id === 'signature')!.ok).toBe(true);
    expect(v.checks.at(-1)).toMatchObject({ id: 'trust', ok: false, reason: 'self-signed' });
  });

  it('uses the fixed lesson clock: the expiry verdict flips when the clock moves, never with Date.now()', async () => {
    const s = await scenario('expired', keys);
    expect((await validate(s.chain, s.store, s.host, LESSON_NOW)).reason).toBe('expired');
    expect((await validate(s.chain, s.store, s.host, '2025-06-01T00:00:00Z')).reason).toBeNull();
  });

  it('the tampered leaf only fails because of the edit: re-presenting the signed original passes', async () => {
    const s = await scenario('tampered', keys);
    expect(s.chain[0].names).toContain('pay.shop.example');
    const original = { ...s.chain[0], names: ['shop.example'] };
    expect((await validate([original, ...s.chain.slice(1)], s.store, s.host)).reason).toBeNull();
  });
});

describe('name matching', () => {
  it('follows the single-label wildcard rule', () => {
    expect(matchName('www.shop.example', '*.shop.example')).toBe(true);
    expect(matchName('WWW.Shop.Example', '*.shop.example')).toBe(true);
    expect(matchName('shop.example', '*.shop.example')).toBe(false);
    expect(matchName('a.b.shop.example', '*.shop.example')).toBe(false);
    expect(matchName('www.shop.example', 'shop.example')).toBe(false);
    expect(matchName('shop.example', 'shop.example')).toBe(true);
    expect(matchName('www.shop.example', 'www.*.example')).toBe(false);
  });
});

describe('sign and verify (real ECDSA P-256)', () => {
  it('verifies the untouched note and fails for every seeded single-byte edit to the note or the signature', async () => {
    const pair = (await ecdsaKeyPair())!;
    const note = enc.encode('Release v2.4.1: fixes the login timeout. Build 7f3c.');
    const sig = (await ecdsaSign(pair.privateKey, note))!;
    expect(await ecdsaVerify(pair.publicKey, sig, note)).toBe(true);
    const rnd = mulberry32(64);
    for (let n = 0; n < 64; n++) {
      const m = note.slice();
      m[Math.floor(rnd() * m.length)] ^= 1 + Math.floor(rnd() * 255);
      expect(await ecdsaVerify(pair.publicKey, sig, m)).toBe(false);
      const s = sig.slice();
      s[Math.floor(rnd() * s.length)] ^= 1 + Math.floor(rnd() * 255);
      expect(await ecdsaVerify(pair.publicKey, s, note)).toBe(false);
    }
  });

  it('two signatures of the same note both verify (whether or not the platform randomises them)', async () => {
    const pair = (await ecdsaKeyPair())!;
    const note = enc.encode('same note');
    const a = (await ecdsaSign(pair.privateKey, note))!;
    const b = (await ecdsaSign(pair.privateKey, note))!;
    expect(await ecdsaVerify(pair.publicKey, a, note)).toBe(true);
    expect(await ecdsaVerify(pair.publicKey, b, note)).toBe(true);
  });

  it('verifies the published RFC 6979 A.2.5 signature (P-256, SHA-256, message "sample")', async () => {
    // The RFC's public key only (no private key in source): 0x04 ‖ Ux ‖ Uy.
    const pub = hexToBytes('04'
      + '60fed4ba255a9d31c961eb74c6356d68c049b8923b61fa6ce669622e60f29fb6'
      + '7903fe1008b8bc99a41ae9e95628bc64f2f1b20c2d7e9f5177a3c294d4462299');
    const sig = hexToBytes('efd48b2aacb6a8fd1140dd9cd45e81d69d2c877b56aaf991c34d0ea84eaf3716'
      + 'f7cb1c942d657c41d436c7a1b6e29f65f3e900dbb9aff4064dc4ab2f843acda8');
    const key = await crypto.subtle.importKey('raw', pub, { name: 'ECDSA', namedCurve: 'P-256' }, true, ['verify']);
    expect(await ecdsaVerify(key, sig, enc.encode('sample'))).toBe(true);
    expect(await ecdsaVerify(key, sig, enc.encode('samplf'))).toBe(false);
  });
});
