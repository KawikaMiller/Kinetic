import { describe, expect, it } from 'vitest';
import { firstWordOf, sentencesOf, skimEnd, skimWords, syllables, textStats, wordsOf } from './textStats';

/** Syllable counts from a dictionary, typed by hand: the heuristic must match each exactly, except the few words listed in KNOWN_OFF_BY_ONE. */
const DICTIONARY: Record<string, number> = {
  the: 1, cat: 1, migration: 3, database: 3, checkout: 2, engineer: 3, approve: 2, deadline: 2, conclusion: 3,
  write: 1, writing: 2, technical: 3, communicate: 4, communicating: 5, information: 4, reader: 2, readers: 2,
  incident: 3, update: 2, important: 3, because: 2, therefore: 2, recommend: 3, recommendation: 5, trade: 1,
  decision: 3, document: 3, schema: 2, service: 2, available: 4, example: 3, simple: 2, little: 2, people: 2,
  table: 2, uncertainty: 4, rolled: 1, locked: 1, started: 2, replayed: 2, expected: 3, orders: 2, failed: 1,
  create: 2, created: 3, queue: 1, single: 2, whole: 1, make: 1, makes: 1, hedge: 1, hedges: 2, voice: 1,
  active: 2, passive: 2, bullets: 2, deploy: 2, deployment: 3, release: 2, rollback: 2, monitor: 3, alert: 2,
  threshold: 2, runbook: 2, database_: 3, every: 2, different: 3, everyone: 3, business: 2, area: 3, idea: 3,
  science: 2, quiet: 2, fire: 1, hour: 1, player: 2, being: 2, create_: 2, evaluate: 4, usually: 3, really: 2,
  scenario: 4, option: 2, options: 2, choose: 1, choice: 1, strategy: 3, latency: 3, throughput: 2, review: 2,
};

/**
 * Words the heuristic is known to miss by one (a silent or split vowel it cannot see). They are listed
 * so the rest of the dictionary can be held to an exact match instead of hiding behind a tolerance.
 */
const KNOWN_OFF_BY_ONE = new Set(['queue', 'business', 'area', 'idea', 'science', 'quiet', 'player', 'being', 'usually', 'scenario', 'strategy', 'every', 'different', 'everyone', 'therefore', 'whole', 'hedges', 'evaluate']);

describe('syllables', () => {
  for (const [word, expected] of Object.entries(DICTIONARY)) {
    const w = word.replace('_', '');
    if (KNOWN_OFF_BY_ONE.has(w)) {
      it(`${w} is a known approximation, within one syllable of ${expected}`, () => {
        expect(Math.abs(syllables(w) - expected)).toBeLessThanOrEqual(1);
      });
    } else {
      it(`${w} is exactly ${expected} syllables`, () => {
        expect(syllables(w)).toBe(expected);
      });
    }
  }

  it('counts the -ed after t or d as its own syllable, as in the words the lesson text uses', () => {
    for (const [w, n] of [['needed', 2], ['expected', 3], ['created', 3], ['updated', 3], ['added', 2], ['started', 2]] as const) {
      expect(syllables(w)).toBe(n);
    }
  });

  it('drops the silent -ed elsewhere', () => {
    for (const [w, n] of [['rolled', 1], ['locked', 1], ['failed', 1], ['replayed', 2]] as const) expect(syllables(w)).toBe(n);
  });

  it('reads a number or a time as one beat and never returns less than one', () => {
    expect(syllables('09:35')).toBe(1);
    expect(syllables('4')).toBe(1);
    expect(syllables('a')).toBe(1);
  });
});

describe('wordsOf and sentencesOf', () => {
  it('keeps contractions, times and versions as one word', () => {
    expect(wordsOf("It's 10:20 UTC on v1.2, don't worry.")).toEqual(["It's", '10:20', 'UTC', 'on', 'v1.2', "don't", 'worry']);
  });

  it('splits sentences on . ! ? and counts each bullet as a sentence', () => {
    expect(sentencesOf('One. Two! Three?')).toHaveLength(3);
    expect(sentencesOf('Next steps:\n- Replay it.\n- Fix the runbook.')).toEqual(['Next steps:', '- Replay it.', '- Fix the runbook.']);
  });

  it('does not split on a decimal point or a time', () => {
    expect(sentencesOf('It took 4.5 minutes, ending at 10:20.')).toHaveLength(1);
  });

  it('has no sentences in empty text', () => {
    expect(sentencesOf('  \n ')).toEqual([]);
  });
});

describe('textStats', () => {
  it('matches the Flesch-Kincaid formula worked by hand', () => {
    // "The cat sat on the mat." is 6 words, 6 syllables, 1 sentence: 0.39*6 + 11.8*1 - 15.59 = -1.45
    const s = textStats('The cat sat on the mat.');
    expect(s.words).toBe(6);
    expect(s.sentences).toBe(1);
    expect(s.grade).toBeCloseTo(-1.45, 2);
    // Flesch reading ease: 206.835 - 1.015*6 - 84.6*1 = 116.145
    expect(s.ease).toBeCloseTo(116.145, 2);
  });

  it('averages words over sentences', () => {
    const s = textStats('The cat sat. The cat sat on the old mat.');
    expect(s.sentences).toBe(2);
    expect(s.words).toBe(10);
    expect(s.perSentence).toBeCloseTo(5, 5);
  });

  it('scores longer sentences and longer words as a higher grade', () => {
    const plain = textStats('We fixed it. It works now. Please check it.');
    const dense = textStats('Notwithstanding considerable organisational complications, the infrastructure consolidation necessitated comprehensive reconfiguration.');
    expect(dense.grade).toBeGreaterThan(plain.grade + 10);
  });

  it('returns zeros for text with no words instead of NaN', () => {
    expect(textStats('')).toEqual({ words: 0, sentences: 0, perSentence: 0, syllablesPerWord: 0, grade: 0, ease: 0 });
  });
});

describe('firstWordOf and skimWords', () => {
  const text = 'Alpha beta. Gamma delta epsilon. Zeta eta theta iota. Please approve it.';

  it('counts the 1-based word where the first matching sentence starts', () => {
    expect(firstWordOf(text, /approve/)).toBe(10);
    expect(firstWordOf(text, /Alpha/)).toBe(1);
    expect(firstWordOf(text, /Gamma/)).toBe(3);
  });

  it('is null when nothing matches', () => {
    expect(firstWordOf(text, /missing/)).toBeNull();
  });

  it('reads the first three sentences when skimming', () => {
    expect(skimWords(text)).toBe(2 + 3 + 4);
    expect(skimWords(text, 1)).toBe(2);
  });

  it('puts the skim marker right after the third sentence, and is 0 for no text', () => {
    expect(text.slice(0, skimEnd(text))).toBe('Alpha beta. Gamma delta epsilon. Zeta eta theta iota.');
    expect(skimEnd('')).toBe(0);
  });
});
