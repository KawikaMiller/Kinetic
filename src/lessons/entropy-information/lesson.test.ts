import { describe, expect, it } from 'vitest';
import lesson from './index';
import {
  ALPHABET_BOUNDS, BELIEF_PRESETS, COIN_PRESETS, COIN_STEP, GENERATORS, LENGTH_BOUNDS, TEXT_PRESETS, TRUE_DIST, blockBitsPerFlip, entropy, generatedBits, setBelief, textEntropy,
} from './model';
import { ITEMS, ITEM_ENTROPY, OPTIMAL_QUESTIONS, evenByCount, expectedQuestions, hintSplit, openSets, optimalTree, rootNode, type QNode } from './questions';
import { beliefCaption, coinCaption, generatedCaption, questionsCaption, questionsVerdict, sampleCaption, textCaption } from './text';

const NO_JUNK = /NaN|undefined|null|Infinity/;

describe('try-this entries, from the default state, as written', () => {
  it('try-this 1: p = 0.10 gives entropy 0.4690 and four-flip blocks 0.4926 bits per flip', () => {
    expect(COIN_PRESETS).toContain(0.1);
    const closedForm = -0.1 * Math.log2(0.1) - 0.9 * Math.log2(0.9);
    expect(closedForm.toFixed(4)).toBe('0.4690');
    expect(blockBitsPerFlip(0.1, 4).toFixed(4)).toBe('0.4926');
    expect(coinCaption(0.1)).toContain('0.4690');
    expect(coinCaption(0.1)).toContain('0.4926');
    expect(lesson.tryThis[0]).toContain('0.4690');
    expect(lesson.tryThis[0]).toContain('0.4926');
  });

  it('try-this 2: password reads 2.750 bits per character and 22.00 bits in all against 64 for ASCII; the default is mississippi at 1.823', () => {
    expect(TEXT_PRESETS.some((p) => p.text === 'password')).toBe(true);
    const t = textEntropy('password')!;
    expect(t.bitsPerChar).toBe(2.75);
    expect(textCaption(t)).toContain('2.750 bits per character, 22.00 bits in all, against 64 bits');
    expect(lesson.tryThis[1]).toContain('2.750 bits per character, 22.00 bits in all, against 64');
    expect(lesson.tryThis[1]).toContain('mississippi, is 1.823');
  });

  it('try-this 3: 4 words give 51.70 bits, below the default 12 letters and digits at 71.45', () => {
    expect(generatedBits(GENERATORS[0].length, GENERATORS[0].alphabet).toFixed(2)).toBe('71.45');
    expect(generatedBits(GENERATORS[1].length, GENERATORS[1].alphabet).toFixed(2)).toBe('51.70');
    expect(generatedCaption(4, 7776)).toContain('= 51.70 bits');
    expect(lesson.tryThis[2]).toContain('51.70 bits, below the 71.45 bits');
  });

  it('try-this 4: Split by count gives 3.000, the best tree 2.630, just above the entropy floor 2.571', () => {
    expect(expectedQuestions(evenByCount(ITEMS.map((_, i) => i)))!.toFixed(3)).toBe('3.000');
    expect(OPTIMAL_QUESTIONS.toFixed(3)).toBe('2.630');
    expect(ITEM_ENTROPY.toFixed(3)).toBe('2.571');
    expect(lesson.tryThis[3]).toContain('3.000 questions');
    expect(lesson.tryThis[3]).toContain('2.630');
    expect(lesson.tryThis[3]).toContain('2.571');
  });

  it('try-this 5: uniform gives 0.085 extra bits and ruling out z is unbounded', () => {
    const uniform = BELIEF_PRESETS.find((b) => b.id === 'uniform')!.q;
    const zero = BELIEF_PRESETS.find((b) => b.id === 'zero')!.q;
    expect(beliefCaption(TRUE_DIST, uniform)).toContain('0.085 extra bits');
    expect(beliefCaption(TRUE_DIST, zero)).toContain('unbounded');
    expect(lesson.tryThis[4]).toContain('0.085');
  });
});

describe('every caption reads cleanly across its control space', () => {
  it('the coin caption at every slider position from 0 to 1 has no NaN or infinity, states p, and matches the model', () => {
    for (let i = 0; i <= 1 / COIN_STEP; i++) {
      const p = Math.round(i * COIN_STEP * 100) / 100;
      const text = coinCaption(p);
      expect(text).not.toMatch(NO_JUNK);
      expect(text).toContain(`p = ${p.toFixed(2)}`);
      expect(text).toContain(blockBitsPerFlip(p, 4).toFixed(4));
    }
    expect(coinCaption(0)).toContain('certain');
    expect(coinCaption(1)).toContain('entropy is 0 bits');
    expect(coinCaption(0.5)).toContain('exactly the entropy');
    expect(coinCaption(0.1)).toContain('above the entropy');
  });

  it('the text caption handles empty, one character, one distinct symbol, non-ASCII and the cap', () => {
    expect(textCaption(textEntropy(''))).toContain('No symbols');
    expect(textCaption(textEntropy('a'))).toContain('1 character,');
    expect(textCaption(textEntropy('aaaa'))).toContain('nothing to code');
    expect(textCaption(textEntropy('é'))).toContain('outside ASCII');
    expect(textCaption(textEntropy('abab'))).not.toContain('outside ASCII');
    for (const p of TEXT_PRESETS) expect(textCaption(textEntropy(p.text))).not.toMatch(NO_JUNK);
    expect(sampleCaption(null, 62)).toContain('Type a string');
  });

  it('the generator caption holds at every bound of L and N', () => {
    for (const l of [LENGTH_BOUNDS.min, 12, LENGTH_BOUNDS.max]) {
      for (const n of [ALPHABET_BOUNDS.min, 62, ALPHABET_BOUNDS.max]) {
        const text = generatedCaption(l, n);
        expect(text).not.toMatch(NO_JUNK);
        expect(text).toContain(`= ${generatedBits(l, n).toFixed(2)} bits`);
      }
    }
  });

  it('the questions caption and verdict agree with the tree on every stage of a hinted build', () => {
    let tree: QNode = rootNode(ITEMS.length);
    for (let step = 0; step < 20; step++) {
      const expected = expectedQuestions(tree);
      const open = openSets(tree).length;
      const text = questionsCaption(expected, open, OPTIMAL_QUESTIONS, ITEM_ENTROPY);
      expect(text).not.toMatch(NO_JUNK);
      expect(text).toContain(ITEM_ENTROPY.toFixed(3));
      if (expected === null) expect(text).toContain(`${open} `);
      else expect(text).toContain(expected.toFixed(3));
      const next = hintSplit(tree);
      if (!next.ok) break;
      tree = next.value;
    }
    expect(questionsVerdict(OPTIMAL_QUESTIONS, OPTIMAL_QUESTIONS).tone).toBe('ok');
    expect(questionsVerdict(3, OPTIMAL_QUESTIONS)).toEqual({ text: '0.370 above the optimal tree', tone: 'orange' });
    expect(questionsVerdict(expectedQuestions(optimalTree()), OPTIMAL_QUESTIONS).tone).toBe('ok');
    expect(questionsVerdict(null, OPTIMAL_QUESTIONS).tone).toBe('muted');
  });

  it('the belief caption holds over a grid of beliefs including zeros', () => {
    const grid = [0, 0.1, 0.5, 0.9, 1];
    let unboundedSeen = 0;
    for (const a of grid) {
      for (const b of grid) {
        const q = setBelief(setBelief([0.2, 0.3, 0.5], 0, a), 1, b);
        const text = beliefCaption(TRUE_DIST, q);
        expect(text).not.toMatch(/NaN|undefined|null/);
        if (text.includes('unbounded')) {
          unboundedSeen++;
          expect(q.some((x, i) => x <= 0 && TRUE_DIST[i] > 0)).toBe(true);
        } else {
          expect(text).toContain(entropy(TRUE_DIST).toFixed(3));
        }
      }
    }
    expect(unboundedSeen).toBeGreaterThan(0);
  });
});

describe('hidden controls feed nothing', () => {
  it('the sample string only changes the sample caption, never the generator readout (L, N)', () => {
    const base = generatedCaption(12, 62);
    for (const sample of ['', 'a', 'password', 'x'.repeat(40)]) {
      sampleCaption(textEntropy(sample), 62);
      expect(generatedCaption(12, 62)).toBe(base);
    }
    expect(sampleCaption(textEntropy('password'), 62)).toContain('22.00 bits');
    expect(sampleCaption(textEntropy('password'), 62)).toContain(`${generatedBits(8, 62).toFixed(2)} bits`);
  });
});
