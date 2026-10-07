import { useMemo, useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { useScenePicker } from '../../components/ScenePicker';
import { StageFrame } from '../../components/StageFrame';
import { Button, ChipButton, ControlGroup, Hint, Legend, Stat, Stats, TextField } from '../../components/ui';
import { WideRegion } from '../../components/WideRegion';
import { usePlayer } from '../../core/usePlayer';
import type { Tone } from '../../core/tone';
import { extendedFrames, group, inverseCaption, signed, tilingFrames } from './frames';
import {
  bezoutRows, euclid, isConsecutiveFibonacci, leftover, naiveTrials, pairError, parseValue, tiling, worstSteps, type Run,
} from './model';
import './styles.css';

type Scene = 'tiling' | 'extended';
const SCENES: { value: Scene; label: string }[] = [
  { value: 'tiling', label: 'Tiling' },
  { value: 'extended', label: 'Extended & inverse' },
];
const STEP_MS = 900;

interface Pair {
  a: number;
  b: number;
}

const PRESETS: { pair: Pair; label: string }[] = [
  { pair: { a: 1071, b: 462 }, label: '1071, 462' },
  { pair: { a: 17, b: 5 }, label: '17, 5' },
  { pair: { a: 89, b: 55 }, label: '89, 55 (Fibonacci)' },
  { pair: { a: 462, b: 1071 }, label: '462, 1071 (a < b)' },
  { pair: { a: 35, b: 0 }, label: '35, 0' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({ label: 'Tool', options: SCENES, initial: 'tiling' });
  const [pair, setPair] = useState<Pair>(PRESETS[0].pair);
  const inputs = <PairInputs pair={pair} setPair={setPair} />;
  if (scene === 'extended') return <ExtendedScene picker={picker} inputs={inputs} pair={pair} />;
  return <TilingScene picker={picker} inputs={inputs} pair={pair} />;
}

/** The two number fields and the presets. The pair only changes when both parse and they aren't both 0. */
function PairInputs({ pair, setPair }: { pair: Pair; setPair: (p: Pair) => void }) {
  const [aText, setAText] = useState(String(pair.a));
  const [bText, setBText] = useState(String(pair.b));
  const [shownFor, setShownFor] = useState(pair);
  if (shownFor !== pair) {
    setShownFor(pair);
    setAText(String(pair.a));
    setBText(String(pair.b));
  }
  const pa = parseValue(aText);
  const pb = parseValue(bText);
  const both = 'value' in pa && 'value' in pb ? pairError(pa.value, pb.value) : null;
  const next = 'value' in pa && 'value' in pb && !both ? { a: pa.value, b: pb.value } : null;
  const apply = () => {
    if (next) setPair(next);
  };
  const error = 'error' in pa ? `a: ${pa.error}` : 'error' in pb ? `b: ${pb.error}` : both;
  return (
    <>
      <TextField label="a" value={aText} onChange={setAText} onEnter={apply} width={150} spellCheck={false} />
      <TextField label="b" value={bText} onChange={setBText} onEnter={apply} width={150} spellCheck={false} />
      <Button variant="primary" onClick={apply} disabled={!next || (next.a === pair.a && next.b === pair.b)}>Run Euclid</Button>
      <ControlGroup label="Try">
        {PRESETS.map((p) => (
          <ChipButton key={p.label} on={p.pair.a === pair.a && p.pair.b === pair.b} onClick={() => setPair(p.pair)}>
            {p.label}
          </ChipButton>
        ))}
      </ControlGroup>
      {error && <Hint className="ge-error">{error} Still showing {group(pair.a)}, {group(pair.b)}.</Hint>}
    </>
  );
}

interface SceneProps {
  picker: ReactNode;
  inputs: ReactNode;
  pair: Pair;
}

// ── Tiling ───────────────────────────────────────────────────────────

const STEP_TONES: readonly Tone[] = ['orange', 'sky', 'pink'];
/** Square classes: the step's categorical tone, or --hi for the square being placed now. */
const squareClass = (tone: Tone, now: boolean) => `ge-sq ${now ? 'tone-hi is-now' : `tone-${tone}`}`;

function TilingScene({ picker, inputs, pair }: SceneProps) {
  const { a, b } = pair;
  const frames = useMemo(() => tilingFrames(a, b), [a, b]);
  const player = usePlayer(frames, { interval: STEP_MS });
  const { g, rows } = useMemo(() => euclid(a, b), [a, b]);
  const { row } = player.frame;
  const finished = row >= rows.length;
  const stepsDone = finished ? rows.length : Math.max(0, row + 1);
  const fib = isConsecutiveFibonacci(a, b);

  return (
    <StageFrame
      player={player}
      height={320}
      stats={
        <Stats>
          <Stat label="gcd" value={finished ? group(g) : '?'} color="var(--ok)" />
          <Stat label="Euclid divisions" value={`${stepsDone} / ${rows.length}`} color="var(--hi)" sub={`slowest pair with a ≥ b up to ${group(Math.max(a, b))}: ${worstSteps(Math.max(a, b))}`} />
          <Stat label="Naive trials" value={group(naiveTrials(a, b))} sub="try every d from 1 to the smaller" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'square being placed' },
            { color: 'var(--orange)', label: 'placed squares, one colour per step (orange, sky, pink)' },
            { color: 'color-mix(in srgb, var(--info) 35%, transparent)', label: 'what is left to tile' },
            { color: 'var(--ok)', label: 'the gcd squares' },
          ]}
        />
      }
      controls={[<>{picker}</>, inputs]}
    >
      <div className="stage-pad ge-tiling">
        {a === 0 || b === 0 ? (
          <p className="ge-zero">gcd({group(a)}, {group(b)}) = {group(g)}: with a 0 there's no rectangle to tile.</p>
        ) : (
          <TilingSvg a={a} b={b} row={row} placed={player.frame.placed} finished={finished} />
        )}
        {fib && (
          <Hint tone="muted" className="ge-fib">
            Neighbouring Fibonacci numbers: every quotient but the last is 1, so the remainders shrink as slowly as they can.
            That's Euclid's slowest case for numbers this size, and it's still only {rows.length} divisions.
          </Hint>
        )}
        <RemainderTable rows={rows} current={row} />
      </div>
    </StageFrame>
  );
}

const VIEW = { w: 480, h: 270, pad: 12 };
/** Thinner than this many drawing units is drawn at this width (and the stage says it's not to scale). */
const MIN_DRAWN = 2.5;
/** The drawn rectangle is never flatter than this. */
const MIN_HEIGHT = 36;
/** Above this many squares in a row, a run is drawn as one block. */
const MAX_DRAWN_SQUARES = 60;
const LABEL_MIN = 30;

function TilingSvg({ a, b, row, placed, finished }: { a: number; b: number; row: number; placed: number; finished: boolean }) {
  const runs = useMemo(() => tiling(a, b), [a, b]);
  const [W, H] = [Math.max(a, b), Math.min(a, b)];
  const kx = Math.min((VIEW.w - 2 * VIEW.pad) / W, (VIEW.h - 2 * VIEW.pad) / H);
  // A very flat rectangle is stretched to a readable height: the stage then says it's not to scale.
  const ky = Math.max(kx, MIN_HEIGHT / H);
  const dx = (v: number) => Math.max(v * kx, MIN_DRAWN);
  const dy = (v: number) => Math.max(v * ky, MIN_DRAWN);
  const ox = (VIEW.w - dx(W)) / 2;
  const oy = (VIEW.h - dy(H)) / 2;
  const notToScale = ky !== kx || runs.some((r) => r.size * kx < MIN_DRAWN);
  const lastRun = runs.length - 1;

  const current = runs.findIndex((r) => r.row === row);
  const firstRow = runs[0]?.row ?? 0;
  const left = finished
    ? null
    : current >= 0
      ? leftover(runs[current], placed, W, H)
      : row < firstRow ? { x: 0, y: 0, w: W, h: H } : null;

  const shownCount = (r: Run, i: number) => (finished || r.row < row ? r.count : i === current ? placed : 0);

  return (
    <div className="ge-tiling-figure">
      <svg viewBox={`0 0 ${VIEW.w} ${VIEW.h}`} className="ge-svg" role="img" aria-label={`A ${W} by ${H} rectangle tiled by Euclid's squares`}>
        <rect x={ox} y={oy} width={dx(W)} height={dy(H)} className="ge-outline" />
        {left && left.w > 0 && left.h > 0 && (
          <rect x={ox + left.x * kx} y={oy + left.y * ky} width={dx(left.w)} height={dy(left.h)} className="ge-left" />
        )}
        {runs.map((r, i) => {
          const count = shownCount(r, i);
          if (count === 0) return null;
          const tone: Tone = finished && i === lastRun ? 'ok' : STEP_TONES[i % STEP_TONES.length];
          const step = (j: number) => (r.axis === 'x' ? { x: r.x + j * r.size, y: r.y } : { x: r.x, y: r.y + j * r.size });
          if (r.count > MAX_DRAWN_SQUARES) {
            const span = count * r.size;
            const w = r.axis === 'x' ? span : r.size;
            const h = r.axis === 'x' ? r.size : span;
            return (
              <g key={i} className={squareClass(tone, i === current)}>
                <rect x={ox + r.x * kx} y={oy + r.y * ky} width={dx(w)} height={dy(h)} />
              </g>
            );
          }
          return (
            <g key={i}>
              {Array.from({ length: count }, (_, j) => {
                const p = step(j);
                const isNow = i === current && j === count - 1;
                const [sw, sh] = [dx(r.size), dy(r.size)];
                return (
                  <g key={j} className={squareClass(tone, isNow)}>
                    <rect x={ox + p.x * kx} y={oy + p.y * ky} width={sw} height={sh} />
                    {Math.min(sw, sh) >= LABEL_MIN && (
                      <text x={ox + p.x * kx + sw / 2} y={oy + p.y * ky + sh / 2 + 4} textAnchor="middle">{group(r.size)}</text>
                    )}
                  </g>
                );
              })}
            </g>
          );
        })}
      </svg>
      {notToScale && <Hint className="ge-note">Very thin rectangles are drawn with a minimum width so they stay visible (not to scale).</Hint>}
      {runs.some((r) => r.count > MAX_DRAWN_SQUARES) && <Hint className="ge-note">A row of more than {MAX_DRAWN_SQUARES} squares is drawn as one block.</Hint>}
    </div>
  );
}

const CHAR_W = 7.8;
const TABLE_PAD = 90;

function RemainderTable({ rows, current }: { rows: ReturnType<typeof euclid>['rows']; current: number }) {
  if (rows.length === 0) return null;
  const longest = Math.max(...rows.map((r) => group(r.a).length));
  return (
    <WideRegion minWidth={Math.round(longest * CHAR_W * 3.2 + TABLE_PAD)} hint="swipe to see the whole table">
      <table className="data-table ge-table">
        <thead>
          <tr><th>a</th><th>= q ·</th><th>b</th><th>+ r</th></tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (i > current ? null : (
            <tr key={i} className={i === current ? 'is-now' : ''}>
              <td>{group(r.a)}</td>
              <td>= {group(r.q)} ·</td>
              <td>{group(r.b)}</td>
              <td>+ {group(r.r)}</td>
            </tr>
          )))}
        </tbody>
      </table>
    </WideRegion>
  );
}

// ── Extended Euclid and the inverse ──────────────────────────────────

/** a·x + b·y in bigint: with inputs up to 10¹² the products pass 2⁵³. */
const combine = (a: number, x: number, b: number, y: number) => group(BigInt(a) * BigInt(x) + BigInt(b) * BigInt(y));

const INVERSE_PRESETS = [
  { a: 3, m: 11, label: '3 mod 11' },
  { a: 17, m: 3120, label: 'RSA: e = 17, φ = 3120' },
  { a: 4, m: 12, label: '4 mod 12' },
];

function ExtendedScene({ picker, inputs, pair }: SceneProps) {
  const { a, b } = pair;
  const frames = useMemo(() => extendedFrames(a, b), [a, b]);
  const player = usePlayer(frames, { interval: STEP_MS * 1.4 });
  const rows = useMemo(() => bezoutRows(a, b), [a, b]);
  const { shown } = player.frame;
  const last = rows[shown - 1];

  return (
    <StageFrame
      player={player}
      height={320}
      stats={
        <Stats>
          <Stat label="x" value={signed(last.x)} color="var(--violet)" />
          <Stat label="y" value={signed(last.y)} color="var(--violet)" />
          <Stat label="a·x + b·y" value={combine(a, last.x, b, last.y)} sub="= r on the newest row" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'newest row' },
            { color: 'var(--violet)', label: 'x and y, carried along with r' },
            { color: 'var(--ok)', label: 'the gcd and the inverse' },
          ]}
        />
      }
      controls={[<>{picker}</>, inputs]}
    >
      <div className="stage-pad ge-ext">
        <SectionTitle hint="each row: (row two up) − q · (row above), for r, x and y alike">Extended Euclid</SectionTitle>
        <WideRegion minWidth={480} hint="swipe to see the whole table">
          <table className="data-table ge-table">
            <thead>
              <tr><th>r</th><th>q</th><th>x</th><th>y</th><th>a·x + b·y</th></tr>
            </thead>
            <tbody>
              {rows.slice(0, shown).map((r, i) => {
                const isGcd = i === rows.length - 1 && player.atEnd;
                return (
                  <tr key={i} className={isGcd ? 'is-gcd' : i === shown - 1 ? 'is-now' : ''}>
                    <td>{group(r.r)}</td>
                    <td>{r.q === null ? '–' : group(r.q)}</td>
                    <td className="ge-xy">{signed(r.x)}</td>
                    <td className="ge-xy">{signed(r.y)}</td>
                    <td>{group(a)}·{signed(r.x)} + {group(b)}·{signed(r.y)} = {combine(a, r.x, b, r.y)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </WideRegion>
        <InversePanel />
      </div>
    </StageFrame>
  );
}

function InversePanel() {
  const [aText, setAText] = useState('3');
  const [mText, setMText] = useState('11');
  const [shown, setShown] = useState({ a: 3, m: 11 });
  const pa = parseValue(aText);
  const pm = parseValue(mText);
  const mError = 'value' in pm && pm.value < 2 ? 'Pick a modulus of at least 2.' : null;
  const typeA = (t: string) => {
    setAText(t);
    const p = parseValue(t);
    if ('value' in p) setShown((s) => ({ ...s, a: p.value }));
  };
  const typeM = (t: string) => {
    setMText(t);
    const p = parseValue(t);
    if ('value' in p && p.value >= 2) setShown((s) => ({ ...s, m: p.value }));
  };
  const load = (a: number, m: number) => {
    setAText(String(a));
    setMText(String(m));
    setShown({ a, m });
  };
  const error = 'error' in pa ? `a: ${pa.error}` : 'error' in pm ? `m: ${pm.error}` : mError;
  return (
    <Box className="ge-inverse">
      <SectionTitle hint="a number that undoes multiplying by a, mod m">Modular inverse</SectionTitle>
      <div className="ge-inverse-row">
        <TextField label="a" value={aText} onChange={typeA} width={130} spellCheck={false} />
        <TextField label="mod m" value={mText} onChange={typeM} width={130} spellCheck={false} />
        {INVERSE_PRESETS.map((p) => (
          <ChipButton key={p.label} on={shown.a === p.a && shown.m === p.m} onClick={() => load(p.a, p.m)}>{p.label}</ChipButton>
        ))}
      </div>
      <p className="ge-inverse-result" aria-live="polite">{inverseCaption(shown.a, shown.m)}</p>
      {error && <Hint className="ge-error">{error} Still showing {group(shown.a)} mod {group(shown.m)}.</Hint>}
      <Hint>
        It's the x from extended Euclid on (a, m), reduced mod m. RSA's private exponent d is exactly this: the inverse of the
        public exponent e mod φ(n). Real keys use numbers hundreds of digits long.
      </Hint>
    </Box>
  );
}
