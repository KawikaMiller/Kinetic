import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { BitStrip } from '../../components/BitStrip';
import { useScenePicker } from '../../components/ScenePicker';
import { StageFrame } from '../../components/StageFrame';
import { TruthTable, type TruthColumn } from '../../components/TruthTable';
import { Button, ChipButton, ControlGroup, Hint, Legend, Segmented, Stat, Stats, TextField, Toggle } from '../../components/ui';
import { WideRegion } from '../../components/WideRegion';
import { flipBit, type Bit } from '../../core/bits';
import { useSetCaption } from '../../core/caption';
import type { Tone } from '../../core/tone';
import { truthRowIndex, type TruthRow } from '../../core/truth';
import { usePlayer } from '../../core/usePlayer';
import { AluDiagram } from './AluDiagram';
import { Board } from './Board';
import { aluCaption, runFor, tickFrames, type AdderMode } from './frames';
import { FULL_LAYOUT, HALF_LAYOUT } from './layout';
import {
  ALU_OPS, BITS, FULL_ADDER, HALF_ADDER, LOOKAHEAD_TICKS, PAIRS, alu, bits4, evaluate, from4, parsePair, rippleAdd, signed4, valueOf,
  type AluOp, type Pair,
} from './model';
import { RippleDiagram } from './RippleDiagram';
import './styles.css';

const SCENES = [
  { value: 'gates' as const, label: 'Half & full adder' },
  { value: 'ripple' as const, label: '4-bit adder' },
  { value: 'alu' as const, label: 'Mini ALU' },
];

const TICK_MS = 1100;
/** The full adder's diagram needs this much width for its labels to stay readable. */
const FULL_MIN_WIDTH = 560;
const ADDER_MIN_WIDTH = 600;
const ALU_MIN_WIDTH = 480;
const HONEST_DELAY = 'Delays are in illustrative ticks: one for every stage to form G and P, then one per stage a carry has to ripple through. Real gates switch in picoseconds.';

const lit = (_: number, bit: Bit): Tone => (bit ? 'hi' : 'dim');
const bin = (v: number) => v.toString(2).padStart(BITS, '0');

export function Stage() {
  const [scene, picker] = useScenePicker({ label: 'Scene', options: SCENES, initial: 'gates' });
  const shownScene = useRef(scene);
  // Each scene is its own component, so switching remounts the picker and drops focus to <body>.
  // Put it back on the picker's chosen option (Phase 2: belongs in useScenePicker).
  useEffect(() => {
    if (shownScene.current === scene) return;
    shownScene.current = scene;
    if (document.activeElement === document.body) document.querySelector<HTMLElement>('.segmented[aria-label="Scene"] button.on')?.focus();
  }, [scene]);
  if (scene === 'ripple') return <RippleScene picker={picker} />;
  if (scene === 'alu') return <AluScene picker={picker} />;
  return <GatesScene picker={picker} />;
}

// ── Half and full adder ──────────────────────────────────────────────────

function GatesScene({ picker }: { picker: ReactNode }) {
  const [full, setFull] = useState(false);
  const [inputs, setInputs] = useState<TruthRow>({ A: true, B: true, Cin: false });
  const [pulse, setPulse] = useState(0);
  const setCaption = useSetCaption();
  const circuit = full ? FULL_ADDER : HALF_ADDER;
  const values = evaluate(circuit, inputs);
  const [sumOut, carryOut] = circuit.outputs;
  const n = (v: boolean) => (v ? 1 : 0);
  const total = circuit.inputs.reduce((t, name) => t + n(inputs[name]), 0);

  const describe = (next: TruthRow, isFull: boolean) => {
    const c = isFull ? FULL_ADDER : HALF_ADDER;
    const v = evaluate(c, next);
    const added = c.inputs.map((name) => n(next[name])).join(' + ');
    return (
      <>{added} = {c.inputs.reduce((t, name) => t + n(next[name]), 0)}: sum <b>{n(v.sum)}</b>, carry <b>{n(v[c.outputs[1].from])}</b>, written{' '}
        <span className="hl">{n(v[c.outputs[1].from])}{n(v.sum)}</span> in binary.{isFull ? ' Two half adders, and an OR joins their carries.' : ''}</>
    );
  };

  useEffect(() => {
    setCaption(
      full
        ? <>A <b>full adder</b> adds a carry-in too: Sum = A ⊕ B ⊕ Cin, Cout = AB + Cin·(A ⊕ B). It's two half adders and an OR. Flip the inputs.</>
        : <>A <b>half adder</b>: XOR gives the sum bit, AND gives the carry. 1 + 1 = 10 in binary. Flip A and B.</>,
    );
  }, [full, setCaption]);

  const set = (next: TruthRow) => {
    setInputs(next);
    setPulse((p) => p + 1);
    setCaption(describe(next, full), { quiet: true });
  };

  const columns: TruthColumn[] = circuit.outputs.map((o) => ({ label: o.label, fn: (row) => evaluate(circuit, row)[o.from] }));

  const board = <Board circuit={circuit} layout={full ? FULL_LAYOUT : HALF_LAYOUT} values={values} pulse={pulse} onFlip={(name) => set({ ...inputs, [name]: !inputs[name] })} />;

  return (
    <StageFrame
      height={320}
      stats={
        <Stats>
          <Stat label={sumOut.label} value={n(values[sumOut.from])} color={values[sumOut.from] ? 'var(--hi)' : 'var(--muted)'} />
          <Stat label={carryOut.label} value={n(values[carryOut.from])} color={values[carryOut.from] ? 'var(--hi)' : 'var(--muted)'} />
          <Stat label={circuit.inputs.join(' + ')} value={total} sub={`= ${n(values[carryOut.from])}${n(values[sumOut.from])} in binary`} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'high (1)', shape: 'line' },
            { color: 'var(--dim)', label: 'low (0)', shape: 'line' },
            { color: 'var(--info)', label: 'current row' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Toggle label="Circuit" value={full} onChange={setFull} off="Half adder" on="Full adder" />
        </>,
        <Hint key="h">Click an input (or a row of the table) to set it. Keyboard: Tab to an input, Space to flip it.</Hint>,
      ]}
    >
      <div className="stage-pad aa aa-gates">
        <div className="aa-board">{full ? <WideRegion minWidth={FULL_MIN_WIDTH}>{board}</WideRegion> : board}</div>
        <TruthTable
          className="aa-table"
          vars={circuit.inputs}
          columns={columns}
          format="10"
          trueTone="hi"
          currentTone="info"
          currentRow={truthRowIndex(circuit.inputs, inputs)}
          onRowClick={(row) => set({ ...inputs, ...row })}
        />
      </div>
    </StageFrame>
  );
}

// ── The 4-bit adder ──────────────────────────────────────────────────────

/** Two 4-bit registers the learner sets by bit, by typing "7, 1", or from a preset chip. */
function useOperands(start: Pair) {
  const [a, setA] = useState(start.a);
  const [b, setB] = useState(start.b);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const submit = () => {
    const parsed = parsePair(draft);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    setError(null);
    setA(parsed.a);
    setB(parsed.b);
  };
  return { a, b, setA, setB, draft, setDraft, error, submit };
}

function OperandRows({ ops }: { ops: ReturnType<typeof useOperands> }) {
  return (
    <div className="aa-rows">
      <span className="aa-row-label">A</span>
      <BitStrip bits={bits4(ops.a)} onToggle={(i) => ops.setA(from4(flipBit(bits4(ops.a), i)))} toneOf={lit} placeValues ariaLabelOf={(i) => `A bit ${BITS - 1 - i}`} ariaLabel="A" size="md" />
      <span className="aa-row-value">{ops.a} <span className="aa-signed">(signed {signed4(ops.a)})</span></span>
      <span className="aa-row-label">B</span>
      <BitStrip bits={bits4(ops.b)} onToggle={(i) => ops.setB(from4(flipBit(bits4(ops.b), i)))} toneOf={lit} placeValues ariaLabelOf={(i) => `B bit ${BITS - 1 - i}`} ariaLabel="B" size="md" />
      <span className="aa-row-value">{ops.b} <span className="aa-signed">(signed {signed4(ops.b)})</span></span>
    </div>
  );
}

function OperandInput({ ops }: { ops: ReturnType<typeof useOperands> }) {
  return (
    <>
      <TextField label="A, B (0-15)" value={ops.draft} onChange={ops.setDraft} onEnter={ops.submit} placeholder="7, 1" width={110} maxLength={24} spellCheck={false} />
      <Button onClick={ops.submit} disabled={!ops.draft.trim()}>Set</Button>
      {ops.error && <Hint tone="muted" className="aa-error">{ops.error}</Hint>}
    </>
  );
}

function RippleScene({ picker }: { picker: ReactNode }) {
  const ops = useOperands(PAIRS[0]);
  const { a, b } = ops;
  const [mode, setMode] = useState<AdderMode>('ripple');
  const frames = useMemo(() => tickFrames(a, b, mode), [a, b, mode]);
  const player = usePlayer(frames, { interval: TICK_MS });
  const tick = player.frame.tick;
  const run = runFor(a, b, mode);
  const ripple = rippleAdd(a, b);
  const settled = tick >= run.delay;
  const sum = valueOf(run.sum);
  const c = run.carries[BITS].value;
  const v = (run.carries[BITS - 1].value ^ c) as Bit;
  const arriving = run.sum.flatMap((s, i) => (s.at === tick ? [BITS - 1 - i] : []));

  const choose = (p: Pair) => {
    ops.setA(p.a);
    ops.setB(p.b);
  };

  return (
    <StageFrame
      player={player}
      height={420}
      stats={
        <Stats>
          <Stat label="Tick" value={`${tick} / ${run.delay}`} sub={mode} />
          <Stat label="Ripple delay" value={ripple.delay} sub="ticks for this pair" />
          <Stat label="Lookahead delay" value={LOOKAHEAD_TICKS} sub="ticks, any pair" />
          <Stat label="C (carry out)" value={settled ? c : '?'} color={settled && c ? 'var(--orange)' : undefined} sub={!settled ? 'settling' : c ? 'unsigned result wrapped' : 'unsigned fits'} />
          <Stat label="V (overflow)" value={settled ? v : '?'} color={settled && v ? 'var(--bad)' : undefined} sub={!settled ? 'settling' : v ? 'signed result wrong' : 'signed fits'} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'bit / carry = 1' },
            { color: 'var(--dim)', label: '0' },
            { color: 'var(--info)', label: 'carry arriving this tick', shape: 'line' },
            { color: 'var(--line-2)', label: '? not settled yet', shape: 'line' },
            { color: 'var(--orange)', label: 'C set: unsigned wrap' },
            { color: 'var(--bad)', label: 'V set: signed overflow' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Toggle label="Carries" value={mode === 'lookahead'} onChange={(on) => setMode(on ? 'lookahead' : 'ripple')} off="Ripple" on="Lookahead" />
        </>,
        <>
          <ControlGroup label="Try">
            {PAIRS.map((p) => (
              <ChipButton key={p.label} on={p.a === a && p.b === b} onClick={() => choose(p)}>{p.label}</ChipButton>
            ))}
          </ControlGroup>
          <OperandInput ops={ops} />
        </>,
      ]}
    >
      <div className="stage-pad aa">
        <OperandRows ops={ops} />
        <WideRegion minWidth={ADDER_MIN_WIDTH}>
          <RippleDiagram a={a} b={b} run={run} mode={mode} tick={tick} />
        </WideRegion>
        <div className="aa-rows">
          <span className="aa-row-label">Sum</span>
          {settled ? (
            <BitStrip bits={bits4(sum)} toneOf={lit} highlight={arriving} ariaLabel={`sum ${sum}`} size="md" />
          ) : (
            <span className="aa-pending">settling: S bits appear as their carries arrive (see the diagram)</span>
          )}
          <span className="aa-row-value">{settled ? <>{sum} <span className="aa-signed">(signed {signed4(sum)})</span></> : ''}</span>
        </div>
        <Hint block>{HONEST_DELAY}</Hint>
      </div>
    </StageFrame>
  );
}

// ── Mini ALU ─────────────────────────────────────────────────────────────

function AluScene({ picker }: { picker: ReactNode }) {
  const ops = useOperands({ label: '', a: 0b0101, b: 0b0011 });
  const { a, b } = ops;
  const [op, setOp] = useState<AluOp>('SUB');
  const setCaption = useSetCaption();
  const out = alu(op, a, b);
  const { z, n, c, v } = out.flags;

  useEffect(() => {
    setCaption(aluCaption(op, a, b), { quiet: true });
  }, [op, a, b, setCaption]);

  return (
    <StageFrame
      height={380}
      stats={
        <Stats>
          <Stat label="Result" value={bin(out.result)} sub={`${out.result} (signed ${signed4(out.result)})`} color="var(--hi)" />
          <Stat label="Z" value={z} sub="zero" />
          <Stat label="N" value={n} sub="negative" />
          <Stat label="C" value={c} sub={op === 'SUB' ? '1 = no borrow' : 'carry out'} color={c ? 'var(--orange)' : undefined} />
          <Stat label="V" value={v} sub="signed overflow" color={v ? 'var(--bad)' : undefined} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'bit = 1' },
            { color: 'var(--dim)', label: 'bit = 0' },
            { color: 'var(--violet)', label: 'selected op path' },
            { color: 'var(--orange)', label: 'C set' },
            { color: 'var(--bad)', label: 'V set' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented label="Op" value={op} onChange={setOp} options={ALU_OPS.map((o) => ({ value: o, label: o }))} />
        </>,
        <OperandInput key="in" ops={ops} />,
      ]}
    >
      <div className="stage-pad aa">
        <OperandRows ops={ops} />
        {op === 'SUB' && (
          <div className="aa-rows">
            <span className="aa-row-label is-op">~B</span>
            <BitStrip bits={bits4(out.bIn)} toneOf={(_, bit) => (bit ? 'violet' : 'dim')} ariaLabel={`not B, ${out.bIn}`} size="md" />
            <span className="aa-row-value">into the adder, with Cin = 1</span>
          </div>
        )}
        <WideRegion minWidth={ALU_MIN_WIDTH}>
          <AluDiagram op={op} result={bin(out.result)} />
        </WideRegion>
        <Hint block>
          C is the adder's carry out. After SUB it means "no borrow" (A ≥ B unsigned), as on ARM; x86 stores the opposite, a borrow flag. AND and OR
          clear C and V.
        </Hint>
      </div>
    </StageFrame>
  );
}
