import { useMemo, useState } from 'react';
import { CodePanel } from '../../components/CodePanel';
import { Box, SectionTitle } from '../../components/Panel';
import { Bars, Curve, HLine, Plot2D, Points, Polygon, VLine, type Point } from '../../components/Plot2D';
import { StageFrame } from '../../components/StageFrame';
import { Button, ControlGroup, Hint, Legend, Segmented, Slider, Stat, Stats, TextArea } from '../../components/ui';
import { useIntroCaption, useSetCaption } from '../../core/caption';
import { pct } from '../../core/format';
import { barsFromHistogram } from '../../core/plot';
import { histogram } from '../../core/stats';
import { drawCaption, exactLines, num, retryCaption, variableCaption } from './frames';
import {
  DEFAULT_TABLE, MAX_ROWS, drawsFor, exactMoments, expectedAttempts, modes, pairSummary, parseTable, pmfOf, runningStats,
  type Params, type VarId,
} from './model';
import './styles.css';

const VARIABLES: { value: VarId; label: string }[] = [
  { value: 'die', label: 'One die' },
  { value: 'two-dice', label: 'Two dice' },
  { value: 'opposite', label: 'Top + bottom' },
  { value: 'geometric', label: 'Attempts until success' },
  { value: 'retries', label: 'Retries, capped' },
  { value: 'custom', label: 'Your table' },
];
const labelOf = (id: VarId) => VARIABLES.find((v) => v.value === id)!.label;

const MEAN_OF = [1, 4, 16] as const;
const DRAW_BATCHES = [1, 100, 10_000] as const;
const MAX_DRAWS = 30_000;
/** Bins for the histogram of averages (n > 1), where values aren't on a fixed grid. */
const MEAN_BINS = 30;
/** Most bins for averages on a 1/n grid; wider ranges fall back to MEAN_BINS equal bins. */
const MAX_LATTICE_BINS = 200;
const HEADROOM = 1.2;
const BAR_SHARE = 0.8;
const INITIAL_TABLE = parseTable(DEFAULT_TABLE);

export function Stage() {
  const [id, setId] = useState<VarId>('die');
  const [successPct, setSuccessPct] = useState(30);
  const [failPct, setFailPct] = useState(50);
  const [cap, setCap] = useState(3);
  const [tableText, setTableText] = useState(DEFAULT_TABLE);
  const [custom, setCustom] = useState(INITIAL_TABLE.ok ? INITIAL_TABLE.pmf : pmfOf('die', {} as Params));
  const [meanOf, setMeanOf] = useState<number>(1);
  const [seed, setSeed] = useState(1);
  const [count, setCount] = useState(0);
  const setCaption = useSetCaption();

  const prm: Params = useMemo(() => ({ successPct, failPct, cap, custom }), [successPct, failPct, cap, custom]);
  const pmf = pmfOf(id, prm);
  const m = exactMoments(id, prm);
  const sd = Math.sqrt(m.variance);
  const draws = useMemo(() => drawsFor(id, prm, seed, count, meanOf), [id, prm, seed, count, meanOf]);
  const running = useMemo(() => runningStats(draws), [draws]);
  const last = running[running.length - 1];
  const parsed = parseTable(tableText);

  useIntroCaption(variableCaption('die', { successPct: 30, failPct: 50, cap: 3, custom: pmfOf('die', {} as Params) }, 'One die'));

  const restart = (nextId: VarId, next: Params) => {
    setCount(0);
    setCaption(variableCaption(nextId, next, labelOf(nextId)));
  };
  const chooseVar = (v: VarId) => {
    setId(v);
    restart(v, prm);
    if (v === 'retries') setCaption(<>{variableCaption(v, prm, labelOf(v))} {retryCaption(failPct / 100, cap)}</>);
  };
  const changeParams = (patch: Partial<Params>) => {
    const next = { ...prm, ...patch };
    if (patch.successPct !== undefined) setSuccessPct(patch.successPct);
    if (patch.failPct !== undefined) setFailPct(patch.failPct);
    if (patch.cap !== undefined) setCap(patch.cap);
    if (patch.custom) setCustom(patch.custom);
    restart(id, next);
    if (id === 'retries') setCaption(<>{variableCaption(id, next, labelOf(id))} {retryCaption(next.failPct / 100, next.cap)}</>);
  };
  const editTable = (text: string) => {
    setTableText(text);
    const p = parseTable(text);
    if (p.ok) changeParams({ custom: p.pmf });
  };
  const drawMore = (k: number) => {
    const next = Math.min(MAX_DRAWS, count + k);
    const all = drawsFor(id, prm, seed, next, meanOf);
    setCount(next);
    setCaption(drawCaption(next, meanOf, all.reduce((a, b) => a + b, 0) / next, m.mean, m.variance));
  };
  const chooseMeanOf = (n: number) => {
    setMeanOf(n);
    setCount(0);
    setCaption(n === 1
      ? <>Back to single draws: each bar counts values of X itself.</>
      : <>Each draw is now the average of {n} draws of X. Its mean is still {num(m.mean)}, but its SD shrinks to σ/√{n} = {num(sd / Math.sqrt(n))}: the variance of the mean is σ²/n.</>);
  };
  const newSeed = () => {
    setSeed(seed + 1);
    setCount(0);
    setCaption(<>New seed {seed + 1}: draws cleared. The exact E[X] and SD don&apos;t depend on the seed.</>);
  };

  // Histogram: one bar per possible value for single draws, equal-width bins for averages.
  const lo = Math.min(...pmf.values);
  const hi = Math.max(...pmf.values);
  const gaps = pmf.values.slice(1).map((v, i) => v - pmf.values[i]);
  const barW = (gaps.length ? Math.min(...gaps) : 1) * BAR_SHARE;
  const pad = Math.max((hi - lo) * 0.08, barW);
  const domain: [number, number] = [lo - pad, hi + pad];
  const tally = new Map<number, number>();
  for (const d of draws) tally.set(d, (tally.get(d) ?? 0) + 1);
  const singleBars = pmf.values.map((v) => ({ x0: v - barW / 2, x1: v + barW / 2, y: count ? (tally.get(v) ?? 0) / count : 0 }));
  // Averages of whole numbers land on a 1/n grid: one bin per grid point keeps the bars from aliasing.
  const lattice = pmf.values.every(Number.isInteger) && (hi - lo) * meanOf + 1 <= MAX_LATTICE_BINS;
  const binSpec = lattice
    ? { bins: (hi - lo) * meanOf + 1, min: lo - 1 / (2 * meanOf), max: hi + 1 / (2 * meanOf) }
    : { bins: MEAN_BINS, min: lo, max: hi };
  const meanBars = meanOf > 1 && hi > lo && count
    ? barsFromHistogram(histogram(draws, binSpec)).map((b) => ({ ...b, y: b.y / count }))
    : [];
  const bars = meanOf === 1 || hi === lo ? singleBars : meanBars;
  const beyond = meanOf === 1 && id === 'geometric' ? draws.filter((d) => d > hi).length : 0;
  const barTop = Math.max(0.05, ...bars.map((b) => b.y)) * HEADROOM;
  const latest = count ? draws[count - 1] : null;
  const latestBar = latest === null ? null : bars.find((b) => latest >= b.x0 && latest <= b.x1);

  const sdN = sd / Math.sqrt(meanOf);
  const band: Point[] = running.length > 1
    ? [...running.map((p) => [p.n, p.mean + p.sd] as const), ...running.map((p) => [p.n, p.mean - p.sd] as const).reverse()]
    : [];
  const load = expectedAttempts(failPct / 100, cap);
  const top = modes(pmf);

  return (
    <StageFrame
      height={460}
      stats={
        <Stats>
          <Stat label="E[X], exact" value={num(m.mean)} color="var(--ok)" sub={`SD ${num(sd)}${meanOf > 1 ? ` · mean of ${meanOf}: ${num(sdN)}` : ''}`} />
          <Stat
            label="Most likely value"
            value={top.length > 3 ? `${top.length} tie` : top.map(num).join(', ')}
            sub={top.length > 3 ? `${top.map(num).join(', ')} are equally likely` : 'the mode'}
          />
          <Stat label="Running mean" value={last ? num(last.mean) : '–'} color="var(--violet)" sub={last ? `SD ${num(last.sd)} over ${count.toLocaleString('en-US')}` : 'draw to measure'} />
          <Stat label="Latest" value={latest === null ? '–' : num(latest)} color="var(--hi)" sub={`seed ${seed}`} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'share of draws' },
            { color: 'var(--hi)', label: 'newest draw', shape: 'dot' },
            { color: 'var(--violet)', label: 'running mean ± 1 SD', shape: 'line' },
            { color: 'var(--ok)', label: 'exact E[X]', shape: 'line' },
            { color: 'var(--dim)', label: 'exact E ± SD', shape: 'line' },
          ]}
        />
      }
      controls={[
        <>
          <Segmented label="Random variable" value={id} onChange={chooseVar} options={VARIABLES} />
          {id === 'geometric' && (
            <Slider label="Success chance p" value={successPct} min={5} max={90} step={5} format={(v) => `${v}%`} onChange={(v) => changeParams({ successPct: v })} />
          )}
          {id === 'retries' && (
            <>
              <Slider label="Each attempt fails" value={failPct} min={0} max={95} step={5} format={(v) => `${v}%`} onChange={(v) => changeParams({ failPct: v })} />
              <Slider label="Retry cap r" value={cap} min={0} max={10} onChange={(v) => changeParams({ cap: v })} />
            </>
          )}
        </>,
        <>
          <ControlGroup label="Draw">
            {DRAW_BATCHES.map((k) => (
              <Button key={k} onClick={() => drawMore(k)} disabled={count >= MAX_DRAWS}>×{k.toLocaleString('en-US')}</Button>
            ))}
            <Button onClick={newSeed}>New seed</Button>
          </ControlGroup>
          <Segmented
            label="Each draw is the mean of"
            value={meanOf}
            onChange={chooseMeanOf}
            options={MEAN_OF.map((n) => ({ value: n, label: n === 1 ? '1 (just X)' : String(n) }))}
          />
        </>,
      ]}
    >
      <div className="stage-pad ev-stage">
        <div className="ev-plots">
          <Plot2D
            x={{ domain, label: meanOf === 1 ? 'value of X' : `mean of ${meanOf} draws` }}
            y={{ domain: [0, barTop], label: 'share of draws', format: (v) => pct(v), ticks: 4 }}
            ariaLabel={`Histogram of ${count} draws; exact E[X] ${num(m.mean)}`}
          >
            <Bars bars={bars} tone="info" />
            <VLine at={m.mean} label={`E = ${num(m.mean)}`} tone="ok" />
            {latestBar && <Points data={[{ x: latest!, y: latestBar.y, tone: 'hi' }]} r={4.5} />}
          </Plot2D>
          <Plot2D
            x={{ domain: [1, MAX_DRAWS], log: true, label: 'draws so far (log scale)' }}
            y={{ domain, label: meanOf === 1 ? 'running mean of X' : 'running mean' }}
            ariaLabel={`Running mean ${last ? num(last.mean) : 'not started'} against exact E[X] ${num(m.mean)}`}
          >
            {band.length > 0 && <Polygon points={band} tone="violet" />}
            {sdN > 0 && <HLine at={m.mean + sdN} tone="dim" label="E + SD" />}
            {sdN > 0 && <HLine at={m.mean - sdN} tone="dim" />}
            <HLine at={m.mean} tone="ok" label={`E = ${num(m.mean)}`} />
            {running.length > 1 && <Curve points={running.map((p) => [p.n, p.mean] as const)} tone="violet" />}
          </Plot2D>
        </div>
        {beyond > 0 && <Hint className="ev-note">{beyond.toLocaleString('en-US')} draws took more than {hi} attempts and sit past the right edge (they still count in the mean).</Hint>}
        <div className="ev-panels">
          <CodePanel title="Exact, from the definition" lines={exactLines(id, prm)} gutter="none" className="ev-exact" />
          {(id === 'two-dice' || id === 'opposite') && <LinearityPanel />}
          {id === 'retries' && (
            <Box className="ev-retry">
              <SectionTitle>Retry storm</SectionTitle>
              <p>
                Expected attempts per request: <b className={load > 2 ? 'is-bad' : load > 1 ? 'is-orange' : ''}>{num(load)}×</b> the load, with SD{' '}
                {num(sd)}. The request still fails after {cap + 1} {cap === 0 ? 'attempt' : 'attempts'} with probability {pct((failPct / 100) ** (cap + 1), 2)}.
              </p>
              <Hint tone="muted" block>
                Assumes each attempt fails independently with the same chance. Real retry storms make failures more likely, which is why
                circuit breakers stop retrying.
              </Hint>
            </Box>
          )}
          {id === 'custom' && (
            <Box className="ev-table">
              <SectionTitle hint={`value, weight · one row per line · up to ${MAX_ROWS} rows`}>Your table</SectionTitle>
              <TextArea label="Values and weights" value={tableText} onChange={editTable} rows={5} />
              {parsed.ok ? (
                <Hint tone="muted" block>{parsed.rows} {parsed.rows === 1 ? 'row' : 'rows'}; weights are scaled to add up to 1.</Hint>
              ) : (
                <div className="ev-errors" aria-live="polite">
                  <ul>
                    {parsed.errors.map((e) => (
                      <li key={`${e.line}-${e.message}`}>{e.line ? `Line ${e.line}: ` : ''}{e.message}.</li>
                    ))}
                  </ul>
                  <p>Still using the last valid table.</p>
                </div>
              )}
            </Box>
          )}
        </div>
        <Hint className="ev-note">Draws are pseudo-random (seeded, so a run repeats). The green lines are exact; nothing on them is simulated.</Hint>
      </div>
    </StageFrame>
  );
}

const IND = pairSummary(false);
const DEP = pairSummary(true);
const same = (a: number, b: number) => Math.abs(a - b) < 1e-9;

function LinearityPanel() {
  const pair = (name: string, s: typeof IND) => {
    const eAdds = same(s.esum, s.ex + s.ey);
    const vAdds = same(s.vsum, s.vx + s.vy);
    return (
      <div className="ev-pair">
        <b>{name}</b>
        <p>
          E[X] + E[Y] = {num(s.ex)} + {num(s.ey)} = {num(s.ex + s.ey)}; E[X + Y] ={' '}
          <span className={eAdds ? 'is-ok' : 'is-bad'}>{num(s.esum)} {eAdds ? '(adds)' : "(doesn't add)"}</span>
        </p>
        <p>
          Var X + Var Y = {num(s.vx)} + {num(s.vy)} = {num(s.vx + s.vy)}; Var(X + Y) ={' '}
          <span className={vAdds ? 'is-ok' : 'is-bad'}>{num(s.vsum)} {vAdds ? '(adds)' : "(doesn't add)"}</span>
        </p>
      </div>
    );
  };
  return (
    <Box className="ev-linearity">
      <SectionTitle hint="X = first die, Y = second die or the bottom face">Linearity</SectionTitle>
      {pair('Two dice (independent)', IND)}
      {pair('Top + bottom of one die (dependent)', DEP)}
      <Hint tone="muted" block>Expectations add for any pair. Variances add only when X and Y are uncorrelated (independence is enough): top + bottom is always 7, so its variance is 0.</Hint>
    </Box>
  );
}
