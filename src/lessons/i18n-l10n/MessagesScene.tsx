import { useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Hint, Legend, Segmented, Slider } from '../../components/ui';
import { useIntroCaption } from '../../core/caption';
import { countCaption, orderCaption } from './captions';
import {
  ADDED, COUNT_RANGE, DIRECTION, LOCALE_LABEL, LOCALES, SAMPLE, WELCOME, gluedAdded, gluedWelcome, messageAdded, messageWelcome, pluralCategory,
  type Locale,
} from './model';

type Sentence = 'order' | 'count';
const SENTENCES: { value: Sentence; label: string }[] = [
  { value: 'order', label: 'Word order' },
  { value: 'count', label: 'A count in a sentence' },
];
const LOCALE_OPTIONS = LOCALES.map((value) => ({ value, label: LOCALE_LABEL[value] }));
const DEFAULT_COUNT = 1;

function Line({ kind, title, code, text, locale }: { kind: 'bad' | 'ok'; title: string; code: string; text: string; locale: Locale }) {
  return (
    <Box className={`i18n-line is-${kind}`}>
      <SectionTitle>{title}</SectionTitle>
      <code className="i18n-code" dir="ltr">{code}</code>
      <p className="i18n-sentence" lang={locale} dir={DIRECTION[locale]}>{text}</p>
    </Box>
  );
}

export function MessagesScene({ picker, locale, setLocale }: { picker: ReactNode; locale: Locale; setLocale: (l: Locale) => void }) {
  const [sentence, setSentence] = useState<Sentence>('order');
  const [n, setN] = useState(DEFAULT_COUNT);
  useIntroCaption(sentence === 'order' ? orderCaption(locale) : countCaption(locale, n), [sentence, locale, n]);

  const [before, between] = ADDED[locale].fragments;
  const gluedOrder = gluedAdded(locale, SAMPLE.item, SAMPLE.list);
  const messageOrder = messageAdded(locale, SAMPLE.item, SAMPLE.list);
  const gluedCount = gluedWelcome(locale, SAMPLE.name, n);
  const messageCount = messageWelcome(locale, SAMPLE.name, n);

  return (
    <StageFrame
      height={380}
      legend={
        <Legend
          items={[
            { color: 'var(--bad)', label: 'glued text that differs from the real message' },
            { color: 'var(--ok)', label: 'one message with placeholders' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented label="Locale" value={locale} onChange={setLocale} options={LOCALE_OPTIONS} />
        </>,
        <>
          <Segmented label="Sentence" value={sentence} onChange={setSentence} options={SENTENCES} />
          {sentence === 'count' && <Slider label="Messages" value={n} min={COUNT_RANGE.min} max={COUNT_RANGE.max} onChange={setN} />}
        </>,
      ]}
    >
      <div className="i18n stage-pad">
        {sentence === 'order' ? (
          <>
            <Line
              kind={gluedOrder === messageOrder ? 'ok' : 'bad'} title="Glued fragments"
              code={`"${before}" + item + "${between}" + list`} text={gluedOrder} locale={locale}
            />
            <Line kind="ok" title="One message" code={ADDED[locale].message} text={messageOrder} locale={locale} />
          </>
        ) : (
          <>
            <Line
              kind={gluedCount === messageCount ? 'ok' : 'bad'} title="One fixed sentence, the count dropped in"
              code={WELCOME[locale].other!} text={gluedCount} locale={locale}
            />
            <Line
              kind="ok" title="Plural-aware message" code={WELCOME[locale][pluralCategory(locale, n)] ?? WELCOME[locale].other!} text={messageCount} locale={locale}
            />
          </>
        )}
        <Hint block>
          The fragments and messages are short samples written for this lesson, not reviewed by translators. Gluing fixes the order of the values and the words around them to English's; the German fragments here are deliberately cut to fit English's shape.
        </Hint>
      </div>
    </StageFrame>
  );
}
