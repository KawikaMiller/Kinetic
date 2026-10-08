import { useState, type ReactNode } from 'react';
import { StageFrame } from '../../components/StageFrame';
import { Box, SectionTitle } from '../../components/Panel';
import { Hint, Legend, Segmented, Slider, Stat, Stats } from '../../components/ui';
import { useIntroCaption } from '../../core/caption';
import { formatCaption, naiveMessage } from './captions';
import {
  COUNT_RANGE, ITEMS, LOCALE_LABEL, LOCALES, cardText, categoryExamples, formatMessage, formatNumber, naiveCategory, pluralCategories, pluralCategory, pluralMessage,
  type Locale,
} from './model';
import { SampleCard } from './SampleCard';

const DEFAULT_COUNT = 2;
const LOCALE_OPTIONS = LOCALES.map((value) => ({ value, label: LOCALE_LABEL[value] }));

export function FormatScene({ picker, locale, setLocale }: { picker: ReactNode; locale: Locale; setLocale: (l: Locale) => void }) {
  const [n, setN] = useState(DEFAULT_COUNT);
  useIntroCaption(formatCaption(locale, n), [locale, n]);
  const active = pluralCategory(locale, n);
  const examples = categoryExamples(locale);
  const real = pluralMessage(ITEMS, locale, n);
  const naive = naiveMessage(locale, n);
  const agree = naive === real;

  return (
    <StageFrame
      height={430}
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'the plural category this count uses' },
            { color: 'var(--dim)', label: 'the locale\'s other categories' },
            { color: 'var(--bad)', label: 'the English rule\'s wrong form' },
            { color: 'var(--ok)', label: 'the real rule' },
          ]}
        />
      }
      stats={
        <Stats>
          <Stat label="Locale" value={locale} />
          <Stat label="Count" value={formatNumber(locale, n)} />
          <Stat label="Plural category" value={active} />
        </Stats>
      }
      controls={[
        <>
          {picker}
          <Segmented label="Locale" value={locale} onChange={setLocale} options={LOCALE_OPTIONS} />
        </>,
        <>
          <Slider label="Items in the cart" value={n} min={COUNT_RANGE.min} max={COUNT_RANGE.max} onChange={setN} />
        </>,
      ]}
    >
      <div className="i18n stage-pad">
        <div className="i18n-grid">
          <SampleCard text={cardText(locale, n, false)} />
          <div className="i18n-side">
            <SectionTitle>Plural categories in {locale}</SectionTitle>
            <table className="data-table i18n-table">
              <thead>
                <tr><th>Category</th><th>Counts</th><th>Phrase</th></tr>
              </thead>
              <tbody>
                {pluralCategories(locale).map((c) => (
                  <tr key={c} className={c === active ? 'is-active' : 'is-dim'}>
                    <td>{c}</td>
                    <td lang={locale}>{examples[c].map((x) => formatNumber(locale, x)).join(', ')}</td>
                    <td lang={locale} dir={locale === 'ar-EG' ? 'rtl' : 'ltr'}>{formatMessage(ITEMS[locale][c] ?? ITEMS[locale].other!, { n: formatNumber(locale, examples[c][0]) })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Box className="i18n-compare">
              <p className={`i18n-verdict ${agree ? 'is-ok' : 'is-bad'}`} lang={locale}>
                <span className="i18n-tag">English rule: {naiveCategory(n)}</span> {naive}
              </p>
              <p className="i18n-verdict is-ok" lang={locale}>
                <span className="i18n-tag">Intl.PluralRules: {active}</span> {real}
              </p>
            </Box>
          </div>
        </div>
        <Hint block>
          Formatting is your browser's real Intl data. The translations are short samples written for this lesson, and the price is each locale's usual currency, not converted.
        </Hint>
      </div>
    </StageFrame>
  );
}
