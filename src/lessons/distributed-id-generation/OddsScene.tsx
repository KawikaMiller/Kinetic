import { useState, type ReactNode } from 'react';
import { Curve, Plot2D, VLine } from '../../components/Plot2D';
import { StageFrame } from '../../components/StageFrame';
import { Hint, Legend, Slider, Stat, Stats } from '../../components/ui';
import { WideRegion } from '../../components/WideRegion';
import { useIntroCaption } from '../../core/caption';
import { power } from '../../core/format';
import type { Tone } from '../../core/tone';
import { oddsCaption } from './captions';
import { formatCount, formatProbability, idsForOdds, probabilityOf, RANDOM_BITS } from './odds';

const TONE_OF: Record<number, Tone> = { 32: 'orange', 64: 'amber', 122: 'ok' };
const MIN_EXP = 2;
const MAX_EXP = 20;
const START_EXP = 5;
const FLOOR = 1e-40;
const CURVE_STEPS = 60;
const PLOT_W = 520;
const ONE_IN_A_MILLION = 1e-6;
const EVEN_ODDS = 0.5;
const HONEST = 'The odds are the birthday-problem arithmetic (exact below 100,000 IDs, the standard approximation above) for IDs picked uniformly at random. Real generators with a weak random source do worse; this assumes a good one.';

const LEGEND = (
  <Legend
    items={RANDOM_BITS.map((r) => ({ color: `var(--${TONE_OF[r.bits]})`, label: r.label }))}
  />
);

const curveFor = (bits: number): [number, number][] =>
  Array.from({ length: CURVE_STEPS + 1 }, (_, i) => {
    const n = 10 ** (MIN_EXP + ((MAX_EXP - MIN_EXP) * i) / CURVE_STEPS);
    return [n, Math.max(FLOOR, probabilityOf(n, bits))];
  });

const CURVES = RANDOM_BITS.map((r) => ({ ...r, points: curveFor(r.bits) }));

export function OddsScene({ picker }: { picker: ReactNode }) {
  const [exp, setExp] = useState(START_EXP);
  const n = 10 ** exp;
  const p = (bits: number) => probabilityOf(n, bits);

  useIntroCaption(oddsCaption(n, p(32), p(122)), [exp]);

  return (
    <StageFrame
      height={420}
      legend={LEGEND}
      stats={
        <Stats>
          {RANDOM_BITS.map((r) => (
            <Stat key={r.bits} label={r.label} value={formatProbability(p(r.bits))} color={`var(--${TONE_OF[r.bits]})`} sub={`${formatCount(idsForOdds(r.bits, ONE_IN_A_MILLION))} IDs make 1 in a million`} />
          ))}
        </Stats>
      }
      controls={[
        <>
          {picker}
          <Slider label="Random IDs made" value={exp} min={MIN_EXP} max={MAX_EXP} onChange={setExp} format={(v) => formatCount(10 ** v)} />
        </>,
      ]}
    >
      <div className="stage-pad idg">
        <WideRegion minWidth={PLOT_W} label="Collision odds plot: scroll sideways to see all of it">
          <Plot2D
            x={{ domain: [10 ** MIN_EXP, 10 ** MAX_EXP], log: true, label: 'random IDs made', tickValues: [1e3, 1e6, 1e9, 1e12, 1e15, 1e18], format: (v) => power(Math.round(Math.log10(v)), 10) }}
            y={{ domain: [FLOOR, 1], log: true, label: 'chance of at least one repeat', tickValues: [1e-40, 1e-30, 1e-20, 1e-10, 1], format: (v) => (v === 1 ? '1' : power(Math.round(Math.log10(v)), 10)) }}
            width={PLOT_W}
            ariaLabel={`Collision chance against the number of random IDs, for 32, 64 and 122 random bits; at ${formatCount(n)} IDs a 32-bit ID has ${formatProbability(p(32))}`}
          >
            {CURVES.map((c) => (
              <Curve key={c.bits} points={c.points} tone={TONE_OF[c.bits]} />
            ))}
            <VLine at={n} label={formatCount(n)} tone="hi" />
          </Plot2D>
        </WideRegion>
        <p className="idg-note">
          Short random IDs run out of room fast: the birthday paradox makes a repeat likely long before the space is full. A 122-bit ID needs about {formatCount(idsForOdds(122, EVEN_ODDS))} IDs before a repeat is as likely as a coin toss, far more than most systems will ever make.
        </p>
        <Hint block>{HONEST}</Hint>
      </div>
    </StageFrame>
  );
}
