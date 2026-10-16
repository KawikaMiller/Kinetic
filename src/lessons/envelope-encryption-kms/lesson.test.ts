import { describe, expect, it } from 'vitest';
import { toHex } from '../../core/crypto';
import { expectCaption } from '../../core/testing/captions';
import { sceneElements, sharedSceneComponents } from '../../core/testing/sceneKeys';
import { envelopeBytes, hierarchyCaption, rotationCaption, shredCaption, workloadCaption } from './captions';
import { decryptRecord, type Envelope } from './envelope';
import { DEFAULTS, FACTS } from './facts';
import lesson from './index';
import { OPENING } from './opening';
import { readAll } from './ShredScene';
import { TENANTS, addRecord, buildVault, checkText, destroyTenant, rotateTenant, MAX_TEXT, SEED_TEXT } from './vault';
import { runWorkload } from './workload';

const sources = import.meta.glob(['./*.ts', './*.tsx', '!./*.test.ts'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

describe('scenes', () => {
  it('every scene component carries its own key and none is shared', () => {
    const els = sceneElements('envelope-encryption-kms');
    // The three vault scenes sit inside one VaultScene that is keyed on the scene, so each scene mounts its own fresh vault.
    const inner = ['RotationScene', 'ShredScene', 'HierarchyScene'];
    expect(els.filter((e) => !inner.includes(e.component)).every((e) => e.keyed)).toBe(true);
    expect(els.map((e) => e.component).sort()).toEqual(['HierarchyScene', 'RotationScene', 'ShredScene', 'VaultScene', 'Waiting', 'WorkloadScene']);
    expect(sharedSceneComponents('envelope-encryption-kms')).toEqual([]);
    expect(sources['./Stage.tsx']).toContain('<VaultScene key={scene}');
    expect(sources['./Stage.tsx'].split('buildVault()').length - 1).toBe(2);
  });

  it('a vault is rebuilt from the same seed on every scene mount: records added to one never appear in the next', async () => {
    const first = await buildVault();
    const changed = await addRecord(first, 'acme', 'made up');
    expect(changed.records).toHaveLength(7);
    const next = await buildVault();
    expect(next.records.map((r) => r.id)).toEqual(['rec-1', 'rec-2', 'rec-3', 'rec-4', 'rec-5', 'rec-6']);
    expect(next.records.filter((r) => r.tenant === 'acme')).toHaveLength(FACTS.recordsPerTenant);
    expect(next.kms.version('acme')).toBe(1);
  });

  it('the status probes read real decryptions, count only copies that exist, and do not touch the KMS call counter', async () => {
    const v = await addRecord(await buildVault(), 'acme', 'added after the backup');
    const calls = v.kms.calls;
    const before = await readAll(v);
    expect(v.kms.calls).toBe(calls);
    const acme = before.filter((r) => r.tenant === 'acme');
    expect(acme.map((r) => [r.live, r.backup, r.dataSame])).toEqual([[true, true, true], [true, true, true], [true, null, null]]);
    const shredded = destroyTenant(v, 'acme');
    const after = (await readAll(shredded)).filter((r) => r.tenant === 'acme');
    expect(after.map((r) => [r.live, r.backup, r.dataSame])).toEqual([[false, false, true], [false, false, true], [false, null, null]]);
    expect(shredded.kms.calls).toBe(calls);
  });

  it('a destroyed tenant cannot be rotated, and text with a lone surrogate is refused', async () => {
    const v = destroyTenant(await buildVault(), 'acme');
    await expect(rotateTenant(v, 'acme')).rejects.toThrow('destroyed');
    expect(v.kms.version('acme')).toBe(1);
    expect(checkText('ab\uD800cd').ok).toBe(false);
    expect(checkText('\uDC00').ok).toBe(false);
    expect(checkText('pair \uD83D\uDE00 fine').ok).toBe(true);
  });

  it('each scene opens on fixed defaults', () => {
    expect(OPENING).toEqual({ scene: 'hierarchy', tenant: 'acme', rotation: { exponent: 4, kib: 8 }, workload: { rate: 400, size: 512, perKey: 100, cache: true } });
  });
});

describe('the vault, built for real', () => {
  it('opens with two seed records for each of three tenants, one KEK each that cannot be exported', async () => {
    const v = await buildVault();
    expect(v.records).toHaveLength(6);
    expect(v.backup).toHaveLength(6);
    for (const t of TENANTS) {
      expect(v.records.filter((r) => r.tenant === t.id)).toHaveLength(2);
      expect(v.kms.describe(t.id)).toEqual({ version: 1, extractable: false });
    }
  });

  it('try-this 1: the first record is a 118-byte envelope and decrypts to its text; adding a record makes three', async () => {
    const v = await buildVault();
    const e = v.records[0];
    expect(envelopeBytes(e)).toBe(118);
    expect([FACTS.firstEnvelope, FACTS.ivBytes, FACTS.ciphertextWithTag, FACTS.wrapped]).toEqual([118, 12, 46, 60]);
    expect(await decryptRecord(v.kms, e)).toEqual({ ok: true, text: SEED_TEXT.acme[0] });
    const checked = checkText('  made-up text  ');
    expect(checked).toEqual({ ok: true, text: 'made-up text' });
    const next = await addRecord(v, 'acme', 'made-up text');
    expect(next.records.filter((r) => r.tenant === 'acme')).toHaveLength(FACTS.recordsAfterAdd);
    expect(lesson.tryThis[0]).toContain('envelope of 118 bytes');
  });

  it('try-this 2: rotating Acme\'s KEK leaves its two data hashes unchanged and changes the wrapped keys; the cost line reads 585.9 KiB against 78.1 MiB', async () => {
    const v = await buildVault();
    const before = v.records.map((r) => ({ data: toHex(r.iv) + toHex(r.ciphertext), wrap: toHex(r.wrapped.bytes) }));
    const next = await rotateTenant(v, 'acme');
    next.records.forEach((r, i) => {
      expect(toHex(r.iv) + toHex(r.ciphertext)).toBe(before[i].data);
      expect(toHex(r.wrapped.bytes) !== before[i].wrap).toBe(r.tenant === 'acme');
    });
    expect([FACTS.rewrapText, FACTS.reencryptText, FACTS.ratioText]).toEqual(['585.9 KiB', '78.1 MiB', '136.53']);
    expect(DEFAULTS.rotationRecords * 60).toBe(600_000);
    expect(lesson.tryThis[1]).toContain('re-wrapping touches 585.9 KiB and re-encrypting the data 78.1 MiB, 136.53 times as much');
  });

  it('try-this 3: destroying Acme\'s KEK makes 0 of 2 live and 0 of 2 backup records readable, others are untouched, the ciphertext is unchanged; the wrong tenant fails with OperationError', async () => {
    const v = await buildVault();
    const snap = v.records.map((r) => toHex(r.ciphertext));
    const gone = destroyTenant(v, 'acme');
    const acme = gone.records.filter((r) => r.tenant === 'acme');
    for (const e of [...acme, ...gone.backup.filter((r) => r.tenant === 'acme')]) expect((await decryptRecord(gone.kms, e)).ok).toBe(false);
    for (const e of gone.records.filter((r) => r.tenant !== 'acme')) expect((await decryptRecord(gone.kms, e)).ok).toBe(true);
    expect(gone.records.map((r) => toHex(r.ciphertext))).toEqual(snap);
    expect(FACTS.unreadable).toBe(0);
    const fresh = await buildVault();
    const birch = fresh.records.find((r) => r.tenant === 'birch') as Envelope;
    const r = await decryptRecord(fresh.kms, birch, { kekTenant: 'acme', context: 'acme' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errorName).toBe('OperationError');
  });

  it('try-this 4: 400 records a second give 1,200 direct calls (over a quota of 1,000), 205 envelope calls with a cache, and a record of 8 KiB is refused directly', () => {
    expect([FACTS.directCalls, FACTS.envelopeCalls, FACTS.quota, FACTS.directOverQuota, FACTS.bigRecordRefused]).toEqual([1200, FACTS.envelopeCalls, 1000, true, true]);
    expect(FACTS.envelopeCalls).toBeLessThan(FACTS.directCalls);
    expect(FACTS.perRecordKeyCalls).toBeGreaterThan(FACTS.envelopeCalls);
    expect(lesson.tryThis[3]).toContain('1200 KMS calls');
  });

  it('refuses empty and over-long text, and leaves any other text as plain data', () => {
    expect(checkText('')).toEqual({ ok: false, error: 'Type some text first.' });
    expect(checkText('   ').ok).toBe(false);
    expect(checkText('x'.repeat(MAX_TEXT + 1)).ok).toBe(false);
    expect(checkText('x'.repeat(MAX_TEXT)).ok).toBe(true);
    expect(checkText('<b>not markup</b> \'; quotes').ok).toBe(true);
  });
});

describe('captions across the control cross product', () => {
  it('every workload slider extreme and key choice gives a clean caption that quotes the computed calls', () => {
    for (const rate of [1, 400, 2000]) {
      for (const recordBytes of [64, 4096, 4160, 16_384]) {
        for (const recordsPerKey of [1, 10, 100, 1000]) {
          for (const cache of [false, true]) {
            const w = { recordsPerSecond: rate, recordBytes, recordsPerKey, cache };
            const direct = runWorkload('direct', w);
            const env = runWorkload('envelope', w);
            const text = expectCaption(workloadCaption(direct, env, recordsPerKey));
            expect(text).not.toMatch(/NaN|undefined|Infinity|\[object/);
            if (direct.refused) expect(text).not.toContain('instead of');
            expect(text).toContain(direct.refused ? 'cannot take records past' : `${direct.kmsCalls.toLocaleString('en-US')} KMS calls a second`);
          }
        }
      }
    }
  });

  it('the rotation caption is clean at the slider extremes, before and after a rotation', async () => {
    const v = await buildVault();
    const rows = [{ id: 'rec-1', dataBefore: 'aa', dataAfter: 'aa', wrapBefore: 'bb', wrapAfter: 'cc', versionBefore: 1, versionAfter: 2 }];
    for (const exponent of [0, 6]) {
      for (const kib of [1, 64]) {
        for (const report of [null, { kind: 'kek' as const, rows }, { kind: 'dek' as const, rows: [{ ...rows[0], dataAfter: 'dd' }] }]) {
          expect(expectCaption(rotationCaption(report, 10 ** exponent, kib * 1024))).not.toMatch(/NaN|undefined|\[object/);
        }
      }
    }
    expect(expectCaption(rotationCaption({ kind: 'kek', rows }, 10, 1024))).toContain('1 of 1 data hashes are identical and 1 wrapped keys changed');
    expect(v.records.length).toBe(6);
  });

  it('the hierarchy and shred captions are clean in every state', async () => {
    const v = await buildVault();
    const e = v.records[0];
    const ok = await decryptRecord(v.kms, e);
    const bad = await decryptRecord(v.kms, e, { kekTenant: 'birch', context: 'acme' });
    for (const last of [null, ok, bad]) expect(expectCaption(hierarchyCaption('acme', 1, e, last))).not.toMatch(/NaN|undefined|\[object/);
    expect(expectCaption(hierarchyCaption('acme', 1, undefined, null))).toContain('no records yet');
    for (const destroyed of [false, true]) expect(expectCaption(shredCaption('birch', destroyed, { live: 0, liveTotal: 2, backup: 0, backupTotal: 2 }, null))).not.toMatch(/NaN|undefined|\[object/);
  });
});

describe('the lesson stays inside the page and carries no real secret', () => {
  const FORBIDDEN = /\bfetch\(|XMLHttpRequest|WebSocket|sendBeacon|\beval\(|new Function|localStorage|sessionStorage|indexedDB/;

  it('makes no network call, runs no eval and stores nothing in any source file', () => {
    expect(Object.keys(sources).length).toBeGreaterThan(10);
    for (const [file, text] of Object.entries(sources)) expect(text, file).not.toMatch(FORBIDDEN);
  });

  it('chips the KMS as simulated and the cipher as real, and the records are marked made-up', () => {
    expect(sources['./HierarchyScene.tsx']).toContain('<Provenance kind="simulated">');
    expect(sources['./HierarchyScene.tsx']).toContain('<Provenance kind="real">');
    expect(sources['./HierarchyScene.tsx']).toContain('made-up text, never a real secret');
    expect(sources['./WorkloadScene.tsx']).toContain('<Provenance kind="illustrative">');
  });
});
