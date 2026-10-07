import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { ArrayStrip, type ArrayCellState } from '../../components/ArrayStrip';
import { CellGrid } from '../../components/CellGrid';
import { Box, SectionTitle } from '../../components/Panel';
import { Curve, Plot2D, Points, VLine } from '../../components/Plot2D';
import { useScenePicker } from '../../components/ScenePicker';
import { StageFrame } from '../../components/StageFrame';
import { WideRegion } from '../../components/WideRegion';
import { Button, ChipButton, ControlGroup, Hint, Legend, Segmented, Slider, Stat, Stats, TextField, Toggle } from '../../components/ui';
import { useIntroCaption, useSetCaption } from '../../core/caption';
import { power } from '../../core/format';
import { parseBoundedInt } from '../../core/parse';
import { CHIPS, MAPPINGS, placementFeedback, REGION_NAMES, SCENARIOS, type Region } from './classes';
import { dpCaption, solveCaption, verifyCaption } from './frames';
import {
  createSolver, DP_RUN_LIMIT, dpCells, dpSolve, inputDigits, MAX_ABS, MAX_DIGITS, MAX_ITEMS, maskToChosen, parseNumbers, seededInstance, SIZES,
  trapInstance, TRAP_N, verify, type DpResult, type Instance, type SolverState, type Verification,
} from './subset';
import './styles.css';

type Scene = 'subset' | 'dp' | 'classes' | 'spot';
const SCENES = [
  { value: 'subset' as const, label: 'Check vs solve' },
  { value: 'dp' as const, label: 'Pseudo-polynomial trap' },
  { value: 'classes' as const, label: 'Class map' },
  { value: 'spot' as const, label: 'Spot it at work' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({ label: 'Scene', options: SCENES, initial: 'subset' });
  if (scene === 'dp') return <DpScene picker={picker} />;
  if (scene === 'classes') return <ClassScene picker={picker} />;
  if (scene === 'spot') return <SpotScene picker={picker} />;
  return <SubsetScene picker={picker} />;
}

/* ---------- scene 1: check vs solve ---------- */

/** Subsets per animation frame: keeps the page responsive while counting for real. */
const CHUNK = 150_000;
const STRIP_ROW = 12;
const TABLE_CELL_LIMIT = 400;
const TARGET_LIMIT = MAX_ITEMS * MAX_ABS;

/** Brute force over every subset, in animation-frame chunks, with its measured rate. */
function useBruteForce(inst: Instance, onProgress: (s: SolverState, perMs: number) => void) {
  const [state, setState] = useState<SolverState | null>(null);
  const [perMs, setPerMs] = useState<number | null>(null);
  const raf = useRef(0);
  const report = useRef(onProgress);
  useEffect(() => {
    report.current = onProgress;
  });
  const cancel = () => cancelAnimationFrame(raf.current);
  // A new instance forgets the old run (during render, not in an effect)…
  const [forInst, setForInst] = useState(inst);
  if (forInst !== inst) {
    setForInst(inst);
    setState(null);
    setPerMs(null);
  }
  // …and stops its animation frames.
  useEffect(() => () => cancelAnimationFrame(raf.current), [inst]);
  const start = () => {
    cancel();
    const solver = createSolver(inst.numbers, inst.target);
    const t0 = performance.now();
    const tick = () => {
      const s = solver.advance(CHUNK);
      const elapsed = Math.max(1, performance.now() - t0);
      const rate = s.tried / elapsed;
      setState(s);
      setPerMs(rate);
      report.current(s, rate);
      if (!s.done) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
  };
  return { state, perMs, start, running: state !== null && !state.done };
}

function SubsetScene({ picker }: { picker: ReactNode }) {
  const [n, setN] = useState<number>(10);
  const [seed, setSeed] = useState(1);
  const [custom, setCustom] = useState<Instance | null>(null);
  const [numText, setNumText] = useState('');
  const [targetText, setTargetText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [chosen, setChosen] = useState<boolean[]>([]);
  const [check, setCheck] = useState<Verification | null>(null);
  const [useDp, setUseDp] = useState(false);
  const [dp, setDp] = useState<DpResult | { refused: string } | null>(null);
  const setCaption = useSetCaption();
  const seeded = useMemo(() => seededInstance(seed, n), [seed, n]);
  const inst = custom ?? seeded;
  const brute = useBruteForce(inst, (s, rate) => setCaption(solveCaption(s, inst.numbers.length, rate), { quiet: true }));
  useIntroCaption(<>Pick numbers by clicking them, then Verify: the check is one pass. Solve has to search all 2ⁿ subsets.</>);

  const reset = () => {
    setChosen([]);
    setCheck(null);
    setDp(null);
  };
  const loadSeeded = (k: number, s: number) => {
    setN(k);
    setSeed(s);
    setCustom(null);
    setError(null);
    reset();
  };
  const loadCustom = () => {
    const nums = parseNumbers(numText);
    if (!nums.ok) return setError(`${nums.error} Keeping the previous numbers.`);
    const t = parseBoundedInt(targetText, { min: -TARGET_LIMIT, max: TARGET_LIMIT, typographicMinus: true });
    if (!t.ok) return setError(`Target: ${t.error} Keeping the previous numbers.`);
    setError(null);
    setCustom({ numbers: nums.value, target: t.value });
    reset();
  };
  const toggle = (i: number) => {
    const next = inst.numbers.map((_, k) => (k === i ? !chosen[k] : !!chosen[k]));
    setChosen(next);
    setCheck(null);
  };
  const runVerify = () => {
    const picks = inst.numbers.map((_, k) => !!chosen[k]);
    const v = verify(inst.numbers, picks, inst.target);
    setCheck(v);
    setCaption(verifyCaption(v, inst.target, picks.filter(Boolean).length));
  };
  const runSolve = () => {
    setCheck(null);
    if (!useDp) return brute.start();
    if (inst.target < 0 || inst.numbers.some((v) => v < 0)) {
      setDp({ refused: 'The table needs non-negative numbers and target; use brute force for these.' });
      setCaption(<>The DP table indexes sums from 0 to the target, so it needs non-negative numbers. Use brute force here.</>);
      return;
    }
    const cells = dpCells(inst.numbers.length, inst.target);
    if (cells > DP_RUN_LIMIT) {
      setDp({ refused: `The table would need ${cells.toLocaleString('en')} cells; that is the pseudo-polynomial cost of a big target.` });
      setCaption(<>A target of {inst.target.toLocaleString('en')} needs a {cells.toLocaleString('en')}-cell table: the cost follows the target's value. See the pseudo-polynomial trap scene.</>);
      return;
    }
    const r = dpSolve(inst.numbers, inst.target);
    setDp(r);
    setCaption(dpCaption(r.cells, inst.numbers.length, r.possible));
  };

  const live = brute.state && !brute.state.done ? maskToChosen(brute.state.mask, inst.numbers.length) : null;
  const found = brute.state?.done && brute.state.first !== null ? maskToChosen(brute.state.first, inst.numbers.length) : null;
  const cellState = (i: number): ArrayCellState => {
    if (live) return live[i] ? 'active' : 'idle';
    if (check) return chosen[i] ? (check.ok ? 'done' : 'bad') : 'dim';
    if (found && !chosen.some(Boolean)) return found[i] ? 'done' : 'dim';
    return chosen[i] ? 'active' : 'idle';
  };
  const rows = Array.from({ length: Math.ceil(inst.numbers.length / STRIP_ROW) }, (_, r) => r * STRIP_ROW);
  const total = 2 ** inst.numbers.length;

  return (
    <StageFrame
      height={460}
      stats={
        <Stats>
          <Stat label="n" value={inst.numbers.length} color="var(--muted)" sub={`target ${inst.target.toLocaleString('en')}`} />
          <Stat label="Verify" value={`${check ? check.steps : inst.numbers.length} steps`} color="var(--ok)" sub="one pass: n" />
          <Stat label="Solve (brute force)" value={brute.state ? brute.state.tried.toLocaleString('en') : '0'} color="var(--orange)" sub={`of ${power(inst.numbers.length)} = ${total.toLocaleString('en')}`} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'chosen / subset being tried', shape: 'square' },
            { color: 'var(--ok)', label: 'check passed', shape: 'square' },
            { color: 'var(--bad)', label: 'check failed', shape: 'square' },
            { color: 'var(--orange)', label: 'brute force (costly)', shape: 'line' },
            { color: 'var(--ok)', label: 'verify (cheap)', shape: 'line' },
          ]}
        />
      }
      controls={[
        picker,
        <>
          <Segmented label="n" value={n} onChange={(k: number) => loadSeeded(k, seed)} options={SIZES.map((k) => ({ value: k, label: String(k) }))} />
          <Button onClick={() => loadSeeded(n, seed + 1)}>New numbers</Button>
          <Toggle label="Solver" value={useDp} onChange={setUseDp} off="Brute force" on="DP table" />
        </>,
        <>
          <TextField label="Your numbers" value={numText} onChange={setNumText} onEnter={loadCustom} placeholder="3, 34, 4, 12, 5, 2" width={220} />
          <TextField label="Target" value={targetText} onChange={setTargetText} onEnter={loadCustom} placeholder="9" width={90} />
          <Button onClick={loadCustom}>Use these</Button>
          {error ? <Hint tone="muted">{error}</Hint> : <Hint>Up to {MAX_ITEMS} whole numbers within ±{MAX_ABS.toLocaleString('en')}.</Hint>}
        </>,
      ]}
    >
      <div className="pn stage-pad">
        <p className="pn-target">
          Is there a subset that adds up to <b>{inst.target.toLocaleString('en')}</b>? {custom ? 'Your numbers.' : 'Seeded random numbers; the target is the sum of a random subset.'}
        </p>
        {rows.map((from) => (
          <ArrayStrip
            key={from}
            values={inst.numbers.slice(from, from + STRIP_ROW)}
            cellMax={64}
            cellState={(i) => cellState(from + i)}
            onCellClick={(i) => toggle(from + i)}
            cellTitle={(i) => `${chosen[from + i] ? 'Remove' : 'Add'} ${inst.numbers[from + i]}`}
            className="pn-strip"
          />
        ))}
        <div className="pn-actions">
          <Button variant="primary" onClick={runVerify}>
            Verify my subset
          </Button>
          <Button onClick={runSolve} disabled={brute.running}>
            {useDp ? 'Solve with the DP table' : brute.running ? 'Solving…' : `Solve: try all ${total.toLocaleString('en')}`}
          </Button>
          <Button onClick={reset}>Clear</Button>
        </div>
        <div className="pn-row">
          <Plot2D
            x={{ domain: [1, 60], label: 'n' }}
            y={{ domain: [1, 2 ** 60], log: true, label: 'steps', tickValues: [1, 1e3, 1e6, 1e9, 1e12, 1e15, 1e18] }}
            ariaLabel="Steps to verify (n) and to brute-force (2 to the n) as n grows, log scale"
          >
            <Curve fn={(x) => 2 ** x} tone="orange" />
            <Curve fn={(x) => x} tone="ok" />
            <VLine at={inst.numbers.length} label={`n = ${inst.numbers.length}`} tone="hi" />
          </Plot2D>
          <div className="pn-side">
            {useDp && dp && 'refused' in dp && <p className="pn-note">{dp.refused}</p>}
            {useDp && dp && !('refused' in dp) && dp.cells <= TABLE_CELL_LIMIT && (
              <WideRegion minWidth={Math.min(520, 40 + (inst.target + 1) * 23)} label="DP table: scroll sideways to see all of it">
                <CellGrid
                  rows={dp.reach.length}
                  cols={inst.target + 1}
                  size="sm"
                  rowLabels={['∅', ...inst.numbers.map(String)]}
                  colLabels={Array.from({ length: inst.target + 1 }, (_, s) => (s % 5 === 0 || s === inst.target ? String(s) : ''))}
                  cell={(r, s) => (dp.reach[r][s] ? { tone: s === inst.target ? 'ok' : 'info', fill: 'tint', intensity: 0.5 } : { tone: 'dim', fill: 'outline' })}
                  ariaLabel="DP table: row i, column s is filled when some of the first i numbers sum to s"
                />
              </WideRegion>
            )}
            {useDp && dp && !('refused' in dp) && dp.cells > TABLE_CELL_LIMIT && <p className="pn-note">The table has {dp.cells.toLocaleString('en')} cells, too many to draw; its answer is in the caption.</p>}
            <Hint tone="muted" block>
              The orange curve is 2ⁿ, the green one n, on a log scale. Extrapolated times are from this browser's measured rate, drawing included.
            </Hint>
          </div>
        </div>
      </div>
    </StageFrame>
  );
}

/* ---------- scene 2: the pseudo-polynomial trap ---------- */

function DpScene({ picker }: { picker: ReactNode }) {
  const [digits, setDigits] = useState(1);
  const setCaption = useSetCaption();
  const inst = useMemo(() => trapInstance(digits), [digits]);
  const cells = dpCells(TRAP_N, inst.target);
  const solved = useMemo(() => (cells <= DP_RUN_LIMIT ? dpSolve(inst.numbers, inst.target).possible : null), [cells, inst]);
  const bruteAnswer = useMemo(() => createSolver(inst.numbers, inst.target).advance(Infinity).hits > 0, [inst]);
  const curve = useMemo(
    () => Array.from({ length: MAX_DIGITS }, (_, i) => {
      const t = trapInstance(i + 1);
      return { d: i + 1, cells: dpCells(TRAP_N, t.target), input: inputDigits(t) };
    }),
    [],
  );
  useIntroCaption(<>Same {TRAP_N} numbers' worth of input, more digits each: the DP table's size follows the target's value.</>);

  const move = (d: number) => {
    setDigits(d);
    const t = trapInstance(d);
    const c = dpCells(TRAP_N, t.target);
    setCaption(
      <>
        {d} digit{d === 1 ? '' : 's'} per number: the input is {inputDigits(t)} digits long, but the table needs {c.toLocaleString('en')} cells, about 10× more per extra digit. Polynomial in the target's <i>value</i>, exponential in its <i>length</i>: pseudo-polynomial, so this doesn't put subset sum in P. Brute force stays at {power(TRAP_N)} = {2 ** TRAP_N} subsets for these {TRAP_N} numbers.
      </>,
      { quiet: true },
    );
  };

  return (
    <StageFrame
      height={420}
      stats={
        <Stats>
          <Stat label="Input length" value={`${inputDigits(inst)} digits`} color="var(--violet)" />
          <Stat label="DP table" value={`${cells.toLocaleString('en')} cells`} color="var(--orange)" />
          <Stat label="Brute force" value={`${(2 ** TRAP_N).toLocaleString('en')} subsets`} color="var(--sky)" sub={`${power(TRAP_N)}, n fixed`} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--orange)', label: 'DP table cells', shape: 'line' },
            { color: 'var(--sky)', label: 'brute-force subsets', shape: 'line' },
            { color: 'var(--violet)', label: 'input length (digits)', shape: 'line' },
            { color: 'var(--hi)', label: 'digits chosen', shape: 'line' },
          ]}
        />
      }
      controls={[
        picker,
        <>
          <Slider label="Digits per number" value={digits} min={1} max={MAX_DIGITS} onChange={move} />
        </>,
      ]}
    >
      <div className="pn stage-pad">
        <p className="pn-target">
          {TRAP_N} numbers: {inst.numbers.map((v) => v.toLocaleString('en')).join(', ')}. Target {inst.target.toLocaleString('en')}.
        </p>
        <div className="pn-row">
          <Plot2D
            x={{ domain: [1, MAX_DIGITS], label: 'digits per number' }}
            y={{ domain: [1, 1e11], log: true, label: 'work' }}
            ariaLabel="DP cells, brute-force subsets and input length as the digits grow, log scale"
          >
            <Curve points={curve.map((c) => [c.d, c.cells] as const)} tone="orange" />
            <Curve points={curve.map((c) => [c.d, 2 ** TRAP_N] as const)} tone="sky" />
            <Curve points={curve.map((c) => [c.d, c.input] as const)} tone="violet" />
            <Points data={[{ x: digits, y: cells, tone: 'hi' }]} />
            <VLine at={digits} tone="hi" />
          </Plot2D>
          <Box className="pn-side">
            <SectionTitle>Both solvers, run for real</SectionTitle>
            <p className="pn-note">
              Brute force: {bruteAnswer ? 'a subset exists' : 'no subset'} ({2 ** TRAP_N} subsets tried).{' '}
              {solved === null ? `DP: ${cells.toLocaleString('en')} cells is past this lesson's limit of ${DP_RUN_LIMIT.toLocaleString('en')}, so it is counted, not built.` : `DP: ${solved ? 'a subset exists' : 'no subset'}, after filling ${cells.toLocaleString('en')} cells.`}
            </p>
            <p className="pn-note">Complexity is measured against the length of the input. The table is polynomial in n and the target's value, but writing a number with one more digit makes it 10× bigger.</p>
          </Box>
        </div>
      </div>
    </StageFrame>
  );
}

/* ---------- scene 3: the class map ---------- */

const MAP_W = 480;
const MAP_H = 300;
const NP_E = { cx: 175, cy: 152, rx: 150, ry: 122 };
const NPH_E = { cx: 352, cy: 152, rx: 116, ry: 140 };
const P_E = { cx: 115, cy: 160, rx: 70, ry: 62 };
const REGION_TONE: Record<Region, string> = { P: 'info', NP: 'violet', NPC: 'hi', NPH: 'orange' };
const REGION_LABEL_AT: Record<Region, { x: number; y: number }> = { P: { x: 115, y: 132 }, NP: { x: 160, y: 56 }, NPC: { x: 278, y: 70 }, NPH: { x: 392, y: 46 } };
const REGIONS: readonly Region[] = ['P', 'NP', 'NPC', 'NPH'];

function ClassScene({ picker }: { picker: ReactNode }) {
  const [selected, setSelected] = useState<string | null>(CHIPS[0].id);
  const [placed, setPlaced] = useState<Record<string, Region>>({});
  const [feedback, setFeedback] = useState<{ correct: boolean; text: string } | null>(null);
  const setCaption = useSetCaption();
  useIntroCaption(<>Pick a problem chip, then click the region it belongs in. Every problem here is its yes/no version.</>);

  const place = (region: Region) => {
    const chip = CHIPS.find((c) => c.id === selected);
    if (!chip) return;
    const fb = placementFeedback(chip, region);
    setPlaced({ ...placed, [chip.id]: region });
    setFeedback(fb);
    setCaption(
      <>
        {chip.label} → {REGION_NAMES[region]}: <span className={`hl ${fb.correct ? 'ok' : 'bad'}`}>{fb.correct ? 'right' : 'not quite'}</span>. {fb.text}
      </>,
    );
    const next = CHIPS.find((c) => c.id !== chip.id && (!(c.id in placed) || placementFeedback(c, placed[c.id]).correct === false));
    if (fb.correct) setSelected(next?.id ?? null);
  };
  const right = CHIPS.filter((c) => c.id in placed && placementFeedback(c, placed[c.id]).correct).length;
  const regionProps = (r: Region) => ({
    role: 'button',
    tabIndex: 0,
    'aria-label': `Place in ${REGION_NAMES[r]}`,
    onClick: () => place(r),
    onKeyDown: (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        place(r);
      }
    },
  });

  return (
    <StageFrame
      height={420}
      stats={
        <Stats>
          <Stat label="Placed right" value={`${right} of ${CHIPS.length}`} color="var(--ok)" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'P', shape: 'line' },
            { color: 'var(--violet)', label: 'NP', shape: 'line' },
            { color: 'var(--hi)', label: 'NP-complete', shape: 'line' },
            { color: 'var(--orange)', label: 'NP-hard', shape: 'line' },
            { color: 'var(--bad)', label: 'misplaced chip', shape: 'square' },
          ]}
        />
      }
      controls={[picker, <Hint key="h">Pick a chip, then a region (click it in the picture or use the region buttons).</Hint>]}
    >
      <div className="pn stage-pad">
        <div className="pn-chips" role="group" aria-label="Problems">
          {CHIPS.map((c) => {
            const at = placed[c.id];
            const tone = at ? (placementFeedback(c, at).correct ? 'ok' : 'bad') : 'info';
            return (
              <ChipButton key={c.id} tone={tone} on={selected === c.id} onStyle="solid" onClick={() => setSelected(c.id)} title={c.question}>
                {c.label}
                {at ? ` · ${REGION_NAMES[at]}` : ''}
              </ChipButton>
            );
          })}
        </div>
        {selected && <p className="pn-note">{CHIPS.find((c) => c.id === selected)!.question}</p>}
        <WideRegion minWidth={460} label="Class map: scroll sideways to see all of it">
          <svg viewBox={`0 0 ${MAP_W} ${MAP_H}`} className="pn-map" role="group" aria-label="Complexity classes, drawn assuming P ≠ NP">
            <defs>
              <clipPath id="pn-np-clip">
                <ellipse {...NP_E} />
              </clipPath>
            </defs>
            <ellipse {...NP_E} className="pn-region tone-violet" {...regionProps('NP')} />
            <ellipse {...NPH_E} className="pn-region tone-orange" {...regionProps('NPH')} />
            <ellipse {...NPH_E} clipPath="url(#pn-np-clip)" className="pn-region tone-hi is-overlap" {...regionProps('NPC')} />
            <ellipse {...P_E} className="pn-region tone-info" {...regionProps('P')} />
            {REGIONS.map((r) => (
              <text key={r} x={REGION_LABEL_AT[r].x} y={REGION_LABEL_AT[r].y} className={`pn-region-label tone-${REGION_TONE[r]}`} textAnchor="middle">
                {REGION_NAMES[r]}
              </text>
            ))}
            {REGIONS.map((r) => {
              const here = CHIPS.filter((c) => placed[c.id] === r);
              const at = REGION_LABEL_AT[r];
              return here.map((c, i) => (
                <text key={c.id} x={at.x} y={at.y + 18 + i * 15} className={`pn-placed ${placementFeedback(c, r).correct ? 'is-ok' : 'is-bad'}`} textAnchor="middle">
                  {c.label.replace(' (decision)', '')}
                </text>
              ));
            })}
          </svg>
        </WideRegion>
        <ControlGroup label="Place the chosen chip in" inline>
          {REGIONS.map((r) => (
            <Button key={r} onClick={() => place(r)} disabled={!selected}>
              {REGION_NAMES[r]}
            </Button>
          ))}
        </ControlGroup>
        {feedback && <p className={`pn-feedback tone-${feedback.correct ? 'ok' : 'bad'}`}>{feedback.text}</p>}
        <Hint tone="muted" block>
          The nested picture assumes P ≠ NP, which nobody has proven; if P = NP, the regions collapse into one. NP means "a yes answer can be checked in polynomial time", not "not polynomial".
        </Hint>
      </div>
    </StageFrame>
  );
}

/* ---------- scene 4: spot it at work ---------- */

function SpotScene({ picker }: { picker: ReactNode }) {
  const [picks, setPicks] = useState<Record<string, string>>({});
  useIntroCaption(<>Three everyday tasks. Tag each with the known problem it really is.</>);
  return (
    <StageFrame height={380} controls={[picker]}>
      <div className="pn stage-pad pn-cards">
        {SCENARIOS.map((s) => {
          const pick = picks[s.id];
          const ok = pick === s.maps;
          return (
            <Box key={s.id} className={`pn-card ${pick ? `tone-${ok ? 'ok' : 'bad'}` : ''}`}>
              <SectionTitle>{s.title}</SectionTitle>
              <p className="pn-story">{s.story}</p>
              <div className="pn-chips" role="group" aria-label={`${s.title}: which problem is it?`}>
                {MAPPINGS.map((m) => (
                  <ChipButton key={m} on={pick === m} tone={pick === m ? (ok ? 'ok' : 'bad') : 'info'} onStyle="solid" onClick={() => setPicks((prev) => ({ ...prev, [s.id]: m }))}>
                    {m}
                  </ChipButton>
                ))}
              </div>
              {pick && (ok ? <p className="pn-note"><b>Probably NP-hard: use a heuristic or an approximation.</b> {s.advice}</p> : <p className="pn-note pn-wrong">Not quite: {pick} doesn't capture it. Look for what has to fit together or what is being chosen.</p>)}
            </Box>
          );
        })}
      </div>
    </StageFrame>
  );
}
