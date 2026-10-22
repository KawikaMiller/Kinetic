import { useMemo, useState, type ReactNode } from 'react';
import { StageFrame } from '../../components/StageFrame';
import { ChipButton, ClaimLabel, Hint, Legend, Provenance, ProvenanceRow, Slider, Stat, Stats, Toggle } from '../../components/ui';
import {
  B_DEFAULT, B_MAX, B_MIN, WITNESS_HORIZON, boundViolations, breakEven, breakEvenBound, clampSki, lateThreshold, maxSeason, maxThreshold, opt, ratio, skiCost, worstSeason,
  type Strategy,
} from './model';
import { CostPlot, RatioPlot } from './Plots';

const DEFAULT_N = 11;
/** Above this share of failing season lengths a rate is itself informative; below it only the witness is. */
const WITNESS_RATE_FLOOR = 0.9;
const fixed2 = (x: number) => x.toFixed(2);
const percent = (part: number, whole: number) => `${((part / whole) * 100).toFixed(1)}%`;

/** Scene 1: ski rental. Rent for t days then buy; the plots show the online cost, the optimum and their ratio over the season length. */
export function SkiScene({ picker }: { picker: ReactNode }) {
  const [B, setB] = useState(B_DEFAULT);
  const [t, setT] = useState(B_DEFAULT - 1);
  const [N, setN] = useState(DEFAULT_N);
  const [never, setNever] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const strategy = useMemo<Strategy>(() => ({ t, never }), [t, never]);
  const cost = skiCost(strategy, B, N);
  const best = opt(B, N);
  const worst = useMemo(() => worstSeason(strategy, B), [strategy, B]);
  const bound = breakEvenBound(B);
  const violations = useMemo(() => boundViolations(strategy, B), [strategy, B]);

  const changeB = (next: number) => {
    const c = clampSki(next, t, N);
    setB(c.B);
    setT(c.t);
    setN(c.N);
    setNote(c.note);
  };
  const preset = (s: Strategy) => {
    setNever(s.never);
    setT(s.t);
    setNote(null);
  };
  const atBreakEven = !never && t === B - 1;

  return (
    <StageFrame
      height={620}
      intro={
        <>
          {note ? `${note} ` : ''}
          {never ? 'Never buying' : `Renting ${t} ${t === 1 ? 'day' : 'days'} and then buying`} in a season of {N} {N === 1 ? 'day' : 'days'} costs {cost}; hindsight pays {best} (rent all {N} days or buy on day 1, whichever is cheaper). The ratio is {fixed2(cost / best)}.
        </>
      }
      introKey={`ski|${B}|${never ? 'never' : t}|${N}|${note ?? ''}`}
      stats={
        <Stats>
          <Stat label="Online cost" value={cost} color="var(--bad)" sub={`at N = ${N}, B = ${B}`} />
          <Stat label="Optimum" value={best} color="var(--ok)" sub="min(N, B), in hindsight" />
          <Stat label="Ratio" value={fixed2(ratio(strategy, B, N))} color="var(--hi)" sub={`worst over N up to ${maxSeason(B)}: ${fixed2(worst.ratio)} at N = ${worst.N}`} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--bad)', label: 'what the online player pays, and its ratio', shape: 'line' },
            { color: 'var(--ok)', label: 'the optimum in hindsight', shape: 'line' },
            { color: 'var(--dim)', label: 'the line 2 - 1/B', shape: 'line' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Slider label="Buy price B" value={B} min={B_MIN} max={B_MAX} onChange={changeB} format={(v) => `${v} days of rent`} />
          <Toggle label="Strategy" value={never} onChange={(v) => { setNever(v); setNote(null); }} off="Rent t days, then buy" on="Never buy" />
          {!never && <Slider label="Threshold t" value={t} min={0} max={maxThreshold(B)} onChange={(v) => { setT(v); setNote(null); }} format={(v) => `${v} days`} />}
          <Slider label="Season length N" value={N} min={1} max={maxSeason(B)} onChange={(v) => { setN(v); setNote(null); }} format={(v) => `${v} days`} />
        </>,
        <>
          <ChipButton tone="ok" on={atBreakEven} onClick={() => preset(breakEven(B))}>Break-even (t = B - 1)</ChipButton>
          <ChipButton tone="info" on={!never && t === 0} onClick={() => preset({ t: 0, never: false })}>Buy at once (t = 0)</ChipButton>
          <ChipButton tone="bad" on={!never && t === B} onClick={() => preset(lateThreshold(B))}>A day late (t = B, broken)</ChipButton>
          <Hint>Rent costs 1 a day and buying costs B, both invented.</Hint>
        </>,
      ]}
    >
      <div className="oa-stage stage-pad">
        <div className="oa-plots">
          <CostPlot B={B} strategy={strategy} N={N} />
          <RatioPlot B={B} strategy={strategy} N={N} />
        </div>
        <section className="oa-claim" aria-label="Check against the break-even bound">
          <p className="oa-note">
            Claim for break-even (argued as a theorem, see the chip below): its ratio stays at or under 2 - 1/B = {fixed2(bound)}. This strategy&apos;s worst ratio is {fixed2(worst.ratio)}, at N = {worst.N}, checked here for N up to {maxSeason(B)}.
          </p>
          {violations.violations === 0 ? (
            <p className="oa-note">It stays within {fixed2(bound)} on all {violations.horizon} season lengths from 1 to {WITNESS_HORIZON}, a fixed horizon that does not move with B (the slider stops at {maxSeason(B)}).</p>
          ) : (
            <p className="oa-witness" role="note">
              <b>Witness: N = {violations.firstViolation?.N}, ratio {fixed2(violations.firstViolation?.ratio ?? 0)} against {fixed2(bound)}.</b>{' '}
              It breaks the bound on {violations.violations} of the {violations.horizon} season lengths from 1 to {WITNESS_HORIZON} ({percent(violations.violations, violations.horizon)}), a fixed horizon that does not move with B (the slider stops at {maxSeason(B)}).{' '}
              {violations.violations / violations.horizon > WITNESS_RATE_FLOOR
                ? 'So the smallest failing season is shown rather than a rate.'
                : 'That rate changes with B and the horizon, so the smallest failing season is the claim, not the rate.'}
            </p>
          )}
        </section>
      </div>
      <ProvenanceRow>
        <Provenance kind="toy">invented prices: renting costs 1 a day, buying costs B days of rent</Provenance>
        <ClaimLabel kind="theorem">2 - 1/B is the best ratio a deterministic strategy can guarantee; argued from the threshold form, and checked here for B up to 50 in the next scene</ClaimLabel>
      </ProvenanceRow>
    </StageFrame>
  );
}
