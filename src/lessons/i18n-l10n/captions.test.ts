import { describe, expect, it } from 'vitest';
import { captionText, expectCaption } from '../../core/testing/captions';
import {
  formatIntro, layoutIntro, sentenceIntro, countCaption, formatCaption, growthPct, layoutCaption, naiveMessage, orderCaption, overflows,
} from './captions';
import { COUNT_RANGE, LOCALES } from './model';

describe('captions', () => {
  it('read cleanly for every locale and every count', () => {
    for (const l of LOCALES) {
      expectCaption(orderCaption(l));
      for (let n = COUNT_RANGE.min; n <= COUNT_RANGE.max; n++) {
        expectCaption(formatCaption(l, n));
        expectCaption(countCaption(l, n));
      }
    }
    for (const intro of [formatIntro, sentenceIntro, layoutIntro]) expectCaption(intro);
  });

  it('Polish 2: the English rule writes the wrong form, and the caption quotes it', () => {
    expect(naiveMessage('pl-PL', 2)).toBe('2 przedmiotu w koszyku');
    const text = captionText(formatCaption('pl-PL', 2));
    expect(text).toContain('plural category few');
    expect(text).toContain('“2 przedmiotu w koszyku”');
    expect(text).toContain('the wrong form');
  });

  it('English 2: the English rule is right and the caption says so', () => {
    expect(captionText(formatCaption('en-US', 2))).toContain('happens to give the same words');
  });

  it('Japanese: the glued order is called out, English agrees with itself', () => {
    expect(captionText(orderCaption('ja-JP'))).toContain('the list first');
    expect(captionText(orderCaption('en-US'))).toContain('the same as the message');
  });

  it('word order: same-order locales do not claim a word-order win, ja does', () => {
    for (const l of ['de-DE', 'fr-FR'] as const) {
      const text = captionText(orderCaption(l));
      expect(text, l).toContain('item still comes first');
      expect(text, l).toContain('moved the verb');
      expect(text, l).not.toContain('always the item first');
    }
    expect(captionText(orderCaption('ja-JP'))).toContain('always the item first');
  });

  it('count sentence: English 1 is wrong with fixed text, English 3 is not', () => {
    expect(captionText(countCaption('en-US', 1))).toContain('the fixed text has the wrong words');
    expect(captionText(countCaption('en-US', 3))).toContain('happens to read the same');
  });
});

describe('layout caption', () => {
  const spill = { text: 190, room: 126, english: 78 };

  it('says the label spills when it needs more than the room, with the measured numbers', () => {
    expect(overflows(spill)).toBe(true);
    expect(growthPct(spill)).toBe(144);
    const text = captionText(expectCaption(layoutCaption('de-DE', false, spill)));
    expect(text).toContain('144% wider than the English one');
    expect(text).toContain('needs 190 px');
    expect(text).toContain('has 126 px');
    expect(text).toContain('the text spills out');
  });

  it('says it fits when it does, and handles a shorter label', () => {
    const fits = { text: 70, room: 126, english: 78 };
    expect(overflows(fits)).toBe(false);
    expect(growthPct(fits)).toBe(-10);
    expect(captionText(layoutCaption('ja-JP', false, fits))).toContain('10% narrower than the English one');
    expect(captionText(layoutCaption('ja-JP', false, fits))).toContain('it fits');
  });

  it('falls back to the intro before anything is measured, and names pseudo-localisation', () => {
    expect(layoutCaption('en-US', false, null)).toBe(layoutIntro);
    expect(captionText(layoutCaption('en-US', true, spill))).toContain('The pseudo-localised label');
  });
});
