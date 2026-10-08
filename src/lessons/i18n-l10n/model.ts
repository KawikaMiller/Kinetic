/**
 * Internationalisation helpers for the lesson. Numbers, dates, relative times and plural
 * categories come from the browser's real `Intl` data; the translations are short samples
 * written for this lesson (not reviewed by translators), and the pseudo-localiser and the
 * placeholder formatter are the two pieces of tooling a team would write itself.
 */

export const LOCALES = ['en-US', 'de-DE', 'ar-EG', 'ja-JP', 'pl-PL', 'fr-FR'] as const;
export type Locale = (typeof LOCALES)[number];

export const LOCALE_LABEL: Record<Locale, string> = {
  'en-US': 'en-US', 'de-DE': 'de-DE', 'ar-EG': 'ar-EG', 'ja-JP': 'ja-JP', 'pl-PL': 'pl-PL', 'fr-FR': 'fr-FR',
};
export const LOCALE_NAME: Record<Locale, string> = {
  'en-US': 'English', 'de-DE': 'German', 'ar-EG': 'Arabic (Egypt)', 'ja-JP': 'Japanese', 'pl-PL': 'Polish', 'fr-FR': 'French',
};
export const DIRECTION: Record<Locale, 'ltr' | 'rtl'> = {
  'en-US': 'ltr', 'de-DE': 'ltr', 'ar-EG': 'rtl', 'ja-JP': 'ltr', 'pl-PL': 'ltr', 'fr-FR': 'ltr',
};
/** The sample price is shown in each locale's usual currency, not converted. */
const CURRENCY: Record<Locale, string> = {
  'en-US': 'USD', 'de-DE': 'EUR', 'ar-EG': 'EGP', 'ja-JP': 'JPY', 'pl-PL': 'PLN', 'fr-FR': 'EUR',
};

export const SAMPLE = {
  price: 1234.5,
  /** Noon UTC on a fixed day, formatted in UTC, so the sample reads the same everywhere and in tests. */
  date: new Date(Date.UTC(2026, 2, 9, 12)),
  daysAgo: 3,
  name: 'Sam',
  item: 'Mug',
  list: 'Wishlist',
} as const;
export const COUNT_RANGE = { min: 0, max: 25 } as const;

export const formatNumber = (locale: Locale, n: number): string => new Intl.NumberFormat(locale).format(n);
export const formatPrice = (locale: Locale, n: number): string => new Intl.NumberFormat(locale, { style: 'currency', currency: CURRENCY[locale] }).format(n);
export const formatDate = (locale: Locale, d: Date): string => new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeZone: 'UTC' }).format(d);
export const formatRelative = (locale: Locale, days: number): string => new Intl.RelativeTimeFormat(locale, { numeric: 'always' }).format(-days, 'day');

export type PluralCategory = 'zero' | 'one' | 'two' | 'few' | 'many' | 'other';
const CATEGORY_ORDER: readonly PluralCategory[] = ['zero', 'one', 'two', 'few', 'many', 'other'];

export const pluralCategory = (locale: Locale, n: number): PluralCategory => new Intl.PluralRules(locale).select(n) as PluralCategory;
/** The categories the locale's rules can produce, in the standard order (the engine's own order varies). */
export const pluralCategories = (locale: Locale): PluralCategory[] => {
  const have = new Set(new Intl.PluralRules(locale).resolvedOptions().pluralCategories as PluralCategory[]);
  return CATEGORY_ORDER.filter((c) => have.has(c));
};
/** The rule most code starts with, and which is right only for English-like languages. */
export const naiveCategory = (n: number): PluralCategory => (n === 1 ? 'one' : 'other');

/** Counts worth trying so every category of every locale in the lesson has an example: 0 to 25, 100, a fraction and a million. */
const PROBES: readonly number[] = [...Array.from({ length: COUNT_RANGE.max + 1 }, (_, i) => i), 100, 1.5, 1_000_000];
export const MAX_EXAMPLES = 5;
/** Up to `MAX_EXAMPLES` counts that fall in each category of the locale. */
export function categoryExamples(locale: Locale): Record<PluralCategory, number[]> {
  const out = {} as Record<PluralCategory, number[]>;
  for (const c of pluralCategories(locale)) out[c] = [];
  for (const n of PROBES) {
    const bucket = out[pluralCategory(locale, n)];
    if (bucket && bucket.length < MAX_EXAMPLES) bucket.push(n);
  }
  return out;
}

type Messages = Record<Locale, Partial<Record<PluralCategory, string>>>;

/** "N items in your cart", one translation per plural category. Sample translations written for this lesson. */
export const ITEMS: Messages = {
  'en-US': { one: '{n} item in your cart', other: '{n} items in your cart' },
  'de-DE': { one: '{n} Artikel im Warenkorb', other: '{n} Artikel im Warenkorb' },
  'fr-FR': { one: '{n} article dans votre panier', many: '{n} d’articles dans votre panier', other: '{n} articles dans votre panier' },
  'pl-PL': { one: '{n} przedmiot w koszyku', few: '{n} przedmioty w koszyku', many: '{n} przedmiotów w koszyku', other: '{n} przedmiotu w koszyku' },
  'ar-EG': {
    zero: 'لا عناصر في سلتك', one: 'عنصر واحد في سلتك', two: 'عنصران في سلتك', few: '{n} عناصر في سلتك', many: '{n} عنصرًا في سلتك', other: '{n} عنصر في سلتك',
  },
  'ja-JP': { other: 'カートに{n}点の商品があります' },
};

/** The welcome sentence, with the count worked in per plural category. */
export const WELCOME: Messages = {
  'en-US': { one: 'Welcome, {name}! You have {n} message.', other: 'Welcome, {name}! You have {n} messages.' },
  'de-DE': { one: 'Willkommen, {name}! Sie haben {n} Nachricht.', other: 'Willkommen, {name}! Sie haben {n} Nachrichten.' },
  'fr-FR': {
    one: 'Bienvenue, {name} ! Vous avez {n} message.', many: 'Bienvenue, {name} ! Vous avez {n} de messages.', other: 'Bienvenue, {name} ! Vous avez {n} messages.',
  },
  'pl-PL': {
    one: 'Witaj, {name}! Masz {n} wiadomość.', few: 'Witaj, {name}! Masz {n} wiadomości.', many: 'Witaj, {name}! Masz {n} wiadomości.', other: 'Witaj, {name}! Masz {n} wiadomości.',
  },
  'ar-EG': {
    zero: 'مرحبًا، {name}! ليس لديك رسائل.', one: 'مرحبًا، {name}! لديك رسالة واحدة.', two: 'مرحبًا، {name}! لديك رسالتان.',
    few: 'مرحبًا، {name}! لديك {n} رسائل.', many: 'مرحبًا، {name}! لديك {n} رسالة.', other: 'مرحبًا، {name}! لديك {n} رسالة.',
  },
  'ja-JP': { other: 'ようこそ、{name}さん！ メッセージが{n}件あります。' },
};

/** "Added {item} to {list}": one message with placeholders, and the same sentence cut into the two fragments glued around the slots in English order. */
export const ADDED: Record<Locale, { message: string; fragments: readonly [string, string] }> = {
  'en-US': { message: 'Added {item} to {list}', fragments: ['Added ', ' to '] },
  'de-DE': { message: '{item} zu {list} hinzugefügt', fragments: ['Hinzugefügt: ', ' zu '] },
  'fr-FR': { message: '{item} ajouté à {list}', fragments: ['Ajouté : ', ' à '] },
  'pl-PL': { message: 'Dodano {item} do {list}', fragments: ['Dodano ', ' do '] },
  'ar-EG': { message: 'تمت إضافة {item} إلى {list}', fragments: ['تمت إضافة ', ' إلى '] },
  'ja-JP': { message: '{list}に{item}を追加しました', fragments: ['追加しました: ', ' を '] },
};

/** Words for the layout scene's button. */
export const BUTTON_LABEL: Record<Locale, string> = {
  'en-US': 'Add to cart', 'de-DE': 'In den Warenkorb', 'fr-FR': 'Ajouter au panier', 'pl-PL': 'Dodaj do koszyka', 'ar-EG': 'أضف إلى السلة', 'ja-JP': 'カートに追加',
};
export const CARD_TITLE: Record<Locale, string> = {
  'en-US': 'Your cart', 'de-DE': 'Ihr Warenkorb', 'fr-FR': 'Votre panier', 'pl-PL': 'Twój koszyk', 'ar-EG': 'سلتك', 'ja-JP': 'カート',
};

/** Fill `{name}` placeholders. One that has no value stays as written, so a missing value is visible. */
export const formatMessage = (template: string, values: Record<string, string | number>): string =>
  template.replace(/\{(\w+)\}/g, (whole, key: string) => (key in values ? String(values[key]) : whole));

/** The message for a count: the plural category the locale's rules pick, with `n` shown in the locale's own digits. */
export function pluralMessage(table: Messages, locale: Locale, n: number, values: Record<string, string | number> = {}): string {
  const category = pluralCategory(locale, n);
  const template = table[locale][category] ?? table[locale].other!;
  return formatMessage(template, { ...values, n: formatNumber(locale, n) });
}

/** The order the placeholders appear in a message: what a fragment-gluing version cannot change. */
export const slotOrder = (template: string): string[] => [...template.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);

export const gluedAdded = (locale: Locale, item: string, list: string): string => {
  const [before, between] = ADDED[locale].fragments;
  return `${before}${item}${between}${list}`;
};
export const messageAdded = (locale: Locale, item: string, list: string): string => formatMessage(ADDED[locale].message, { item, list });

/** The welcome sentence translated once, for no particular count, with the number dropped in: what text glued around a count looks like. */
export const gluedWelcome = (locale: Locale, name: string, n: number): string => formatMessage(WELCOME[locale].other!, { name, n: formatNumber(locale, n) });
export const messageWelcome = (locale: Locale, name: string, n: number): string => pluralMessage(WELCOME, locale, n, { name });

const ACCENTS: Record<string, string> = {
  a: 'à', e: 'é', i: 'î', o: 'ö', u: 'ü', c: 'ç', n: 'ñ', s: 'š', y: 'ý', z: 'ž',
  A: 'Å', E: 'É', I: 'Î', O: 'Ö', U: 'Û', C: 'Ç', N: 'Ñ', S: 'Š', Y: 'Ý', Z: 'Ž',
};
/** Strings run roughly 30-40% longer after translation; the padding makes that visible. */
export const PSEUDO_GROWTH = 0.4;
const PSEUDO_PAD = '~';

/**
 * Pseudo-localisation: accented letters (so hard-coded or clipped text stands out), padding to
 * about 40% longer, and square brackets (so a truncated string shows its missing end).
 * Placeholders such as `{name}` are left exactly as they are. Deterministic.
 */
export function pseudoLocalize(text: string): string {
  const accented = text.replace(/\{\w+\}|[A-Za-z]/g, (m) => (m.length > 1 ? m : (ACCENTS[m] ?? m)));
  const padding = PSEUDO_PAD.repeat(Math.ceil(text.length * PSEUDO_GROWTH));
  return `[${accented} ${padding}]`;
}

export interface CardText {
  /** The locale the text is in: English when pseudo-localising. */
  lang: Locale;
  dir: 'ltr' | 'rtl';
  title: string;
  count: string;
  price: string;
  date: string;
  relative: string;
  button: string;
}

/** Everything the sample card says. With `pseudo`, the English strings go through the pseudo-localiser instead of a translation. */
export function cardText(locale: Locale, n: number, pseudo: boolean): CardText {
  const lang: Locale = pseudo ? 'en-US' : locale;
  const tr = (s: string) => (pseudo ? pseudoLocalize(s) : s);
  const template = ITEMS[lang][pluralCategory(lang, n)] ?? ITEMS[lang].other!;
  return {
    lang,
    dir: DIRECTION[lang],
    title: tr(CARD_TITLE[lang]),
    count: formatMessage(tr(template), { n: formatNumber(lang, n) }),
    price: formatPrice(lang, SAMPLE.price),
    date: formatDate(lang, SAMPLE.date),
    relative: formatRelative(lang, SAMPLE.daysAgo),
    button: tr(BUTTON_LABEL[lang]),
  };
}
