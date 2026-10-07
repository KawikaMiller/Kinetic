import { describe, expect, it } from 'vitest';
import { captionText as text } from '../../core/testing/captions';
import { analogyCaption, compareCaption, mapAgreement, num, ordinal, pairCaption, queryCaption } from './frames';
import { ANALOGIES, MAP, MAP_POINTS, VOCAB, analogy, lookup, misleadingPair, neighbours, phraseVector, project } from './model';

describe('queryCaption', () => {
  it('for every word, lists its true top 5 with their cosines and the map-agreement count', () => {
    for (const w of VOCAB) {
      const p = phraseVector(w.word);
      const top = neighbours(w.v, 5, [w.word]);
      const c = text(queryCaption(w.word, p, top));
      top.forEach((n) => expect(c).toContain(`${n.word.word} (${num(n.cos)})`));
      expect(c).toContain(`${mapAgreement(w.v, top, [w.word])} of those 5`);
    }
  });

  it('refusals and unknown words are spelled out, never NaN', () => {
    expect(text(queryCaption('', phraseVector(''), []))).toBe('Type a word or a short phrase.');
    expect(text(queryCaption('zebra stripes', phraseVector('zebra stripes'), []))).toBe(
      'None of these words are in this toy vocabulary. Not in this toy vocabulary, so ignored: zebra, stripes.',
    );
    const p = phraseVector('fixing my vehicle');
    const c = text(queryCaption('fixing my vehicle', p, p.ok ? neighbours(p.vector, 5, p.known) : []));
    expect(c).toContain('the mean of 2 word vectors');
    expect(c).toContain('so ignored: my');
    expect(c).not.toMatch(/NaN/);
  });

  it('mapAgreement counts the true neighbours among the closest dots, by brute force', () => {
    const w = lookup('truck')!;
    const top = neighbours(w.v, 5, ['truck']);
    const [x, y] = project(MAP, w.v);
    const near = VOCAB.map((v, i) => ({ w: v.word, d: Math.hypot(MAP_POINTS[i][0] - x, MAP_POINTS[i][1] - y) }))
      .filter((q) => q.w !== 'truck').sort((a, b) => a.d - b.d).slice(0, 5).map((q) => q.w);
    expect(mapAgreement(w.v, top, ['truck'])).toBe(top.filter((n) => near.includes(n.word.word)).length);
  });
});

describe('caption grammar', () => {
  it('ordinals are right, teens included', () => {
    expect([1, 2, 3, 4, 5, 11, 12, 13, 21, 22, 23, 101].map(ordinal)).toEqual(['1st', '2nd', '3rd', '4th', '5th', '11th', '12th', '13th', '21st', '22nd', '23rd', '101st']);
  });

  it('"1 of those 5 is", any other count "are", for every word', () => {
    for (const w of VOCAB) {
      const top = neighbours(w.v, 5, [w.word]);
      const k = mapAgreement(w.v, top, [w.word]);
      expect(text(queryCaption(w.word, phraseVector(w.word), top))).toContain(`${k} of those 5 ${k === 1 ? 'is' : 'are'} also among`);
    }
  });
});

describe('analogyCaption', () => {
  it('says "the answer you\'d expect" exactly when the analogy holds, and names the real top word otherwise', () => {
    for (const a of ANALOGIES) {
      const r = analogy(a);
      const c = text(analogyCaption(a));
      expect(c.includes("the answer you'd expect")).toBe(r.holds);
      expect(c).toContain(`${r.top[0].word.word} (cosine ${num(r.top[0].cos)})`);
    }
  });

  it('the success claim is literally true: kitten = cat + (puppy − dog)', () => {
    const [p, d, c, k] = ['puppy', 'dog', 'cat', 'kitten'].map((w) => lookup(w)!.v);
    k.forEach((x, i) => expect(x).toBeCloseTo(c[i] + p[i] - d[i], 12));
  });
});

describe('pair and compare captions', () => {
  it('the pair caption reports the computed distance and cosine', () => {
    const p = misleadingPair();
    const c = text(pairCaption(p.a.word, p.b.word, p.dist2d, p.cos));
    expect(c).toContain(`(${num(p.dist2d, 3)} apart)`);
    expect(c).toContain(`only ${num(p.cos)}`);
  });

  it('praises vectors over keywords only when overlap is 0 and the cosine is high', () => {
    expect(text(compareCaption('car repair', 'fixing my vehicle'))).toContain('Matching words would miss this pair');
    expect(text(compareCaption('cat food', 'cat cake'))).not.toContain('Matching words would miss');
    expect(text(compareCaption('kitten', 'truck'))).not.toContain('Matching words would miss');
    expect(text(compareCaption('hello', 'car'))).toBe('Both phrases need at least one word from the toy vocabulary to get a vector.');
  });
});
