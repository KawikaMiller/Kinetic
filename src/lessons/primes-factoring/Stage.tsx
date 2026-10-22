import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Bar } from '../../components/Bar';
import { CellGrid, type GridCellSpec } from '../../components/CellGrid';
import { Box } from '../../components/Panel';
import { Curve, HLine, Plot2D, Points, VLine } from '../../components/Plot2D';
import { useScenePicker } from '../../components/ScenePicker';
import { StageFrame } from '../../components/StageFrame';
import { Button, ChipButton, ControlGroup, Hint, Legend, Segmented, Slider, Stat, Stats, TextField } from '../../components/ui';
import { WideRegion } from '../../components/WideRegion';
import { useIntroCaption, useSetCaption } from '../../core/caption';
import { power } from '../../core/format';
import { isProbablePrime, trialFactor } from '../../core/numberTheory';
import { mulberry32 } from '../../core/random';
import { useInterval } from '../../core/useInterval';
import { usePlayer } from '../../core/usePlayer';
import { group, primalityCaption, rate, runCaption, sieveFrames } from './frames';
import {
  AGE_OF_UNIVERSE_S, RSA_2048_DIGITS, SIEVE_SIZES, TRIAL_LIMIT, advanceTrial, cellState, digitsOf, extrapolateSeconds, factorText,
  fermatSaysPrime, longTime, trialStepsFor,
  parseCandidate, primality, primeWithDigits, sieveCols, sieveCounts, sievePlan, startTrial, type CellState, type Primality,
  type SieveSize, type TrialRun,
} from './model';
import './styles.css';

type Scene = 'sieve' | 'factor' | 'primality';
const SCENES: { value: Scene; label: string }[] = [
  { value: 'sieve', label: 'Sieve' },
  { value: 'factor', label: 'Multiply vs factor' },
  { value: 'primality', label: 'Primality' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({ label: 'Tool', options: SCENES, initial: 'sieve' });
  if (scene === 'factor') return <FactorScene picker={picker} />;
  if (scene === 'primality') return <PrimalityScene picker={picker} />;
  return <SieveScene picker={picker} />;
}

// ── Sieve ────────────────────────────────────────────────────────────

const SIEVE_MS = 1100;
const CELL_PITCH = 24;

const CELL_LOOK: Record<CellState, GridCellSpec> = {
  one: { tone: 'dim', fill: 'outline' },
  unvisited: { fill: 'none' },
  current: { tone: 'hi', fill: 'solid' },
  fresh: { tone: 'bad', fill: 'solid' },
  crossed: { tone: 'dim', fill: 'tint', intensity: 0.35 },
  prime: { tone: 'ok', fill: 'solid' },
};

function SieveScene({ picker }: { picker: ReactNode }) {
  const [size, setSize] = useState<SieveSize>(100);
  const plan = useMemo(() => sievePlan(size), [size]);
  const frames = useMemo(() => sieveFrames(plan), [plan]);
  const player = usePlayer(frames, { interval: SIEVE_MS });
  const { pass, phase } = player.frame;
  const counts = sieveCounts(plan, pass, phase);
  const cols = sieveCols(size);
  const rows = size / cols;
  const current = plan.passes[pass]?.prime;

  const grid = (
    <CellGrid
      rows={rows}
      cols={cols}
      size="sm"
      ariaLabel={`The numbers 1 to ${size}`}
      cell={(r, c) => {
        const m = r * cols + c + 1;
        return { ...CELL_LOOK[cellState(m, plan, pass, phase)], text: m };
      }}
      cellTitle={(r, c) => factorText(r * cols + c + 1)}
    />
  );

  return (
    <StageFrame
      player={player}
      height={320}
      stats={
        <Stats>
          <Stat label="Current prime" value={phase === 'light' || phase === 'cross' ? current : '–'} color="var(--hi)" />
          <Stat label="Primes found" value={counts.primes} color="var(--ok)" />
          <Stat label="Crossings done" value={counts.crossings} sub="each number crossed once" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'current prime' },
            { color: 'var(--bad)', label: 'multiples being crossed out now' },
            { color: 'color-mix(in srgb, var(--dim) 60%, transparent)', label: 'crossed out earlier' },
            { color: 'var(--ok)', label: 'confirmed prime' },
            { color: 'transparent', label: 'no fill: not reached yet; 1 has a grey outline' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented
            label="Numbers up to"
            value={size}
            onChange={setSize}
            options={SIEVE_SIZES.map((v) => ({ value: v, label: String(v) }))}
          />
        </>,
      ]}
    >
      <div className="stage-pad pf-sieve">
        {cols * CELL_PITCH > 300 ? <WideRegion minWidth={cols * CELL_PITCH} hint="swipe to see the whole grid">{grid}</WideRegion> : grid}
        <Hint className="pf-note">Hover a number to see its factors.</Hint>
      </div>
    </StageFrame>
  );
}

// ── Multiply vs factor ───────────────────────────────────────────────

const PAIRS: { p: bigint; q: bigint; label: string }[] = [
  { p: 61n, q: 53n, label: '61 × 53' },
  { p: 7919n, q: 7907n, label: '7,919 × 7,907' },
  { p: 999_983n, q: 1_000_003n, label: '999,983 × 1,000,003' },
];
const MIN_DIGITS = 2;
const MAX_DIGITS = 12;
const TICK_MS = 30;
/** Milliseconds of work per tick, so the page stays responsive while it runs. */
const SLICE_MS = 14;
const CHUNK = 20_000;
/**
 * (2⁶¹ − 1)², a 37-digit number with no factor below 2⁶¹: the speed check runs trial division on it when
 * the scene opens. It's past 2⁶⁴ on purpose: V8 is much faster on bigints that fit in 64 bits, which
 * would flatter the extrapolation.
 */
const CALIBRATION_N = (2n ** 61n - 1n) ** 2n;
const CALIBRATION_MS = 40;
const HONESTY = 'Times beyond what we ran are extrapolated from your browser\'s measured speed, for trial division only; real algorithms (the quadratic and number field sieves) are much faster, but 2048-bit RSA moduli are still out of reach.';

function pairFor(digits: number, seed: number) {
  const rnd = mulberry32(digits * 1000 + seed);
  const p = primeWithDigits(digits, rnd);
  let q = primeWithDigits(digits, rnd);
  while (q === p) q = primeWithDigits(digits, rnd);
  return p < q ? { p, q } : { p: q, q: p };
}

function useMeasuredSpeed(): number | null {
  const [speed, setSpeed] = useState<number | null>(null);
  // Measured just after the first paint, so opening the scene never waits on it.
  useEffect(() => {
    const id = setTimeout(() => {
      const t0 = performance.now();
      let run = startTrial(CALIBRATION_N);
      while (performance.now() - t0 < CALIBRATION_MS && run.status === 'running') run = advanceTrial(run, 2000);
      setSpeed(run.steps / ((performance.now() - t0) / 1000));
    }, 0);
    return () => clearTimeout(id);
  }, []);
  return speed;
}

function FactorScene({ picker }: { picker: ReactNode }) {
  const [digits, setDigits] = useState(4);
  const [seed, setSeed] = useState(0);
  const [pair, setPair] = useState(() => pairFor(4, 0));
  const [run, setRun] = useState<TrialRun | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [startedAt, setStartedAt] = useState(0);
  const [measured, setMeasured] = useState<{ digits: number; seconds: number } | null>(null);
  const [runSpeed, setRunSpeed] = useState<number | null>(null);
  const calibrated = useMeasuredSpeed();
  const setCaption = useSetCaption();
  const n = pair.p * pair.q;
  const running = run?.status === 'running';
  const speed = runSpeed ?? calibrated;

  useIntroCaption(<>Multiplying two primes is one step, however big they are. Press "Factor it" to undo it the obvious way: trial
    division.</>);

  const choose = (p: bigint, q: bigint) => {
    setPair({ p, q });
    setRun(null);
    setElapsed(0);
    setCaption(<>{group(p)} × {group(q)} = {group(p * q)}: one multiplication. Now try to get {group(p)} and {group(q)} back from
      {' '}{group(p * q)} alone.</>);
  };
  const changeDigits = (d: number) => {
    setDigits(d);
    const next = pairFor(d, seed);
    choose(next.p, next.q);
  };
  const newPair = () => {
    setSeed(seed + 1);
    const next = pairFor(digits, seed + 1);
    choose(next.p, next.q);
  };
  const start = () => {
    setRun(startTrial(n));
    setElapsed(0);
    setStartedAt(performance.now());
    setCaption(runCaption(startTrial(n), 0));
  };
  const stop = () => setRun(null);

  useInterval(() => {
    if (!run || run.status !== 'running') return;
    const t0 = performance.now();
    let next = run;
    while (performance.now() - t0 < SLICE_MS && next.status === 'running') next = advanceTrial(next, CHUNK);
    const seconds = (performance.now() - startedAt) / 1000;
    setRun(next);
    setElapsed(seconds);
    if (next.status !== 'running') {
      setCaption(runCaption(next, seconds));
      setRunSpeed(next.steps / Math.max(seconds, 1e-6));
      if (next.status === 'found') setMeasured({ digits: digitsOf(n), seconds });
    }
  }, TICK_MS, running);

  const sqrtSteps = Math.sqrt(Number(n)) / 2;

  return (
    <StageFrame
      height={320}
      stats={
        <Stats>
          <Stat label="Divisions tried" value={group(run?.steps ?? 0)} color="var(--info)">
            <Bar value={run?.steps ?? 0} max={sqrtSteps} tone="info" label="toward √n" />
          </Stat>
          <Stat label="Elapsed" value={run ? longTime(elapsed) : '–'} />
          <Stat label="Speed" value={speed ? rate(speed) : 'measuring…'} sub={runSpeed ? 'from your last run' : 'quick check in your browser'} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'divisions done; measured part of the plot (solid)' },
            { color: 'var(--violet)', label: 'extrapolated (dashed)', shape: 'line' },
            { color: 'var(--hi)', label: 'your last run', shape: 'dot' },
            { color: 'var(--dim)', label: 'age of the universe, RSA-2048', shape: 'line' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Slider label="Digits per prime" value={digits} min={MIN_DIGITS} max={MAX_DIGITS} onChange={changeDigits} />
          <Button onClick={newPair}>New pair</Button>
        </>,
        <ControlGroup key="pairs" label="Or pick">
          {PAIRS.map((c) => (
            <ChipButton key={c.label} on={pair.p === c.p && pair.q === c.q} onClick={() => choose(c.p, c.q)}>{c.label}</ChipButton>
          ))}
        </ControlGroup>,
      ]}
    >
      <div className="stage-pad pf-factor">
        <Box className="pf-mult">
          <p className="pf-eq">
            <span>{group(pair.p)}</span> × <span>{group(pair.q)}</span> = <b>{group(n)}</b>
          </p>
          <p className="pf-sub">{digitsOf(n)} digits · multiplying: 1 step</p>
          <div className="pf-actions">
            {running
              ? <Button onClick={stop}>Stop</Button>
              : <Button variant="primary" onClick={start}>Factor it</Button>}
            {run && run.status === 'found' && <span className="hl ok">{group(run.factor!)} × {group(n / run.factor!)}</span>}
            {run && run.status === 'capped' && <span className="pf-capped">too big to try here</span>}
          </div>
        </Box>
        <TimePlot speed={speed} measured={measured} />
        <Hint className="pf-note">{HONESTY}</Hint>
      </div>
    </StageFrame>
  );
}

/** Seconds on a log scale, drawn as log₁₀(seconds) on a linear axis so the ticks land on round powers. */
const LOG_Y: [number, number] = [-6, 320];

function TimePlot({ speed, measured }: { speed: number | null; measured: { digits: number; seconds: number } | null }) {
  if (!speed) return <p className="pf-sub">Measuring your browser's speed…</p>;
  const ran = measured?.digits ?? 0;
  const logAt = (d: number) => Math.log10(extrapolateSeconds(d, speed));
  return (
    <div className="pf-plot">
      <Plot2D
        x={{ domain: [1, RSA_2048_DIGITS], label: 'digits in n' }}
        y={{ domain: LOG_Y, ticks: 4, label: 'seconds to factor (log)', format: (v) => power(v, 10) }}
        ariaLabel={`Trial-division time against digits: RSA-2048 would take ${longTime(extrapolateSeconds(RSA_2048_DIGITS, speed))}`}
      >
        <HLine at={Math.log10(AGE_OF_UNIVERSE_S)} label="age of the universe" tone="dim" />
        <VLine at={RSA_2048_DIGITS} label="RSA-2048" tone="dim" />
        {ran > 0 && <Curve fn={(d) => (d <= ran ? logAt(d) : NaN)} tone="info" />}
        <Curve fn={(d) => (d >= ran ? logAt(d) : NaN)} tone="violet" dashed />
        {measured && <Points data={[{ x: measured.digits, y: Math.log10(Math.max(measured.seconds, 1e-6)), tone: 'hi' }]} />}
      </Plot2D>
      <p className="pf-sub">
        RSA-2048 by trial division at {rate(speed)}: <b>{longTime(extrapolateSeconds(RSA_2048_DIGITS, speed))}</b>. A computer 1,000×
        faster only moves the curve by 6 digits.
      </p>
    </div>
  );
}

// ── Primality ────────────────────────────────────────────────────────

const CANDIDATES: { n: bigint; label: string }[] = [
  { n: 561n, label: '561' },
  { n: 1105n, label: '1105' },
  { n: 1729n, label: '1729' },
  { n: 97n, label: '97' },
  { n: 1_000_003n, label: '1,000,003' },
  { n: 2n ** 61n - 1n, label: '2⁶¹ − 1' },
];

interface Checked {
  n: bigint;
  report: Primality;
  ms: { fermat: number; mr: number; trial: number };
}

function check(n: bigint): Checked {
  const time = (f: () => unknown) => {
    const t0 = performance.now();
    f();
    return performance.now() - t0;
  };
  return {
    n,
    report: primality(n),
    ms: {
      fermat: time(() => fermatSaysPrime(n)),
      mr: time(() => isProbablePrime(n)),
      trial: n <= TRIAL_LIMIT ? time(() => trialFactor(n)) : 0,
    },
  };
}

function PrimalityScene({ picker }: { picker: ReactNode }) {
  const [text, setText] = useState('561');
  const [checked, setChecked] = useState<Checked>(() => check(561n));
  const setCaption = useSetCaption();
  const parsed = parseCandidate(text);
  const { n, report } = checked;

  useIntroCaption(primalityCaption(checked.n, checked.report));

  const run = (value: bigint) => {
    const c = check(value);
    setChecked(c);
    setCaption(primalityCaption(c.n, c.report));
  };
  const apply = () => {
    if ('value' in parsed) run(parsed.value);
  };
  const load = (v: bigint) => {
    setText(v.toString());
    run(v);
  };

  const tone = (says: boolean) => (report.truth === null ? '' : says === report.truth ? 'is-right' : 'is-wrong');
  const mr = report.millerRabin;

  return (
    <StageFrame
      height={300}
      stats={
        <Stats>
          <Stat label="n" value={n.toString().length > 14 ? `${digitsOf(n)} digits` : group(n)} />
          <Stat label="Verdict" value={report.truth === null ? 'probable prime' : report.truth ? 'prime' : 'composite'} color={report.truth === null ? undefined : 'var(--ok)'} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--ok)', label: 'right' },
            { color: 'var(--bad)', label: 'fooled' },
            { color: 'var(--dim)', label: 'too big to try here' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <TextField label="Number" value={text} onChange={setText} onEnter={apply} width={220} spellCheck={false} />
          <Button variant="primary" onClick={apply} disabled={!('value' in parsed)}>Check</Button>
          {'error' in parsed && <Hint tone="bad">{parsed.error} Still showing {n.toString().length > 14 ? `the ${digitsOf(n)}-digit number` : group(n)}.</Hint>}
        </>,
        <ControlGroup key="c" label="Try">
          {CANDIDATES.map((c) => (
            <ChipButton key={c.label} on={c.n === n} onClick={() => load(c.n)}>{c.label}</ChipButton>
          ))}
        </ControlGroup>,
      ]}
    >
      <div className="stage-pad pf-prime">
        <p className="pf-number">{group(n)}</p>
        <ul className="pf-tests">
          <li className={tone(report.fermat)}>
            <b>Fermat, base 2</b>
            <span>2^(n − 1) mod n {report.fermat ? '= 1: says prime' : '≠ 1: composite'}</span>
            <i>{fmtMs(checked.ms.fermat)}</i>
          </li>
          <li className={tone(mr.prime)}>
            <b>Miller-Rabin, 13 bases</b>
            <span>{mr.prime ? (mr.certain ? 'prime (a proof below 3.3·10²⁴)' : 'probably prime') : 'composite: found a witness'}</span>
            <i>{fmtMs(checked.ms.mr)}</i>
          </li>
          {report.trial === 'too-big' ? (
            <li className="is-skipped">
              <b>Trial division</b>
              <span>too big to try here (about {approx(trialStepsFor(n))} divisions)</span>
              <i>–</i>
            </li>
          ) : (
            <li className={tone(report.trial.factors.length === 1)}>
              <b>Trial division</b>
              <span>
                {report.trial.factors.length === 1 ? 'no divisor up to √n: prime' : report.trial.factors.map(String).join(' × ')}
                {' '}({group(report.trial.steps)} divisions)
              </span>
              <i>{fmtMs(checked.ms.trial)}</i>
            </li>
          )}
        </ul>
        <Hint className="pf-note">Miller-Rabin is used as a black box here; times are measured in your browser.</Hint>
      </div>
    </StageFrame>
  );
}

/** A big count, grouped while it's readable and as a power of ten after. */
const approx = (v: number) => (v < 1e12 ? group(Math.round(v)) : power(Math.floor(Math.log10(v)), 10));

const fmtMs = (ms: number) => (ms < 0.1 ? '< 0.1 ms' : `${ms.toFixed(1)} ms`);
