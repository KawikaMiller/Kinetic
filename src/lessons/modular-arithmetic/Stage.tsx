import { useMemo, useState, type ReactNode } from 'react';
import { CellGrid } from '../../components/CellGrid';
import { Box, SectionTitle } from '../../components/Panel';
import { useScenePicker } from '../../components/ScenePicker';
import { StageFrame } from '../../components/StageFrame';
import { Button, Hint, Legend, Slider, Stat, Stats, TextField } from '../../components/ui';
import { WideRegion } from '../../components/WideRegion';
import { useIntroCaption, useSetCaption } from '../../core/caption';
import { usePlayer } from '../../core/usePlayer';
import { cellCaption, clockFrames, equation, tableCaption, type ClockFrame, type Op } from './frames';
import {
  DEFAULT_MOD, MAX_ABS, MAX_MOD, MIN_MOD, RING_ITEMS, RING_SIZE, decompositions, fmt, gcdN, inverseInTable, jsRemainder,
  modN, parseWhole, productTable, ringNext, ringPrevBuggy, ringPrevFixed, rowsWithoutInverse,
} from './model';
import './styles.css';

type Scene = 'clock' | 'table' | 'negatives';
const SCENES: { value: Scene; label: string }[] = [
  { value: 'clock', label: 'Clock' },
  { value: 'table', label: 'Inverses' },
  { value: 'negatives', label: 'Negatives' },
];
const STEP_MS = 600;
const LIVE_NOTE = 'Nothing simulated: every number here is computed live.';

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({ label: 'Tool', options: SCENES, initial: 'clock' });
  const [n, setN] = useState(DEFAULT_MOD);
  if (scene === 'table') return <TableScene picker={picker} n={n} setN={setN} />;
  if (scene === 'negatives') return <NegativesScene picker={picker} />;
  return <ClockScene picker={picker} n={n} setN={setN} />;
}

interface SceneProps {
  picker: ReactNode;
  n: number;
  setN: (n: number) => void;
}

// ── Clock ────────────────────────────────────────────────────────────

interface Move {
  op: Op;
  from: number;
  a: number;
}

function ClockScene({ picker, n, setN }: SceneProps) {
  const [hand, setHand] = useState(0);
  const [move, setMove] = useState<Move | null>(null);
  const [aText, setAText] = useState('17');
  const parsed = parseWhole(aText, -MAX_ABS, MAX_ABS);

  const idle = useMemo<ClockFrame[]>(
    () => [{ pos: hand, trail: [], say: <>A clock of {n}: numbers 0 to {n - 1}, and after {n - 1} comes 0 again. Type an amount and press
      + or ×.</> }],
    [hand, n],
  );
  const frames = useMemo(() => (move ? clockFrames(move.op, move.from, move.a, n).frames : idle), [move, n, idle]);
  const player = usePlayer(frames, { interval: STEP_MS, autoplayOnChange: move !== null, keyboard: move !== null });
  const { pos, trail } = player.frame;

  const run = (op: Op) => {
    if (!('value' in parsed)) return;
    const a = parsed.value;
    setMove({ op, from: hand, a });
    setHand(modN(op === 'plus' ? hand + a : hand * a, n));
  };
  const changeN = (next: number) => {
    setN(next);
    setHand(modN(hand, next));
    setMove(null);
  };
  const reset = () => {
    setHand(0);
    setMove(null);
  };

  return (
    <StageFrame
      player={move ? player : undefined}
      height={300}
      stats={
        <Stats>
          <Stat label="Hand at" value={pos} color="var(--hi)" />
          <Stat
            label="Equation"
            value={move ? (player.atEnd ? equation(move.op, move.from, move.a, n) : 'walking…') : '–'}
            sub={move ? `${move.from} ${move.op === 'plus' ? '+' : '×'} ${fmt(move.a)}` : 'nothing yet'}
          />
          <Stat label="Steps walked" value={trail.length} color="var(--info)" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'hand and where it points now', shape: 'dot' },
            { color: 'var(--info)', label: 'positions walked through', shape: 'dot' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Slider label="Modulus n" value={n} min={MIN_MOD} max={MAX_MOD} onChange={changeN} />
        </>,
        <>
          <TextField label="Amount a" value={aText} onChange={setAText} onEnter={() => run('plus')} width={110} spellCheck={false} />
          <Button variant="primary" onClick={() => run('plus')} disabled={!('value' in parsed)}>+ a</Button>
          <Button onClick={() => run('times')} disabled={!('value' in parsed)}>× a</Button>
          <Button onClick={reset}>Reset to 0</Button>
          {'error' in parsed && <Hint className="ma-error">{parsed.error} The clock keeps its last value.</Hint>}
        </>,
      ]}
    >
      <div className="stage-pad ma-clock-wrap">
        <ClockFace n={n} pos={pos} trail={trail} />
        <Hint className="ma-note">{LIVE_NOTE}</Hint>
      </div>
    </StageFrame>
  );
}

const FACE = { size: 260, rim: 96, label: 117 };

function ClockFace({ n, pos, trail }: { n: number; pos: number; trail: number[] }) {
  const c = FACE.size / 2;
  const at = (k: number, r: number) => {
    const t = (2 * Math.PI * k) / n - Math.PI / 2;
    return { x: c + r * Math.cos(t), y: c + r * Math.sin(t) };
  };
  const walked = new Set(trail);
  const tip = at(pos, FACE.rim - 16);
  return (
    <svg viewBox={`0 0 ${FACE.size} ${FACE.size}`} className="ma-clock" role="img" aria-label={`Clock of ${n}, hand at ${pos}`}>
      <circle cx={c} cy={c} r={FACE.rim} className="ma-rim" />
      {Array.from({ length: n }, (_, k) => {
        const dot = at(k, FACE.rim);
        const label = at(k, FACE.label);
        const cls = k === pos ? 'is-now' : walked.has(k) ? 'is-walked' : '';
        return (
          <g key={k} className={`ma-tick ${cls}`}>
            <circle cx={dot.x} cy={dot.y} r={k === pos ? 7 : 5} />
            <text x={label.x} y={label.y + 4} textAnchor="middle">{k}</text>
          </g>
        );
      })}
      <line x1={c} y1={c} x2={tip.x} y2={tip.y} className="ma-hand" />
      <circle cx={c} cy={c} r={5} className="ma-hub" />
    </svg>
  );
}

// ── Inverses table ───────────────────────────────────────────────────

const CELL_PITCH = 24;
const LABEL_CHAR_W = 6.2;
const TABLE_MIN_WIDTH = 520;

function TableScene({ picker, n, setN }: SceneProps) {
  const table = useMemo(() => productTable(n), [n]);
  const [picked, setPicked] = useState<{ a: number; b: number } | null>(null);
  const setCaption = useSetCaption();
  const missing = rowsWithoutInverse(table);
  const noInverse = new Set(missing);
  const size = n - 1;
  const natural = String(size).length * LABEL_CHAR_W + 8 + size * CELL_PITCH;

  useIntroCaption(tableCaption(table, n), [n]);

  const changeN = (next: number) => {
    setN(next);
    setPicked(null);
  };
  const pick = (r: number, c: number) => {
    setPicked({ a: r + 1, b: c + 1 });
    setCaption(cellCaption(table, n, r + 1, c + 1));
  };
  const labels = Array.from({ length: size }, (_, i) => String(i + 1));

  return (
    <StageFrame
      height={300}
      stats={
        <Stats>
          <Stat label="Modulus" value={n} />
          <Stat label="Have an inverse" value={size - missing.length} color="var(--ok)" sub="rows with a 1" />
          <Stat label="No inverse" value={missing.length} color="var(--muted)" sub={missing.length ? `gcd(a, ${n}) > 1` : `${n} is prime`} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--ok)', label: 'product is 1: an inverse pair' },
            { color: 'color-mix(in srgb, var(--info) 60%, transparent)', label: 'other products, deeper blue = bigger' },
            { color: 'var(--dim)', label: 'row with no 1: no inverse' },
            { color: 'var(--hi)', label: 'the cell you picked', shape: 'line' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Slider label="Modulus n" value={n} min={MIN_MOD} max={MAX_MOD} onChange={changeN} />
        </>,
      ]}
    >
      <div className="stage-pad ma-table">
        <SectionTitle hint="row a, column b: (a × b) mod n. Click a cell.">Multiplication mod {n}</SectionTitle>
        <WideRegion minWidth={Math.min(natural, TABLE_MIN_WIDTH)} hint="swipe to see the whole table">
          <CellGrid
            rows={size}
            cols={size}
            size="sm"
            rowLabels={labels}
            colLabels={labels}
            ariaLabel={`Multiplication table mod ${n}`}
            onCellClick={pick}
            cell={(r, c) => {
              const v = table[r][c];
              if (v === 1) return { tone: 'ok', fill: 'solid', text: v };
              if (noInverse.has(r + 1)) return { tone: 'dim', fill: 'tint', intensity: 0.3, text: v };
              return { tone: 'info', fill: 'tint', intensity: 0.08 + (0.6 * v) / (n - 1), text: v };
            }}
            cellTitle={(r, c) => `${r + 1} × ${c + 1} mod ${n} = ${table[r][c]}`}
            cellAriaLabel={(r, c) => `${r + 1} times ${c + 1} mod ${n} is ${table[r][c]}`}
            highlight={picked ? [{ r: picked.a - 1, c: picked.b - 1, tone: 'hi' }] : []}
          />
        </WideRegion>
        {picked && <PickedRow table={table} n={n} a={picked.a} />}
        <Hint className="ma-note">
          {LIVE_NOTE} 0 is left out: 0 × anything is 0, so it never has an inverse.
        </Hint>
      </div>
    </StageFrame>
  );
}

function PickedRow({ table, n, a }: { table: number[][]; n: number; a: number }) {
  const inv = inverseInTable(table, a);
  return (
    <p className="ma-picked">
      Row {a}: gcd({a}, {n}) = {gcdN(a, n)} → {inv === null ? <span className="ma-none">no inverse</span> : <span className="hl ok">{a}⁻¹ = {inv}</span>}
    </p>
  );
}

// ── Negatives ────────────────────────────────────────────────────────

function NegativesScene({ picker }: { picker: ReactNode }) {
  const [aText, setAText] = useState('-7');
  const [nText, setNText] = useState('3');
  const [values, setValues] = useState({ a: -7, n: 3 });
  const [i, setI] = useState(0);
  const setCaption = useSetCaption();
  const pa = parseWhole(aText, -MAX_ABS, MAX_ABS);
  const pn = parseWhole(nText, MIN_MOD, MAX_ABS);

  useIntroCaption(
    <>In JavaScript, <code>-7 % 3</code> is <span className="hl orange">−1</span>, not 2: <code>%</code> is a remainder that keeps
      the sign of the left side. A true mod always lands in 0 to n − 1.</>,
  );

  const typeA = (t: string) => {
    setAText(t);
    const p = parseWhole(t, -MAX_ABS, MAX_ABS);
    if ('value' in p) setValues((v) => ({ ...v, a: p.value }));
  };
  const typeN = (t: string) => {
    setNText(t);
    const p = parseWhole(t, MIN_MOD, MAX_ABS);
    if ('value' in p) setValues((v) => ({ ...v, n: p.value }));
  };

  const { a, n } = values;
  const js = jsRemainder(a, n);
  const m = modN(a, n);
  const d = decompositions(a, n);

  const back = () => {
    const buggy = ringPrevBuggy(i, RING_SIZE);
    const fixed = ringPrevFixed(i, RING_SIZE);
    setI(fixed);
    setCaption(
      buggy < 0 ? (
        <>From slot 0, <code>(i - 1) % {RING_SIZE}</code> was <span className="hl bad">{buggy}</span>, and <code>buf[{buggy}]</code> is
          undefined. The fix, <code>((i - 1) % n + n) % n</code>, wrapped to <span className="hl">{fixed}</span>.</>
      ) : (
        <>From slot {i}, both formulas gave {fixed}: the bug only bites when i − 1 goes negative.</>
      ),
    );
  };
  const forward = () => {
    const next = ringNext(i, RING_SIZE);
    setI(next);
    setCaption(<>Forward is safe either way: <code>(i + 1) % {RING_SIZE}</code> = {next}, never negative.</>);
  };
  const buggyPrev = ringPrevBuggy(i, RING_SIZE);
  const fixedPrev = ringPrevFixed(i, RING_SIZE);

  return (
    <StageFrame
      height={300}
      stats={
        <Stats>
          <Stat label={`${fmt(a)} % ${fmt(n)}`} value={fmt(js)} color={js !== m ? 'var(--orange)' : undefined} sub="JavaScript remainder" />
          <Stat label={`mod(${fmt(a)}, ${fmt(n)})`} value={fmt(m)} color="var(--ok)" sub={`always 0 to ${fmt(n - 1)}`} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--orange)', label: '% result that differs from mod' },
            { color: 'var(--ok)', label: 'true mod result' },
            { color: 'var(--hi)', label: 'ring slot i, now' },
            { color: 'var(--bad)', label: 'index outside the buffer' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <TextField label="a" value={aText} onChange={typeA} width={110} spellCheck={false} />
          <TextField label="n" value={nText} onChange={typeN} width={110} spellCheck={false} />
          {'error' in pa && <Hint className="ma-error">a: {pa.error} Showing {fmt(a)}.</Hint>}
          {'error' in pn && <Hint className="ma-error">n: {pn.error} Showing {fmt(n)}.</Hint>}
        </>,
        <>
          <Button onClick={back}>← Step back</Button>
          <Button onClick={forward}>Step forward →</Button>
        </>,
      ]}
    >
      <div className="stage-pad ma-neg">
        <Box className="ma-split">
          <SectionTitle hint="the same a = q·n + r, two ways to pick q">Remainder vs mod</SectionTitle>
          <p className={`ma-row ${js !== m ? 'is-diff' : ''}`}>
            <code>{fmt(a)} % {fmt(n)}</code> → {fmt(js)} <span className="ma-why">{fmt(a)} = ({fmt(d.js.q)})·{fmt(n)} + ({fmt(d.js.r)}): q rounded toward zero</span>
          </p>
          <p className="ma-row is-mod">
            <code>mod({fmt(a)}, {fmt(n)})</code> → {fmt(m)} <span className="ma-why">{fmt(a)} = ({fmt(d.mod.q)})·{fmt(n)} + {fmt(d.mod.r)}: q rounded down</span>
          </p>
          <p className="ma-fix"><code>const mod = (a, n) =&gt; ((a % n) + n) % n;</code></p>
        </Box>
        <Box className="ma-ring-box">
          <SectionTitle hint={`${RING_SIZE} slots; what stepping back from slot ${i} would read`}>Ring buffer</SectionTitle>
          <ol className="ma-ring" aria-label={`Ring buffer, slot ${i} is current`}>
            {RING_ITEMS.map((item, k) => (
              <li key={item} className={k === i ? 'is-now' : ''}>
                <span className="ma-slot">{k}</span>
                {item}
              </li>
            ))}
          </ol>
          <p className={`ma-row ${buggyPrev < 0 ? 'is-bad' : ''}`}>
            <code>buf[(i - 1) % {RING_SIZE}]</code> → buf[{buggyPrev}] = {buggyPrev < 0 ? 'undefined' : RING_ITEMS[buggyPrev]}
          </p>
          <p className="ma-row is-mod">
            <code>buf[((i - 1) % n + n) % n]</code> → buf[{fixedPrev}] = {RING_ITEMS[fixedPrev]}
          </p>
        </Box>
        <Hint className="ma-note">{LIVE_NOTE} The % results come from JavaScript's own operator in your browser.</Hint>
      </div>
    </StageFrame>
  );
}
