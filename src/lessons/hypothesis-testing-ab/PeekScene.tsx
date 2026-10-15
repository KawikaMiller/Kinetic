import { useMemo, useState, type ReactNode } from 'react';
import { Bar } from '../../components/Bar';
import { Box, SectionTitle } from '../../components/Panel';
import { Curve, HLine, Plot2D, Points, VLine } from '../../components/Plot2D';
import { StageFrame } from '../../components/StageFrame';
import type { Option } from '../../components/options';
import { Button, Hint, Legend, Provenance, Segmented, Stat, Stats, Toggle } from '../../components/ui';
import { useIntroCaption } from '../../core/caption';
import type { Tone } from '../../core/tone';
import { pctText, sig } from '../distributions/fmt';
import { SeedField } from '../distributions/SeedField';
import { peekCaption, pText, verdictSays } from './frames';
import {
  ALPHA, PEEK_DEFAULT, PEEK_LIFT_POINTS, PEEK_LOOKS, PEEK_TOTAL, firstCrossing, lookAlpha, lookVerdict, peekRates, peekRun, runSeed,
} from './model';

type Policy = 'end' | 'first';
const POLICY_OPTIONS: Option<Policy>[] = [
  { value: 'end', label: 'Look once at the end' },
  { value: 'first', label: 'Stop at the first p < 0.05' },
];
const LOOK_OPTIONS: Option<number>[] = PEEK_LOOKS.map((l) => ({ value: l, label: `${l} ${l === 1 ? 'look' : 'looks'}` }));
const TRUTH_OPTIONS: Option<number>[] = [
  { value: 0, label: 'No effect (A/A)' },
  { value: PEEK_LIFT_POINTS, label: `Real +${PEEK_LIFT_POINTS} pt lift` },
];
const BAR_MAX = 0.5;
const KIND_TONE: Record<string, Tone> = { 'real-win': 'ok', 'false-positive': 'bad', 'wrong-sign': 'bad' };

export function PeekScene({ picker }: { picker: ReactNode }) {
  const [looks, setLooks] = useState<number>(PEEK_DEFAULT.looks);
  const [lift, setLift] = useState<number>(PEEK_DEFAULT.lift);
  const [bonferroni, setBonferroni] = useState(PEEK_DEFAULT.bonferroni);
  const [policy, setPolicy] = useState<Policy>('first');
  const [seed, setSeed] = useState(PEEK_DEFAULT.seed);
  const [index, setIndex] = useState(0);

  const run = useMemo(() => peekRun({ baseline: PEEK_DEFAULT.baseline, lift, looks, seed: runSeed(seed, index) }), [lift, looks, seed, index]);
  const rates = useMemo(() => peekRates({ baseline: PEEK_DEFAULT.baseline, lift, looks }, seed, bonferroni), [lift, looks, seed, bonferroni]);
  const threshold = lookAlpha(looks, bonferroni);
  const crossing = firstCrossing(run, threshold);
  const last = run[run.length - 1];
  const stopped = policy === 'first' && crossing >= 0 ? run[crossing] : last;
  const stoppedKind = lookVerdict(stopped, lift, policy === 'first' ? threshold : ALPHA);
  const crossingKind = crossing >= 0 ? lookVerdict(run[crossing], lift, threshold) : null;

  useIntroCaption(peekCaption(run, looks, bonferroni, lift, rates), [run, looks, bonferroni, lift, rates]);

  const trace = run.flatMap((l) => (l.p === null ? [] : [[l.visitors, l.p] as const]));

  return (
    <StageFrame
      height={460}
      stats={
        <Stats>
          <Stat
            label="This run"
            value={stopped.p === null ? '–' : `p = ${pText(stopped.p)}`}
            sub={[`${policy === 'first' && crossing >= 0 ? `stopped at look ${crossing + 1}` : `read at look ${run.length}`}, ${stopped.visitors.toLocaleString('en-US')} per arm`, verdictSays(stoppedKind)]}
          />
          <Stat
            label="Stop at first p < threshold"
            value={pctText(rates.anyLook)}
            color={lift === 0 ? 'var(--bad)' : undefined}
            sub={[`of ${rates.runs.toLocaleString('en-US')} experiments declared a winner`, `each look tested at ${sig(threshold, 2)}`]}
          />
          <Stat label="Look once at the end" value={pctText(rates.lastLook)} color="var(--ok)" sub={['tested once, at 0.05']} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'p-value after each look', shape: 'line' },
            { color: 'var(--dim)', label: 'the threshold', shape: 'line' },
            { color: 'var(--bad)', label: 'first crossing, false positive' },
            { color: 'var(--ok)', label: 'first crossing, real lift' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented label="Data arrives in" value={looks} onChange={setLooks} options={LOOK_OPTIONS} />
          <Segmented label="Truth" value={lift} onChange={setLift} options={TRUTH_OPTIONS} />
        </>,
        <>
          <Segmented label="Policy" value={policy} onChange={setPolicy} options={POLICY_OPTIONS} />
          <Toggle label="Bonferroni" value={bonferroni} onChange={setBonferroni} off="Off" on="Test each look at α ÷ looks" />
        </>,
        <>
          <Button variant="primary" onClick={() => setIndex((i) => i + 1)}>New experiment</Button>
          <SeedField seed={seed} onSeed={setSeed} />
        </>,
      ]}
    >
      <div className="ab-stage stage-pad">
        <Plot2D
          x={{ domain: [0, PEEK_TOTAL], label: 'visitors per arm so far', ticks: 5 }}
          y={{ domain: [0, 1], label: 'p-value so far', ticks: 4 }}
          ariaLabel={`p-value after each of ${looks} looks; the threshold is ${sig(threshold, 2)}`}
        >
          <HLine at={threshold} tone="dim" label={sig(threshold, 2)} />
          <Curve points={trace} tone="hi" />
          <Points data={trace.map(([x, y]) => ({ x, y, tone: 'hi' as const }))} r={2.5} />
          {crossing >= 0 && crossingKind && <Points data={[{ x: run[crossing].visitors, y: run[crossing].p!, tone: KIND_TONE[crossingKind] ?? 'hi', r: 6 }]} />}
          {policy === 'first' && crossing >= 0 && <VLine at={run[crossing].visitors} tone="dim" label="stop" />}
        </Plot2D>
        <Box className="ab-calc">
          <SectionTitle hint={`${rates.runs.toLocaleString('en-US')} replicated experiments, same settings`}>How often does each policy declare a winner?</SectionTitle>
          <Bar value={rates.anyLook} max={BAR_MAX} tone={lift === 0 ? 'bad' : 'ok'} label={<span className="ab-bar-label">stop at the first p &lt; {sig(threshold, 2)}</span>} trailing={<span className="ab-bar-value">{pctText(rates.anyLook)}</span>} markers={[{ at: ALPHA, label: '5%', tone: 'dim' }]} />
          <Bar value={rates.lastLook} max={BAR_MAX} tone="ok" label={<span className="ab-bar-label">look once at the end</span>} trailing={<span className="ab-bar-value">{pctText(rates.lastLook)}</span>} />
          <Hint tone="muted" block>
            With no true effect, every declared winner is a false positive. Looking at the final p-value only is a 5% test; checking at {looks} points and stopping at the first significant one is not.
          </Hint>
        </Box>
        <Hint tone="muted" className="ab-note">
          Published tables of repeated significance testing (Armitage, McPherson and Rowe, 1969) give roughly 14% for 5 looks, 19% for 10 and 25% for 20; this lesson computes its own
          numbers above and does not copy those. Sequential methods exist that allow peeking safely; they are named here, not taught.
        </Hint>
        <div className="ab-chips">
          <Provenance kind="simulated" seed={seed}>seeded A/A or +1 pt experiments, {PEEK_TOTAL.toLocaleString('en-US')} visitors per arm in total</Provenance>
          <Provenance kind="from-memory">the published repeated-testing figures: verify against Armitage et al., 1969</Provenance>
        </div>
      </div>
    </StageFrame>
  );
}
