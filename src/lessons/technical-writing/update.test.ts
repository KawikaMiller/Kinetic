import { describe, expect, it } from 'vitest';
import { diffLines, lineKind, sideOf, wordDiff } from './diff';
import { ALL_EDITS, ASK_CUE, EDIT_IDS, EDITS, NO_EDITS, renderUpdate, toggleEdit, viewOf, type EditId, type Edits } from './update';
import { sentencesOf, wordsOf } from './textStats';

const permutations = <T,>(xs: readonly T[]): T[][] =>
  xs.length <= 1 ? [[...xs]] : xs.flatMap((x, i) => permutations([...xs.slice(0, i), ...xs.slice(i + 1)]).map((rest) => [x, ...rest]));

const applyAll = (order: readonly EditId[]): Edits => order.reduce(toggleEdit, NO_EDITS);

const HEDGES = /\b(just|basically|sort of|kind of|I think|I believe|maybe|probably|quick)\b/i;

describe('the draft', () => {
  const draft = viewOf(NO_EDITS);

  it('is a wordy update of about 180 words', () => {
    expect(draft.stats.words).toBeGreaterThanOrEqual(170);
    expect(draft.stats.words).toBeLessThanOrEqual(190);
  });

  it('buries the ask far past where a skimmer stops', () => {
    expect(draft.askAt).not.toBeNull();
    expect(draft.askAt!).toBeGreaterThan(draft.skimWords * 2);
    expect(draft.askSkimmed).toBe(false);
  });

  it('is full of hedges', () => {
    expect(draft.text.match(new RegExp(HEDGES, 'gi'))!.length).toBeGreaterThanOrEqual(8);
  });
});

describe('the edits', () => {
  it('commute: all 120 orders reach the same final text', () => {
    const final = renderUpdate(ALL_EDITS);
    const orders = permutations(EDIT_IDS);
    expect(orders).toHaveLength(120);
    for (const order of orders) expect(renderUpdate(applyAll(order))).toBe(final);
  });

  it('each edit changes the text, and undoing it restores the draft', () => {
    for (const { id } of EDITS) {
      const on = toggleEdit(NO_EDITS, id);
      expect(renderUpdate(on)).not.toBe(renderUpdate(NO_EDITS));
      expect(renderUpdate(toggleEdit(on, id))).toBe(renderUpdate(NO_EDITS));
    }
  });

  it('every pair of edits changes the text differently from either alone', () => {
    const texts = new Set<string>();
    for (let mask = 0; mask < 32; mask++) {
      texts.add(renderUpdate(Object.fromEntries(EDIT_IDS.map((id, i) => [id, Boolean(mask & (1 << i))])) as unknown as Edits));
    }
    expect(texts.size).toBe(32);
  });

  it('cutting hedges removes every filler hedge and keeps the real uncertainty', () => {
    const text = renderUpdate(toggleEdit(NO_EDITS, 'hedges'));
    expect(HEDGES.test(text)).toBe(false);
    expect(text).toContain('We are still looking into why the lock lasted so long.');
  });

  it('naming the actor replaces both passives that hid an owner and keeps the one that should stay passive', () => {
    const before = renderUpdate(NO_EDITS);
    const after = renderUpdate(toggleEdit(NO_EDITS, 'voice'));
    expect(before).toMatch(/migration was run at/);
    expect(before).toMatch(/migration was rolled back/);
    expect(after).toMatch(/platform team ran the migration/);
    expect(after).toContain('The on-call engineer rolled the migration back');
    expect(after).toContain('Our on-call engineer was paged');
  });

  it('bullets turn the three next steps into three bullet lines', () => {
    const lines = renderUpdate(toggleEdit(NO_EDITS, 'bullets')).split('\n');
    expect(lines.filter((l) => l.startsWith('- '))).toHaveLength(3);
    expect(renderUpdate(NO_EDITS).split('\n').filter((l) => l.startsWith('- '))).toHaveLength(0);
  });

  it('the ask edit gives the ask an object and a deadline', () => {
    const asks = (t: string) => sentencesOf(t).filter((s) => ASK_CUE.test(s));
    expect(asks(renderUpdate(NO_EDITS))).toHaveLength(1);
    expect(asks(renderUpdate(toggleEdit(NO_EDITS, 'ask')))).toEqual(['Ask: please approve the replay job for the failed orders by Thursday 17:00 UTC.']);
  });

  it('keeps every fact in the update: nothing but wording and order changes', () => {
    const facts = ['23:10 UTC', '09:41 UTC', '10:12 UTC', '10:20 UTC', '4%', 'orders table', 'lock-time check', 'alert threshold', 'Thursday 17:00 UTC'];
    const text = renderUpdate(ALL_EDITS);
    for (const f of facts) expect(text).toContain(f);
  });
});

describe('the ask position is computed from the text', () => {
  it('starts past the skim point in the draft and inside it after the conclusion-first edit', () => {
    expect(viewOf(NO_EDITS).askSkimmed).toBe(false);
    expect(viewOf(toggleEdit(NO_EDITS, 'bluf')).askSkimmed).toBe(true);
    expect(viewOf(toggleEdit(NO_EDITS, 'ask')).askSkimmed).toBe(false);
  });

  it('finds the ask where the sentence really is', () => {
    for (const mask of [NO_EDITS, ALL_EDITS, toggleEdit(NO_EDITS, 'bluf'), toggleEdit(NO_EDITS, 'bullets')]) {
      const v = viewOf(mask);
      const words = wordsOf(v.text);
      const askWords = wordsOf(sentencesOf(v.text).find((s) => ASK_CUE.test(s))!);
      expect(words.slice(v.askAt! - 1, v.askAt! - 1 + askWords.length)).toEqual(askWords);
    }
  });

  it('moves with the text when edits shorten it', () => {
    expect(viewOf(toggleEdit(NO_EDITS, 'hedges')).askAt!).toBeLessThan(viewOf(NO_EDITS).askAt!);
  });
});

describe('the measured numbers move the way the edits claim', () => {
  const draft = viewOf(NO_EDITS);
  it('cutting hedges lowers the word count', () => {
    expect(viewOf(toggleEdit(NO_EDITS, 'hedges')).stats.words).toBeLessThan(draft.stats.words);
  });
  it('bullets add sentences and shorten the average sentence', () => {
    const v = viewOf(toggleEdit(NO_EDITS, 'bullets'));
    expect(v.stats.sentences).toBeGreaterThan(draft.stats.sentences);
    expect(v.stats.perSentence).toBeLessThan(draft.stats.perSentence);
  });
  it('all edits together make a shorter text with a lower grade level', () => {
    const v = viewOf(ALL_EDITS);
    expect(v.stats.words).toBeLessThan(draft.stats.words);
    expect(v.stats.grade).toBeLessThan(draft.stats.grade);
  });
});

describe('wordDiff', () => {
  it('rebuilds both texts from the diff', () => {
    const a = renderUpdate(NO_EDITS);
    const b = renderUpdate(toggleEdit(toggleEdit(NO_EDITS, 'hedges'), 'bluf'));
    const d = wordDiff(a, b);
    expect(sideOf(d, 'before').replace(/ *\n */g, '\n')).toBe(a);
    expect(sideOf(d, 'after').replace(/ *\n */g, '\n')).toBe(b);
  });

  it('marks exactly the removed words as deleted when hedges are cut', () => {
    const d = wordDiff('Basically, we just shipped it.', 'We shipped it.');
    expect(d.filter((t) => t.kind === 'del').map((t) => t.text)).toEqual(['Basically,', 'we', 'just']);
    expect(d.filter((t) => t.kind === 'ins').map((t) => t.text)).toEqual(['We']);
  });

  it('has no changes between identical texts', () => {
    expect(wordDiff('a b c', 'a b c').every((t) => t.kind === 'eq')).toBe(true);
  });

  it('splits into display lines and classifies each one', () => {
    const lines = diffLines(wordDiff('keep this\nremove me', 'keep this\nadd me'));
    expect(lines.map(lineKind)).toEqual(['eq', 'mixed']);
  });
});
