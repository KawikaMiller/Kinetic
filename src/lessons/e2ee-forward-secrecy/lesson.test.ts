import { describe, expect, it } from 'vitest';
import { sceneElements, sharedSceneComponents } from '../../core/testing/sceneKeys';
import { FACTS } from './facts';
import lesson from './index';
import { CHAIN_MESSAGES, DEFAULT_SEED, analyse, buildRun, compareModes, opensText, parsePattern, textFor, triesText } from './model';

const texts = (n: number) => Array.from({ length: n }, (_, i) => textFor(i, []));
const readIds = (readable: readonly boolean[]) => readable.flatMap((r, i) => (r ? [i + 1] : []));

describe('scenes', () => {
  it('every scene component carries its own key and none is shared between scenes', () => {
    const els = sceneElements('e2ee-forward-secrecy');
    expect(els).toHaveLength(3);
    expect(els.every((e) => e.keyed)).toBe(true);
    expect(sharedSceneComponents('e2ee-forward-secrecy')).toEqual([]);
  });
});

describe('try-this entries, in written order from the default state', () => {
  const chain = parsePattern('A'.repeat(CHAIN_MESSAGES));

  it('try-this 1: in the default symmetric mode a theft after message 4 turns 5 to 8 red, keeps 1 to 4 sealed, and prints "20 tries, 0 opened"', async () => {
    const run = (await buildRun(chain, texts(CHAIN_MESSAGES), 'symmetric', DEFAULT_SEED))!;
    const a = await analyse(run, chain, 'symmetric', 'A', 4, DEFAULT_SEED);
    expect(readIds(a.readable)).toEqual([5, 6, 7, 8]);
    for (let i = 0; i < 4; i++) expect(triesText(a.tries[i])).toBe(`${FACTS.symmetricTries} tries, 0 opened`);
    expect(a.candidates).toBe(FACTS.symmetricTries);
    expect(lesson.tryThis[0]).toContain('"20 tries, 0 opened"');
  });

  it('try-this 2: the one fixed key opens all eight, past and future', async () => {
    const run = (await buildRun(chain, texts(CHAIN_MESSAGES), 'symmetric', DEFAULT_SEED))!;
    const a = await analyse(run, chain, 'fixed', 'A', 4, DEFAULT_SEED);
    expect(readIds(a.readable)).toHaveLength(8);
    expect(a.cloned.every(Boolean)).toBe(true);
    expect(lesson.tryThis[1]).toContain('opens all eight');
  });

  it('try-this 3: AABBAB with Alice stolen after message 1: 2, 3, 4 read, 5 and 6 sealed, healing at message 5', async () => {
    const pattern = parsePattern('AABBAB');
    const run = (await buildRun(pattern, texts(6), 'full', DEFAULT_SEED))!;
    const a = await analyse(run, pattern, 'full', 'A', 1, DEFAULT_SEED);
    expect(readIds(a.readable)).toEqual([2, 3, 4]);
    expect(a.cloned).toEqual(a.readable);
    expect((a.healing ?? -1) + 1).toBe(FACTS.healingDefault);
    expect(a.healsByFreshKey).toBe(true);
    expect(lesson.tryThis[2]).toContain('messages 2, 3 and 4 read, messages 5 and 6 stay sealed');
    expect(lesson.tryThis[2]).toContain('healing point is message 5');
  });

  it('try-this 4: six messages from Alice and a theft after 3 reads every later one; then one from Bob still reads and the next one from Alice is sealed', async () => {
    const mono = parsePattern('AAAAAA');
    const a = await analyse((await buildRun(mono, texts(6), 'full', DEFAULT_SEED))!, mono, 'full', 'A', 3, DEFAULT_SEED);
    expect(readIds(a.readable)).toEqual([4, 5, 6]);
    const longer = parsePattern('AAAAAABA');
    const b = await analyse((await buildRun(longer, texts(8), 'full', DEFAULT_SEED))!, longer, 'full', 'A', 3, DEFAULT_SEED);
    expect(readIds(b.readable)).toEqual([4, 5, 6, 7]);
    expect(b.healing).toBe(7);
    expect(lesson.tryThis[3]).toContain("Bob's message still reads");
  });
});

describe('manipulations', () => {
  it('manipulation 1: steal after message 4 in AAAAAA: every later message is readable, since nobody replied and no fresh key was made', async () => {
    const pattern = parsePattern('AAAAAA');
    const a = await analyse((await buildRun(pattern, texts(6), 'full', DEFAULT_SEED))!, pattern, 'full', 'A', 4, DEFAULT_SEED);
    expect(readIds(a.readable)).toEqual([5, 6]);
    expect(a.healing).toBeNull();
    expect(a.agree).toBe(true);
  });

  it('manipulation 2: in ABABAB, stealing after message 1 leaves message 3 sealed', async () => {
    const pattern = parsePattern('ABABAB');
    const a = await analyse((await buildRun(pattern, texts(6), 'full', DEFAULT_SEED))!, pattern, 'full', 'A', 1, DEFAULT_SEED);
    expect(a.readable[2]).toBe(false);
    expect(readIds(a.readable)).toEqual([2]);
  });
});

describe('the lesson text agrees with the model', () => {
  it('the mode comparison for AABBAB stolen after message 2 matches the typed key idea', async () => {
    const rows = await compareModes(parsePattern('AABBAB'), 'A', 2);
    expect(rows.map((r) => opensText(r.opens))).toEqual([FACTS.modeFixed, FACTS.modeSymmetric, FACTS.modeFull]);
    expect(lesson.keyIdeas[1]).toContain(FACTS.modeFull);
    expect(FACTS.patternSize).toBe(6);
  });
});
