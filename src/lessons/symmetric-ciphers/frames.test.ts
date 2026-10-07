import { describe, expect, it } from 'vitest';
import { captionText as text } from '../../core/testing/captions';
import { cbcDecrypt, cbcEncrypt, ctrCrypt, gcmDecrypt, gcmEncrypt, randomBytes } from './ciphers';
import { bitDistance, chainCaption, pictureCaption, reuseCaption, tamperCaption } from './frames';
import { TAMPER_DEFAULT_BYTE, TAMPER_TEXT, ascii, changedBytes, readable } from './model';

describe('pictureCaption', () => {
  it('states the counts it is given and only claims "appears once" when it does', () => {
    const r = { ECB: 130, CBC: 0, CTR: 0, GCM: 0 };
    expect(text(pictureCaption(r, 144, null))).toContain('ECB repeats 130 of 144 blocks');
    expect(text(pictureCaption(r, 144, null))).toContain('repeat none');
    expect(text(pictureCaption(r, 144, { block: 0, same: 60, othersMax: 1 }))).toContain('60 blocks have exactly this ciphertext');
    expect(text(pictureCaption(r, 144, { block: 0, same: 60, othersMax: 2 }))).not.toContain('appears once');
    expect(text(pictureCaption(r, 144, { block: 7, same: 1, othersMax: 1 }))).toContain('Block 8 is unique');
  });
});

describe('chainCaption', () => {
  it('counts the flipped bits and names the changed blocks for every mode', () => {
    expect(text(chainCaption('CBC', 0, [], 0))).toContain('Pick a plaintext byte');
    expect(text(chainCaption('CBC', 1, [0, 1, 2, 3], 64))).toBe(
      'One flipped plaintext bit changed 64 ciphertext bytes in blocks 1–4. CBC feeds each ciphertext block into the next, so a change carries to the end.',
    );
    expect(text(chainCaption('CTR', 2, [1], 1))).toContain('2 flipped plaintext bits changed 1 ciphertext byte in block 2');
    expect(text(chainCaption('ECB', 1, [3], 16))).toContain('only the flipped blocks change');
  });

  it('counts bits, not bytes', () => {
    expect(bitDistance(Uint8Array.of(0, 0xff), Uint8Array.of(1, 0xfe))).toBe(2);
    expect(bitDistance(Uint8Array.of(0b1010), Uint8Array.of(0b0101))).toBe(4);
  });
});

describe('reuseCaption', () => {
  it('covers every mode × reuse combination', () => {
    expect(text(reuseCaption('CBC', false, 0, 0))).toContain('fresh random IV');
    expect(text(reuseCaption('CTR', false, 0, 3))).toContain('fresh random nonce');
    expect(text(reuseCaption('CBC', true, 1, 0))).toContain('1 identical block');
    expect(text(reuseCaption('CTR', true, 0, 33))).toContain('33 bytes come out as 00');
  });
});

describe('tamperCaption, from a real tamper run', () => {
  it('reports what each mode actually did to the default flip', async () => {
    const plain = ascii(TAMPER_TEXT);
    const key = randomBytes(16);
    const iv = randomBytes(16);
    const nonce = randomBytes(12);
    const cbc = (await cbcEncrypt(key, iv, plain))!;
    const ctr = (await ctrCrypt(key, iv, plain))!;
    const gcm = (await gcmEncrypt(key, nonce, plain))!;
    for (const ct of [cbc, ctr, gcm]) ct[TAMPER_DEFAULT_BYTE] ^= 1;
    const ctrOut = (await ctrCrypt(key, iv, ctr))!;
    const r = {
      cbcChanged: changedBytes(plain, (await cbcDecrypt(key, iv, cbc))!).length,
      ctrChanged: changedBytes(plain, ctrOut).length,
      gcmRefused: !(await gcmDecrypt(key, nonce, gcm))!.ok,
    };
    // The amount's last digit: '0' ^ 1 = '1', so 100 silently becomes 101.
    expect(readable(ctrOut)).toContain('"amount":101,');
    expect(r.ctrChanged).toBe(1);
    expect(r.cbcChanged).toBeGreaterThan(8);
    expect(r.gcmRefused).toBe(true);
    const c = text(tamperCaption(true, TAMPER_DEFAULT_BYTE, r));
    expect(c).toContain(`CTR silently changes 1 byte`);
    expect(c).toContain('GCM refuses to decrypt');
    expect(text(tamperCaption(false, TAMPER_DEFAULT_BYTE, r))).toContain('Untouched');
  });
});
