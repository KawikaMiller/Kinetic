import { useMemo, useState, type ReactNode } from 'react';
import { CellGrid, type GridCellSpec } from '../../components/CellGrid';
import { Box, SectionTitle } from '../../components/Panel';
import { Bars, Curve, HLine, Plot2D, Points, Segments } from '../../components/Plot2D';
import { useScenePicker } from '../../components/ScenePicker';
import { StageFrame } from '../../components/StageFrame';
import { Button, ControlGroup, Hint, Legend, Segmented, Slider, Stat, Stats, Toggle } from '../../components/ui';
import { useIntroCaption, useSetCaption } from '../../core/caption';
import { pct } from '../../core/format';
import { mulberry32 } from '../../core/random';
import { eventCaption, flakyCaption, replicaCaption, rollCaption } from './frames';
import {
  EVENTS, FACES, RACK_DOWN, SLOS, chance, convergence, distinct, eventDef, eventSet, fracText, hitsOf, outcomeCell, outcomes, replicaDown, replicaRisk,
  rollsFor, rules, runSuite, spaceSize, suiteRed, totalOf, totals, type Dice,
} from './model';
import './styles.css';

type Scene = 'dice' | 'replicas' | 'flaky';
const SCENES: { value: Scene; label: string }[] = [
  { value: 'dice', label: 'Dice lab' },
  { value: 'replicas', label: 'Replicas' },
  { value: 'flaky', label: 'Flaky suite' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({ label: 'Tool', options: SCENES, initial: 'dice' });
  if (scene === 'replicas') return <ReplicaScene picker={picker} />;
  if (scene === 'flaky') return <FlakyScene picker={picker} />;
  return <DiceScene picker={picker} />;
}

const fmt = (n: number) => n.toLocaleString('en-US');

// ── Dice lab ─────────────────────────────────────────────────────────

const MAX_ROLLS = 100_000;
const ROLL_BATCHES = [1, 100, 10_000] as const;
const CUSTOM = 'custom';
const NO_B = 'none';
const DICE_OPTIONS = [{ value: 1 as Dice, label: 'One' }, { value: 2 as Dice, label: 'Two' }];
const DEFAULT_A: Record<Dice, string> = { 1: 'even', 2: 'sum7' };
/** Head-room above the tallest bar or exact mark. */
const BAR_HEADROOM = 1.2;

function DiceScene({ picker }: { picker: ReactNode }) {
  const [dice, setDice] = useState<Dice>(2);
  const [aId, setAId] = useState(DEFAULT_A[2]);
  const [custom, setCustom] = useState<Set<number>>(() => eventSet(2, eventDef(2, DEFAULT_A[2])!));
  const [bId, setBId] = useState(NO_B);
  const [seed, setSeed] = useState(1);
  const [count, setCount] = useState(0);
  const setCaption = useSetCaption();

  const total = spaceSize(dice);
  const setA = (d: Dice, id: string, own: ReadonlySet<number>) => (id === CUSTOM ? new Set(own) : eventSet(d, eventDef(d, id)!));
  const a = useMemo(() => setA(dice, aId, custom), [dice, aId, custom]);
  const bDef = bId === NO_B ? null : eventDef(dice, bId)!;
  const b = useMemo(() => (bDef ? eventSet(dice, bDef) : new Set<number>()), [dice, bDef]);
  const r = rules(a, b, total);
  const aLabel = aId === CUSTOM ? 'your event' : eventDef(dice, aId)!.label;
  const rolls = useMemo(() => rollsFor(seed, dice, count), [seed, dice, count]);
  const hits = hitsOf(rolls, a);
  const latest = count ? rolls[count - 1] : null;
  const faces = outcomes(dice);

  useIntroCaption(eventCaption('sum = 7', rules(eventSet(2, eventDef(2, 'sum7')!), new Set(), 36), null));

  const describe = (nextA: ReadonlySet<number>, nextALabel: string, nextB: ReadonlySet<number>, nextBLabel: string | null, d: Dice) =>
    setCaption(eventCaption(nextALabel, rules(nextA, nextB, spaceSize(d)), nextBLabel));

  const chooseDice = (d: Dice) => {
    const nextA = eventSet(d, eventDef(d, DEFAULT_A[d])!);
    setDice(d);
    setAId(DEFAULT_A[d]);
    setCustom(nextA);
    setBId(NO_B);
    setCount(0);
    describe(nextA, eventDef(d, DEFAULT_A[d])!.label, new Set(), null, d);
  };
  const chooseA = (id: string) => {
    const nextA = setA(dice, id, a);
    setAId(id);
    if (id === CUSTOM) setCustom(new Set(a));
    describe(nextA, id === CUSTOM ? 'your event' : eventDef(dice, id)!.label, b, bDef?.label ?? null, dice);
  };
  const chooseB = (id: string) => {
    const def = id === NO_B ? null : eventDef(dice, id)!;
    const nextB = def ? eventSet(dice, def) : new Set<number>();
    setBId(id);
    describe(a, aLabel, nextB, def?.label ?? null, dice);
  };
  const toggleCell = (outcome: number) => {
    const next = new Set(a);
    if (next.has(outcome)) next.delete(outcome);
    else next.add(outcome);
    setCustom(next);
    setAId(CUSTOM);
    describe(next, 'your event', b, bDef?.label ?? null, dice);
  };
  const rollMore = (n: number) => {
    const next = Math.min(MAX_ROLLS, count + n);
    const all = rollsFor(seed, dice, next);
    setCount(next);
    setCaption(rollCaption(aLabel, next, hitsOf(all, a), r));
  };
  const newSeed = () => {
    setSeed(seed + 1);
    setCount(0);
    setCaption(<>New seed {seed + 1}: the roll history is cleared. The exact chances don't change; only the luck does.</>);
  };

  const rows = dice === 1 ? 1 : FACES;
  const cellOf = (row: number, col: number) => row * FACES + col;
  const cell = (row: number, col: number): GridCellSpec => {
    const o = cellOf(row, col);
    const inA = a.has(o);
    const inB = b.has(o);
    const text = totalOf(dice, o);
    if (inA && inB) return { tone: 'violet', fill: 'solid', text };
    if (inA) return { tone: 'info', fill: 'solid', text };
    if (inB) return { tone: 'sky', fill: 'tint', text, intensity: 0.35 };
    return { tone: 'muted', fill: 'outline', text };
  };
  const cellName = (row: number, col: number) => {
    const o = cellOf(row, col);
    const f = faces[o];
    const where = [a.has(o) && 'in A', b.has(o) && 'in B'].filter(Boolean).join(' and ') || 'in neither';
    return `${f.length === 2 ? `${f[0]} then ${f[1]}, sum ${f[0] + f[1]}` : `face ${f[0]}`}: ${where}`;
  };

  const exactTotals = totals(dice);
  const observed = new Map<number, number>();
  for (const o of rolls) observed.set(totalOf(dice, o), (observed.get(totalOf(dice, o)) ?? 0) + 1);
  const barTop = Math.max(...exactTotals.map((t) => t.ways / total), ...[...observed.values()].map((v) => v / Math.max(1, count))) * BAR_HEADROOM;
  const curve = useMemo(() => convergence(rolls, a), [rolls, a]);
  const latestFaces = latest === null ? null : faces[latest];

  return (
    <StageFrame
      height={420}
      stats={
        <Stats>
          <Stat label="P(A), exact" value={fracText({ num: r.a, den: r.total })} color="var(--ok)" sub={chance(r.a / r.total)} />
          <Stat label="Rolls" value={fmt(count)} sub={`seed ${seed}`} />
          <Stat label="Frequency of A" value={count ? chance(hits / count) : '–'} color="var(--info)" sub={count ? `${fmt(hits)} hits` : 'roll to measure'} />
          <Stat
            label="Latest roll"
            value={latestFaces ? latestFaces.join(' + ') : '–'}
            color="var(--hi)"
            sub={latestFaces && latestFaces.length === 2 ? `sum ${latestFaces[0] + latestFaces[1]}` : undefined}
          />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'in A (favourable)' },
            { color: 'var(--sky)', label: 'in B only' },
            { color: 'var(--violet)', label: 'in both A and B' },
            { color: 'var(--hi)', label: 'latest roll' },
            { color: 'var(--ok)', label: 'exact value', shape: 'line' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented label="Dice" value={dice} onChange={chooseDice} options={DICE_OPTIONS} />
          <Segmented
            label="Event A"
            value={aId}
            onChange={chooseA}
            options={[...EVENTS[dice].map((e) => ({ value: e.id, label: e.label })), { value: CUSTOM, label: 'your own' }]}
          />
          <Segmented
            label="Event B"
            value={bId}
            onChange={chooseB}
            options={[{ value: NO_B, label: 'none' }, ...EVENTS[dice].map((e) => ({ value: e.id, label: e.label }))]}
          />
        </>,
        <ControlGroup key="roll" label="Roll">
          {ROLL_BATCHES.map((n) => (
            <Button key={n} onClick={() => rollMore(n)} disabled={count >= MAX_ROLLS}>×{fmt(n)}</Button>
          ))}
          <Button onClick={newSeed}>New seed</Button>
        </ControlGroup>,
      ]}
    >
      <div className="stage-pad pb-dice">
        <div className="pb-left">
          <SectionTitle hint={dice === 2 ? 'row: first die · column: second · number: the sum' : 'one cell per face'}>
            Sample space · {total} outcomes
          </SectionTitle>
          <CellGrid
            rows={rows}
            cols={FACES}
            size="md"
            rowLabels={dice === 2 ? ['1', '2', '3', '4', '5', '6'] : undefined}
            colLabels={['1', '2', '3', '4', '5', '6']}
            cell={cell}
            onCellClick={(row, col) => toggleCell(cellOf(row, col))}
            cellAriaLabel={cellName}
            highlight={latest === null ? [] : [{ ...outcomeCell(dice, latest), tone: 'hi' }]}
            ariaLabel={`Sample space, ${total} outcomes; click a cell to add it to or remove it from A`}
            className="pb-grid"
          />
          <RulesPanel r={r} hasB={bDef !== null} />
        </div>
        <div className="pb-plots">
          <Plot2D
            x={{ domain: [exactTotals[0].value - 0.5, exactTotals[exactTotals.length - 1].value + 0.5], label: dice === 2 ? 'sum of the two dice' : 'face', ticks: 6 }}
            y={{ domain: [0, barTop], label: 'share of rolls', format: (v) => pct(v), ticks: 4 }}
            ariaLabel={`Share of rolls for each ${dice === 2 ? 'sum' : 'face'} after ${fmt(count)} rolls, with the exact chances marked`}
          >
            <Bars bars={exactTotals.map((t) => ({ x0: t.value - 0.45, x1: t.value + 0.45, y: count ? (observed.get(t.value) ?? 0) / count : 0 }))} tone="info" />
            <Segments segments={exactTotals.map((t) => ({ from: [t.value - 0.5, t.ways / total], to: [t.value + 0.5, t.ways / total], tone: 'ok' }))} />
          </Plot2D>
          <Plot2D
            x={{ domain: [1, MAX_ROLLS], log: true, label: 'rolls so far (log scale)' }}
            y={{ domain: [0, 1], label: 'frequency of A', format: (v) => pct(v), ticks: 4 }}
            ariaLabel={`Running frequency of A: ${count ? chance(hits / count) : 'no rolls yet'}; exact ${chance(r.a / r.total)}`}
          >
            <HLine at={r.a / r.total} label={`exact ${chance(r.a / r.total)}`} tone="ok" />
            {curve.length > 1 && <Curve points={curve} tone="info" />}
            {count > 0 && <Points data={[{ x: count, y: hits / count, tone: 'hi' }]} r={4} />}
          </Plot2D>
        </div>
        <Hint className="pb-note">Rolls are pseudo-random (seeded, so a run is repeatable). The exact values come from counting outcomes.</Hint>
      </div>
    </StageFrame>
  );
}

function RulesPanel({ r, hasB }: { r: ReturnType<typeof rules>; hasB: boolean }) {
  const t = r.total;
  return (
    <Box className="pb-rules">
      <SectionTitle>Rules, from the counts</SectionTitle>
      <dl>
        <dt>Complement</dt>
        <dd>P(not A) = 1 − {r.a}/{t} = {t - r.a}/{t}</dd>
        {hasB ? (
          <>
            <dt>Union</dt>
            <dd>
              P(A ∪ B) = {r.a}/{t} + {r.b}/{t} − <span className="pb-overlap">{r.both}/{t}</span> = {r.a + r.b - r.both}/{t}
              {' '}<span className="pb-check">({r.either} cells are in A or B)</span>
            </dd>
            <dt>Independent?</dt>
            <dd>
              P(A ∩ B) = {r.both}/{t}; P(A)·P(B) = {r.a * r.b}/{t * t}.{' '}
              <b>{r.independent ? 'Yes: they match.' : "No: they don't match."}</b>
            </dd>
          </>
        ) : (
          <>
            <dt>Union, independence</dt>
            <dd>Pick an event B to compare.</dd>
          </>
        )}
      </dl>
    </Box>
  );
}

// ── Replicas ─────────────────────────────────────────────────────────

const MAX_REPLICAS = 10;
/** p is held in tenths of a percent, so 0.5% steps stay exact. */
const P_STEP = 5;
const P_MAX = 500;
const PERMILLE = 1000;
const LOG_FLOOR = 1e-24;

function ReplicaScene({ picker }: { picker: ReactNode }) {
  const [n, setN] = useState(3);
  const [pMille, setPMille] = useState(10);
  const [correlated, setCorrelated] = useState(false);
  const [sloId, setSloId] = useState<(typeof SLOS)[number]['id']>('4');
  const setCaption = useSetCaption();
  const p = pMille / PERMILLE;
  const slo = SLOS.find((s) => s.id === sloId)!;
  const risk = replicaRisk(n, p, correlated);
  const meets = risk.allDown <= slo.budget;
  const [downText, budgetText] = distinct(risk.allDown, slo.budget);
  const [availText, targetText] = distinct(1 - risk.allDown, 1 - slo.budget);

  useIntroCaption(replicaCaption(3, 0.01, 1e-4, false));

  const update = (nn: number, pm: number, corr: boolean, id: (typeof SLOS)[number]['id']) => {
    setN(nn);
    setPMille(pm);
    setCorrelated(corr);
    setSloId(id);
    setCaption(replicaCaption(nn, pm / PERMILLE, SLOS.find((s) => s.id === id)!.budget, corr));
  };

  const ns = Array.from({ length: MAX_REPLICAS }, (_, i) => i + 1);
  const pointsFor = (corr: boolean) => ns.map((k) => [k, replicaRisk(k, p, corr).allDown] as const);

  return (
    <StageFrame
      height={360}
      stats={
        <Stats>
          <Stat label="P(all down)" value={downText} color={meets ? 'var(--ok)' : 'var(--bad)'} sub={`target ≤ ${budgetText}`} />
          <Stat label="P(at least one down)" value={chance(risk.anyDown)} />
          <Stat label="Availability" value={availText} sub={`1 − P(all down) · target ${targetText}`} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'independent replicas', shape: 'line' },
            { color: 'var(--orange)', label: 'shared rack (correlated)', shape: 'line' },
            { color: 'var(--ok)', label: 'meets the target', shape: 'dot' },
            { color: 'var(--bad)', label: 'misses it', shape: 'dot' },
            { color: 'var(--dim)', label: 'target line', shape: 'line' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Slider label="Replicas n" value={n} min={1} max={MAX_REPLICAS} onChange={(v) => update(v, pMille, correlated, sloId)} />
          <Slider
            label="Each down"
            value={pMille}
            min={0}
            max={P_MAX}
            step={P_STEP}
            format={(v) => pct(v / PERMILLE, v % 10 ? 1 : 0)}
            onChange={(v) => update(n, v, correlated, sloId)}
          />
        </>,
        <>
          <Toggle label="Failures" value={correlated} onChange={(v) => update(n, pMille, v, sloId)} off="Independent" on="Shared rack" />
          <Segmented
            label="Availability target"
            value={sloId}
            onChange={(id) => update(n, pMille, correlated, id)}
            options={SLOS.map((s) => ({ value: s.id, label: s.label }))}
          />
        </>,
      ]}
    >
      <div className="stage-pad pb-replicas">
        <div className={`pb-rack ${correlated ? 'is-shared' : ''}`} aria-label={`${n} replicas${correlated ? ' in one shared rack' : ''}`}>
          {correlated && <span className="pb-rack-label">one rack · down {chance(RACK_DOWN)} of the time</span>}
          <ol className="pb-servers">
            {ns.slice(0, n).map((k) => (
              <li key={k}>
                <b>replica {k}</b>
                <span>down {chance(replicaDown(p, correlated))}</span>
              </li>
            ))}
          </ol>
        </div>
        <Plot2D
          x={{ domain: [1, MAX_REPLICAS], label: 'replicas n', ticks: 10 }}
          y={{ domain: [LOG_FLOOR, 1], log: true, label: 'P(all down)', tickValues: [1e-24, 1e-18, 1e-12, 1e-6, 1] }}
          ariaLabel={`P(all down) against the number of replicas; now ${chance(risk.allDown)} for ${n}`}
        >
          <HLine at={slo.budget} label={`target ${budgetText}`} tone="dim" />
          <Curve points={pointsFor(false)} tone="info" dashed={correlated} />
          <Curve points={pointsFor(true)} tone="orange" dashed={!correlated} />
          {risk.allDown > 0 && <Points data={[{ x: n, y: risk.allDown, tone: meets ? 'ok' : 'bad' }]} r={5} />}
        </Plot2D>
        <Hint className="pb-note">
          Independence is an assumption: real replicas often fail together (a shared rack, power feed, bad deploy or bug). The rack&apos;s
          {' '}{chance(RACK_DOWN)} is illustrative.
        </Hint>
      </div>
    </StageFrame>
  );
}

// ── Flaky suite ──────────────────────────────────────────────────────

const MAX_TESTS = 500;
const TEST_STEP = 10;
/** Flaky rate in tenths of a percent. */
const F_MAX = 50;
const SUITE_COLS = 25;
const RUN_BATCHES = [1, 100] as const;
const MAX_RUNS = 2_000;

interface SuiteHistory {
  runs: number;
  red: number;
  last: boolean[];
}

/** Every run for one seed, replayed from the start so results are a pure function of the inputs. */
function history(seed: number, tests: number, f: number, runs: number): SuiteHistory {
  const rnd = mulberry32(seed);
  let red = 0;
  let last: boolean[] = [];
  for (let i = 0; i < runs; i++) {
    last = runSuite(rnd, tests, f);
    if (last.some(Boolean)) red++;
  }
  return { runs, red, last };
}

function FlakyScene({ picker }: { picker: ReactNode }) {
  const [tests, setTests] = useState(200);
  const [fMille, setFMille] = useState(10);
  const [seed, setSeed] = useState(1);
  const [runs, setRuns] = useState(0);
  const setCaption = useSetCaption();
  const f = fMille / PERMILLE;
  const h = useMemo(() => history(seed, tests, f, runs), [seed, tests, f, runs]);
  const exact = suiteRed(tests, f);
  const failed = h.last.filter(Boolean).length;

  useIntroCaption(flakyCaption(200, 0.01, 0, 0));

  const change = (t: number, fm: number) => {
    setTests(t);
    setFMille(fm);
    setRuns(0);
    setCaption(flakyCaption(t, fm / PERMILLE, 0, 0));
  };
  const run = (k: number) => {
    const next = Math.min(MAX_RUNS, runs + k);
    const nh = history(seed, tests, f, next);
    setRuns(next);
    setCaption(flakyCaption(tests, f, nh.runs, nh.red));
  };
  const newSeed = () => {
    setSeed(seed + 1);
    setRuns(0);
    setCaption(<>New seed {seed + 1}: run history cleared. The exact chance is still {chance(exact)}.</>);
  };

  const rows = Math.ceil(tests / SUITE_COLS);
  const cell = (r: number, c: number): GridCellSpec => {
    const i = r * SUITE_COLS + c;
    if (i >= tests) return { fill: 'none' };
    if (!h.runs) return { tone: 'muted', fill: 'outline' };
    return h.last[i] ? { tone: 'bad', fill: 'solid' } : { tone: 'ok', fill: 'tint' };
  };

  return (
    <StageFrame
      height={360}
      stats={
        <Stats>
          <Stat label="P(suite red), exact" value={chance(exact)} color="var(--bad)" sub="1 − (1 − p)ⁿ" />
          <Stat label="Simulated" value={h.runs ? chance(h.red / h.runs) : '–'} sub={h.runs ? `${fmt(h.red)} red of ${fmt(h.runs)} runs` : 'no runs yet'} />
          <Stat label="Last run" value={h.runs ? (failed ? `${failed} failed` : 'green') : '–'} sub={`seed ${seed}`} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--ok)', label: 'test passed' },
            { color: 'var(--bad)', label: 'test failed (flaked)' },
            { color: 'var(--info)', label: 'P(red) for n tests', shape: 'line' },
            { color: 'var(--hi)', label: 'this suite', shape: 'dot' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Slider label="Tests" value={tests} min={TEST_STEP} max={MAX_TESTS} step={TEST_STEP} onChange={(v) => change(v, fMille)} />
          <Slider
            label="Each flaky"
            value={fMille}
            min={0}
            max={F_MAX}
            format={(v) => pct(v / PERMILLE, 1)}
            onChange={(v) => change(tests, v)}
          />
        </>,
        <ControlGroup key="run" label="Run the suite">
          {RUN_BATCHES.map((k) => (
            <Button key={k} onClick={() => run(k)} disabled={runs >= MAX_RUNS}>×{k}</Button>
          ))}
          <Button onClick={newSeed}>New seed</Button>
        </ControlGroup>,
      ]}
    >
      <div className="stage-pad pb-flaky">
        <div className="pb-left">
          <SectionTitle hint={h.runs ? `run ${fmt(h.runs)}` : 'not run yet'}>Last run, one cell per test</SectionTitle>
          <CellGrid
            rows={rows}
            cols={SUITE_COLS}
            size={{ cell: 12, gap: 2 }}
            cell={cell}
            ariaLabel={h.runs ? `Last run: ${failed} of ${tests} tests failed` : `${tests} tests, not run yet`}
            className="pb-suite"
          />
        </div>
        <Plot2D
          x={{ domain: [0, MAX_TESTS], label: 'tests in the suite' }}
          y={{ domain: [0, 1], label: 'P(suite red)', format: (v) => pct(v), ticks: 4 }}
          ariaLabel={`P(suite red) against suite size at ${chance(f)} flakiness; ${tests} tests give ${chance(exact)}`}
        >
          <Curve fn={(x) => suiteRed(Math.round(x), f)} tone="info" />
          <Points data={[{ x: tests, y: exact, tone: 'hi' }]} />
        </Plot2D>
        <Hint className="pb-note">
          Assumes each test flakes independently with the same chance. Runs are seeded pseudo-random, so they repeat. Finding and fixing
          flaky tests gets its own lesson later in the course.
        </Hint>
      </div>
    </StageFrame>
  );
}
