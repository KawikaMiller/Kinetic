import { useMemo, useState, type ReactNode } from 'react';
import { Curve, HLine, Plot2D, Points } from '../../components/Plot2D';
import { StageFrame } from '../../components/StageFrame';
import { Button, ClaimLabel, Hint, Legend, Provenance, ProvenanceRow, Slider, Stat, Stats, TextField } from '../../components/ui';
import {
  B_DEFAULT, B_MAX, B_MIN, CHECKED_B_MAX, breakEvenBound, challenge, checkBound, clampSki, maxThreshold, neverBuyVerdict, opt, parseTarget,
  ratio, skiCost, thresholdSweep, type Strategy,
} from './model';
import { PLOT_WIDTH, RatioPlot } from './Plots';

const DEFAULT_TARGET = '2.00';
const SWEEP_HEIGHT = 200;
const fixed2 = (x: number) => x.toFixed(2);

/** Scene 2: the learner is the adversary. Pick the season end, challenge a target ratio, or declare never-buy competitive; every refusal is computed. */
export function AdversaryScene({ picker }: { picker: ReactNode }) {
  const [B, setB] = useState(B_DEFAULT);
  const [t, setT] = useState(B_DEFAULT - 1);
  const [N, setN] = useState(1);
  const [targetText, setTargetText] = useState(DEFAULT_TARGET);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const strategy = useMemo<Strategy>(() => ({ t, never: false }), [t]);
  const sweep = useMemo(() => thresholdSweep(B), [B]);
  const check = useMemo(() => checkBound(), []);
  const target = parseTarget(targetText);
  const best = Math.min(...sweep.map((p) => p.ratio));
  const bestTs = sweep.filter((p) => p.ratio === best).map((p) => p.t);

  const changeB = (next: number) => {
    const c = clampSki(next, t, N);
    setB(c.B);
    setT(c.t);
    setN(c.N);
    setMessage(c.note ? { text: c.note, ok: true } : null);
  };
  const run = () => {
    if (!target.ok) return;
    const result = challenge(strategy, B, target.value);
    if (result.ok) {
      setN(result.N);
      setMessage({ text: `Challenge met: a season of ${result.N} ${result.N === 1 ? 'day' : 'days'} gives ratio ${fixed2(result.ratio)}, which reaches ${fixed2(target.value)}.`, ok: true });
    } else {
      setMessage({ text: result.message, ok: false });
    }
  };

  return (
    <StageFrame
      height={680}
      intro={
        <>
          {message ? `${message.text} ` : ''}
          You are the adversary: you know the strategy (rent {t} days, then buy) and choose when the season ends. Season {N}: online {skiCost(strategy, B, N)}, optimum {opt(B, N)}, ratio {fixed2(ratio(strategy, B, N))}.
        </>
      }
      introKey={`adv|${B}|${t}|${N}|${message?.text ?? ''}`}
      stats={
        <Stats>
          <Stat label="Your season" value={`N = ${N}`} color="var(--hi)" sub={`ratio ${fixed2(ratio(strategy, B, N))}`} />
          <Stat label="Best threshold" value={bestTs.length === 1 ? `t = ${bestTs[0]}` : `t = ${bestTs.join(', ')}`} color="var(--ok)" sub={`worst ratio ${fixed2(best)}, in the sweep`} />
          <Stat label="Bound 2 - 1/B" value={fixed2(breakEvenBound(B))} color="var(--info)" sub={`B = ${B}`} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--bad)', label: 'ratio for the season you pick (drag the rule)', shape: 'line' },
            { color: 'var(--ok)', label: 'worst ratio of each threshold, in the sweep', shape: 'line' },
            { color: 'var(--dim)', label: 'the line 2 - 1/B', shape: 'line' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Slider label="Buy price B" value={B} min={B_MIN} max={B_MAX} onChange={changeB} format={(v) => `${v} days of rent`} />
          <Slider label="Threshold t" value={t} min={0} max={maxThreshold(B)} onChange={(v) => { setT(v); setMessage(null); }} format={(v) => `${v} days`} />
        </>,
        <>
          <TextField label="Target ratio (1.00 to 20.00)" value={targetText} onChange={setTargetText} onEnter={run} width={90} spellCheck={false} />
          <Button variant="primary" softDisabled={!target.ok} onClick={run}>Challenge</Button>
          <Button onClick={() => setMessage({ text: neverBuyVerdict(B), ok: false })}>Declare never buy competitive</Button>
          <Hint tone={!target.ok || (message && !message.ok) ? 'bad' : 'faint'}>
            <span role="status">{!target.ok ? target.error : message?.text ?? 'Pick a target the strategy cannot keep under, and press Challenge.'}</span>
          </Hint>
        </>,
      ]}
    >
      <div className="oa-stage stage-pad">
        <div className="oa-plots">
          <RatioPlot B={B} strategy={strategy} N={N} onDragN={(n) => { setN(n); setMessage(null); }} />
          <Plot2D
            x={{ domain: [0, maxThreshold(B)], label: 'threshold t (days)' }}
            y={{ domain: [0, Math.max(2.2, sweep[0].ratio * 1.1)], label: 'worst ratio' }}
            width={PLOT_WIDTH}
            height={SWEEP_HEIGHT}
            ariaLabel="Worst-case ratio of every threshold from 0 to 3B"
          >
            <HLine at={breakEvenBound(B)} label={`2 - 1/B = ${fixed2(breakEvenBound(B))}`} tone="dim" />
            <Curve points={sweep.map((p) => [p.t, p.ratio] as const)} tone="ok" />
            <Points data={[{ x: t, y: sweep[t].ratio, tone: 'hi' }]} />
          </Plot2D>
        </div>
        <p className="oa-note">
          Every threshold from 0 to {maxThreshold(B)} has a worst season; the lowest worst ratio is {fixed2(best)}, at t = {bestTs.join(', ')} (the break-even threshold B - 1 = {B - 1}).
          Any deterministic strategy is a threshold, which is the argument behind the theorem chip below: no deterministic strategy does better than that line.
        </p>
        <p className="oa-note">
          {check.holds
            ? `Checked for every buy price from 1 to ${check.maxB}, every threshold from 0 to 3B and every season from 1 to 6B (${check.evaluations.toLocaleString('en-US')} evaluations): the worst ratio is at least 2 - 1/B, and equal to it only at t = B - 1.`
            : `The check over buy prices 1 to ${check.maxB} found a disagreement with the bound.`}
          {' '}A check up to B = {CHECKED_B_MAX} is a bound on the check, not a proof for all B: the lower-bound argument is the theorem.
        </p>
      </div>
      <ProvenanceRow>
        <Provenance kind="toy">invented prices: renting costs 1 a day, buying costs B days of rent</Provenance>
        <ClaimLabel kind="theorem">no deterministic strategy beats 2 - 1/B: argued from the threshold form, checked for B up to {CHECKED_B_MAX}</ClaimLabel>
        <Provenance kind="from-memory">a randomised strategy can reach about e/(e-1), near 1.58; named only (verify against Karlin, Manasse, Rudolph and Sleator, 1988)</Provenance>
      </ProvenanceRow>
    </StageFrame>
  );
}
