import { describe, expect, it } from 'vitest';
import {
  ADDED, COUNT_RANGE, ITEMS, LOCALES, SAMPLE, WELCOME, categoryExamples, formatDate, formatMessage, formatNumber, formatPrice, formatRelative,
  cardText, gluedAdded, gluedWelcome, messageAdded, messageWelcome, naiveCategory, pluralCategories, pluralCategory, pluralMessage, pseudoLocalize, slotOrder,
  type Locale,
} from './model';

const counts = Array.from({ length: COUNT_RANGE.max + 1 }, (_, i) => i);
/** Intl groups French thousands with a narrow no-break space; compare with a plain one. */
const plain = (s: string) => s.replace(/[  ]/g, ' ');

describe('plural categories come from the real rules', () => {
  it('Polish: one, few and many by the last digits', () => {
    const pl = (n: number) => pluralCategory('pl-PL', n);
    expect([pl(0), pl(1), pl(2), pl(4), pl(5), pl(11), pl(12), pl(14), pl(21), pl(22), pl(25)]).toEqual(
      ['many', 'one', 'few', 'few', 'many', 'many', 'many', 'many', 'many', 'few', 'many'],
    );
  });

  it('Arabic uses all six categories', () => {
    const ar = (n: number) => pluralCategory('ar-EG', n);
    expect([ar(0), ar(1), ar(2), ar(3), ar(10), ar(11), ar(99), ar(100)]).toEqual(['zero', 'one', 'two', 'few', 'few', 'many', 'many', 'other']);
    expect(pluralCategories('ar-EG')).toEqual(['zero', 'one', 'two', 'few', 'many', 'other']);
  });

  it('Japanese has one category, and English two', () => {
    expect(pluralCategories('ja-JP')).toEqual(['other']);
    expect(counts.every((n) => pluralCategory('ja-JP', n) === 'other')).toBe(true);
    expect(pluralCategories('en-US')).toEqual(['one', 'other']);
    expect(pluralCategory('en-US', 1)).toBe('one');
    expect(pluralCategory('en-US', 0)).toBe('other');
  });

  it('French and German treat 1 as one; French treats 0 as one too, and German does not', () => {
    expect(pluralCategory('fr-FR', 0)).toBe('one');
    expect(pluralCategory('fr-FR', 1)).toBe('one');
    expect(pluralCategory('fr-FR', 2)).toBe('other');
    expect(pluralCategory('de-DE', 0)).toBe('other');
    expect(pluralCategory('de-DE', 1)).toBe('one');
  });

  it('the English-only rule is wrong for Polish, Arabic and Japanese, and right for English', () => {
    const wrong = (l: Locale) => counts.filter((n) => naiveCategory(n) !== pluralCategory(l, n));
    expect(wrong('en-US')).toEqual([]);
    expect(wrong('pl-PL')).toEqual(counts.filter((n) => n !== 1));
    expect(wrong('pl-PL')).toContain(2);
    expect(wrong('ar-EG')).toEqual(counts.filter((n) => n !== 1));
    expect(wrong('ja-JP')).toEqual([1]);
  });

  it('every locale has examples for every category it can produce', () => {
    for (const l of LOCALES) {
      const examples = categoryExamples(l);
      expect(Object.keys(examples)).toEqual(pluralCategories(l));
      for (const c of pluralCategories(l)) expect(examples[c].length, `${l} ${c}`).toBeGreaterThan(0);
    }
  });
});

describe('real formatting', () => {
  it('de-DE writes 1234.5 as 1.234,5, en-US as 1,234.5 and fr-FR with spaces and a comma', () => {
    expect(formatNumber('de-DE', 1234.5)).toBe('1.234,5');
    expect(formatNumber('en-US', 1234.5)).toBe('1,234.5');
    expect(plain(formatNumber('fr-FR', 1234.5))).toBe('1 234,5');
    // Polish does not group four-digit numbers: only from five digits up.
    expect(formatNumber('pl-PL', 1234.5)).toBe('1234,5');
    expect(plain(formatNumber('pl-PL', 12345.5))).toBe('12 345,5');
  });

  it('Arabic (Egypt) numbers use Arabic-Indic digits', () => {
    expect(formatNumber('ar-EG', 25)).toMatch(/^[٠-٩]+$/);
  });

  it('prices carry the locale currency', () => {
    expect(formatPrice('en-US', SAMPLE.price)).toBe('$1,234.50');
    expect(plain(formatPrice('de-DE', SAMPLE.price))).toBe('1.234,50 €');
    expect(formatPrice('ja-JP', SAMPLE.price)).toMatch(/1,235/);
  });

  it('the date and the relative time differ by locale and do not depend on the machine time zone', () => {
    expect(formatDate('en-US', SAMPLE.date)).toBe('March 9, 2026');
    expect(formatDate('de-DE', SAMPLE.date)).toBe('9. März 2026');
    expect(formatRelative('en-US', 3)).toBe('3 days ago');
    expect(formatRelative('de-DE', 3)).toBe('vor 3 Tagen');
  });
});

describe('the sample translations', () => {
  it('cover every plural category the locale can produce, for the cart line and the welcome line', () => {
    for (const l of LOCALES) {
      for (const c of pluralCategories(l)) {
        expect(ITEMS[l][c], `${l} items ${c}`).toBeTruthy();
        expect(WELCOME[l][c], `${l} welcome ${c}`).toBeTruthy();
      }
    }
  });

  it('give every count 0 to 25 a finished sentence with no placeholder left over', () => {
    for (const l of LOCALES) {
      for (const n of counts) {
        expect(pluralMessage(ITEMS, l, n), `${l} ${n}`).not.toMatch(/\{/);
        expect(messageWelcome(l, SAMPLE.name, n), `${l} ${n}`).not.toMatch(/\{/);
      }
    }
  });

  it('Polish picks przedmiot, przedmioty and przedmiotów for 1, 2 and 5', () => {
    expect(pluralMessage(ITEMS, 'pl-PL', 1)).toContain('1 przedmiot w');
    expect(pluralMessage(ITEMS, 'pl-PL', 2)).toContain('2 przedmioty');
    expect(pluralMessage(ITEMS, 'pl-PL', 5)).toContain('5 przedmiotów');
    expect(pluralMessage(ITEMS, 'pl-PL', 22)).toContain('22 przedmioty');
  });
});

describe('placeholders and fragments', () => {
  it('formatMessage fills placeholders and leaves an unknown one visible', () => {
    expect(formatMessage('Hi {name}, {n}!', { name: 'Sam', n: 3 })).toBe('Hi Sam, 3!');
    expect(formatMessage('Hi {name}, {n}!', { name: 'Sam' })).toBe('Hi Sam, {n}!');
  });

  it('English glues to exactly the message; Japanese cannot, because it puts the list first', () => {
    expect(gluedAdded('en-US', 'Mug', 'Wishlist')).toBe(messageAdded('en-US', 'Mug', 'Wishlist'));
    expect(slotOrder(ADDED['ja-JP'].message)).toEqual(['list', 'item']);
    expect(gluedAdded('ja-JP', 'Mug', 'Wishlist')).not.toBe(messageAdded('ja-JP', 'Mug', 'Wishlist'));
    expect(messageAdded('ja-JP', 'Mug', 'Wishlist')).toBe('WishlistにMugを追加しました');
  });

  it('every other sample message keeps the item before the list; only the fragments differ from the message', () => {
    for (const l of LOCALES.filter((x) => x !== 'ja-JP')) expect(slotOrder(ADDED[l].message), l).toEqual(['item', 'list']);
  });

  it('fixed text around a count is wrong exactly where the plural category changes the words', () => {
    const wrongAt = (l: Locale) => counts.filter((n) => gluedWelcome(l, SAMPLE.name, n) !== messageWelcome(l, SAMPLE.name, n));
    expect(wrongAt('en-US')).toEqual([1]);
    expect(wrongAt('ja-JP')).toEqual([]);
    expect(wrongAt('pl-PL')).toEqual([1]);
    expect(wrongAt('ar-EG')).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(wrongAt('fr-FR')).toEqual([0, 1]);
  });
});

describe('the pseudo-localiser', () => {
  it('is deterministic', () => {
    expect(pseudoLocalize('Add to cart')).toBe(pseudoLocalize('Add to cart'));
  });

  it('accents the letters, brackets the string and pads it about 40% longer', () => {
    const out = pseudoLocalize('Add to cart');
    expect(out).toBe('[Ådd tö çàrt ~~~~~]');
    expect(out.length).toBeGreaterThanOrEqual(Math.ceil('Add to cart'.length * 1.4));
    expect(out.startsWith('[') && out.endsWith(']')).toBe(true);
  });

  it('keeps placeholders exactly as they are', () => {
    const out = pseudoLocalize('Welcome, {name}! You have {n} messages.');
    expect(out).toContain('{name}');
    expect(out).toContain('{n}');
    expect(slotOrder(out)).toEqual(['name', 'n']);
    expect(formatMessage(out, { name: 'Sam', n: 2 })).toContain('Sam');
  });

  it('leaves text with no letters it knows as it was, inside the brackets', () => {
    expect(pseudoLocalize('12:30')).toBe('[12:30 ~~]');
  });
});

describe('the sample card', () => {
  it('says each thing in the locale, and picks direction from it', () => {
    const de = cardText('de-DE', 3, false);
    expect(de).toMatchObject({ lang: 'de-DE', dir: 'ltr', title: 'Ihr Warenkorb', count: '3 Artikel im Warenkorb', date: '9. März 2026' });
    expect(cardText('ar-EG', 3, false).dir).toBe('rtl');
  });

  it('pseudo-localising shows the accented English in left-to-right, whatever the locale, with the real number', () => {
    const p = cardText('ar-EG', 5, true);
    expect(p.lang).toBe('en-US');
    expect(p.dir).toBe('ltr');
    expect(p.title).toBe(pseudoLocalize('Your cart'));
    expect(p.count).toContain('5');
    expect(p.count).not.toContain('{');
  });
});
