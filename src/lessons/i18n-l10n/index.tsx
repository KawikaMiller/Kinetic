import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'Localising an app is more than translating its strings: numbers, dates, plurals, word order, text length and reading direction all change with the locale, and the browser already knows most of the rules.',
    what: 'Internationalisation (i18n) is building the app so that nothing about one language is hard-coded; localisation (l10n) is supplying one locale\'s data and translations. The platform\'s `Intl` APIs format numbers, currencies, dates and relative times for any locale, and `Intl.PluralRules` says which plural category a count falls in: English has two, Polish has one, few, many and other, Arabic has six, and Japanese has one. Sentences must be whole messages with placeholders, not fragments glued around values, because other languages reorder the pieces. Translated text also changes size, and right-to-left scripts mirror the layout, so spacing is written with logical properties such as `margin-inline-start`.',
    analogy: 'Moving a shop to another country. Translating the signs is the easy part. You also change the price tags, the date on the receipt, how the cashier says "one" or "three" of something, which side the door is on, and whether the new words still fit on the old shelf labels.',
    useCases: [
      'Showing prices, dates and "3 days ago" the way each user expects, with no hand-written format code',
      'Writing item and message counts that stay correct in Polish, Arabic and other languages with several plural forms',
      'Keeping layouts working when German text runs long or Arabic flips the page right to left',
      'Finding hard-coded strings and clipped boxes before translators arrive, with pseudo-localisation',
    ],
    why: 'Bugs here are quiet: they look fine in English and wrong, or rude, or unreadable, for a large share of real users. Plural rules and word order cannot be fixed with a ternary. The cheapest fixes come early: use `Intl`, keep whole messages, write logical CSS and test with pseudo-localised text. Character encodings and byte lengths are covered in `char-encoding`, time-zone arithmetic in `time-and-timezones`, and the layout machinery behind reflow in `css-layout`. The translation workflow and its tooling are a team process of their own.',
    watch: 'In Formats and plurals, the plural category the current count uses is a solid yellow row and the locale\'s other categories are grey; the English rule\'s wrong form is red and the real rule\'s answer green. In Sentences, red is text glued around values that differs from the real message and green is one message with placeholders. In Space and direction, text that spills out of its box has a red outline, blue marks the logical-property row and orange the physical one.',
  },
  tryThis: [
    'In Formats and plurals pick pl-PL and drag the count through 1, 2, 5 and 22. Which category does each use, and when does the English rule write the wrong form?',
    'Pick ar-EG and slide through 0 to 12. How many different categories do you see, and which count is the first "many"?',
    'In Sentences, pick ja-JP with Word order. Which value does the glued version put first, and which does the real message put first?',
    'In Sentences, switch to A count in a sentence, stay on en-US and set the count to 1, then 2. Where does the fixed text go wrong, and does pl-PL go wrong in the same places? (Its sample word has the same form for few, many and other, so look at the Formats tab to see where Polish really splits.)',
    'In Space and direction pick de-DE: the label overflows its fixed 120 px button. Then pick ar-EG: nothing overflows, but which icon row keeps its gap in right-to-left?',
  ],
  keyIdeas: [
    'Format with `Intl` and let the locale decide separators, currency, date order and digits: de-DE writes 1.234,5.',
    'A plural is a category chosen by the locale\'s rules (Polish has few and many, Arabic has six), not "one or many".',
    'Translate whole messages with placeholders: the translator, not your code, decides the word order.',
    'Expect longer text and mirrored layouts: use logical CSS properties and test with pseudo-localised strings.',
  ],
  quiz: [
    {
      q: 'An item count is shown as `count === 1 ? "item" : "items"`. Which languages does this get right?',
      options: [
        'Languages with English-like plural rules',
        'Every language that has a word for "item"',
        'Any language written from left to right',
        'All languages once the number is formatted',
      ],
      answer: 0,
      why: 'Polish has separate forms for 2 to 4 and for 5 and up, Arabic has six forms and Japanese has none. A ternary encodes English\'s two-way rule. Intl.PluralRules returns the right category for each locale.',
    },
    {
      q: 'Why can a sentence built as "Added " + item + " to " + list not be translated well?',
      options: [
        'Some languages put the list before the item, and glue cannot',
        'Translators are not allowed to edit the fragments',
        'Strings with plus signs are slower to look up',
        'Fragments always lose the placeholder characters',
      ],
      answer: 0,
      why: 'Word order differs between languages: Japanese puts the list first. A message with placeholders lets the translator move the values; glued fragments fix the order to English\'s.',
    },
    {
      q: 'Which CSS makes an icon-and-label gap work in both left-to-right and right-to-left pages?',
      options: [
        '`margin-inline-start` on the label',
        '`margin-left` on the label',
        '`position: absolute; left: 0` on the icon',
        '`text-align: left` on the row',
      ],
      answer: 0,
      why: 'Logical properties follow the writing direction: the inline start is the right edge in Arabic. A physical `margin-left` stays on the left, so in a right-to-left page the gap lands on the wrong side.',
    },
    {
      q: 'What does pseudo-localisation do for a team that has not started translating?',
      options: [
        'It shows hard-coded text and clipped boxes early',
        'It translates the strings with a free service',
        'It checks that every plural category exists',
        'It converts the layout to right-to-left',
      ],
      answer: 0,
      why: 'Accented, padded text is still readable but easy to spot: any string that stays plain was never translatable, and a box that cuts off the bracket is too small. It finds bugs without waiting for translators.',
    },
  ],
};

export default lesson;
