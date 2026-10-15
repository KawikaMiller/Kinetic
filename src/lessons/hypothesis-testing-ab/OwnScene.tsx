import { useMemo, useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { Plot2D, Points, Segments, VLine } from '../../components/Plot2D';
import { StageFrame } from '../../components/StageFrame';
import { Hint, Legend, Provenance, Stat, Stats, TextField } from '../../components/ui';
import { useIntroCaption } from '../../core/caption';
import { pctText, sig } from '../distributions/fmt';
import { VERDICT_TONE, ownCaption, pText, pointsText, verdictSays, zText } from './frames';
import { MIN_VISITORS, OWN_DEFAULT, parseArms, verdictKind, zTest, type ArmFields } from './model';

const INTERVAL_PAD = 0.15;

const FIELD_LABELS: Record<keyof ArmFields, string> = {
  conversionsA: 'A: conversions',
  visitorsA: 'A: visitors',
  conversionsB: 'B: conversions',
  visitorsB: 'B: visitors',
};
const ORDER: (keyof ArmFields)[] = ['conversionsA', 'visitorsA', 'conversionsB', 'visitorsB'];

export function OwnScene({ picker }: { picker: ReactNode }) {
  const [fields, setFields] = useState<ArmFields>(OWN_DEFAULT);
  const parsed = useMemo(() => parseArms(fields), [fields]);
  const [kept, setKept] = useState(() => {
    const first = parseArms(OWN_DEFAULT);
    return first.ok ? first.arms : { conversionsA: 100, visitorsA: 1000, conversionsB: 130, visitorsB: 1000 };
  });
  const arms = parsed.ok ? parsed.arms : kept;
  const test = zTest(arms);
  const kind = verdictKind(test, null);
  const tone = VERDICT_TONE[kind];

  useIntroCaption(ownCaption(arms, test), [arms]);

  const edit = (key: keyof ArmFields, text: string) => {
    const next = { ...fields, [key]: text };
    setFields(next);
    const result = parseArms(next);
    if (result.ok) setKept(result.arms);
  };

  const lo = test.lo;
  const hi = test.hi;
  const xs = lo === null || hi === null ? [-0.02, 0.02] : [Math.min(lo, 0), Math.max(hi, 0)];
  const pad = (xs[1] - xs[0]) * INTERVAL_PAD || 0.01;

  return (
    <StageFrame
      height={420}
      stats={
        <Stats>
          <Stat label="A converts" value={pctText(test.rateA, 2)} color="var(--sky)" sub={[`${arms.conversionsA.toLocaleString('en-US')} of ${arms.visitorsA.toLocaleString('en-US')}`]} />
          <Stat label="B converts" value={pctText(test.rateB, 2)} color="var(--amber)" sub={[`${arms.conversionsB.toLocaleString('en-US')} of ${arms.visitorsB.toLocaleString('en-US')}`]} />
          <Stat label="p-value" value={test.p === null ? 'undefined' : pText(test.p)} sub={test.z === null ? ['no z-test here'] : [`z = ${zText(test.z)}`, `pooled SE ${sig(test.se!, 3)}`]} />
          <Stat label="95% interval, B − A" value={lo === null || hi === null ? '–' : `${pointsText(lo)} to ${pointsText(hi)}`} sub={[`difference ${pointsText(test.diff)}`]} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--sky)', label: 'variant A' },
            { color: 'var(--amber)', label: 'variant B' },
            { color: 'var(--violet)', label: '95% interval for B − A', shape: 'line' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
        </>,
        <>
          {ORDER.map((key) => (
            <TextField key={key} label={FIELD_LABELS[key]} value={fields[key]} onChange={(text) => edit(key, text)} width={110} spellCheck={false} />
          ))}
        </>,
      ]}
    >
      <div className="ab-stage stage-pad">
        {!parsed.ok && (
          <Box className="ab-refusals">
            <SectionTitle>Not read</SectionTitle>
            <ul role="status">
              {ORDER.filter((k) => parsed.errors[k]).map((k) => (
                <li key={k}>{parsed.errors[k]}</li>
              ))}
            </ul>
            <p>Still showing the last numbers that were valid.</p>
          </Box>
        )}
        <Plot2D
          x={{ domain: [xs[0] - pad, xs[1] + pad], label: 'B − A (share of visitors)', format: (v) => `${(v * 100).toFixed(1)}`, ticks: 5 }}
          y={{ domain: [0, 2], format: () => '', ticks: 1 }}
          ariaLabel={lo === null || hi === null ? 'Interval for the difference: none' : `95% interval for the difference: ${pointsText(lo)} to ${pointsText(hi)}`}
        >
          <VLine at={0} tone="dim" label="no difference" />
          {lo !== null && hi !== null && <Segments segments={[{ from: [lo, 1], to: [hi, 1], tone: 'violet' }]} />}
          {lo !== null && hi !== null && <Points data={[{ x: test.diff, y: 1, tone: 'hi' }]} r={5} />}
        </Plot2D>
        <Box className="ab-verdict">
          <SectionTitle>Verdict</SectionTitle>
          <p className={tone ? `ab-${tone}` : ''}>{test.status === 'ok' ? verdictSays(kind) : test.status === 'too-few' ? `Under ${MIN_VISITORS} visitors in an arm is too few for a z-test.` : 'The p-value is undefined: both arms converted at the same extreme rate.'}</p>
          <Hint tone="muted" block>Whole numbers only: plain digits, conversions no more than visitors, nothing above a billion.</Hint>
        </Box>
        <Hint tone="muted" className="ab-note">Frequentist two-proportion z-test at a fixed horizon: it assumes independent users and a single look at the end. The first screen is the worked example, 100 of 1,000 against 130 of 1,000.</Hint>
        <div className="ab-chips">
          <Provenance kind="real">the z-test and interval are computed from exactly the numbers you type</Provenance>
        </div>
      </div>
    </StageFrame>
  );
}
