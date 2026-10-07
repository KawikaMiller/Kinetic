import { describe, expect, it } from 'vitest';
import { captionText as text } from '../../core/testing/captions';
import { encryptFrames, encryptSummary, factorCaption, keygenFrames, signCaption, sizeCaption } from './frames';
import { DEFAULT_PARAMS, edited, factorToy, keygen, parseMessage, runItems, sign, unsign, type RsaParams } from './model';

const key = keygen(DEFAULT_PARAMS).key!;
const itemsOf = (mode: 'number' | 'word', t: string) => {
  const r = parseMessage({ mode, text: t }, key.n);
  if (!r.ok) throw new Error(r.error);
  return runItems(key, r.value);
};

describe('keygenFrames', () => {
  it('walks every check of the textbook key and ends on the computed key pair', () => {
    const g = keygen(DEFAULT_PARAMS);
    const frames = keygenFrames(g, 61n, 53n, 17n);
    expect(frames.length).toBe(g.steps.length + 2);
    expect(text(frames.find((f) => f.shown === 4)!.say)).toContain('n = p × q = 61 × 53 = 3,233');
    expect(text(frames.find((f) => f.shown === 8)!.say)).toContain('y = -367, so d = -367 mod 3,120 = 2,753');
    expect(text(frames.at(-1)!.say)).toContain('(n, e) = (3,233, 17)');
    expect(text(frames.at(-1)!.say)).toContain('d = 2,753');
  });

  it('ends every invalid preset on its own reason, and never claims a key', () => {
    const bad: [RsaParams, string][] = [
      [{ p: 57n, q: 53n, e: 17n }, 'p = 57 isn\'t prime: 3 × 19'],
      [{ p: 61n, q: 61n, e: 17n }, 'p and q are both 61'],
      [{ p: 61n, q: 53n, e: 15n }, 'gcd(e, φ) = 15'],
      [{ p: 61n, q: 53n, e: 65537n }, 'must be between 1 and φ = 3120'],
    ];
    for (const [p, want] of bad) {
      const frames = keygenFrames(keygen(p), p.p, p.q, p.e);
      const all = frames.map((f) => text(f.say)).join(' | ');
      expect(all).toContain(want);
      expect(text(frames.at(-1)!.say)).toMatch(/^No key\./);
      expect(all).not.toContain('Public key');
    }
  });
});

describe('encryptFrames', () => {
  it('captions each encrypt and decrypt with the computed values', () => {
    const items = itemsOf('number', '65');
    const frames = encryptFrames(key, items);
    expect(text(frames[1].say)).toBe('m = 65: c = 65¹⁷ mod 3,233 = 2,790.');
    expect(text(frames[2].say)).toContain('2,790²⁷⁵³ mod 3,233 = 65');
    expect(frames.map((f) => f.phase)).toEqual(['start', 'enc', 'dec', 'done']);
  });

  it('names repeated ciphertexts only when the message repeats', () => {
    expect(text(encryptSummary(itemsOf('word', 'ABBA')))).toContain('every copy of "A" (2,790) and "B" (524) gave the same ciphertext');
    expect(text(encryptSummary(itemsOf('word', 'HELLO')))).toContain('every copy of "L" (');
    const once = text(encryptSummary(itemsOf('word', 'HEY')));
    expect(once).not.toContain('every copy');
    expect(once).toContain('Every ciphertext decrypted back');
  });
});

describe('signCaption', () => {
  it('says valid for the signed message and rejected for every edit, from the check itself', () => {
    for (const m of [0n, 1n, 42n, 1234n, 3232n]) {
      const s = sign(key, m);
      const ok = text(signCaption(key, { m, s, received: m, recovered: unsign(key, s), valid: true }));
      expect(ok).toContain('valid signature');
      const e = edited(m, key.n);
      const bad = text(signCaption(key, { m, s, received: e, recovered: unsign(key, s), valid: unsign(key, s) === e }));
      expect(bad).toContain('signature rejected');
      expect(bad).not.toContain('valid signature');
    }
  });
});

describe('size captions', () => {
  it('reports the real factoring run and the extrapolated work', () => {
    expect(text(factorCaption(key, factorToy(key.n)))).toContain('Factored in 28 steps: n = 3,233 = 53 × 61');
    expect(text(sizeCaption(2048))).toContain('about 2¹⁰²³ trial divisions');
    expect(text(sizeCaption(2048))).toContain('years');
  });
});
