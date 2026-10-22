import { useMemo, useState, type ReactNode } from 'react';
import { ConsolePanel } from '../../components/ConsolePanel';
import { StageFrame } from '../../components/StageFrame';
import { Button, ChipButton, ControlGroup, Hint, Legend, Provenance, ProvenanceRow, Slider, Stat, Stats, TextField, Toggle } from '../../components/ui';
import { formatPoint } from '../../core/ecc';
import { humanDuration, power } from '../../core/format';
import { parseBoundedBigInt } from '../../core/parse';
import {
  FORGOT_FACTOR_2_WITNESS, ILLUSTRATIVE_RATE, P256_COST, SCALAR_MAX, TOY, commutativityChecks, groupBits, mulChecked, scalarView, traceLines, walkToReverse, type DoublingRule,
} from './model';

const SLIDER_MAX = 40;
const DEFAULT_K = 13n;
const PRESET_KS = [13n, 19n, 20n];
const fmt = (n: number | bigint) => n.toLocaleString('en-US');
const READ_K = { min: 0n, max: BigInt(SCALAR_MAX), messages: { tooBig: () => `Keep k between 0 and ${fmt(SCALAR_MAX)}.`, tooSmall: () => `Keep k between 0 and ${fmt(SCALAR_MAX)}.` } };

/** Scene 3: kG by double-and-add with its trace, the broken doubling, and the easy-forward, hard-to-reverse costs. */
export function ScalarScene({ picker }: { picker: ReactNode }) {
  const [k, setK] = useState(DEFAULT_K);
  const [text, setText] = useState(String(DEFAULT_K));
  const [error, setError] = useState<string | null>(null);
  const [rule, setRule] = useState<DoublingRule>('correct');
  const [walkedFor, setWalkedFor] = useState<bigint | null>(null);
  const [commute, setCommute] = useState<{ checked: number; agreed: number } | null>(null);

  const view = useMemo(() => scalarView(k), [k]);
  const checked = useMemo(() => mulChecked(rule, k), [rule, k]);
  const lines = useMemo(() => traceLines(k), [k]);
  const broken = checked.failure !== null;
  const walk = walkedFor === k ? walkToReverse(TOY, view.point) : null;

  const choose = (next: bigint) => {
    setK(next);
    setText(String(next));
    setError(null);
  };
  const type = (value: string) => {
    setText(value);
    const parsed = parseBoundedBigInt(value, READ_K);
    if (parsed.ok) {
      setK(parsed.value);
      setError(null);
    } else {
      setError(parsed.error);
    }
  };

  const intro = broken
    ? checked.failure!.message
    : `${k}G = ${formatPoint(view.point)}: ${view.doublings} doublings and ${view.additions} additions, and ${k} mod ${TOY.n} = ${view.reduced} gives the same point.`;

  return (
    <StageFrame
      height={520}
      intro={intro}
      introKey={`scalar|${k}|${rule}`}
      stats={
        <Stats>
          <Stat label={`${k}G`} value={broken ? 'not on the curve' : formatPoint(view.point)} color={broken ? 'var(--bad)' : view.point === null ? 'var(--hi)' : 'var(--ok)'} sub={view.point === null && !broken ? 'the point at infinity O' : `k = ${view.bits} in binary`} />
          <Stat label="Doublings" value={view.doublings} sub="left to right over the bits" />
          <Stat label="Additions" value={view.additions} sub="one per 1 bit after the first" />
          <Stat label="k mod 19" value={String(view.reduced)} sub={`the group has ${TOY.n} points`} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--ok)', label: 'cheap forward cost', shape: 'square' },
            { color: 'var(--bad)', label: 'hard-to-reverse cost, and a refused result', shape: 'square' },
            { color: 'var(--hi)', label: 'the point at infinity O', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Slider label="k (slider, 0 to 40)" value={Math.min(SLIDER_MAX, Number(k))} min={0} max={SLIDER_MAX} onChange={(v) => choose(BigInt(v))} />
          <TextField label="k (typed, 0 to 1,000,000)" value={text} onChange={type} onBlur={() => { setText(String(k)); setError(null); }} width={110} spellCheck={false} />
          {error && <Hint tone="bad">{error} Keeping k = {String(k)}.</Hint>}
        </>,
        <>
          <ControlGroup label="Try k">
            {PRESET_KS.map((v) => (
              <ChipButton key={String(v)} on={k === v} onClick={() => choose(v)}>{String(v)}</ChipButton>
            ))}
          </ControlGroup>
          <Toggle label="Tangent slope" value={rule === 'forgot-factor-2'} onChange={(b) => setRule(b ? 'forgot-factor-2' : 'correct')} off="3x^2 + a over 2y" on="over y (forgot the 2, broken)" />
        </>,
      ]}
    >
      <div className="stage-pad ec-stage">
        <ConsolePanel title={`double-and-add for k = ${k}`} lines={rule === 'correct' ? lines : checked.failure ? [`first doubling: ${checked.failure.message}`] : lines} empty="k = 0: no steps, the result is O" />
        {broken && (
          <p className="ec-refusal" role="alert">
            {checked.failure!.message}. The shortest failing input is k = {String(FORGOT_FACTOR_2_WITNESS)}, the first multiple that needs the tangent, and every k from {String(FORGOT_FACTOR_2_WITNESS)} up starts the same way: a deterministic witness, no seed involved.
          </p>
        )}
        <div className="ec-costs">
          <div className="ec-cost is-ok">
            <b>Forward, on the toy curve:</b> {view.doublings + view.additions} group operations for k = {String(k)}.
          </div>
          <div className="ec-cost is-ok">
            <b>Back, on the toy curve:</b> find k from Q = kG by walking G, 2G, 3G, ... at most {String(TOY.n)} steps.{' '}
            <Button onClick={() => setWalkedFor(k)} softDisabled={broken}>Walk to find k</Button>{' '}
            {walk && !broken && <span>Found k = {String(walk.k)} after {walk.steps} steps (instant).</span>}
          </div>
          <div className="ec-cost is-bad">
            <b>Back, on P-256 (a 256-bit group order):</b> the best generic method takes about the square root of n, about {power(P256_COST.log2)} steps: at a made-up {fmt(ILLUSTRATIVE_RATE)} steps per second that is about {humanDuration(P256_COST.seconds)}.
          </div>
          <div className="ec-cost">
            <Button onClick={() => setCommute(commutativityChecks())}>Check all 19 x 19 pairs</Button>{' '}
            {commute && <span>k1(k2 G), k2(k1 G) and (k1 k2) G agree on {commute.agreed} of {commute.checked} pairs: the property key agreement uses, not the protocol itself.</span>}
          </div>
        </div>
      </div>
      <ProvenanceRow>
        <Provenance kind="toy">{TOY.bits}-bit field; the group has {String(TOY.n)} points, about {groupBits(TOY.n)} bits: a walk of {String(TOY.n)} steps breaks it. Never copy this code: BigInt arithmetic is not constant-time</Provenance>
        <Provenance kind="illustrative">the {fmt(ILLUSTRATIVE_RATE)} steps per second is a made-up rate; the P-256 line shows the generic cost, not a safety claim</Provenance>
        <Provenance kind="from-memory">no known attack on well-chosen curves beats the generic one (verify against a current survey)</Provenance>
      </ProvenanceRow>
    </StageFrame>
  );
}
