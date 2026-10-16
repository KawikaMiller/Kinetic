import { describe, expect, it } from 'vitest';
import { hexToBytes, sha256Hex, toHex } from '../../core/crypto';
import { mulberry32 } from '../../core/random';
import {
  IV_BYTES, Kms, TAG_BYTES, WRAPPED_BYTES, aesGcmDecrypt, aesGcmEncrypt, decryptRecord, encryptRecord, importAesKey, randomBytes, reencryptRecord, rewrapTenant, type Bytes, type Envelope,
} from './envelope';
import { ARCHIVE_RECORDS, DIRECT_LIMIT_BYTES, QUOTA_PER_SECOND, READS_PER_WRITE, runWorkload } from './workload';

/** node:crypto, loaded at run time with only the shape used here (the app tsconfig has no Node types). */
interface NodeCipher {
  setAAD(b: Uint8Array): void;
  update(b: Uint8Array): Uint8Array;
  final(): Uint8Array;
  getAuthTag(): Uint8Array;
  setAuthTag(b: Uint8Array): void;
}
interface NodeCrypto {
  createCipheriv(alg: string, key: Uint8Array, iv: Uint8Array): NodeCipher;
  createDecipheriv(alg: string, key: Uint8Array, iv: Uint8Array): NodeCipher;
}
const NODE_CRYPTO = 'node:crypto';
const node = (await import(/* @vite-ignore */ NODE_CRYPTO)) as NodeCrypto;

const concat = (a: Uint8Array, b: Uint8Array): Bytes => {
  const out = new Uint8Array(a.length + b.length);
  out.set(a);
  out.set(b, a.length);
  return out;
};
const utf8 = (s: string): Bytes => new TextEncoder().encode(s);

function nodeEncrypt(key: Uint8Array, iv: Uint8Array, aad: Uint8Array, plaintext: Uint8Array): Bytes {
  const c = node.createCipheriv('aes-256-gcm', key, iv);
  c.setAAD(aad);
  const body = concat(c.update(plaintext), c.final());
  return concat(body, c.getAuthTag());
}

function nodeDecrypt(key: Uint8Array, iv: Uint8Array, aad: Uint8Array, ctAndTag: Uint8Array): Bytes {
  const d = node.createDecipheriv('aes-256-gcm', key, iv);
  d.setAAD(aad);
  d.setAuthTag(ctAndTag.slice(ctAndTag.length - TAG_BYTES));
  return concat(d.update(ctAndTag.slice(0, ctAndTag.length - TAG_BYTES)), d.final());
}

async function vault() {
  const kms = new Kms();
  for (const t of ['acme', 'birch', 'cedar']) await kms.createTenant(t);
  return kms;
}

/** The record's DEK, read back for the interop checks only (the KMS hands an extractable key to its caller). */
async function dekBytes(kms: Kms, e: Envelope): Promise<Bytes> {
  return new Uint8Array(await crypto.subtle.exportKey('raw', await kms.unwrap(e.tenant, e.context, e.wrapped)));
}

describe('AES-GCM through the lesson\'s encrypt function', () => {
  // The 256-bit test vector commonly published as test case 16 of McGrew and Viega's GCM specification (and in NIST's GCM
  // test vectors). It is checked against node:crypto here as well, so a mistyped digit would fail both.
  const K = hexToBytes('feffe9928665731c6d6a8f9467308308feffe9928665731c6d6a8f9467308308');
  const IV = hexToBytes('cafebabefacedbaddecaf888');
  const P = hexToBytes('d9313225f88406e5a55909c5aff5269a86a7a9531534f7da2e4c303d8a318a721c3c0c95956809532fcf0e2449a6b525b16aedf5aa0de657ba637b39');
  const A = hexToBytes('feedfacedeadbeeffeedfacedeadbeefabaddad2');
  const C = '522dc1f099567d07f47f37a32a84427d643a8cdcbfe5c0c97598a2bd2555d1aa8cb08e48590dbb3da7b08b1056828838c5f61e6393ba7a0abcc9f662';
  const T = '76fc6ece0f4e1768cddf8853bb2d551b';

  it('passes the published vector: ciphertext and tag', async () => {
    const out = await aesGcmEncrypt(await importAesKey(K, ['encrypt']), IV, A, P);
    expect(toHex(out)).toBe(C + T);
  });

  it('the same vector through node:crypto gives the same bytes, and the lesson decrypts what node produced', async () => {
    const viaNode = nodeEncrypt(K, IV, A, P);
    expect(toHex(viaNode)).toBe(C + T);
    expect(toHex(await aesGcmDecrypt(await importAesKey(K, ['decrypt']), IV, A, viaNode))).toBe(toHex(P));
  });

  it('a one-bit change to the vector\'s expected tag would fail', async () => {
    const out = toHex(await aesGcmEncrypt(await importAesKey(K, ['encrypt']), IV, A, P));
    expect(out).not.toBe(C + '76fc6ece0f4e1768cddf8853bb2d551a');
  });
});

describe('interoperability with node:crypto, over 200 seeded records', () => {
  it('a record the lesson encrypts decrypts under node, and what node encrypts the lesson decrypts', async () => {
    const kms = await vault();
    const rnd = mulberry32(31);
    const tenants = ['acme', 'birch', 'cedar'];
    for (let i = 0; i < 200; i++) {
      const tenant = tenants[Math.floor(rnd() * 3)];
      const text = Array.from({ length: 1 + Math.floor(rnd() * 64) }, () => String.fromCharCode(97 + Math.floor(rnd() * 26))).join('');
      const e = await encryptRecord(kms, tenant, `rec-${i}`, text);
      const dek = await dekBytes(kms, e);
      expect(new TextDecoder().decode(nodeDecrypt(dek, e.iv, utf8(e.id), e.ciphertext)), `lesson to node ${i}`).toBe(text);
      const iv = randomBytes(IV_BYTES);
      const fromNode = nodeEncrypt(dek, iv, utf8(e.id), utf8(text));
      const back = await aesGcmDecrypt(await importAesKey(dek, ['decrypt']), iv, utf8(e.id), fromNode);
      expect(new TextDecoder().decode(back), `node to lesson ${i}`).toBe(text);
    }
  });
});

describe('the hierarchy', () => {
  it('holds the KEK as a key WebCrypto will not export', async () => {
    const kms = await vault();
    expect(kms.describe('acme')).toEqual({ version: 1, extractable: false });
    const keys = (kms as unknown as { keys: Map<string, Map<number, CryptoKey>> }).keys;
    await expect(crypto.subtle.exportKey('raw', keys.get('acme')!.get(1)!)).rejects.toThrow();
  });

  it('stores a 12-byte IV, ciphertext 16 bytes longer than the text, and a 60-byte wrapped DEK', async () => {
    const kms = await vault();
    const e = await encryptRecord(kms, 'acme', 'r1', 'hello');
    expect([e.iv.length, e.ciphertext.length, e.wrapped.bytes.length + e.wrapped.iv.length]).toEqual([12, 5 + 16, 60]);
    expect(WRAPPED_BYTES).toBe(60);
    expect(e.context).toBe('acme');
  });

  it('decrypts every record back to its text, including non-ASCII text', async () => {
    const kms = await vault();
    for (const text of ['Order 1001', 'café ☕', 'x'.repeat(64)]) {
      const e = await encryptRecord(kms, 'birch', 'r', text);
      expect(await decryptRecord(kms, e)).toEqual({ ok: true, text });
    }
  });

  it('10,000 generated IVs are 12 bytes and do not collide in the sample (a sanity check, not a proof of randomness)', () => {
    const ivs = new Set<string>();
    for (let i = 0; i < 10_000; i++) {
      const iv = randomBytes(IV_BYTES);
      expect(iv.length).toBe(12);
      ivs.add(toHex(iv));
    }
    expect(ivs.size).toBe(10_000);
  });
});

describe('rotation', () => {
  it('leaves ciphertext and IV byte-identical, changes every wrapped DEK, and every record still decrypts', async () => {
    const kms = await vault();
    const records: Envelope[] = [];
    for (let i = 0; i < 12; i++) records.push(await encryptRecord(kms, i % 2 ? 'acme' : 'birch', `r${i}`, `text ${i}`));
    const before = records.map((r) => ({ data: toHex(concat(r.iv, r.ciphertext)), wrapped: toHex(r.wrapped.bytes) }));
    const hashBefore = await Promise.all(records.map((r) => sha256Hex(toHex(concat(r.iv, r.ciphertext)))));
    expect(await kms.rotate('acme')).toBe(2);
    const after = await rewrapTenant(kms, 'acme', records);
    for (const [i, r] of after.entries()) {
      expect(toHex(concat(r.iv, r.ciphertext)), `data ${i}`).toBe(before[i].data);
      expect(await sha256Hex(toHex(concat(r.iv, r.ciphertext)))).toBe(hashBefore[i]);
      if (r.tenant === 'acme') {
        expect(toHex(r.wrapped.bytes), `wrapped ${i}`).not.toBe(before[i].wrapped);
        expect(r.wrapped.version).toBe(2);
      } else {
        expect(toHex(r.wrapped.bytes)).toBe(before[i].wrapped);
      }
      expect(await decryptRecord(kms, r), `decrypt ${i}`).toEqual({ ok: true, text: `text ${i}` });
    }
  });

  it('new wraps use the new version; an old wrapped DEK still unwraps, since the old version is kept until it is destroyed', async () => {
    const kms = await vault();
    const old = await encryptRecord(kms, 'acme', 'a', 'old');
    await kms.rotate('acme');
    const fresh = await encryptRecord(kms, 'acme', 'b', 'new');
    expect([old.wrapped.version, fresh.wrapped.version]).toEqual([1, 2]);
    expect((await decryptRecord(kms, old)).ok).toBe(true);
  });

  it('rotating one record\'s DEK changes its ciphertext and IV and leaves the others alone', async () => {
    const kms = await vault();
    const a = await encryptRecord(kms, 'acme', 'a', 'same text');
    const b = await encryptRecord(kms, 'acme', 'b', 'other');
    const a2 = await reencryptRecord(kms, a);
    expect(toHex(a2.ciphertext)).not.toBe(toHex(a.ciphertext));
    expect(toHex(a2.iv)).not.toBe(toHex(a.iv));
    expect(await decryptRecord(kms, a2)).toEqual({ ok: true, text: 'same text' });
    expect(await decryptRecord(kms, b)).toEqual({ ok: true, text: 'other' });
  });
});

describe('shredding', () => {
  it('after destroying a tenant\'s KEK its records cannot be read, other tenants\' can, and the ciphertext is unchanged', async () => {
    const kms = await vault();
    const acme = await Promise.all([1, 2, 3].map((i) => encryptRecord(kms, 'acme', `a${i}`, `a text ${i}`)));
    const birch = await encryptRecord(kms, 'birch', 'b1', 'b text');
    const snapshot = acme.map((e) => toHex(concat(e.iv, concat(e.ciphertext, e.wrapped.bytes))));
    kms.destroy('acme');
    for (const e of acme) {
      const r = await decryptRecord(kms, e);
      expect(r.ok).toBe(false);
      if (!r.ok) expect([r.stage, r.errorName]).toEqual(['kms', 'kek-destroyed']);
    }
    expect(await decryptRecord(kms, birch)).toEqual({ ok: true, text: 'b text' });
    expect(acme.map((e) => toHex(concat(e.iv, concat(e.ciphertext, e.wrapped.bytes))))).toEqual(snapshot);
  });

  it('a backup copy made before the shred is just as unreadable afterwards', async () => {
    const kms = await vault();
    const e = await encryptRecord(kms, 'cedar', 'c1', 'secret');
    const backup: Envelope = { ...e, iv: e.iv.slice(), ciphertext: e.ciphertext.slice() };
    kms.destroy('cedar');
    expect((await decryptRecord(kms, backup)).ok).toBe(false);
  });
});

describe('encryption context and tampering', () => {
  it('a wrap with context A fails to unwrap with context B, with the real OperationError', async () => {
    const kms = await vault();
    const e = await encryptRecord(kms, 'acme', 'r', 'x');
    const r = await decryptRecord(kms, e, { kekTenant: 'acme', context: 'birch' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect([r.stage, r.errorName]).toEqual(['kms', 'OperationError']);
  });

  it('Birch\'s record presented to Acme\'s key fails, and so does the right key with the wrong context', async () => {
    const kms = await vault();
    const b = await encryptRecord(kms, 'birch', 'r', 'x');
    expect((await decryptRecord(kms, b, { kekTenant: 'acme', context: 'acme' })).ok).toBe(false);
    expect((await decryptRecord(kms, b, { kekTenant: 'birch', context: 'acme' })).ok).toBe(false);
    expect((await decryptRecord(kms, b, { kekTenant: 'birch', context: 'birch' })).ok).toBe(true);
  });

  it('fails authentication for 200 seeded single-byte flips of the ciphertext or the tag, and for a different record id', async () => {
    const kms = await vault();
    const e = await encryptRecord(kms, 'acme', 'rec-7', 'a fairly ordinary record');
    const rnd = mulberry32(5);
    for (let i = 0; i < 200; i++) {
      const bad = e.ciphertext.slice();
      bad[Math.floor(rnd() * bad.length)] ^= 1 + Math.floor(rnd() * 255);
      const r = await decryptRecord(kms, { ...e, ciphertext: bad });
      expect(r.ok, `flip ${i}`).toBe(false);
      if (!r.ok) expect([r.stage, r.errorName]).toEqual(['data', 'OperationError']);
    }
    expect((await decryptRecord(kms, { ...e, id: 'rec-8' })).ok).toBe(false);
  });
});

describe('the KMS call counts', () => {
  it('count one call per wrap, unwrap and re-wrap', async () => {
    const kms = await vault();
    const e = await encryptRecord(kms, 'acme', 'a', 'x');
    expect(kms.calls).toBe(1);
    await decryptRecord(kms, e);
    expect(kms.calls).toBe(2);
    await rewrapTenant(kms, 'acme', [e]);
    expect(kms.calls).toBe(3);
  });

  it('the counting loop agrees with a real run: records per key, no cache, one unwrap per read', async () => {
    const kms = await vault();
    const writes = 12;
    const perKey = 4;
    // One DEK per group of records: wrap once per group, as the model counts it.
    const dek = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
    let wraps = 0;
    for (let i = 0; i < writes; i++) {
      if (i % perKey === 0) {
        await kms.wrap('acme', dek, 'acme');
        wraps++;
      }
    }
    expect(kms.calls).toBe(wraps);
    const model = runWorkload('envelope', { recordsPerSecond: writes, recordBytes: 100, recordsPerKey: perKey, cache: false });
    expect(model.kmsCalls - writes * READS_PER_WRITE).toBe(wraps);
  });
});

describe('the direct against envelope workload', () => {
  const base = { recordsPerSecond: 100, recordBytes: 512, recordsPerKey: 100, cache: true };

  it('direct encryption calls the KMS for every write and read, and sends the data itself', () => {
    const d = runWorkload('direct', base);
    expect([d.writes, d.reads, d.kmsCalls, d.kmsBytes]).toEqual([100, 200, 300, 300 * 512]);
    expect(d.refused).toBe(false);
  });

  it('refuses a record past the direct payload limit and counts no calls', () => {
    const d = runWorkload('direct', { ...base, recordBytes: DIRECT_LIMIT_BYTES + 1 });
    expect([d.refused, d.kmsCalls]).toEqual([true, 0]);
    expect(runWorkload('direct', { ...base, recordBytes: DIRECT_LIMIT_BYTES }).refused).toBe(false);
  });

  it('envelope sends only wrapped keys: with one record per key and no cache the calls match the direct design, the bytes do not', () => {
    const e = runWorkload('envelope', { ...base, recordsPerKey: 1, cache: false });
    const d = runWorkload('direct', base);
    expect(e.kmsCalls).toBe(d.kmsCalls);
    expect(e.kmsBytes).toBe(e.kmsCalls * WRAPPED_BYTES);
    expect(e.kmsBytes).toBeLessThan(d.kmsBytes);
  });

  it('records sharing a key and a DEK cache shrink the calls, monotonically', () => {
    let last = Infinity;
    for (const recordsPerKey of [1, 10, 100, 1000]) {
      const calls = runWorkload('envelope', { ...base, recordsPerKey, cache: true }).kmsCalls;
      expect(calls).toBeLessThanOrEqual(last);
      last = calls;
    }
    const noCache = runWorkload('envelope', { ...base, cache: false }).kmsCalls;
    const cache = runWorkload('envelope', { ...base, cache: true }).kmsCalls;
    expect(cache).toBeLessThanOrEqual(noCache);
    expect(noCache).toBe(1 + 200);
  });

  it('counts are recomputed identically on every call (a seeded sample) and bounded by the archive', () => {
    const w = { recordsPerSecond: 2000, recordBytes: 64, recordsPerKey: 50, cache: true };
    expect(runWorkload('envelope', w)).toEqual(runWorkload('envelope', w));
    expect(runWorkload('envelope', w).kmsCalls).toBeLessThanOrEqual(2000 / 50 + 4000);
    expect(ARCHIVE_RECORDS).toBe(100_000);
    expect(QUOTA_PER_SECOND).toBe(1000);
  });
});
