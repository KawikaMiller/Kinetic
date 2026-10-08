import { useRef, useState, type ReactNode } from 'react';
import { CodePanel } from '../../components/CodePanel';
import { ResizablePane } from '../../components/ResizablePane';
import { StageFrame } from '../../components/StageFrame';
import { Hint, Legend, Segmented, Stat, Stats, Toggle } from '../../components/ui';
import { useIntroCaption } from '../../core/caption';
import { rectIn, useMeasure } from '../../core/useMeasure';
import { growthPct, layoutCaption, overflows, type LayoutMeasure } from './captions';
import { BUTTON_LABEL, DIRECTION, LOCALE_LABEL, LOCALES, cardText, type Locale } from './model';
import { SampleCard } from './SampleCard';

const LOCALE_OPTIONS = LOCALES.map((value) => ({ value, label: LOCALE_LABEL[value] }));
const CARD_WIDTH = { min: 260, max: 520, step: 20, initial: 360 } as const;
const COUNT = 3;
const CSS_LINES = [
  '.icon-row .label {',
  '  margin-left: 10px;          /* physical: always the left */',
  '}',
  '.icon-row .label {',
  '  margin-inline-start: 10px;  /* logical: the side the text starts on */',
  '}',
];

interface Measured extends LayoutMeasure {
  /** Gap between the icon and the label in each row, px. */
  physicalGap: number;
  logicalGap: number;
}

/** Real layout: how wide the label is, how much room the fixed-width button has, and the actual gap in each icon row. */
function measure(el: HTMLElement): Measured | null {
  const btn = el.querySelector<HTMLElement>('.i18n-btn');
  const text = el.querySelector<HTMLElement>('.i18n-btn-text');
  const ghost = el.querySelector<HTMLElement>('.i18n-ghost');
  if (!btn || !text || !ghost) return null;
  const gap = (row: string) => {
    const icon = rectIn(el.querySelector(`.${row} .i18n-icon`)!, el);
    const label = rectIn(el.querySelector(`.${row} .i18n-label`)!, el);
    return Math.round(Math.max(label.x - (icon.x + icon.w), icon.x - (label.x + label.w)));
  };
  const style = getComputedStyle(btn);
  const room = btn.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
  return {
    text: Math.round(text.getBoundingClientRect().width), room: Math.round(room), english: Math.round(ghost.getBoundingClientRect().width),
    physicalGap: gap('i18n-physical'), logicalGap: gap('i18n-logical'),
  };
}

export function LayoutScene({ picker, locale, setLocale }: { picker: ReactNode; locale: Locale; setLocale: (l: Locale) => void }) {
  const [width, setWidth] = useState<number>(CARD_WIDTH.initial);
  const [pseudo, setPseudo] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const m = useMeasure(ref, measure);
  const text = cardText(locale, COUNT, pseudo);
  const bad = m ? overflows(m) : false;
  useIntroCaption(layoutCaption(locale, pseudo, m), [locale, pseudo, m?.text, m?.room, m?.english]);

  return (
    <StageFrame
      height={470}
      legend={
        <Legend
          items={[
            { color: 'var(--bad)', label: 'text that spills out of its box' },
            { color: 'var(--info)', label: 'logical property: follows the direction' },
            { color: 'var(--orange)', label: 'physical property: always the same side' },
          ]}
        />
      }
      stats={
        <Stats>
          <Stat label="Label vs English" value={m ? `${growthPct(m) > 0 ? '+' : ''}${growthPct(m)}%` : '–'} />
          <Stat label="Label / room" value={m ? `${m.text} / ${m.room} px` : '–'} color={bad ? 'var(--bad)' : undefined} />
          <Stat label="Icon gap (physical, logical)" value={m ? `${m.physicalGap}, ${m.logicalGap} px` : '–'} />
        </Stats>
      }
      controls={[
        <>
          {picker}
          <Segmented label="Locale" value={locale} onChange={setLocale} options={LOCALE_OPTIONS} />
          <Toggle label="Pseudo-localise English" value={pseudo} onChange={setPseudo} />
        </>,
      ]}
    >
      <div className="i18n stage-pad">
        <ResizablePane min={CARD_WIDTH.min} max={CARD_WIDTH.max} step={CARD_WIDTH.step} value={width} onChange={setWidth} label="Card width">
          <div ref={ref} className={`i18n-layout ${bad ? 'is-overflow' : ''}`}>
            <SampleCard text={text} />
            <span className="i18n-ghost" aria-hidden>{BUTTON_LABEL['en-US']}</span>
            <div className="i18n-icons" dir={text.dir} lang={text.lang}>
              <div className="i18n-icon-row i18n-physical"><i className="i18n-icon" /><span className="i18n-label">{text.button}</span></div>
              <div className="i18n-icon-row i18n-logical"><i className="i18n-icon" /><span className="i18n-label">{text.button}</span></div>
            </div>
          </div>
        </ResizablePane>
        <div className="i18n-code-row">
          <CodePanel title="The two icon rows" lines={CSS_LINES} gutter="none" />
          <p className="i18n-note">
            Top row (orange) uses <code>margin-left</code>, bottom row (blue) uses <code>margin-inline-start</code>. {DIRECTION[locale] === 'rtl' && !pseudo ? 'In Arabic the page runs right to left: the physical margin lands on the wrong side and the icon touches its label.' : 'Switch to ar-EG: the page runs right to left and only the logical margin follows.'}
          </p>
        </div>
        <Hint block>
          Measured in your browser from the real layout. Strings are short samples written for this lesson; growth varies by string, and 30-40% is a common rule of thumb, not a law.
        </Hint>
      </div>
    </StageFrame>
  );
}
