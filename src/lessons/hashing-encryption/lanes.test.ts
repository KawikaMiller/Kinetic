import { describe, expect, it } from 'vitest';
import { hexToBits } from '../../core/crypto';
import { bitsFlipped, charDiff, tweakOneChar } from './hashModel';
import { buildAsym, buildSym } from './keyFrames';
import { cardPlacement, KEY_SCENE_MIN_WIDTH, POS } from './keyModel';
import { answer, SCENARIOS, score, TOOL_IDS, type Tool } from './pickerModel';
import { sha } from './testVectors';

describe('① Hashing', () => {
  it.each(['hello world', 'a', 'xyz', '12345', '', 'It was the best of times'])('"Change one letter" changes exactly one character of %j', (s) => {
    const t = tweakOneChar(s);
    expect(t).not.toBe(s);
    expect(charDiff(s, t)).toBe(1);
  });

  it('bits flipped is the popcount of the XOR of the two digests', () => {
    const [a, b] = [sha('hello world'), sha('hello World')];
    const xor = BigInt(`0x${a}`) ^ BigInt(`0x${b}`);
    const popcount = [...xor.toString(2)].filter((c) => c === '1').length;
    expect(bitsFlipped(hexToBits(a), hexToBits(b))).toBe(popcount);
    expect(bitsFlipped(hexToBits(a), hexToBits(a))).toBe(0);
  });
});

describe('③ Symmetric', () => {
  const frames = buildSym();
  it('the message is ciphertext whenever it is on the wire or Eve holds a copy', () => {
    for (const f of frames) if (f.at === 'wire') expect(f.locked).toBe(true);
    const firstEve = frames.findIndex((f) => f.eve);
    expect(frames[firstEve].locked).toBe(true);
  });
  it('only Bob ever opens it, and only with the shared key', () => {
    for (const f of frames) if (f.opened) expect([f.at, f.keys]).toEqual(['bob', true]);
    for (const f of frames) if (f.locked) expect(f.keys).toBe(true);
  });
});

describe('④ Asymmetric', () => {
  const frames = buildAsym();
  it('Eve only ever tries her public key on a locked message, and it never opens for her', () => {
    for (const f of frames) if (f.eveTry) expect([f.at, f.locked, f.opened]).toEqual(['wire', true, false]);
    for (const f of frames) if (f.opened) expect(f.at).toBe('bob');
  });
  it('the key pair exists before anything is locked, and the public key is out before anyone uses it', () => {
    for (const f of frames) if (f.locked || f.sign !== 'none') expect([f.pair, f.published]).toEqual([true, true]);
  });
  it('signing happens at Bob; checking (valid, then tampered) happens at the receiver', () => {
    const signs = frames.filter((f) => f.sign !== 'none').map((f) => [f.sign, f.at]);
    expect(signs[0]).toEqual(['signed', 'bob']);
    expect(signs.slice(1).every(([, at]) => at === 'alice')).toBe(true);
    expect(signs.map(([s]) => s)).toEqual(['signed', 'verified', 'tampered', 'tampered']);
  });
  it('every frame in both lanes has a caption', () => {
    for (const f of [...frames, ...buildSym()]) expect(f.say).toBeTruthy();
  });
});

describe('key scenes fit (M-5)', () => {
  /** Pixel extent of a card of width `w` placed at `at` in a scene `W` wide. */
  const extent = (at: 'alice' | 'wire' | 'bob', w: number, W: number) => {
    const p = cardPlacement(at);
    const left = (parseFloat(p.left) / 100) * W + (parseFloat(p.x) / 100) * w;
    return [left, left + w];
  };
  it('the widest card (the tampered release, ~320 px) stays inside the scene at the minimum width', () => {
    for (const at of ['alice', 'wire', 'bob'] as const) {
      const [l, r] = extent(at, 320, KEY_SCENE_MIN_WIDTH);
      expect(l).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThanOrEqual(KEY_SCENE_MIN_WIDTH);
    }
  });
  it('three 190 px people fit side by side without overlapping or leaving the scene', () => {
    const centers = [POS.alice, POS.wire, POS.bob].map((p) => (p / 100) * KEY_SCENE_MIN_WIDTH);
    expect(centers[0] - 95).toBeGreaterThanOrEqual(0);
    expect(centers[2] + 95).toBeLessThanOrEqual(KEY_SCENE_MIN_WIDTH);
    expect(centers[1] - centers[0]).toBeGreaterThanOrEqual(190);
  });
});

describe('⑤ Which one?', () => {
  it('every tool is the answer to at least one job', () => {
    expect(new Set(SCENARIOS.map((s) => s.a))).toEqual(new Set(TOOL_IDS));
  });
  it('scores right answers, and a correct answer stays locked in', () => {
    let a: (Tool | null)[] = SCENARIOS.map(() => null);
    a = answer(a, 0, 'hash');
    expect(score(a)).toBe(0);
    a = answer(a, 0, 'slow');
    expect(score(a)).toBe(1);
    expect(answer(a, 0, 'hash')).toBe(a);
    const all = SCENARIOS.reduce((acc, s, i) => answer(acc, i, s.a), SCENARIOS.map(() => null as Tool | null));
    expect(score(all)).toBe(SCENARIOS.length);
  });
});
