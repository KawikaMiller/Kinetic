import { useMemo, useState, type ReactNode } from 'react';
import { Curve, HLine, Plot2D, Points } from '../../components/Plot2D';
import { SeedField } from '../../components/SeedField';
import { StageFrame } from '../../components/StageFrame';
import { WideRegion } from '../../components/WideRegion';
import { ChipButton, Hint, Legend, Provenance, ProvenanceRow, Stat, Stats, TextField, Toggle } from '../../components/ui';
import { parseBoundedInt } from '../../core/parse';
import type { Tone } from '../../core/tone';
import { show, showError, sumCaption } from './captions';
import { OPENING, SUM_PRESETS } from './opening';
import { evaluate, generate, GENERATORS, MAX_N, METHODS, type GeneratorId, type MethodId, type Precision } from './summation';

const TONE: Record<MethodId, Tone> = { naive: 'bad', sorted: 'sky', pairwise: 'violet', kahan: 'ok', neumaier: 'ok' };
const TABLE_MIN_WIDTH = 440;
const FLOOR_DECADES = 1;

/** Scene 1: five ways to add the same numbers, each against the exact sum. */
export function SumScene({ picker }: { picker: ReactNode }) {
  const [generator, setGenerator] = useState<GeneratorId>(OPENING.summation.generator);
  const [n, setN] = useState(OPENING.summation.n);
  const [draft, setDraft] = useState(String(OPENING.summation.n));
  const [error, setError] = useState<string | null>(null);
  const [precision, setPrecision] = useState<Precision>(OPENING.summation.precision);
  const [seed, setSeed] = useState(OPENING.summation.seed);

  const fixedLength = generator === 'blind-spot';
  const data = useMemo(() => generate(generator, n, seed, precision), [generator, n, seed, precision]);
  const ev = useMemo(() => (data.overflow ? null : evaluate(data.values, precision)), [data, precision]);
  const count = data.values.length;

  const edit = (text: string) => {
    setDraft(text);
    const parsed = parseBoundedInt(text, {
      min: 1,
      max: MAX_N,
      messages: { tooBig: () => `N is at most ${MAX_N.toLocaleString('en-US')}: the exact BigInt oracle stays instant on a phone`, tooSmall: () => 'N is at least 1' },
    });
    if (parsed.ok) {
      setN(parsed.value);
      setError(null);
    } else setError(parsed.error);
  };
  const load = (p: (typeof SUM_PRESETS)[number]) => {
    setGenerator(p.generator);
    setN(p.n);
    setDraft(String(p.n));
    setPrecision(p.precision);
    setError(null);
  };

  const positives = ev
    ? Object.fromEntries(METHODS.map((m) => [m.id, ev.curves[m.id].filter((c) => c.error > 0)])) as Record<MethodId, { n: number; error: number }[]>
    : null;
  const allPositive = positives ? Object.values(positives).flat().map((c) => c.error) : [];
  const hasError = allPositive.length > 0;
  const floor = hasError ? 10 ** (Math.floor(Math.log10(Math.min(...allPositive))) - FLOOR_DECADES) : 1;
  const ceiling = hasError ? 10 ** (Math.ceil(Math.log10(Math.max(...allPositive))) + FLOOR_DECADES) : 10;

  return (
    <StageFrame
      height={640}
      intro={ev ? sumCaption(ev, precision, count) : <>This generator reaches a value that does not fit {precision === 'f32' ? 'float32' : 'float64'}: it overflows to infinity, and an infinity cannot be summed exactly, so nothing is plotted. Switch to float64.</>}
      introKey={`${generator}-${count}-${seed}-${precision}`}
      stats={
        <Stats>
          <Stat label="Exact sum" value={ev ? ev.exactText : 'overflow to infinity'} color="var(--info)" sub={`${count.toLocaleString('en-US')} values, summed as BigInt`} />
          {ev && <Stat label="Naive error" value={showError(ev.runs[0].error)} color="var(--bad)" sub={ev.runs[0].ulps === null ? 'exact sum is 0' : `${ev.runs[0].ulps.toFixed(2)} ulps of the exact sum`} />}
          {ev && <Stat label="Kahan error" value={showError(ev.runs[3].error)} color="var(--ok)" sub={ev.runs[3].ulps === null ? 'exact sum is 0' : `${ev.runs[3].ulps.toFixed(2)} ulps of the exact sum`} />}
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--bad)', label: 'naive', shape: 'line' },
            { color: 'var(--sky)', label: 'sorted ascending', shape: 'line' },
            { color: 'var(--violet)', label: 'pairwise', shape: 'line' },
            { color: 'var(--ok)', label: 'Kahan and Neumaier (Neumaier dashed)', shape: 'line' },
            { color: 'var(--info)', label: 'the exact sum (the stat and the table row, not drawn on the plot)', shape: 'square' },
            { color: 'var(--dim)', label: 'a hollow dot on the floor line: an error of exactly 0', shape: 'dot' },
          ]}
        />
      }
      controls={[
        picker,
        <>
          {GENERATORS.map((g) => (
            <ChipButton key={g.id} tone="info" on={generator === g.id} onClick={() => setGenerator(g.id)}>{g.label}</ChipButton>
          ))}
        </>,
        <>
          <TextField label={fixedLength ? 'N (fixed at 4)' : `N (1 to ${MAX_N.toLocaleString('en-US')})`} value={fixedLength ? '4' : draft} onChange={edit} width={120} spellCheck={false} disabled={fixedLength} />
          <Toggle label="Precision" value={precision === 'f32'} onChange={(v) => setPrecision(v ? 'f32' : 'f64')} off="float64" on="float32" />
          {generator === 'uniform' && <SeedField seed={seed} onSeed={setSeed} />}
        </>,
        <>
          {SUM_PRESETS.map((p) => (
            <ChipButton key={p.id} tone="violet" on={generator === p.generator && count === (p.generator === 'blind-spot' ? 4 : p.n) && precision === p.precision} onClick={() => load(p)}>{p.label}</ChipButton>
          ))}
          <Hint><span role="status">{error ?? 'float32 is emulated with Math.fround after every operation.'}</span></Hint>
        </>,
      ]}
    >
      <div className="np-stage stage-pad">
        {ev && (
          <WideRegion minWidth={TABLE_MIN_WIDTH} label="Method table: scroll sideways to see all of it">
            <table className="data-table np-table">
              <caption>Each method against the exact sum</caption>
              <thead>
                <tr><th>Method</th><th>Result</th><th>Error</th><th>Error in ulps</th></tr>
              </thead>
              <tbody>
                {ev.runs.map((r) => (
                  <tr key={r.id}>
                    <td style={{ color: `var(--${TONE[r.id]})` }}>{METHODS.find((m) => m.id === r.id)?.label}</td>
                    <td>{show(r.result)}</td>
                    <td>{showError(r.error)}</td>
                    <td>{r.ulps === null ? 'n/a' : r.ulps.toFixed(2)}</td>
                  </tr>
                ))}
                <tr className="np-exact"><td style={{ color: 'var(--info)' }}>Exact (BigInt)</td><td>{ev.exactText}</td><td>0</td><td>0</td></tr>
              </tbody>
            </table>
          </WideRegion>
        )}
        {ev && positives && hasError && (
          <Plot2D
            x={{ domain: [1, Math.max(2, count)], log: true, label: 'values added so far' }}
            y={{ domain: [floor, ceiling], log: true, label: 'absolute error' }}
            ariaLabel="Absolute error of each summation method against the running count, on log axes; zero error is drawn on the floor"
          >
            <HLine at={floor} label="exact (zero error)" tone="dim" />
            {METHODS.map((m) => (
              <Curve key={m.id} points={positives[m.id].map((c) => [c.n, c.error] as const)} tone={TONE[m.id]} dashed={m.id === 'neumaier'} />
            ))}
            {METHODS.map((m) => (
              <Points key={`z${m.id}`} data={ev.curves[m.id].filter((c) => c.error === 0).map((c) => ({ x: c.n, y: floor, tone: TONE[m.id], hollow: true }))} r={3} />
            ))}
          </Plot2D>
        )}
        {ev && !hasError && <p className="np-note">Every method is exact at every count here, so there is no error to plot.</p>}
        {generator === 'blind-spot' && !data.overflow && <p className="np-note">Kahan assumes each new term is smaller than the running sum. Here 1e100 is not, so its compensation is lost; Neumaier's version handles both orders.</p>}
        {ev && <p className="np-note">Compensated sums can be deleted by a compiler that is allowed to reassociate floating point (<code>-ffast-math</code> in GCC and Clang).</p>}
      </div>
      <ProvenanceRow>
        <Provenance kind="real">every method and the float32 emulation run as real JavaScript arithmetic</Provenance>
        <Provenance kind="real">the exact sum is a BigInt oracle; N is capped at {MAX_N.toLocaleString('en-US')} so it stays instant on a phone</Provenance>
        <Provenance kind="from-memory">NumPy sums with a pairwise scheme (a blocked version of the pairwise method here), and -ffast-math may remove compensation; verify against the NumPy and GCC documentation</Provenance>
      </ProvenanceRow>
    </StageFrame>
  );
}
