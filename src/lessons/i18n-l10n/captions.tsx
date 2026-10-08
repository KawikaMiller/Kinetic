import type { ReactNode } from 'react';
import {
  ADDED, ITEMS, SAMPLE, formatMessage, formatNumber, gluedAdded, gluedWelcome, messageAdded, messageWelcome, naiveCategory, pluralCategory, pluralMessage, slotOrder,
  type Locale,
} from './model';

export const FORMAT_INTRO = (
  <>
    One card, formatted live by the browser's own Intl data. Pick a locale and drag the count: the plural category, the separators, the date and the currency all change with it.
  </>
);
export const SENTENCE_INTRO = (
  <>
    Two ways to build a translated sentence: glue translated fragments around the values, or translate one message with placeholders. Pick a locale and see where gluing breaks.
  </>
);
export const LAYOUT_INTRO = (
  <>
    Translated text and right-to-left scripts change the size and direction of everything around them. Drag the card narrower, pick German or Arabic, or turn on pseudo-localisation to find the bugs early.
  </>
);

/** What the English rule would have written for this count in this locale (falling back to `other`, as such code does). */
export function naiveMessage(locale: Locale, n: number): string {
  const template = ITEMS[locale][naiveCategory(n)] ?? ITEMS[locale].other!;
  return formatMessage(template, { n: formatNumber(locale, n) });
}

export function formatCaption(locale: Locale, n: number): ReactNode {
  const real = pluralMessage(ITEMS, locale, n);
  const naive = naiveMessage(locale, n);
  return (
    <>
      In {locale}, {formatNumber(locale, n)} falls in the plural category <span className="hl">{pluralCategory(locale, n)}</span>.{' '}
      {naive === real ? (
        <>The English rule, <code>n === 1 ? 'one' : 'other'</code>, happens to give the same words here.</>
      ) : (
        <>The English rule, <code>n === 1 ? 'one' : 'other'</code>, would have written “{naive}”: <span className="hl bad wrap">the wrong form</span>.</>
      )}
    </>
  );
}

export function orderCaption(locale: Locale): ReactNode {
  const glued = gluedAdded(locale, SAMPLE.item, SAMPLE.list);
  const message = messageAdded(locale, SAMPLE.item, SAMPLE.list);
  const order = slotOrder(ADDED[locale].message);
  if (glued === message) return <>In {locale} the glued fragments give “{glued}”, the same as the message: the fragments were cut along English's own shape.</>;
  return (
    <>
      Glued fragments give “{glued}”, always the item first. The message with placeholders lets the translator write “{message}”, with the {order[0]} first: <span className="hl ok wrap">the translator is in control</span>.
    </>
  );
}

export function countCaption(locale: Locale, n: number): ReactNode {
  const glued = gluedWelcome(locale, SAMPLE.name, n);
  const message = messageWelcome(locale, SAMPLE.name, n);
  return glued === message ? (
    <>For {formatNumber(locale, n)} in {locale}, the fixed text happens to read the same as the plural-aware message. Move the count to find where it stops.</>
  ) : (
    <>
      For {formatNumber(locale, n)} in {locale}, the fixed text says “{glued}”. The plural-aware message says “{message}”: <span className="hl bad wrap">the fixed text has the wrong words</span>.
    </>
  );
}

export interface LayoutMeasure {
  /** Rendered width of the button label, px. */
  text: number;
  /** Room inside the fixed-width button, px. */
  room: number;
  /** The English label's width in the same font, px. */
  english: number;
}
export const overflows = (m: LayoutMeasure): boolean => m.text > m.room;
/** Growth of the label over the English one, as a whole percent (negative when shorter). */
export const growthPct = (m: LayoutMeasure): number => Math.round((m.text / m.english - 1) * 100);

export function layoutCaption(locale: Locale, pseudo: boolean, m: LayoutMeasure | null): ReactNode {
  if (!m) return LAYOUT_INTRO;
  const grow = growthPct(m);
  const label = pseudo ? 'The pseudo-localised label' : `The ${locale} label`;
  const size = grow === 0 ? 'as wide as' : grow > 0 ? `${grow}% wider than` : `${-grow}% narrower than`;
  return overflows(m) ? (
    <>
      {label} is {size} the English one and needs {m.text} px, but the fixed-width button has {m.room} px: <span className="hl bad wrap">the text spills out</span>.
    </>
  ) : (
    <>{label} is {size} the English one and needs {m.text} px of the button's {m.room} px: it fits.</>
  );
}
