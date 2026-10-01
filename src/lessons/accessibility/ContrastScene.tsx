import { useState, type CSSProperties, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { ChipButton, ControlGroup, Legend, Segmented, Stat, Stats } from '../../components/ui';
import { useIntroCaption, useSetCaption } from '../../core/caption';
import { CVD_MATRICES, contrastRatio, formatRatio, grade, type Vision } from './model';

// Colour pairs the learner can load. These are example inputs to the checker, not app colours.
const PAIRS = [
  { id: 'grey', label: 'Grey on white', fg: '#777777', bg: '#ffffff' }, // allow-color: WCAG example pair
  { id: 'dark-grey', label: 'One step darker', fg: '#767676', bg: '#ffffff' }, // allow-color: example pair (the first grey that passes AA, 4.54:1)
  { id: 'white-yellow', label: 'White on yellow', fg: '#ffffff', bg: '#f5c400' }, // allow-color: example pair
  { id: 'navy', label: 'Navy on cream', fg: '#1b2a4a', bg: '#fdf6e3' }, // allow-color: example pair
] as const;

/**
 * A red/green status pair picked (by distance under the same matrices) to be clearly
 * different for typical vision but close for protanopia and deuteranopia.
 */
const STATUS_RED = '#cc3333'; // allow-color: a real-world confusable red/green pair
const STATUS_GREEN = '#7a8f2c'; // allow-color: a real-world confusable red/green pair
const dotStyle = (c: string) => ({ background: c });
const chipStyle = (c: string) => ({ '--c': c }) as CSSProperties;

const VISION_NOTE: Record<Vision, ReactNode> = {
  normal: <>Typical vision: the red and green dots are easy to tell apart, which is exactly why a design that relies on them can look fine to its author.</>,
  protanopia: <>With protanopia the red and green dots become <b>hard to tell apart</b>: colour alone can't carry meaning.</>,
  deuteranopia: <>With deuteranopia the red and green dots become <b>hard to tell apart</b>. Its milder form, deuteranomaly, is the most common colour-vision difference of all.</>,
  tritanopia: <>Tritanopia mostly confuses blue with green and yellow with violet: this red/green pair happens to stay distinct, which is luck, not design.</>,
};

const VISIONS: { value: Vision; label: string }[] = [
  { value: 'normal', label: 'Typical vision' },
  { value: 'protanopia', label: 'Protanopia' },
  { value: 'deuteranopia', label: 'Deuteranopia' },
  { value: 'tritanopia', label: 'Tritanopia' },
];

function Verdict({ ok, label }: { ok: boolean; label: string }) {
  return <span className={`chip ${ok ? 'tone-ok' : 'tone-bad'}`}>{ok ? '✓' : '✕'} {label}</span>;
}

export function ContrastScene({ picker }: { picker: ReactNode }) {
  const [fg, setFg] = useState<string>(PAIRS[0].fg);
  const [bg, setBg] = useState<string>(PAIRS[0].bg);
  const [vision, setVision] = useState<Vision>('normal');
  const setCaption = useSetCaption();
  const ratio = contrastRatio(fg, bg);
  const g = grade(ratio);

  useIntroCaption(
    <>Text needs enough contrast against its background. WCAG AA asks for <b>4.5:1</b> for normal text and <b>3:1</b> for large
      text. <code>#777</code> on white looks fine to many people, but it is <span className="hl bad">4.48:1</span>: a fail.{/* allow-color: the WCAG example colour named in prose */}</>,
  );

  const load = (p: (typeof PAIRS)[number]) => {
    setFg(p.fg);
    setBg(p.bg);
    const r = contrastRatio(p.fg, p.bg);
    setCaption(<>{p.label}: <b>{formatRatio(r)}</b>. {grade(r).aaNormal ? 'Passes AA for body text.' : 'Fails AA for body text.'}</>);
  };

  const filter = vision === 'normal' ? undefined : `url(#ac-cvd-${vision})`;

  return (
    <StageFrame
      height={520}
      stats={
        <Stats>
          <Stat label="Contrast ratio" value={formatRatio(ratio)} color={g.aaNormal ? 'var(--ok)' : 'var(--bad)'} sub="WCAG 2.x relative luminance" />
          <Stat label="AA body text" value={g.aaNormal ? 'pass' : 'fail'} color={g.aaNormal ? 'var(--ok)' : 'var(--bad)'} sub="needs 4.5:1" />
          <Stat label="AA large text" value={g.aaLarge ? 'pass' : 'fail'} color={g.aaLarge ? 'var(--ok)' : 'var(--bad)'} sub="needs 3:1" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--ok)', label: 'passes' },
            { color: 'var(--bad)', label: 'fails' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <label className="ac-color">
            <span>Text colour</span>
            <input type="color" value={fg} onChange={(e) => setFg(e.target.value)} />
            <code>{fg}</code>
          </label>
          <label className="ac-color">
            <span>Background</span>
            <input type="color" value={bg} onChange={(e) => setBg(e.target.value)} />
            <code>{bg}</code>
          </label>
        </>,
        <ControlGroup key="pairs" label="Try a pair">
          {PAIRS.map((p) => (
            <ChipButton key={p.id} size="md" on={fg === p.fg && bg === p.bg} onClick={() => load(p)}>
              {p.label}
            </ChipButton>
          ))}
        </ControlGroup>,
        <Segmented
          key="vision"
          label="See it as (approximate simulation)"
          value={vision}
          onChange={(v) => {
            setVision(v);
            setCaption(VISION_NOTE[v]);
          }}
          options={VISIONS}
        />,
      ]}
    >
      <div className="stage-pad ac">
        <svg className="ac-defs" aria-hidden="true" focusable="false">
          {(Object.keys(CVD_MATRICES) as (keyof typeof CVD_MATRICES)[]).map((k) => (
            <filter key={k} id={`ac-cvd-${k}`}>
              <feColorMatrix type="matrix" values={CVD_MATRICES[k]} />
            </filter>
          ))}
        </svg>
        <div className="ac-contrast" style={{ filter }}>
          <Box className="ac-preview">
            <SectionTitle>Your pair</SectionTitle>
            <div className="ac-sample" style={{ color: fg, background: bg }}>
              <p className="ac-sample-body">Body text at 16px: can you read this comfortably?</p>
              <p className="ac-sample-large">Large text, 24px</p>
            </div>
            <div className="ac-verdicts">
              <Verdict ok={g.aaNormal} label="AA normal (4.5)" />
              <Verdict ok={g.aaLarge} label="AA large (3)" />
              <Verdict ok={g.aaaNormal} label="AAA normal (7)" />
              <Verdict ok={g.aaaLarge} label="AAA large (4.5)" />
            </div>
          </Box>
          <Box className="ac-colour-only">
            <SectionTitle>Colour alone vs colour + text</SectionTitle>
            <div className="ac-status-row">
              <span className="ac-dot" style={dotStyle(STATUS_RED)} aria-hidden="true" />
              <span className="ac-dot" style={dotStyle(STATUS_GREEN)} aria-hidden="true" />
              <span className="ac-status-label is-bad-example">Bad: which payment failed? Only colour says.</span>
            </div>
            <div className="ac-status-row">
              <span className="chip" style={chipStyle(STATUS_RED)}>✕ Payment failed</span>
              <span className="chip" style={chipStyle(STATUS_GREEN)}>✓ Payment sent</span>
              <span className="ac-status-label">Good: an icon and words say it too.</span>
            </div>
          </Box>
        </div>
        <p className="ac-honest">
          The ratio is computed exactly (WCAG 2.x relative luminance). The colour-vision views are approximate filters for
          illustration, not a medical simulation.
        </p>
      </div>
    </StageFrame>
  );
}
