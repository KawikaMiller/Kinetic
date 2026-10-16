import { useMemo, useState, type ReactNode } from 'react';
import { ArrayStrip } from '../../components/ArrayStrip';
import { Curve, Plot2D, VLine } from '../../components/Plot2D';
import { SeedField } from '../../components/SeedField';
import { Hint, Segmented, Slider, Stat } from '../../components/ui';
import { breakEven, MAX_DIST, MIN_DIST, nominalStates, tourCount, tourLength, transitionBound, tspBitmask, type Matrix } from './dp';
import { DpTab, type TabLines } from './DpTab';
import { CITIES_MAX, CITIES_MIN, distances, OPENING, tspCounterexamples } from './presets';
import { tspRun, type TspState } from './runs';

const COUNTEREXAMPLES = tspCounterexamples();
const STATES: { value: TspState; label: string }[] = [
  { value: 'm', label: 'dp[mask] only' },
  { value: 'l', label: 'dp[last] only' },
  { value: 'ml', label: 'dp[mask][last]' },
];
const PLOT_MIN_N = 3;
const PLOT_MAX_N = 20;
const PLOT_TOP = 1e18;

const linesFor = (state: TspState): TabLines => ({
  state:
    state === 'm' ? 'dp[mask]: the cheapest path through a set of cities, remembering only where it ended.'
    : state === 'l' ? 'dp[last]: the cheapest walk of k edges ending at a city, with no record of which cities were visited.'
    : 'dp[mask][last]: the cheapest path from city 0 through exactly the cities in mask, ending at last.',
  transition: state === 'ml' ? 'dp[mask][last] = min over p in mask of dp[mask minus last][p] + d(p, last)' : state === 'm' ? 'Extend the one stored path of the smaller set.' : 'dp_k[c] = min over p of dp_(k-1)[p] + d(p, c)',
  base: state === 'ml' ? 'dp[{c}][c] = d(0, c): go straight from city 0.' : state === 'm' ? 'dp[{c}] = d(0, c)' : 'dp_0[0] = 0, everything else unreachable.',
  answer: state === 'ml' ? 'min over c of dp[all][c] + d(c, 0), then walk the choices back.' : state === 'm' ? 'dp[all] + the way home.' : 'dp_n[0], a closed walk of n edges.',
});

function GrowthPlot({ n }: { n: number }) {
  const ns = Array.from({ length: PLOT_MAX_N - PLOT_MIN_N + 1 }, (_, k) => PLOT_MIN_N + k);
  const line = (f: (m: number) => number) => ns.map((m) => [m, f(m)] as const);
  return (
    <Plot2D
      x={{ domain: [PLOT_MIN_N, PLOT_MAX_N], label: 'cities n' }}
      y={{ domain: [1, PLOT_TOP], log: true, label: 'count', tickValues: [1, 1e3, 1e6, 1e9, 1e12, 1e15, 1e18] }}
      ariaLabel="Table states, transitions and tours against the number of cities, log scale"
    >
      <Curve points={line(nominalStates)} tone="info" />
      <Curve points={line(transitionBound)} tone="ok" />
      <Curve points={line(tourCount)} tone="bad" />
      <VLine at={n} label={`n = ${n}`} />
    </Plot2D>
  );
}

export function TspScene({ picker }: { picker: ReactNode }) {
  const [n, setN] = useState(OPENING.tsp.n);
  const [seed, setSeed] = useState(OPENING.tsp.seed);
  const [state, setState] = useState<TspState>(OPENING.tsp.state);
  const [overrides, setOverrides] = useState<Record<string, number>>({});
  const [a, setA] = useState(0);
  const [b, setB] = useState(1);

  const dist: Matrix = useMemo(() => {
    const d = distances(n, seed);
    for (const [k, v] of Object.entries(overrides)) {
      const [x, y] = k.split('-').map(Number);
      d[x][y] = d[y][x] = v;
    }
    return d;
  }, [n, seed, overrides]);

  const fresh = (nextN: number, nextSeed: number) => {
    setN(nextN);
    setSeed(nextSeed);
    setOverrides({});
    setA((x) => Math.min(x, nextN - 1));
    setB((x) => Math.min(x, nextN - 1));
  };
  const setDistance = (v: number) => {
    if (a === b) return;
    const key = a < b ? `${a}-${b}` : `${b}-${a}`;
    setOverrides((cur) => ({ ...cur, [key]: v }));
  };

  const run = useMemo(() => tspRun(dist, state), [dist, state]);
  const exact = useMemo(() => tspBitmask(dist), [dist]);
  const ce = COUNTEREXAMPLES;
  const wrongNote = state === 'm' ? ce.mask : ce.last;
  const wrongRun = useMemo(() => tspRun(distances(wrongNote.n, wrongNote.seed), state), [wrongNote, state]);
  const wrongTruth = useMemo(() => tspBitmask(distances(wrongNote.n, wrongNote.seed)).best, [wrongNote]);
  const be = breakEven(PLOT_MAX_N);

  const verdict =
    state === 'ml' ? (
      <p className="dp-verdict">
        The mask says which cities are used and the last city says where the path stands, which is everything the future depends on. Best tour <b className="ok">{exact.best}</b>: {exact.tour.join(' → ')} (its edges add up to {tourLength(dist, exact.tour)}).
      </p>
    ) : (
      <p className="dp-verdict">
        On this instance it says <b className={run.answer === String(exact.best) ? 'ok' : 'bad'}>{run.answer}</b> and the real best is <b className="ok">{exact.best}</b>. A counterexample the lesson found (seed {wrongNote.seed}, {wrongNote.n} cities): <b className="bad">{wrongRun.answer}</b> against <b className="ok">{wrongTruth}</b>{state === 'l' ? ', lower than any real tour because the walk revisits a city' : ''}.
      </p>
    );

  return (
    <DpTab
      picker={picker}
      run={run}
      truth={String(exact.best)}
      lines={linesFor(state)}
      choice={<Segmented label="State" value={state} onChange={setState} options={STATES} />}
      controls={
        <>
          <Slider label="Cities" value={n} min={CITIES_MIN} max={CITIES_MAX} onChange={(v) => fresh(v, seed)} />
          <SeedField seed={seed} onSeed={(s) => fresh(n, s)} />
          <Slider label="City a" value={a} min={0} max={n - 1} onChange={setA} />
          <Slider label="City b" value={b} min={0} max={n - 1} onChange={setB} />
          <Slider label={`Distance ${a} to ${b}`} value={dist[a][b]} min={MIN_DIST} max={MAX_DIST} onChange={setDistance} />
          <Hint><span role="status">{a === b ? 'Pick two different cities to edit a distance.' : 'Distances are symmetric; seeded, 1 to 99.'}</span></Hint>
        </>
      }
      extraStats={
        <>
          <Stat label="Table cells" value={nominalStates(n)} color="var(--info)" sub={`n x 2^n; counted transitions: ${exact.transitions}`} />
          <Stat label="Tours checked by brute force" value={tourCount(n)} color="var(--bad)" sub={`(n-1)! with city 0 fixed; the bound n^2 x 2^n passes below it at n = ${be}`} />
        </>
      }
      below={
        <>
          {verdict}
          <GrowthPlot n={n} />
          <p className="dp-note">Curves are computed for every n, not run: table cells n x 2^n (blue), transition bound n^2 x 2^n (green), tours (n-1)! (red). The exact table explodes too: by n = {PLOT_MAX_N} it holds {nominalStates(PLOT_MAX_N).toLocaleString('en-US')} cells.</p>
          <span className="dp-note">The best tour, city by city:</span>
          <ArrayStrip values={exact.tour} cellMax={36} cellState={() => 'done'} pointers={[]} />
        </>
      }
      intro={<p className="dp-note">Pick the state first. City 0 is the start, so the mask ranges over the other {n - 1} cities.</p>}
    />
  );
}
