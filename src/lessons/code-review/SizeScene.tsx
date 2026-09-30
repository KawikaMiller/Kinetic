import { useState, type ReactNode } from 'react';
import { Bar } from '../../components/Bar';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { ChipButton, ControlGroup, Hint, Legend, Slider } from '../../components/ui';
import { useIntroCaption, useSetCaption } from '../../core/caption';
import { CHECKLIST, MAX_LINES, MIN_LINES, relativeDefectRate, relativeReviewTime, verdictFor } from './size';

const W = 560;
const H = 200;
const PAD = 28;
const SAMPLES = 60;

const VERDICT: Record<ReturnType<typeof verdictFor>, ReactNode> = {
  small: <>Small PR: a reviewer can hold all of it in their head and actually read every line.</>,
  ok: <>Getting big. Still reviewable in one sitting, but attention is starting to thin out.</>,
  large: <>Huge PR: reviewers skim, find fewer problems per line, and approve to make it go away. Split it.</>,
};

export function SizeScene({ picker }: { picker: ReactNode }) {
  const [lines, setLines] = useState(120);
  const [done, setDone] = useState<boolean[]>(CHECKLIST.map(() => false));
  const setCaption = useSetCaption();

  useIntroCaption(<>How big should a pull request be? Drag the slider and watch what size does to review time and to how much a reviewer actually catches.</>);

  const xs = Array.from({ length: SAMPLES }, (_, i) => MIN_LINES + ((MAX_LINES - MIN_LINES) * i) / (SAMPLES - 1));
  const maxTime = relativeReviewTime(MAX_LINES);
  const px = (l: number) => PAD + ((l - MIN_LINES) / (MAX_LINES - MIN_LINES)) * (W - PAD * 2);
  const py = (v: number) => H - PAD - v * (H - PAD * 2);
  const path = (f: (l: number) => number) => xs.map((l, i) => `${i ? 'L' : 'M'} ${px(l)} ${py(f(l))}`).join(' ');
  const timeOf = (l: number) => relativeReviewTime(l) / maxTime;

  const ready = done.filter(Boolean).length;
  const toggle = (i: number) => setDone(done.map((d, j) => (j === i ? !d : d)));

  return (
    <StageFrame
      height={420}
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'review time', shape: 'line' },
            { color: 'var(--ok)', label: 'defects found per line', shape: 'line' },
            { color: 'var(--hi)', label: 'this PR', shape: 'line' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Slider
            label="Lines changed"
            value={lines}
            min={MIN_LINES}
            max={MAX_LINES}
            step={20}
            onChange={(v) => {
              setLines(v);
              setCaption(VERDICT[verdictFor(v)], { quiet: true });
            }}
          />
        </>,
        <Hint key="note">Illustrative shapes, based on published review studies (e.g. SmartBear&apos;s analysis of reviews at Cisco): past a few hundred lines, reviewers catch less per line.</Hint>,
      ]}
    >
      <div className="crv stage-pad">
        <Box variant="sunken" className="crv-size">
          <SectionTitle hint="relative units, no real figures">PR size vs review</SectionTitle>
          <svg viewBox={`0 0 ${W} ${H}`} className="crv-chart" role="img" aria-label="Review time rises and defects found per line fall as a PR grows">
            <line x1={PAD} y1={H - PAD} x2={W - PAD} y2={H - PAD} className="crv-axis" />
            <line x1={PAD} y1={PAD} x2={PAD} y2={H - PAD} className="crv-axis" />
            <path d={path(timeOf)} className="crv-curve is-time" />
            <path d={path(relativeDefectRate)} className="crv-curve is-rate" />
            <line x1={px(lines)} y1={PAD - 6} x2={px(lines)} y2={H - PAD} className="crv-now" />
            <circle cx={px(lines)} cy={py(timeOf(lines))} r={5} className="crv-dot is-time" />
            <circle cx={px(lines)} cy={py(relativeDefectRate(lines))} r={5} className="crv-dot is-rate" />
            <text x={W - PAD} y={H - 8} textAnchor="end" className="crv-axis-label">
              lines changed →
            </text>
            <text x={px(lines)} y={PAD - 10} textAnchor="middle" className="crv-now-label">
              {lines} lines
            </text>
          </svg>
        </Box>
        <Box className="crv-checklist">
          <SectionTitle hint="before you ask for review">Author checklist</SectionTitle>
          <ControlGroup>
            {CHECKLIST.map((item, i) => (
              <ChipButton key={item} size="md" tone="ok" on={done[i]} onClick={() => toggle(i)}>
                {done[i] ? '✓ ' : ''}
                {item}
              </ChipButton>
            ))}
          </ControlGroup>
          <Bar value={ready} max={CHECKLIST.length} tone={ready === CHECKLIST.length ? 'ok' : 'hi'} label={<span className="crv-ready">{ready}/{CHECKLIST.length} ready</span>} />
        </Box>
      </div>
    </StageFrame>
  );
}
