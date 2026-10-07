import { useMemo, useState, type ReactNode } from 'react';
import { ArrayStrip, type ArrayCellState } from '../../components/ArrayStrip';
import { CellGrid } from '../../components/CellGrid';
import { Box, SectionTitle } from '../../components/Panel';
import { Bars, HLine, Plot2D } from '../../components/Plot2D';
import { useScenePicker } from '../../components/ScenePicker';
import { StageFrame } from '../../components/StageFrame';
import { Button, ControlGroup, Hint, Legend, Segmented, Slider, Stat, Stats } from '../../components/ui';
import { useIntroCaption, useSetCaption } from '../../core/caption';
import { pct, power } from '../../core/format';
import { clamp } from '../../core/math';
import { factorial } from '../../core/stats';
import { usePlayer } from '../../core/usePlayer';
import { heatCaption, reservoirFrames, shuffleFrames } from './frames';
import { enumeratePaths, flagged, heat, inclusionCounts, pathCounts, permKey, permutations, type Algo } from './model';
import './styles.css';

type Scene = 'lab' | 'exact' | 'reservoir';
const SCENES: { value: Scene; label: string }[] = [
  { value: 'lab', label: 'Shuffle lab' },
  { value: 'exact', label: 'Exact n = 3' },
  { value: 'reservoir', label: 'Reservoir' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({ label: 'Tool', options: SCENES, initial: 'lab' });
  if (scene === 'exact') return <ExactScene picker={picker} />;
  if (scene === 'reservoir') return <ReservoirScene picker={picker} />;
  return <LabScene picker={picker} />;
}

const fmt = (n: number) => n.toLocaleString('en-US');

// ── Shuffle lab ──────────────────────────────────────────────────────

const ALGOS: { value: Algo; label: string }[] = [
  { value: 'fisher-yates', label: 'Fisher-Yates' },
  { value: 'naive', label: 'Naive (swap with anyone)' },
  { value: 'comparator', label: 'Random comparator' },
];
const SIZES = [3, 4, 5, 6, 7, 8].map((n) => ({ value: n, label: String(n) }));
const RUNS = 10_000;
const STEP_MS = 900;
/** A cell at the uniform expectation is drawn at this intensity, so cells above and below it both show. */
const HEAT_MID = 0.5;
/** Contrast: a cell 10% above the fair count is drawn 0.2 darker. Said on screen. */
const HEAT_GAIN = 2;
/** Heatmap runs use their own seed stream, apart from the stepped shuffle's. */
const HEAT_SEED_OFFSET = 1_000;

function LabScene({ picker }: { picker: ReactNode }) {
  const [algo, setAlgo] = useState<Algo>('fisher-yates');
  const [n, setN] = useState(5);
  const [seed, setSeed] = useState(1);
  const [ran, setRan] = useState(false);
  const setCaption = useSetCaption();
  const frames = useMemo(() => shuffleFrames(algo, n, seed), [algo, n, seed]);
  const player = usePlayer(frames, { interval: STEP_MS });
  const f = player.frame;
  const counts = useMemo(() => (ran ? heat(algo, n, RUNS, seed + HEAT_SEED_OFFSET) : null), [ran, algo, n, seed]);
  const off = counts ? flagged(counts, RUNS) : [];

  const change = (a: Algo, size: number) => {
    setAlgo(a);
    setN(size);
    setRan(false);
  };
  const run = () => {
    setRan(true);
    setCaption(heatCaption(algo, n, RUNS, heat(algo, n, RUNS, seed + HEAT_SEED_OFFSET)));
  };

  const cellState = (i: number): ArrayCellState => {
    if (f.swapped && (i === f.i || i === f.j)) return 'active';
    if (i === f.j && i !== f.i) return 'violet';
    if (i === f.i) return 'info';
    return 'idle';
  };
  const pointers = [
    ...(f.i !== null ? [{ i: f.i, label: 'i', tone: 'info' as const }] : []),
    ...(f.j !== null ? [{ i: f.j, label: 'j', tone: 'violet' as const }] : []),
  ];
  const expected = RUNS / n;

  return (
    <StageFrame
      player={player}
      height={420}
      stats={
        <Stats>
          <Stat label="Equally likely paths" value={algo === 'comparator' ? '–' : algo === 'naive' ? `${power(n, n)} = ${fmt(n ** n)}` : `${n}! = ${fmt(Number(factorial(n)))}`} />
          <Stat label="Arrangements" value={`${n}! = ${fmt(Number(factorial(n)))}`} />
          <Stat label="Cells beyond 3 SE" value={counts ? `${off.length} of ${n * n}` : '–'} color={off.length ? 'var(--bad)' : undefined} sub={counts ? `${fmt(RUNS)} runs, seed ${seed}` : 'press Run ×10,000'} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'i, and heat by count', shape: 'dot' },
            { color: 'var(--violet)', label: 'the random pick j', shape: 'dot' },
            { color: 'var(--hi)', label: 'swap', shape: 'dot' },
            { color: 'var(--ok)', label: 'settled (Fisher-Yates)' },
            { color: 'var(--bad)', label: 'more than 3 SE off' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented label="Algorithm" value={algo} onChange={(a) => change(a, n)} options={ALGOS} />
          <Segmented label="n" value={n} onChange={(v) => change(algo, v)} options={SIZES} />
        </>,
        <ControlGroup key="run" label="Runs">
          <Button onClick={() => setSeed(seed + 1)}>Shuffle again (new seed)</Button>
          <Button onClick={run}>Run ×{fmt(RUNS)}</Button>
        </ControlGroup>,
      ]}
    >
      <div className="stage-pad sr-lab">
        <ArrayStrip
          values={f.arr}
          cellState={cellState}
          pointers={pointers}
          ranges={f.settled > 0 ? [{ from: 0, to: f.settled - 1, tone: 'ok' }] : []}
          showIndex
          cellMax={56}
          className="sr-strip"
        />
        <div className="sr-heat">
          <SectionTitle hint={`rows: value · columns: final position · fair: every cell near ${pct(1 / n)} · shade exaggerates gaps ${HEAT_GAIN}×`}>Where each value ended up</SectionTitle>
          {counts ? (
            <CellGrid
              rows={n}
              cols={n}
              size={n <= 5 ? 'md' : 'sm'}
              rowLabels={Array.from({ length: n }, (_, v) => String(v + 1))}
              colLabels={Array.from({ length: n }, (_, p) => String(p))}
              cell={(r, c) => ({
                tone: 'info',
                fill: 'tint',
                intensity: clamp(HEAT_MID + (counts[r][c] / expected - 1) * HEAT_GAIN, 0.05, 1),
                text: pct(counts[r][c] / RUNS),
              })}
              highlight={off.map((o) => ({ ...o, tone: 'bad' as const }))}
              cellTitle={(r, c) => `value ${r + 1} at position ${c}: ${fmt(counts[r][c])} (expected ${fmt(expected)})`}
              ariaLabel={`Heatmap of ${fmt(RUNS)} shuffles; ${off.length} cells more than 3 standard errors from ${fmt(expected)}`}
              className="sr-grid"
            />
          ) : (
            <p className="empty-note">Press Run ×{fmt(RUNS)} to fill it.</p>
          )}
        </div>
        <Hint className="sr-note">
          Runs use a seeded pseudo-random generator, so you can repeat them.
          {algo === 'comparator' && ' How biased the random-comparator sort is depends on the browser\'s sort algorithm; this is what yours does.'}
        </Hint>
      </div>
    </StageFrame>
  );
}

// ── Exact n = 3 ──────────────────────────────────────────────────────

const N3 = 3;
const NAIVE3 = enumeratePaths('naive', N3);
const FY3 = enumeratePaths('fisher-yates', N3);
const NAIVE_COUNTS = pathCounts(NAIVE3);
const FY_COUNTS = pathCounts(FY3);
const PERMS3 = permutations(N3);
const SHOWN_N = [3, 4, 5, 6, 7, 8];

function ExactScene({ picker }: { picker: ReactNode }) {
  useIntroCaption(<>All {NAIVE3.length} naive paths, grouped by the arrangement they make. {NAIVE3.length} isn&apos;t divisible by {PERMS3.length}, so
    no grouping can be even: this is a proof, not a simulation.</>);
  const most = Math.max(...NAIVE_COUNTS.values());
  return (
    <StageFrame
      height={360}
      stats={
        <Stats>
          <Stat label="Naive paths" value={`3³ = ${NAIVE3.length}`} />
          <Stat label="Fisher-Yates paths" value={`3·2·1 = ${FY3.length}`} />
          <Stat label="Fair share" value={`${NAIVE3.length}/${PERMS3.length} = ${(NAIVE3.length / PERMS3.length).toFixed(1)}`} sub="not a whole number" color="var(--bad)" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'naive paths per arrangement' },
            { color: 'var(--ok)', label: 'Fisher-Yates: 1 path each' },
            { color: 'var(--bad)', label: 'over- or under-represented' },
          ]}
        />
      }
      controls={[<>{picker}</>]}
    >
      <div className="stage-pad sr-exact">
        <table className="data-table sr-table">
          <thead>
            <tr>
              <th scope="col">arrangement</th>
              <th scope="col">naive (of {NAIVE3.length})</th>
              <th scope="col">Fisher-Yates (of {FY3.length})</th>
            </tr>
          </thead>
          <tbody>
            {PERMS3.map((p) => {
              const c = NAIVE_COUNTS.get(permKey(p)) ?? 0;
              const fair = c * PERMS3.length === NAIVE3.length;
              return (
                <tr key={permKey(p)}>
                  <th scope="row">{p.join(' ')}</th>
                  <td>
                    <span className="sr-bar" style={{ width: `${(c / most) * 100}%` }} />
                    <span className={fair ? '' : 'sr-off'}>{c}/{NAIVE3.length} · {pct(c / NAIVE3.length, 1)}</span>
                  </td>
                  <td className="sr-fy">{FY_COUNTS.get(permKey(p)) ?? 0}/{FY3.length} · {pct((FY_COUNTS.get(permKey(p)) ?? 0) / FY3.length, 1)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <Box className="sr-proof">
          <SectionTitle>It never comes out even</SectionTitle>
          <p>nⁿ naive paths can only spread evenly over n! arrangements if n! divides nⁿ. It doesn&apos;t, for any n ≥ 3:</p>
          <ul>
            {SHOWN_N.map((k) => {
              const paths = BigInt(k) ** BigInt(k);
              const rem = paths % factorial(k);
              return <li key={k}>n = {k}: {fmt(Number(paths))} mod {fmt(Number(factorial(k)))} = {fmt(Number(rem))}</li>;
            })}
          </ul>
        </Box>
        <details className="sr-paths">
          <summary>Show all {NAIVE3.length} naive paths</summary>
          <ol>
            {NAIVE3.map((p) => (
              <li key={p.choices.join('')}>j = ({p.choices.join(', ')}) → {p.result.join(' ')}</li>
            ))}
          </ol>
        </details>
      </div>
    </StageFrame>
  );
}

// ── Reservoir ────────────────────────────────────────────────────────

const MAX_K = 5;
const MAX_STREAM = 12;
const RES_RUNS = 10_000;
const RES_MS = 1000;

function ReservoirScene({ picker }: { picker: ReactNode }) {
  const [k, setK] = useState(3);
  const [n, setN] = useState(10);
  const [seed, setSeed] = useState(1);
  const [ran, setRan] = useState(false);
  const setCaption = useSetCaption();
  const frames = useMemo(() => reservoirFrames(n, k, seed), [n, k, seed]);
  const player = usePlayer(frames, { interval: RES_MS });
  const f = player.frame;
  const counts = useMemo(() => (ran ? inclusionCounts(n, k, RES_RUNS, seed + HEAT_SEED_OFFSET) : null), [ran, n, k, seed]);

  const change = (nk: number, nn: number) => {
    setK(nk);
    setN(Math.max(nn, nk + 1));
    setRan(false);
  };
  const run = () => {
    setRan(true);
    const c = inclusionCounts(n, k, RES_RUNS, seed + HEAT_SEED_OFFSET);
    const shares = c.map((v) => v / RES_RUNS);
    setCaption(<>{fmt(RES_RUNS)} runs: every item was kept between {pct(Math.min(...shares), 1)} and {pct(Math.max(...shares), 1)} of the time.
      The exact chance is {k}/{n} = {pct(k / n, 1)} for every item, first or last.</>);
  };

  const stream = Array.from({ length: n }, (_, i) => i + 1);
  const streamState = (i: number): ArrayCellState => {
    const item = i + 1;
    if (item === f.seen) return 'active';
    if (item > f.seen) return 'idle';
    return f.reservoir.includes(item) ? 'info' : 'dim';
  };

  return (
    <StageFrame
      player={player}
      height={400}
      stats={
        <Stats>
          <Stat label="Items seen" value={`${f.seen} of ${n}`} />
          <Stat label="Exact P(kept)" value={`${k}/${n} = ${pct(k / n, 1)}`} color="var(--ok)" sub="for every item" />
          <Stat label="Evicted now" value={f.evicted ?? '–'} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'item arriving / just admitted' },
            { color: 'var(--info)', label: 'in the reservoir, and kept-count bars' },
            { color: 'var(--dim)', label: 'passed by or evicted' },
            { color: 'var(--ok)', label: 'exact k/n', shape: 'line' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Slider label="Slots k" value={k} min={1} max={MAX_K} onChange={(v) => change(v, n)} />
          <Slider label="Stream length n" value={n} min={k + 1} max={MAX_STREAM} onChange={(v) => change(k, v)} />
        </>,
        <ControlGroup key="run" label="Runs">
          <Button onClick={() => setSeed(seed + 1)}>New run (new seed)</Button>
          <Button onClick={run}>Run ×{fmt(RES_RUNS)}</Button>
        </ControlGroup>,
      ]}
    >
      <div className="stage-pad sr-res">
        <SectionTitle hint="items flow left to right">Stream</SectionTitle>
        <ArrayStrip values={stream} cellState={streamState} cellMax={44} className="sr-strip" />
        <SectionTitle hint={`${k} ${k === 1 ? 'slot' : 'slots'}`}>Reservoir</SectionTitle>
        <ArrayStrip
          values={Array.from({ length: k }, (_, s) => f.reservoir[s] ?? '·')}
          cellState={(s) => (s === f.admitted ? 'active' : f.reservoir[s] ? 'info' : 'dim')}
          cellMax={56}
          className="sr-strip sr-slots"
        />
        <Plot2D
          x={{ domain: [0.5, n + 0.5], label: 'item', ticks: Math.min(n, 12) }}
          y={{ domain: [0, 1], label: 'share of runs that kept it', format: (v) => pct(v), ticks: 4 }}
          height={200}
          ariaLabel={counts ? `Kept share per item over ${RES_RUNS} runs; exact ${k}/${n}` : `Exact chance ${k}/${n} per item; no runs yet`}
        >
          {counts && <Bars bars={counts.map((c, i) => ({ x0: i + 0.6, x1: i + 1.4, y: c / RES_RUNS }))} tone="info" />}
          <HLine at={k / n} tone="ok" label={`k/n = ${pct(k / n, 1)}`} />
        </Plot2D>
        <Hint className="sr-note">Runs use a seeded pseudo-random generator, so you can repeat them.</Hint>
      </div>
    </StageFrame>
  );
}
