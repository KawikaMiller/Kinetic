import { useMemo, useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { Bars, Plot2D, Steps } from '../../components/Plot2D';
import { StageFrame } from '../../components/StageFrame';
import type { Option } from '../../components/options';
import { Button, ChipButton, ControlGroup, Hint, Legend, Provenance, Segmented, Stat, Stats } from '../../components/ui';
import { useIntroCaption, useSetCaption } from '../../core/caption';
import { barsFromHistogram } from '../../core/plot';
import { quantile } from '../../core/distributions';
import { histogram, logHistogram } from '../../core/stats';
import type { Tone } from '../../core/tone';
import { SeedField } from './SeedField';
import { sig } from './fmt';
import { mysteryCaption, revealCaption } from './frames';
import {
  BINS, FAMILIES, FAMILY_NAME, MYSTERY_DEFAULT, MYSTERY_DISTS, MYSTERY_LABELS, ccdf, mysteryDatasets, mysteryHints, tailSlope, type Dist, type Family,
  type Mystery, type MysteryLabel,
} from './model';

const LABEL_OPTIONS: Option<MysteryLabel>[] = MYSTERY_LABELS.map((l) => ({ value: l, label: `Dataset ${l}` }));
const HEADROOM = 1.12;
/** The linear histogram ends at this quantile of the sample, so a long tail can't flatten it. */
const LINEAR_AXIS_QUANTILE = 0.995;
const SURVIVAL_FLOOR = 1e-4;
const AXIS_ROOM = 1.05;

type Guesses = Partial<Record<MysteryLabel, Family>>;

/** Why each family looks the way it does in these three pictures: what the reveal says. */
const WHY: Record<Family, string> = {
  normal: 'A normal is symmetric on linear bins and its survival curve falls off a cliff: no long tail.',
  exponential: 'An exponential is a straight line when only the survival axis is logged (it falls by the same factor every fixed step).',
  lognormal: 'A log-normal looks lopsided on linear bins and symmetric on log bins.',
  pareto: 'A Pareto is a straight line on log-log axes, with slope −α.',
};

function guessTone(revealed: boolean, guess: Family | undefined, truth: Family, option: Family): Tone {
  if (!revealed) return 'hi';
  if (option === truth) return 'ok';
  return guess === option ? 'bad' : 'dim';
}

function Pictures({ set }: { set: Mystery }) {
  const xs = set.sorted;
  const n = xs.length;
  const top = quantile(xs, LINEAR_AXIS_QUANTILE);
  const linear = histogram(xs, { bins: BINS, min: 0, max: top });
  const logged = logHistogram(xs, { bins: BINS, min: xs[0], max: xs[n - 1] });
  const linearTop = Math.max(...linear.counts) * HEADROOM;
  const loggedTop = Math.max(...logged.counts) * HEADROOM;
  const tail = ccdf(xs);
  return (
    <div className="dist-row">
      <Plot2D
        x={{ domain: [0, top], label: 'value', ticks: 4 }}
        y={{ domain: [0, linearTop], label: 'count', ticks: 3 }}
        ariaLabel={`Dataset ${set.label}, linear bins`}
      >
        <Bars bars={barsFromHistogram(linear)} tone="muted" />
      </Plot2D>
      <Plot2D
        x={{ domain: [xs[0], xs[n - 1]], log: true, label: 'value (log bins)', ticks: 4 }}
        y={{ domain: [0, loggedTop], label: 'count', ticks: 3 }}
        ariaLabel={`Dataset ${set.label}, log-spaced bins`}
      >
        <Bars bars={barsFromHistogram(logged)} tone="muted" />
      </Plot2D>
      <Plot2D
        x={{ domain: [xs[0], xs[n - 1] * AXIS_ROOM], log: true, label: 'value (log)', ticks: 4 }}
        y={{ domain: [SURVIVAL_FLOOR, 1], log: true, label: 'share above x', ticks: 4 }}
        ariaLabel={`Dataset ${set.label}, share of draws above each value on log-log axes`}
      >
        <Steps data={tail} startY={1} tone="info" />
      </Plot2D>
    </div>
  );
}

function Hints({ set }: { set: Mystery }) {
  const h = mysteryHints(set.sorted);
  return (
    <Box className="dist-table">
      <SectionTitle hint="computed from the data; a hint, not a test">Hints for {set.label}</SectionTitle>
      <table className="data-table">
        <tbody>
          <tr><td>mean ÷ median</td><td>{sig(h.meanOverMedian)}</td></tr>
          <tr><td>skew of ln x</td><td>{sig(h.logSkew, 2)}</td></tr>
          <tr><td>tail straightness, log-log (R²)</td><td>{sig(h.r2LogLog, 3)}</td></tr>
          <tr><td>tail straightness, log survival only (R²)</td><td>{sig(h.r2LogY, 3)}</td></tr>
          <tr><td>log-log tail slope</td><td>{sig(tailSlope(set.sorted), 2)}</td></tr>
        </tbody>
      </table>
    </Box>
  );
}

/** "a normal", "an exponential": the article that goes with the family's name. */
const article = (f: Family): string => (f === 'exponential' ? 'an' : 'a');

function truthLine(d: Dist): string {
  return d.family === 'pareto' ? ` (α = ${d.alpha}, so the slope should be about −${d.alpha})` : '';
}

export function MysteryScene({ picker }: { picker: ReactNode }) {
  const [seed, setSeedState] = useState(MYSTERY_DEFAULT.seed);
  const [label, setLabel] = useState<MysteryLabel>('A');
  const [guesses, setGuesses] = useState<Guesses>({});
  const [revealed, setRevealed] = useState(false);
  const setCaption = useSetCaption();

  const sets = useMemo(() => mysteryDatasets(seed), [seed]);
  const set = sets.find((s) => s.label === label)!;
  const guess = guesses[label];

  useIntroCaption(mysteryCaption(label), [label, seed]);

  const setSeed = (next: number) => {
    setSeedState(next);
    setGuesses({});
    setRevealed(false);
    setCaption(mysteryCaption(label));
  };
  const pick = (f: Family) => {
    setGuesses((g) => ({ ...g, [label]: f }));
    setRevealed(false);
    setCaption(mysteryCaption(label));
  };
  const reveal = () => {
    setRevealed(true);
    setCaption(revealCaption(sets, guesses));
  };
  const answered = MYSTERY_LABELS.filter((l) => guesses[l]).length;

  return (
    <StageFrame
      height={420}
      stats={
        <Stats>
          <Stat label="Datasets guessed" value={`${answered} of ${MYSTERY_LABELS.length}`} sub={[`seed ${seed}`]} />
          <Stat label="This dataset" value={set.label} sub={[guess ? `your guess: ${FAMILY_NAME[guess]}` : 'no guess yet']} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--muted)', label: 'count per bin' },
            { color: 'var(--info)', label: 'share above x', shape: 'line' },
            { color: 'var(--hi)', label: 'your guess' },
            { color: 'var(--ok)', label: 'right family' },
            { color: 'var(--bad)', label: 'wrong guess' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented label="Dataset" value={label} onChange={setLabel} options={LABEL_OPTIONS} />
        </>,
        <>
          <ControlGroup label={`Your guess for ${label}`} inline>
            {FAMILIES.map((f) => (
              <ChipButton
                key={f}
                tone={guessTone(revealed, guess, set.truth, f)}
                on={guess === f || (revealed && f === set.truth)}
                onStyle={revealed ? 'solid' : 'tint'}
                onClick={() => pick(f)}
              >
                {FAMILY_NAME[f]}
              </ChipButton>
            ))}
          </ControlGroup>
          <Button variant="primary" onClick={reveal} disabled={answered === 0}>Reveal</Button>
          <SeedField seed={seed} onSeed={setSeed} />
        </>,
      ]}
    >
      <div className="stage-pad dist-stage">
        <Pictures set={set} />
        <Hints set={set} />
        {revealed && (
          <Box className="dist-reveal">
            <SectionTitle>What {set.label} really was</SectionTitle>
            <p>
              {set.label} was drawn from {article(set.truth)} <b className={guess === set.truth ? 'is-ok' : 'is-bad'}>{FAMILY_NAME[set.truth].toLowerCase()}</b>
              {guess ? (guess === set.truth ? ': you got it.' : `; you said ${FAMILY_NAME[guess].toLowerCase()}.`) : '; you made no guess.'}{' '}
              {WHY[set.truth]}{truthLine(MYSTERY_DISTS[set.truth])}
            </p>
          </Box>
        )}
        <Hint tone="muted" className="dist-note">The guess is by eye plus the computed hints, not a goodness-of-fit test.</Hint>
        <div className="dist-chips">
          <Provenance kind="simulated" seed={seed}>three seeded datasets of 5,000 draws</Provenance>
          <Provenance kind="illustrative">the families and parameters are made up</Provenance>
        </div>
      </div>
    </StageFrame>
  );
}
