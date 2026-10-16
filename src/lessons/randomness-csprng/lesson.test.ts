import { describe, expect, it } from 'vitest';
import { classifyScore, emptyClassify, sortedCount } from '../../core/classify';
import { expectCaption } from '../../core/testing/captions';
import { sceneElements, sharedSceneComponents } from '../../core/testing/sceneKeys';
import { RANGE } from './bias';
import { biasCaption, distinctLines, pairsCaption, planesCaption, recoverCaption, seedCaption } from './captions';
import { FACTS } from './facts';
import lesson from './index';
import { PRESETS, presetById } from './lcg';
import { OPENING } from './opening';
import { COARSENESS, MAX_OUTPUTS, WINDOWS } from './recovery';
import { KEY, USES } from './sources';

const sources = import.meta.glob(['./*.ts', './*.tsx', '!./*.test.ts'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

describe('scenes', () => {
  it('every scene component carries its own key and none is shared', () => {
    const els = sceneElements('randomness-csprng');
    expect(els).toHaveLength(6);
    expect(els.every((e) => e.keyed)).toBe(true);
    expect(sharedSceneComponents('randomness-csprng')).toEqual([]);
  });

  it('each scene opens on fixed defaults', () => {
    expect(OPENING.scene).toBe('pairs');
    expect(OPENING.pairs).toEqual({ preset: 'toy', seed: 0, count: 200 });
    expect(OPENING.planes).toEqual({ count: 2000, degrees: 30, seed: 1 });
    expect(OPENING.recover).toEqual({ seed: 12_345, revealed: 0 });
    expect(OPENING.seed).toEqual({ coarseness: 'seconds', window: 'day' });
    expect(OPENING.bias.range).toBe(6);
  });
});

describe('try-this entries, each from the default state', () => {
  it('try-this 1: the toy\'s 200 pairs lie on 5 lines against a bound of 11; RANDU at seed 0 is a single point; at seed 1 it uses many lines', () => {
    expect([FACTS.toyLines, FACTS.toyBound]).toEqual([5, 11]);
    expect(FACTS.randuSeed1Lines).toBeGreaterThan(12);
    expect(distinctLines(presetById('randu'), 0, 200)).toBe(1);
    expect(expectCaption(pairsCaption(presetById('randu'), 0, 200))).toContain('stays at 0');
    expect(lesson.tryThis[0]).toContain('lie on 5 lines, against a bound of 11');
  });

  it('try-this 2: the edge-on angle rounds to 146 degrees and the 2,000 default triples use planes out of the 15', () => {
    expect(FACTS.edgeOn).toBe(146);
    expect(FACTS.planesTotal).toBe(15);
    expect(FACTS.planesInSample).toBeLessThanOrEqual(15);
    expect(FACTS.planesInSample).toBeGreaterThan(8);
    expect(lesson.tryThis[1]).toContain('146 degrees');
  });

  it('try-this 3: with the default hidden seed, five outputs leave 4,096, 257, 29, 3 and 1 states and the predictions match', () => {
    expect(FACTS.counts.slice(0, 5)).toEqual([4096, 257, 29, 3, 1]);
    expect(FACTS.firstUnique).toBe(5);
    expect(FACTS.predicted).toBe(true);
    expect(lesson.tryThis[2]).toContain('4,096, 257, 29, 3 and 1');
  });

  it('try-this 4: a day of whole seconds is 86,400 seeds and 16.4 bits, milliseconds 26.4 bits, the system value 128', () => {
    expect([FACTS.daySeeds, FACTS.dayBits, FACTS.msBits, FACTS.systemBits]).toEqual([86_400, '16.4', '26.4', 128]);
    expect(lesson.tryThis[3]).toContain('86,400 seeds, 16.4 bits');
  });

  it('try-this 5: byte % 6 gives 43 43 43 43 42 42, rejection at 252 gives 42 each, and 8 divides 256', () => {
    expect([FACTS.bias6, FACTS.limit6, FACTS.rejected6]).toEqual(['43 43 43 43 42 42', 252, 42]);
    expect(lesson.tryThis[4]).toContain('43 43 43 43 42 42');
  });

  it('the sorting board: with only the first use sorted and right the score is 1 of 8', () => {
    expect([FACTS.firstOnlyRight, FACTS.sorted]).toEqual([1, 8]);
    const board = emptyClassify(USES);
    expect(sortedCount(USES, board.answers)).toBe(0);
    expect(classifyScore(USES, KEY, { ...board.answers, [USES[0].id]: KEY[USES[0].id] })).toBe(1);
  });
});

describe('the control cross product', () => {
  it('every preset, seed edge and count gives a clean pairs caption', () => {
    for (const p of PRESETS) for (const seed of [0, 1, 65_535]) for (const count of [10, 200, 5000]) {
      expect(expectCaption(pairsCaption(p, seed, count)), `${p.id} ${seed} ${count}`).not.toMatch(/NaN|undefined|\[object/);
    }
  });

  it('every angle edge and count gives a clean planes caption', () => {
    for (const degrees of [0, 30, 146, 147, 180]) for (const count of [100, 5000]) expect(expectCaption(planesCaption(1, count, degrees, 12))).not.toMatch(/NaN|undefined|\[object/);
    expect(expectCaption(planesCaption(1, 2000, 146, 15))).toContain('edge on');
  });

  it('every number of revealed outputs gives a clean recovery caption', () => {
    for (let r = 0; r <= MAX_OUTPUTS; r++) for (const predicted of [false, true]) expect(expectCaption(recoverCaption(r, FACTS.counts, predicted && r >= 5))).not.toMatch(/NaN|undefined|\[object/);
  });

  it('every coarseness and window gives a clean seed caption', () => {
    for (const c of COARSENESS) for (const w of WINDOWS) expect(expectCaption(seedCaption(c.id, w.id))).not.toMatch(/NaN|undefined|\[object/);
  });

  it('every range from 2 to 20 gives a bias caption that quotes its own counts', () => {
    for (let n = RANGE.min; n <= RANGE.max; n++) {
      const text = expectCaption(biasCaption(n));
      expect(text).not.toMatch(/NaN|undefined|\[object/);
      if (256 % n === 0) expect(text).toContain('unbiased');
      else expect(text).toContain(`${Math.floor(256 / n)} each`);
    }
  });
});

describe('the lesson stays inside the page and operates on nothing real', () => {
  const FORBIDDEN = /\bfetch\(|XMLHttpRequest|WebSocket|sendBeacon|\beval\(|new Function|localStorage|sessionStorage/;

  it('makes no network call, no eval and stores nothing', () => {
    expect(Object.keys(sources).length).toBeGreaterThan(10);
    for (const [file, text] of Object.entries(sources)) expect(text, file).not.toMatch(FORBIDDEN);
  });

  it('never reads Math.random output: the only random source in the source is crypto.getRandomValues', () => {
    for (const [file, text] of Object.entries(sources)) expect(text.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter((l) => !l.trim().startsWith('//')).join('\n'), file).not.toMatch(/Math\.random\(/);
    expect(sources['./PairsScene.tsx']).toContain('crypto.getRandomValues');
  });

  it('chips the toy generators and the real source on screen, and hedges what it quotes from memory', () => {
    expect(sources['./PairsScene.tsx']).toContain('<Provenance kind="toy">');
    expect(sources['./PairsScene.tsx']).toContain('<Provenance kind="real">');
    expect(sources['./PairsScene.tsx']).toContain('<Provenance kind="from-memory">');
    expect(sources['./SourcesScene.tsx']).toContain('<Provenance kind="from-memory">');
    expect(sources['./RecoverScene.tsx']).toContain('<Provenance kind="toy">');
  });
});
