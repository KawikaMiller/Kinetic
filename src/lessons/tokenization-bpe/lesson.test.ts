import { describe, expect, it } from 'vitest';
import { pctText } from '../../core/format';
import { expectCaption } from '../../core/testing/captions';
import { sceneElements } from '../../core/testing/sceneKeys';
import { UNKNOWN, applyMerge, bestPair, pairText, totalSymbols, trainMerges, type Pair } from './bpe';
import { bytesCaption, costCaption, lettersCaption, mergeCaption, vocabCaption } from './captions';
import { classicStart, greedyTotal, stateAfter, stepReports } from './classic';
import { CLASSIC_MERGES, CLASSIC_WORDS, ILLUSTRATIVE_PRICE_PER_MILLION, ILLUSTRATIVE_WINDOWS, SENTENCES, tokenCost } from './corpus';
import lesson from './index';
import { bytesOpening, costOpening, mergeOpening, vocabOpening } from './openings';
import { prepare } from './text';
import { byteLength, paragraphTokenizer, tokenStats, tokenViews } from './view';

const mergeView = (path: readonly Pair[]) => {
  const state = stateAfter(path);
  const best = bestPair(state);
  return {
    path,
    last: stepReports(path).at(-1) ?? null,
    total: totalSymbols(state),
    greedyTotal: greedyTotal(path.length),
    next: best ? { pair: best, count: best.count } : null,
  };
};

describe('try-this entries, from the default state, as written', () => {
  it('try-this 1: ten greedy merges give the listed pairs and counts; w e by hand leaves 87 symbols against 86', () => {
    expect(mergeOpening().path).toEqual([]);
    let state = classicStart();
    const path: Pair[] = [];
    for (let i = 0; i < 10; i++) {
      const best = bestPair(state)!;
      expect([best.left, best.right, best.count]).toEqual([...CLASSIC_MERGES[i]]);
      path.push(best);
      state = applyMerge(state, best);
    }
    const hand: Pair[] = [{ left: 'w', right: 'e' }];
    expect(totalSymbols(stateAfter(hand))).toBe(87);
    expect(greedyTotal(1)).toBe(86);
    const text = expectCaption(mergeCaption(mergeView(hand)));
    expect(text).toContain('Merge 1: w e (8 times) removed 8 symbols');
    expect(text).toContain('The most frequent pair, e s (9 times), would have removed 9');
    expect(text).toContain('The corpus is now 87 symbols; greedy merges after the same 1 steps would leave 86');
  });

  it('try-this 2: at 60 merges the opening text is 19 tokens, 2.63 characters per token, 2 of 8 words whole; 0 merges 51 tokens; 200 merges 15', () => {
    const open = vocabOpening();
    const full = paragraphTokenizer('chars');
    const at = (m: number) => tokenStats(full.withMerges(m), open.text);
    expect(open.merges).toBe(60);
    expect([at(60).tokens, at(60).charsPerToken!.toFixed(2), at(60).whole, at(60).words]).toEqual([19, '2.63', 2, 8]);
    expect(at(0).tokens).toBe(51);
    expect(at(200).tokens).toBe(15);
    expect(expectCaption(vocabCaption({ merges: 60, vocabulary: full.withMerges(60).vocabulary.length, stats: at(60) }))).toContain('your text is 19 tokens for 50 characters, 2.63 characters per token');
  });

  it('try-this 3: "café" is 5 tokens with one <unk> in characters mode, 6 tokens with none in bytes mode (é = c3 a9); Greek needs 43 against English 9', () => {
    const open = bytesOpening();
    expect(open).toEqual({ mode: 'chars', text: 'café' });
    const chars = paragraphTokenizer('chars');
    const bytes = paragraphTokenizer('bytes');
    const charTokens = chars.encode('café');
    expect(charTokens.length).toBe(5);
    expect(charTokens.filter((t) => t === UNKNOWN).length).toBe(1);
    const byteViews = tokenViews(bytes, bytes.encode('café'));
    expect(byteViews.length).toBe(6);
    expect(byteViews.some((v) => v.unknown)).toBe(false);
    expect(byteViews.map((v) => v.hex).slice(3, 5)).toEqual(['c3', 'a9']);
    const greek = SENTENCES.find((s) => s.language === 'Greek')!;
    const english = SENTENCES.find((s) => s.language === 'English')!;
    expect([bytes.encode(greek.text).length, bytes.encode(english.text).length]).toEqual([43, 9]);
    const charViews = tokenViews(chars, charTokens);
    expect(expectCaption(bytesCaption('chars', charViews, 4, byteLength('café')))).toContain('1 of 5 tokens are <unk>');
    expect(expectCaption(bytesCaption('bytes', byteViews, 4, 5))).toContain('4 characters are 5 UTF-8 bytes, split into 6 tokens');
  });

  it('try-this 4: the first sentence is 42 toy tokens, 4.1% of 1,024, 0.000105, and 16.4% of 256', () => {
    const open = costOpening();
    const tokens = paragraphTokenizer('bytes').encode(prepare(open.doc).text).length;
    expect(tokens).toBe(42);
    expect(open.window).toBe(1024);
    const cost = tokenCost(tokens, ILLUSTRATIVE_PRICE_PER_MILLION);
    expect(cost.toFixed(6)).toBe('0.000105');
    expect(pctText(tokens / 1024, 1)).toBe('4.1%');
    expect(pctText(tokens / ILLUSTRATIVE_WINDOWS[0], 1)).toBe('16.4%');
    expect(expectCaption(costCaption({ tokens, price: 2.5, cost, window: 256, share: tokens / 256 }))).toContain('use 16.4% of a 256-token window');
    expect(expectCaption(costCaption({ tokens: 300, price: 2.5, cost: 0.00075, window: 256, share: 300 / 256 }))).toContain('over the window');
  });

  it('try-this 5: "tokenizer" has 2 e\'s and 1 id; 2024202520262027 is 9 pieces: 202, 4, 202, 5, 202, 6, 202, 7 and the end marker', () => {
    const open = costOpening();
    const bytes = paragraphTokenizer('bytes');
    const word = tokenViews(bytes, bytes.encode(open.word));
    expect(word.length).toBe(1);
    expect(open.word.length).toBe(9);
    const truth = Array.from(open.word).filter((c) => c === 'e').length;
    expect(truth).toBe(2);
    expect(expectCaption(lettersCaption(open.word, word, 'e', truth))).toContain('has 2 copies of "e", but this toy tokenizer gives 1 id');
    const strawberry = tokenViews(bytes, bytes.encode('strawberry'));
    expect(strawberry.length, 'strawberry stays nearly one id per letter in this toy').toBe(9);
    const digits = bytes.encode(open.number);
    expect(digits.length).toBe(9);
    expect(digits.slice(0, 8).map((t) => tokenViews(bytes, [t])[0].text)).toEqual(['202', '4', '202', '5', '202', '6', '202', '7']);
  });
});

describe('captions are computed from the model', () => {
  it('the merge caption states the first pair before any merge and the real step report after each of the ten greedy merges', () => {
    const start = expectCaption(mergeCaption(mergeView([])));
    expect(start).toContain('95 symbols in all');
    expect(start).toContain('e s (9 times)');
    const path = trainMerges(CLASSIC_WORDS, 'chars', 10).merges;
    for (let k = 1; k <= 10; k++) {
      const view = mergeView(path.slice(0, k));
      const text = expectCaption(mergeCaption(view));
      expect(text).toContain(`Merge ${k}: ${pairText(path[k - 1])} (${path[k - 1].count} times)`);
      expect(text).toContain('That was the most frequent pair.');
      expect(text).toContain(`The corpus is now ${view.total} symbols; greedy merges after the same ${k} steps would leave ${greedyTotal(k)}`);
      expect(view.total).toBe(greedyTotal(k));
    }
  });

  it('the vocabulary caption quotes the real counts for every slider stop of 0, 50, 100, 150 and 200 and for empty text', () => {
    const full = paragraphTokenizer('chars');
    for (const m of [0, 50, 100, 150, 200]) {
      const t = full.withMerges(m);
      const s = tokenStats(t, vocabOpening().text);
      const text = expectCaption(vocabCaption({ merges: m, vocabulary: t.vocabulary.length, stats: s }));
      expect(text).toContain(`the vocabulary has ${t.vocabulary.length} entries`);
      expect(text).toContain(`${s.tokens} tokens for ${s.characters} characters`);
      expect(text).toContain(`${s.whole} of ${s.words} words stayed whole`);
    }
    expect(expectCaption(vocabCaption({ merges: 5, vocabulary: 49, stats: tokenStats(full, '') }))).toContain('0 tokens');
  });

  it('the bytes caption: unknown count in character mode and the byte total in byte mode, for each example text', () => {
    for (const text of ['café', '🙂', '日本語', 'naïve résumé', 'plain']) {
      const chars = paragraphTokenizer('chars');
      const views = tokenViews(chars, chars.encode(text));
      const unknown = views.filter((v) => v.unknown).length;
      const caption = expectCaption(bytesCaption('chars', views, Array.from(text).length, byteLength(text)));
      expect(caption.includes('<unk>'), text).toBe(unknown > 0);
      if (unknown > 0) expect(caption).toContain(`${unknown} of ${views.length} tokens are <unk>`);
      const bytes = paragraphTokenizer('bytes');
      const byteViews = tokenViews(bytes, bytes.encode(text));
      expect(byteViews.some((v) => v.unknown)).toBe(false);
      expect(expectCaption(bytesCaption('bytes', byteViews, Array.from(text).length, byteLength(text)))).toContain(`${byteLength(text)} UTF-8 bytes`);
    }
  });

  it('the digits and letters claims are scoped, never stated as the only explanation', () => {
    const bytes = paragraphTokenizer('bytes');
    const views = tokenViews(bytes, bytes.encode('strawberry'));
    const text = expectCaption(lettersCaption('strawberry', views, 'r', 3));
    expect(text).toContain('one reason, often cited');
    expect(text).toContain('not the only one');
  });
});

describe('quiz answers, from independent oracles', () => {
  it('Q3: the first merge is e s with 9 occurrences; w e has 8 and l o 7 (the distractors are real pairs with their true counts)', () => {
    const pairs = new Map(
      [...classicStart().counts].map(([key, count]) => [key.replace('\u0001', ' '), count]),
    );
    expect(pairs.get('e s')).toBe(9);
    expect(pairs.get('w e')).toBe(8);
    expect(pairs.get('l o')).toBe(7);
    expect(pairs.get('n e')).toBe(6);
    expect(lesson.quiz[2].options[lesson.quiz[2].answer]).toBe('e s, found 9 times');
  });

  it('Q4: any text, including accents and emoji, encodes in bytes mode with no unknown symbol; characters mode loses the unseen ones', () => {
    const bytes = paragraphTokenizer('bytes');
    for (const text of ['café', '🙂🙂', '日本語', 'Ελληνικά', 'ñ́']) {
      expect(tokenViews(bytes, bytes.encode(text)).some((v) => v.unknown)).toBe(false);
      expect(bytes.decode(bytes.encode(text))).toBe(text);
    }
    const chars = paragraphTokenizer('chars');
    expect(chars.encode('日本語')).toContain(UNKNOWN);
  });

  it('Q2: the merge list is frozen after fitting: encoding many texts, and taking a smaller vocabulary, leave it exactly as it was', () => {
    const tokenizer = paragraphTokenizer('chars');
    const saved = JSON.stringify(tokenizer.merges);
    for (const text of ['the cat', 'zzzz qqqq', 'tokenizer tokenizer', 'café 🙂', '']) tokenizer.encode(text);
    tokenizer.withMerges(10).encode('the newest');
    expect(JSON.stringify(tokenizer.merges)).toBe(saved);
    expect(tokenizer.merges.length).toBe(200);
  });
});

describe('scenes', () => {
  it('every scene the Stage returns carries its own key', () => {
    const elements = sceneElements('tokenization-bpe');
    expect(elements.map((e) => e.component)).toEqual(['VocabScene', 'BytesScene', 'TokenCostScene', 'MergeScene']);
    for (const element of elements) expect(element.keyed, element.component).toBe(true);
  });
});
