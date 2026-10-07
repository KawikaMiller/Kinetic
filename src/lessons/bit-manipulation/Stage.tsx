import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { BitStrip } from '../../components/BitStrip';
import { CodePanel } from '../../components/CodePanel';
import { Box, SectionTitle } from '../../components/Panel';
import { useScenePicker } from '../../components/ScenePicker';
import { StageFrame } from '../../components/StageFrame';
import { Button, ChipButton, ControlGroup, Hint, Legend, Segmented, Slider, Stat, Stats, TextField, Toggle } from '../../components/ui';
import { chunkGroups, flipBit, fromBits, type Bit } from '../../core/bits';
import { useSetCaption } from '../../core/caption';
import type { Tone } from '../../core/tone';
import { usePlayer } from '../../core/usePlayer';
import { flagCaption, opFrames, TRICK_CODE, trickFrames, type Trick, type TrickRow } from './frames';
import {
  FLAG_NAMES, JS_FACTS, OPS, PRESETS, WIDTHS, applyFlag, bitNumber, bitsOf, changedBits, expression, fitsWidth, hex, isPowerOfTwo,
  isPowerOfTwoNaive, isShift, jsDifference, jsEval, maskOf, maxShift, parseRegister, resultBits, resultValue, testFlag, toRegister,
  usesB, type FlagOp, type Op, type Preset, type Width,
} from './model';
import './styles.css';

const SCENES = [
  { value: 'ops' as const, label: 'Operators' },
  { value: 'flags' as const, label: 'Flags' },
  { value: 'tricks' as const, label: 'Tricks' },
];

/** Autoplay speed of the column fill: 8 columns read slowly, 32 go faster. */
const FILL_MS: Record<Width, number> = { 8: 420, 32: 150 };
const TRICK_MS = 1300;
const START = { a: 0b1100_1010, b: 0b1010_0110 };
const TYPE_HINT = '202, 0xCA, 0b1100_1010';
const MAX_TYPED = 40;

const OP_LABEL: Record<Op, string> = { '&': '&', '|': '|', '^': '^', '~': '~A', '<<': '<<', '>>': '>>', '>>>': '>>>' };

const lit = (_: number, bit: Bit): Tone => (bit ? 'hi' : 'dim');
const operandTone = (_: number, bit: Bit): Tone => (bit ? 'violet' : 'dim');
const tick = <span className="bm-tick" aria-label="changed">✓</span>;
const pendingMark = <span className="bm-pending-mark">·</span>;

export function Stage() {
  const [scene, picker] = useScenePicker({ label: 'Scene', options: SCENES, initial: 'ops' });
  const shownScene = useRef(scene);
  // Each scene is its own component, so switching remounts the picker and drops focus to <body>.
  // Put it back on the picker's chosen option (Phase 2: belongs in useScenePicker).
  useEffect(() => {
    if (shownScene.current === scene) return;
    shownScene.current = scene;
    if (document.activeElement === document.body) document.querySelector<HTMLElement>('.segmented[aria-label="Scene"] button.on')?.focus();
  }, [scene]);
  if (scene === 'flags') return <FlagsScene picker={picker} />;
  if (scene === 'tricks') return <TricksScene picker={picker} />;
  return <OpsScene picker={picker} />;
}

/** Labels above a register: place values at 8 bits; at 32 bits powers of two, with the sign bit called out. */
function registerLabels(width: Width) {
  return width === 8
    ? { placeValues: true as const }
    : { placeValues: 'exponent' as const, labelOf: (i: number) => (i === 0 ? <span className="bm-sign">sign</span> : null) };
}

const byteGroups = (width: Width) => (width === 32 ? chunkGroups(32, 8, { label: (k) => `byte ${3 - k}` }) : []);

// ── Operators ────────────────────────────────────────────────────────────

function OpsScene({ picker }: { picker: ReactNode }) {
  const [width, setWidth] = useState<Width>(8);
  const [a, setA] = useState(START.a);
  const [b, setB] = useState(START.b);
  const [op, setOp] = useState<Op>('&');
  const [n, setN] = useState(1);
  const [drafts, setDrafts] = useState({ a: '', b: '' });
  const [errors, setErrors] = useState<{ a?: string; b?: string }>({});
  const [preset, setPreset] = useState<Preset | null>(null);
  const setCaption = useSetCaption();

  const frames = useMemo(() => opFrames(op, a, b, n, width), [op, a, b, n, width]);
  const player = usePlayer(frames, { interval: FILL_MS[width] });
  const { filled, col } = player.frame;
  const done = filled === width;
  const out = resultBits(op, a, b, n, width);
  const value = resultValue(op, out, width);
  const aBits = bitsOf(a, width);
  const pending = (i: number) => i < width - filled;
  const changed = new Set(changedBits(aBits, out));
  const ring = col === null ? [] : [col];
  const shownPreset = preset && preset.width === width && preset.op === op && preset.a === a && (!usesB(op) || preset.b === b) && (!isShift(op) || preset.n === n)
    ? preset : null;

  /** Editing a register shows the new answer straight away; picking an operator replays the fill. */
  const showAnswer = () => player.queueNext({ play: false, from: width + 1 });

  const toggleBit = (reg: 'a' | 'b', i: number) => {
    const cur = reg === 'a' ? a : b;
    const next = toRegister(fromBits(flipBit(bitsOf(cur, width), i)), width);
    (reg === 'a' ? setA : setB)(next);
    showAnswer();
  };

  const submit = (reg: 'a' | 'b') => {
    const parsed = parseRegister(drafts[reg], width);
    if (!parsed.ok) {
      setErrors({ ...errors, [reg]: parsed.error });
      return;
    }
    setErrors({ ...errors, [reg]: undefined });
    (reg === 'a' ? setA : setB)(parsed.value);
    showAnswer();
  };

  const changeWidth = (w: Width) => {
    const reset: string[] = [];
    const keep = (v: number, name: string, fallback: number) => {
      if (fitsWidth(v, w)) return toRegister(v, w);
      reset.push(`${name} (${v})`);
      return fallback;
    };
    setA(keep(a, 'A', START.a));
    setB(keep(b, 'B', START.b));
    setN(Math.min(n, maxShift(w)));
    setWidth(w);
    setErrors({});
    if (reset.length) {
      setCaption(<>{reset.join(' and ')} didn't fit in 8 bits, so {reset.length === 1 ? 'it was' : 'they were'} reset rather than cut down.</>);
    }
  };

  const load = (p: Preset) => {
    setWidth(p.width);
    setA(p.a);
    setB(p.b);
    setOp(p.op);
    setN(p.n);
    setErrors({});
    setPreset(p);
    player.queueNext({ play: false, from: p.width + 1 });
  };

  const diff = width === 8 ? jsDifference(op, a, b, n) : 'same';
  const js = jsEval(op, a, b, n);

  return (
    <StageFrame
      player={player}
      height={300}
      stats={
        <Stats>
          <Stat label="A" value={a} sub={hex(a, width)} />
          {usesB(op) && <Stat label="B" value={b} sub={hex(b, width)} />}
          <Stat label={width === 8 ? 'Result (8-bit)' : 'JS returns'} value={done ? value : '…'} sub={done ? hex(value, width) : 'filling'} color="var(--hi)" />
          {width === 8 && (
            <Stat
              label="Real JS gives"
              value={js}
              sub={diff === 'same' ? 'the same number' : diff === 'wider' ? 'same low 8 bits, all 32 kept' : "differs: bit 7 isn't JS's sign bit"}
              color={diff === 'sign' ? 'var(--bad)' : undefined}
            />
          )}
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'bit = 1' },
            { color: 'var(--dim)', label: 'bit = 0' },
            { color: 'var(--info)', label: 'column being worked out', shape: 'line' },
            { color: 'var(--ok)', label: '✓ differs from A', shape: 'dot' },
            ...(width === 32 ? [{ color: 'var(--orange)', label: 'sign bit', shape: 'dot' as const }] : []),
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented label="Width" value={width} onChange={changeWidth} options={WIDTHS.map((w) => ({ value: w, label: `${w}-bit` }))} />
          <Segmented label="Operator" value={op} onChange={setOp} options={OPS.map((o) => ({ value: o, label: OP_LABEL[o] }))} />
          {isShift(op) && <Slider label="Shift by n =" value={n} min={0} max={maxShift(width)} onChange={(v) => {
            setN(v);
            showAnswer();
          }} />}
        </>,
        <>
          <TextField label="Type A" value={drafts.a} onChange={(v) => setDrafts({ ...drafts, a: v })} onEnter={() => submit('a')} placeholder={TYPE_HINT} width={170} maxLength={MAX_TYPED} spellCheck={false} />
          <Button onClick={() => submit('a')} disabled={!drafts.a.trim()}>Set A</Button>
          {usesB(op) && (
            <>
              <TextField label="Type B" value={drafts.b} onChange={(v) => setDrafts({ ...drafts, b: v })} onEnter={() => submit('b')} placeholder={TYPE_HINT} width={170} maxLength={MAX_TYPED} spellCheck={false} />
              <Button onClick={() => submit('b')} disabled={!drafts.b.trim()}>Set B</Button>
            </>
          )}
          {errors.a && <Hint tone="muted" className="bm-error">A: {errors.a}</Hint>}
          {errors.b && usesB(op) && <Hint tone="muted" className="bm-error">B: {errors.b}</Hint>}
        </>,
        <>
          <ControlGroup label="Real uses">
            {PRESETS.map((p) => (
              <ChipButton key={p.id} on={shownPreset?.id === p.id} onClick={() => load(p)}>{p.label}</ChipButton>
            ))}
          </ControlGroup>
          <ControlGroup label="JavaScript surprises (32-bit)">
            {JS_FACTS.map((p) => (
              <ChipButton key={p.id} tone="orange" on={shownPreset?.id === p.id} onClick={() => load(p)}>{p.label}</ChipButton>
            ))}
          </ControlGroup>
        </>,
      ]}
    >
      <div className={`stage-pad bm ${width === 32 ? 'is-32' : ''}`}>
        <div className="bm-rows">
          <span className="bm-row-label">A</span>
          <BitStrip
            bits={aBits}
            onToggle={(i) => toggleBit('a', i)}
            toneOf={lit}
            highlight={ring}
            groups={byteGroups(width)}
            ariaLabelOf={(i) => `A bit ${bitNumber(i, width)}`}
            ariaLabel="register A"
            {...registerLabels(width)}
          />
          {usesB(op) && (
            <>
              <span className="bm-row-label">B</span>
              <BitStrip
                bits={bitsOf(b, width)}
                onToggle={(i) => toggleBit('b', i)}
                toneOf={lit}
                highlight={ring}
                groups={byteGroups(width)}
                ariaLabelOf={(i) => `B bit ${bitNumber(i, width)}`}
                ariaLabel="register B"
                {...registerLabels(width)}
              />
            </>
          )}
          <span className="bm-row-label is-result">{expression(op, n)}</span>
          <BitStrip
            className="bm-result"
            bits={out.map((bit, i) => (pending(i) ? 0 : bit))}
            toneOf={(i, bit) => (pending(i) ? 'dim' : lit(i, bit))}
            labelOf={(i) => (pending(i) ? pendingMark : changed.has(i) ? tick : '')}
            highlight={ring}
            groups={byteGroups(width)}
            ariaLabel={done ? `result ${value}` : `result, ${filled} of ${width} columns worked out`}
          />
        </div>
        {shownPreset && <p className="bm-note">{shownPreset.note}</p>}
        {width === 8 && (
          <Hint block className="bm-honest">
            8-bit mode is a teaching width; JavaScript always computes in 32 bits.
            {op === '>>' && ' Here >> treats bit 7 as the sign bit, as an 8-bit signed register would.'}
          </Hint>
        )}
      </div>
    </StageFrame>
  );
}

// ── Flags ────────────────────────────────────────────────────────────────

const FLAG_OPS: { value: FlagOp; label: string }[] = [
  { value: 'set', label: 'Set' },
  { value: 'clear', label: 'Clear' },
  { value: 'toggle', label: 'Toggle' },
  { value: 'test', label: 'Test' },
];

function flagCode(op: FlagOp, name: string): string {
  switch (op) {
    case 'set': return `flags = flags | ${name};`;
    case 'clear': return `flags = flags & ~${name};`;
    case 'toggle': return `flags = flags ^ ${name};`;
    case 'test': return `const on = (flags & ${name}) !== 0;`;
  }
}

function FlagsScene({ picker }: { picker: ReactNode }) {
  const [f, setF] = useState(0b0000_0101);
  const [k, setK] = useState(1);
  const [op, setOp] = useState<FlagOp>('set');
  const setCaption = useSetCaption();
  const mask = maskOf(k);
  const name = FLAG_NAMES[k];
  const result = op === 'test' ? f & mask : applyFlag(op, f, mask);
  const fBits = bitsOf(f, 8);
  const rBits = bitsOf(result, 8);
  const changed = op === 'test' ? new Set<number>() : new Set(changedBits(fBits, rBits));

  useEffect(() => {
    setCaption(flagCaption(op, f, k), { quiet: true });
  }, [op, f, k, setCaption]);

  const apply = () => {
    if (op !== 'test') setF(result);
  };

  return (
    <StageFrame
      height={300}
      stats={
        <Stats>
          <Stat label="flags" value={f} sub={hex(f, 8)} />
          <Stat label={name} value={mask} sub={`1 << ${k}`} color="var(--violet)" />
          {op === 'test'
            ? <Stat label="on?" value={String(testFlag(f, mask))} color={testFlag(f, mask) ? 'var(--hi)' : 'var(--muted)'} />
            : <Stat label="result" value={result} sub={hex(result, 8)} color="var(--hi)" />}
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'bit = 1' },
            { color: 'var(--dim)', label: 'bit = 0' },
            { color: 'var(--violet)', label: 'mask bit' },
            { color: 'var(--ok)', label: '✓ changed by the operation', shape: 'dot' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented label="Operation" value={op} onChange={setOp} options={FLAG_OPS} />
          {op !== 'test' && <Button variant="primary" onClick={apply} disabled={result === f}>Apply: flags = result</Button>}
        </>,
        <Hint key="hint">Click a flags bit to flip it by hand; click a MASK bit to pick which flag the mask selects.</Hint>,
      ]}
    >
      <div className="stage-pad bm">
        <div className="bm-rows">
          <span className="bm-row-label">flags</span>
          <BitStrip bits={fBits} onToggle={(i) => setF(fromBits(flipBit(fBits, i)))} toneOf={lit} labelOf={(i) => bitNumber(i, 8)} ariaLabelOf={(i) => `flags bit ${bitNumber(i, 8)}, ${FLAG_NAMES[bitNumber(i, 8)]}`} ariaLabel="flags register" size="md" />
          <span className="bm-row-label is-mask">MASK</span>
          <BitStrip bits={bitsOf(mask, 8)} onToggle={(i) => setK(bitNumber(i, 8))} toneOf={operandTone} ariaLabelOf={(i) => `use bit ${bitNumber(i, 8)}, ${FLAG_NAMES[bitNumber(i, 8)]}, as the mask`} ariaLabel="mask register" size="md" />
          {op === 'clear' && (
            <>
              <span className="bm-row-label is-mask">~MASK</span>
              <BitStrip bits={bitsOf(~mask & 0xff, 8)} toneOf={operandTone} ariaLabel="inverted mask" size="md" />
            </>
          )}
          <span className="bm-row-label is-result">{op === 'test' ? 'flags & MASK' : 'result'}</span>
          <BitStrip bits={rBits} toneOf={lit} labelOf={(i) => (changed.has(i) ? tick : '')} ariaLabel={`result ${result}`} size="md" />
        </div>
        <CodePanel title="The code" lines={[`const ${name} = 1 << ${k};`, flagCode(op, name)]} active={1} />
        <ul className="bm-flagnames" aria-label="Flag names">
          {FLAG_NAMES.map((flag, bit) => (
            <li key={flag} className={`chip ${testFlag(f, maskOf(bit)) ? 'tone-hi' : 'tone-dim'} ${bit === k ? 'is-mask' : ''}`}>
              {bit} {flag}
            </li>
          ))}
        </ul>
      </div>
    </StageFrame>
  );
}

// ── Tricks ───────────────────────────────────────────────────────────────

const TRICKS: { value: Trick; label: string }[] = [
  { value: 'popcount', label: 'Count 1s' },
  { value: 'lowest', label: 'Lowest set bit' },
  { value: 'power', label: 'Power of two?' },
  { value: 'swap', label: 'XOR swap' },
];

const MIN_INT32 = -(2 ** 31);

function TricksScene({ picker }: { picker: ReactNode }) {
  const [trick, setTrick] = useState<Trick>('popcount');
  const [x, setX] = useState(0b1011_0100);
  const [y, setY] = useState(0b0110_0011);
  const [alias, setAlias] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const frames = useMemo(() => trickFrames(trick, x, y, alias), [trick, x, y, alias]);
  const player = usePlayer(frames, { interval: TRICK_MS });
  const fr = player.frame;
  const xBits = bitsOf(x, 8);

  const edit = <T,>(setter: (v: T) => void, v: T) => {
    setter(v);
    player.queueNext({ play: false });
  };

  const submit = () => {
    const parsed = parseRegister(draft, 8);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    setError(null);
    edit(setX, parsed.value);
  };

  const rowStrip = (row: TrickRow) => (
    <BitStrip
      bits={bitsOf(row.value, 8)}
      toneOf={row.operand ? operandTone : lit}
      labelOf={(i) => (row.changed?.includes(i) ? tick : '')}
      ariaLabel={`${row.label} = ${row.value}`}
      size="md"
    />
  );

  return (
    <StageFrame
      player={player}
      height={320}
      stats={
        <Stats>
          <Stat label="input x" value={x} sub={hex(x, 8)} />
          {trick === 'swap' && !alias && <Stat label="input y" value={y} sub={hex(y, 8)} />}
          {fr.counter !== null && <Stat label="count" value={fr.counter} color="var(--hi)" />}
          {fr.verdicts.map((v) => (
            <Stat key={v.label} label={v.label} value={String(v.value)} color={v.value ? 'var(--hi)' : 'var(--muted)'} />
          ))}
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'bit = 1' },
            { color: 'var(--dim)', label: 'bit = 0' },
            { color: 'var(--violet)', label: 'the operand (x − 1, ~x, −x)' },
            { color: 'var(--ok)', label: '✓ changed by this line', shape: 'dot' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented label="Trick" value={trick} onChange={setTrick} options={TRICKS} />
          {trick === 'swap' && <Toggle label="Swap" value={alias} onChange={(v) => edit(setAlias, v)} off="x with y" on="x with itself" />}
        </>,
        <>
          <TextField label="Type x" value={draft} onChange={setDraft} onEnter={submit} placeholder={TYPE_HINT} width={170} maxLength={MAX_TYPED} spellCheck={false} />
          <Button onClick={submit} disabled={!draft.trim()}>Set x</Button>
          {error && <Hint tone="muted" className="bm-error">{error}</Hint>}
        </>,
      ]}
    >
      <div className="stage-pad bm bm-tricks">
        <div className="bm-rows">
          <span className="bm-row-label">x</span>
          <BitStrip bits={xBits} onToggle={(i) => edit(setX, fromBits(flipBit(xBits, i)))} toneOf={lit} placeValues ariaLabelOf={(i) => `x bit ${bitNumber(i, 8)}`} ariaLabel="input x" size="md" />
          {trick === 'swap' && !alias && (
            <>
              <span className="bm-row-label">y</span>
              <BitStrip bits={bitsOf(y, 8)} onToggle={(i) => edit(setY, fromBits(flipBit(bitsOf(y, 8), i)))} toneOf={lit} ariaLabelOf={(i) => `y bit ${bitNumber(i, 8)}`} ariaLabel="input y" size="md" />
            </>
          )}
        </div>
        <div className="bm-trick-body">
          <Box className="bm-steps">
            <SectionTitle hint="this step">Registers</SectionTitle>
            <div className="bm-rows">
              {fr.rows.map((row) => (
                <RowPair key={row.label} label={row.label} operand={row.operand}>{rowStrip(row)}</RowPair>
              ))}
            </div>
          </Box>
          <CodePanel title="The code" lines={TRICK_CODE[trick]} active={fr.line} />
        </div>
        {trick === 'power' && (
          <Hint block className="bm-honest">
            In 32-bit JS, −2147483648 is the other trap: the tempting test says {String(isPowerOfTwoNaive(MIN_INT32))}, the fixed one says{' '}
            {String(isPowerOfTwo(MIN_INT32))}. That's why the fix is x &gt; 0, not x !== 0.
          </Hint>
        )}
        <Hint block className="bm-honest">Shown on an 8-bit register to keep it readable; the same tricks work on JavaScript's 32-bit ints.</Hint>
      </div>
    </StageFrame>
  );
}

function RowPair({ label, operand, children }: { label: string; operand?: boolean; children: ReactNode }) {
  return (
    <>
      <span className={`bm-row-label ${operand ? 'is-mask' : ''}`}>{label}</span>
      {children}
    </>
  );
}
