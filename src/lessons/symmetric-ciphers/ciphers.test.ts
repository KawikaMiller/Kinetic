import { afterEach, describe, expect, it, vi } from 'vitest';
import { aesBlockEncrypt, toHex } from '../../core/crypto';
import { BLOCK, cbcDecrypt, cbcEncrypt, ctrCrypt, ecbEncrypt, gcmDecrypt, gcmEncrypt, randomBytes, xorBytes } from './ciphers';
import {
  BG, CHAIN_TEXT, FG, REUSE_TEXTS, TAMPER_TEXT, ascii, blockIds, changedBlocks, changedBytes, mascot, repeatedBlocks, sameAs,
} from './model';

const hex = (s: string) => Uint8Array.from(s.match(/../g)!.map((b) => parseInt(b, 16)));

// NIST SP 800-38A, appendix F: the AES-128 key and the four plaintext blocks shared by F.1.1, F.2.1 and F.5.1.
const KEY = hex('2b7e151628aed2a6abf7158809cf4f3c');
const PLAIN = hex('6bc1bee22e409f96e93d7e117393172a' + 'ae2d8a571e03ac9c9eb76fac45af8e51' + '30c81c46a35ce411e5fbc1191a0a52ef' + 'f69f2445df4f9b17ad2b417be66c3710');

describe('published test vectors', () => {
  it('a single raw block matches FIPS-197 appendix C.1', async () => {
    const out = await aesBlockEncrypt(hex('000102030405060708090a0b0c0d0e0f'), hex('00112233445566778899aabbccddeeff'));
    expect(toHex(out!)).toBe('69c4e0d86a7b0430d8cdb78070b4c55a');
  });

  it('ECB matches SP 800-38A F.1.1', async () => {
    expect(toHex((await ecbEncrypt(KEY, PLAIN))!)).toBe(
      '3ad77bb40d7a3660a89ecaf32466ef97' + 'f5d3d58503b9699de785895a96fdbaaf' + '43b1cd7f598ece23881b00e3ed030688' + '7b0c785e27e8ad3f8223207104725dd4',
    );
  });

  it('CBC matches SP 800-38A F.2.1, and decrypts back through the padding trick', async () => {
    const iv = hex('000102030405060708090a0b0c0d0e0f');
    const ct = (await cbcEncrypt(KEY, iv, PLAIN))!;
    expect(toHex(ct)).toBe(
      '7649abac8119b246cee98e9b12e9197d' + '5086cb9b507219ee95db113a917678b2' + '73bed6b8e3c1743b7116e69e22229516' + '3ff1caa1681fac09120eca307586e1a7',
    );
    expect(toHex((await cbcDecrypt(KEY, iv, ct))!)).toBe(toHex(PLAIN));
    // Single-block slice through the same path: block 1 alone.
    expect(toHex((await cbcEncrypt(KEY, iv, PLAIN.slice(0, BLOCK)))!)).toBe('7649abac8119b246cee98e9b12e9197d');
  });

  it('CTR matches SP 800-38A F.5.1', async () => {
    const counter = hex('f0f1f2f3f4f5f6f7f8f9fafbfcfdfeff');
    const ct = (await ctrCrypt(KEY, counter, PLAIN))!;
    expect(toHex(ct)).toBe(
      '874d6191b620e3261bef6864990db6ce' + '9806f66b7970fdff8617187bb9fffdff' + '5ae4df3edbd5d35e5b4f09020db03eab' + '1e031dda2fbe03d1792170a0f3009cee',
    );
    expect(toHex((await ctrCrypt(KEY, counter, ct))!)).toBe(toHex(PLAIN));
  });
});

describe('GCM against the McGrew–Viega GCM specification', () => {
  it('test case 2: zero key, zero IV, one zero block', async () => {
    const z16 = new Uint8Array(16);
    const out = (await gcmEncrypt(z16, new Uint8Array(12), z16))!;
    expect(toHex(out)).toBe('0388dace60b6a392f328c2b971b2fe78' + 'ab6e47d42cec13bdf53a67b21257bddf');
  });

  it('test case 3: four blocks, ciphertext and tag', async () => {
    const out = (await gcmEncrypt(
      hex('feffe9928665731c6d6a8f9467308308'),
      hex('cafebabefacedbaddecaf888'),
      hex('d9313225f88406e5a55909c5aff5269a86a7a9531534f7da2e4c303d8a318a721c3c0c95956809532fcf0e2449a6b525b16aedf5aa0de657ba637b391aafd255'),
    ))!;
    expect(toHex(out)).toBe(
      '42831ec2217774244b7221b784d0d49ce3aa212f2c02a4e035c17e2329aca12e21d514b25466931c7d8f6a5aac84aa051ba30b396a0aac973d58e091473f5985'
      + '4d5c2af327cd64a62cf35abd2ba6fab4',
    );
  });
});

describe('the ECB picture', () => {
  it('is a two-tone picture with plenty of repeated blocks', () => {
    const img = mascot();
    expect(new Set(img)).toEqual(new Set([BG, FG]));
    expect(repeatedBlocks(img)).toBeGreaterThan(100);
  });

  it('repeats exactly the blocks the plaintext repeats, in ECB and in no other mode', async () => {
    const img = mascot();
    const key = randomBytes(16);
    const ecb = (await ecbEncrypt(key, img))!;
    expect(repeatedBlocks(ecb)).toBe(repeatedBlocks(img));
    for (let i = 0; i < blockIds(img).length; i++) expect(sameAs(ecb, i)).toEqual(sameAs(img, i));
    expect(repeatedBlocks((await cbcEncrypt(key, randomBytes(16), img))!)).toBe(0);
    expect(repeatedBlocks((await ctrCrypt(key, randomBytes(16), img))!)).toBe(0);
    expect(repeatedBlocks((await gcmEncrypt(key, randomBytes(12), img))!.slice(0, img.length))).toBe(0);
  });
});

describe('chaining: one flipped plaintext bit', () => {
  it('changes block k onward in CBC, only block k in ECB, and only that byte in CTR', async () => {
    const key = randomBytes(16);
    const iv = randomBytes(16);
    const plain = ascii(CHAIN_TEXT);
    expect(plain.length).toBe(4 * BLOCK);
    for (let byte = 0; byte < plain.length; byte += 5) {
      const flipped = plain.slice();
      flipped[byte] ^= 0x04;
      const k = Math.floor(byte / BLOCK);
      const blocksAfter = [0, 1, 2, 3].filter((b) => b >= k);
      expect(changedBlocks((await cbcEncrypt(key, iv, plain))!, (await cbcEncrypt(key, iv, flipped))!)).toEqual(blocksAfter);
      expect(changedBlocks((await ecbEncrypt(key, plain))!, (await ecbEncrypt(key, flipped))!)).toEqual([k]);
      const a = (await ctrCrypt(key, iv, plain))!;
      const b = (await ctrCrypt(key, iv, flipped))!;
      expect(changedBytes(a, b)).toEqual([byte]);
      expect(a[byte] ^ b[byte]).toBe(0x04);
    }
  });
});

describe('IV and nonce reuse', () => {
  const [m1, m2] = REUSE_TEXTS.map(ascii);

  it('CBC with a reused IV gives an identical first block for messages that share one', async () => {
    const key = randomBytes(16);
    const iv = randomBytes(16);
    const c1 = (await cbcEncrypt(key, iv, m1))!;
    const reused = (await cbcEncrypt(key, iv, m2))!;
    expect(changedBlocks(c1, reused)).toEqual([1, 2]);
    expect(changedBlocks(c1, (await cbcEncrypt(key, randomBytes(16), m2))!)).toEqual([0, 1, 2]);
  });

  it('CTR with a reused nonce leaks exactly P1 ⊕ P2', async () => {
    const key = randomBytes(16);
    const ctr = randomBytes(16);
    const x = xorBytes((await ctrCrypt(key, ctr, m1))!, (await ctrCrypt(key, ctr, m2))!);
    expect(toHex(x)).toBe(toHex(xorBytes(m1, m2)));
    const zeros = Array.from(x).filter((v) => v === 0).length;
    expect(zeros).toBe(Array.from(m1).filter((v, i) => v === m2[i]).length);
  });
});

describe('tampering with ciphertext', () => {
  const plain = ascii(TAMPER_TEXT);

  it('CBC garbles the flipped block and flips the same bit in the next one', async () => {
    const key = randomBytes(16);
    const iv = randomBytes(16);
    const ct = (await cbcEncrypt(key, iv, plain))!;
    for (const byte of [3, 20, 40]) {
      const bad = ct.slice();
      bad[byte] ^= 0x01;
      const out = (await cbcDecrypt(key, iv, bad))!;
      const k = Math.floor(byte / BLOCK);
      const diff = changedBytes(plain, out);
      expect(diff.filter((i) => Math.floor(i / BLOCK) === k).length).toBeGreaterThan(8);
      const next = diff.filter((i) => Math.floor(i / BLOCK) === k + 1);
      if (k + 1 < plain.length / BLOCK) {
        expect(next).toEqual([byte + BLOCK]);
        expect(out[byte + BLOCK] ^ plain[byte + BLOCK]).toBe(0x01);
      }
      expect(diff.every((i) => Math.floor(i / BLOCK) === k || Math.floor(i / BLOCK) === k + 1)).toBe(true);
    }
  });

  it('CTR flips exactly the same plaintext bit', async () => {
    const key = randomBytes(16);
    const ctr = randomBytes(16);
    const ct = (await ctrCrypt(key, ctr, plain))!;
    for (let byte = 0; byte < ct.length; byte++) {
      const bad = ct.slice();
      bad[byte] ^= 0x01;
      const out = (await ctrCrypt(key, ctr, bad))!;
      expect(changedBytes(plain, out)).toEqual([byte]);
    }
  });

  it('GCM refuses every single-byte edit, the tag included, and opens the untouched message', async () => {
    const key = randomBytes(16);
    const iv = randomBytes(12);
    const sealed = (await gcmEncrypt(key, iv, plain))!;
    expect(sealed.length).toBe(plain.length + 16);
    expect(await gcmDecrypt(key, iv, sealed)).toEqual({ ok: true, plain });
    for (let byte = 0; byte < sealed.length; byte++) {
      const bad = sealed.slice();
      bad[byte] ^= 0x01;
      expect(await gcmDecrypt(key, iv, bad)).toEqual({ ok: false });
    }
  });
});

describe('without Web Crypto', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('returns null instead of fake output', async () => {
    vi.stubGlobal('crypto', { getRandomValues: (a: Uint8Array) => a });
    const z = new Uint8Array(16);
    expect(await ecbEncrypt(z, z)).toBeNull();
    expect(await cbcEncrypt(z, z, z)).toBeNull();
    expect(await ctrCrypt(z, z, z)).toBeNull();
    expect(await gcmEncrypt(z, z.slice(0, 12), z)).toBeNull();
  });
});
