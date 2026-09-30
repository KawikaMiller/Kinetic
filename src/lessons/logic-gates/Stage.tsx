import { useState, type KeyboardEvent, type ReactNode } from 'react';
import { TravelDot } from '../../components/scene';
import { StageFrame } from '../../components/StageFrame';
import { TruthTable, type TruthColumn } from '../../components/TruthTable';
import { Hint, Legend, Segmented, Stat, Stats } from '../../components/ui';
import { useIntroCaption, useSetCaption } from '../../core/caption';
import { truthRowIndex, truthRows, type TruthRow } from '../../core/truth';
import {
  BOARD, BUBBLE_R, IO_R, LAYOUTS, XOR_BACK_PATH, bubbleAt, gateBodyPath, wirePath, wirePoints, wiresOf, type LayoutId,
} from './layout';
import {
  CUSTOM_START, GATE_FORMULA, GATE_TYPES, HALF_ADDER, NAND_AND, NAND_NOT, NAND_OR, customCircuit, deMorgan, evalGate, evaluate,
  gateDepth, type Circuit, type GateType,
} from './model';
import './styles.css';

/** Seconds a signal takes to cross one wire when it flows. */
const HOP_S = 0.35;
const MIN_WIDTH = 540;

type BoardId = 'half-adder' | 'nand' | 'de-morgan' | 'custom';
type NandTarget = 'NOT' | 'AND' | 'OR';

const BOARDS: { value: BoardId; label: string }[] = [
  { value: 'half-adder', label: 'Half adder' },
  { value: 'nand', label: 'NAND is universal' },
  { value: 'de-morgan', label: "De Morgan's law" },
  { value: 'custom', label: 'Build your own' },
];

const NAND_BUILDS: Record<NandTarget, { circuit: Circuit; layout: LayoutId; label: string }> = {
  NOT: { circuit: NAND_NOT, layout: 'nand-not', label: '¬A' },
  AND: { circuit: NAND_AND, layout: 'nand-and', label: 'A ∧ B' },
  OR: { circuit: NAND_OR, layout: 'nand-or', label: 'A ∨ B' },
};

const bit = (v: boolean) => (v ? 1 : 0);

export function Stage() {
  const [board, setBoard] = useState<BoardId>('half-adder');
  const [nandTarget, setNandTarget] = useState<NandTarget>('AND');
  const [rewrite, setRewrite] = useState<'AND' | 'OR'>('AND');
  const [custom, setCustom] = useState(CUSTOM_START);
  const [selected, setSelected] = useState<string | null>(null);
  const [values, setValues] = useState<TruthRow>({ A: false, B: false, C: false });
  const [pulse, setPulse] = useState(0);
  const setCaption = useSetCaption();

  const { circuit, layoutId, columns, mismatch } = describeBoard(board, nandTarget, rewrite, custom);
  const layout = LAYOUTS[layoutId];
  const signals = evaluate(circuit, values);
  const depth = gateDepth(circuit);
  const wires = wiresOf(circuit, layout);
  const editable = new Set(circuit.gates.filter((g) => g.editable).map((g) => g.id));
  const selectedGate = circuit.gates.find((g) => g.id === selected && editable.has(g.id)) ?? null;

  useIntroCaption(introFor(board, nandTarget), [board, nandTarget]);

  const setInputs = (next: TruthRow) => {
    setValues(next);
    setPulse((p) => p + 1);
    const now = evaluate(circuit, next);
    setCaption(readout(board, circuit, now, next), { quiet: true });
  };

  const flip = (name: string) => setInputs({ ...values, [name]: !values[name] });

  const pickBoard = (b: BoardId) => {
    setBoard(b);
    setSelected(null);
    setPulse(0);
  };

  const pickRewrite = (type: 'AND' | 'OR') => {
    setRewrite(type);
    setPulse((p) => p + 1);
    setCaption(
      type === 'OR' ? (
        <>Now the rewrite is <b>¬A ∨ ¬B</b>, and the two output columns match on <span className="hl ok">every row</span>.
          That's De Morgan: push the NOT inside and <b>flip AND to OR</b>.</>
      ) : (
        <>¬A ∧ ¬B is the tempting "negate each part" rewrite. The <span className="hl bad">red rows</span> are where it
          disagrees with ¬(A ∧ B): the operator has to flip too.</>
      ),
    );
  };

  const setType = (id: string, type: GateType) => {
    const next = [...custom] as typeof custom;
    next[['G1', 'G2', 'G3', 'G4'].indexOf(id)] = type;
    setCustom(next);
    setPulse((p) => p + 1);
    setCaption(<>{id} is now <b>{type}</b>. Every row of the table was recomputed from the new circuit.</>);
  };

  return (
    <StageFrame
      height={330}
      minWidth={MIN_WIDTH}
      stats={
        <Stats>
          {circuit.outputs.map((o) => (
            <Stat key={o.label} label={o.label} value={bit(signals[o.from])} color={signals[o.from] ? 'var(--hi)' : 'var(--muted)'} />
          ))}
          {board === 'half-adder' && (
            <Stat label="A + B" value={bit(values.A) + bit(values.B)} sub={`= ${bit(signals.carry)}${bit(signals.sum)} in binary`} />
          )}
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'high (1)', shape: 'line' },
            { color: 'var(--dim)', label: 'low (0)', shape: 'line' },
            { color: 'var(--info)', label: 'current row' },
            ...(board === 'de-morgan' ? [{ color: 'var(--bad)', label: 'rows that disagree' }] : []),
            ...(editable.size ? [{ color: 'var(--violet)', label: 'gate you can change' }] : []),
          ]}
        />
      }
      controls={[
        <>
          <Segmented label="Circuit" value={board} onChange={pickBoard} options={BOARDS} />
          {board === 'nand' && (
            <Segmented
              label="Build from NAND"
              value={nandTarget}
              onChange={(t) => {
                setNandTarget(t);
                setPulse(0);
              }}
              options={(['NOT', 'AND', 'OR'] as NandTarget[]).map((t) => ({ value: t, label: t }))}
            />
          )}
          {board === 'de-morgan' && (
            <Segmented
              label="Rewrite with"
              value={rewrite}
              onChange={pickRewrite}
              options={[
                { value: 'AND' as const, label: '¬A ∧ ¬B' },
                { value: 'OR' as const, label: '¬A ∨ ¬B' },
              ]}
            />
          )}
        </>,
        <>
          {selectedGate ? (
            <Segmented
              label={`${selectedGate.id} is a`}
              value={selectedGate.type}
              onChange={(t) => setType(selectedGate.id, t)}
              options={GATE_TYPES.map((t) => ({ value: t, label: t }))}
            />
          ) : (
            <Hint>
              Click an input to flip it, or a row of the table.
              {editable.size > 0 && ' Click a violet-outlined gate to change its type.'}
            </Hint>
          )}
        </>,
      ]}
    >
      <div className="stage-pad lg">
        <div className="lg-board">
          <svg viewBox={`0 0 ${BOARD.width} ${BOARD.height}`} className="lg-svg" role="img" aria-label="Logic circuit">
            {wires.map((w) => (
              <path
                key={w.key}
                d={wirePath(w.start, w.end)}
                className={`lg-wire ${w.unused ? 'is-unused' : signals[w.from] ? 'is-high' : 'is-low'}`}
              />
            ))}
            {pulse > 0 &&
              wires
                .filter((w) => !w.unused && signals[w.from])
                .map((w) => (
                  <TravelDot
                    key={`${pulse}-${w.key}`}
                    path={wirePoints(w.start, w.end)}
                    color="var(--hi)"
                    r={4}
                    duration={HOP_S}
                    delay={depth[w.from] * HOP_S}
                    className="lg-dot"
                  />
                ))}
            {circuit.gates.map((g) => (
              <GateShape
                key={g.id}
                type={g.type}
                at={layout.at[g.id]}
                on={signals[g.id]}
                name={editable.has(g.id) ? g.id : undefined}
                editable={editable.has(g.id)}
                selected={selectedGate?.id === g.id}
                onSelect={() => setSelected(selectedGate?.id === g.id ? null : g.id)}
              />
            ))}
            {circuit.inputs.map((name) => (
              <InputSwitch key={name} name={name} at={layout.at[name]} on={values[name]} onFlip={() => flip(name)} />
            ))}
            {circuit.outputs.map((o, i) => (
              <g key={o.label} className={`lg-lamp ${signals[o.from] ? 'is-on' : ''}`}>
                <circle cx={layout.outputs[i].x} cy={layout.outputs[i].y} r={IO_R} />
                <text x={layout.outputs[i].x} y={layout.outputs[i].y + 5} textAnchor="middle" className="lg-io-value">
                  {bit(signals[o.from])}
                </text>
                <text x={layout.outputs[i].x} y={layout.outputs[i].y + IO_R + 16} textAnchor="middle" className="lg-io-name">
                  {o.label}
                </text>
              </g>
            ))}
          </svg>
          <p className="lg-note">Signals change instantly here. Real gates are a handful of transistors and take picoseconds to switch.</p>
        </div>
        <TruthTable
          className="lg-table"
          vars={circuit.inputs}
          columns={columns}
          format="10"
          trueTone="hi"
          currentTone="info"
          currentRow={truthRowIndex(circuit.inputs, values)}
          mismatchRows={mismatch}
          onRowClick={(row) => setInputs({ ...values, ...row })}
        />
      </div>
    </StageFrame>
  );
}

/** The circuit, its table columns and any rows where two outputs that should agree don't. */
function describeBoard(board: BoardId, nandTarget: NandTarget, rewrite: 'AND' | 'OR', custom: typeof CUSTOM_START) {
  const outputColumns = (c: Circuit, labels?: string[]): TruthColumn[] =>
    c.outputs.map((o, i) => ({ label: labels?.[i] ?? o.label, fn: (row) => evaluate(c, row)[o.from] }));

  if (board === 'nand') {
    const build = NAND_BUILDS[nandTarget];
    const reference: TruthColumn = {
      label: <span className="lg-ref">{build.label}</span>,
      fn: (row) => evalGate(nandTarget, row.A, row.B ?? false),
    };
    return { circuit: build.circuit, layoutId: build.layout, columns: [...outputColumns(build.circuit, ['NAND-built']), reference], mismatch: [] };
  }
  if (board === 'de-morgan') {
    const c = deMorgan(rewrite);
    const columns = outputColumns(c, ['¬(A ∧ B)', GATE_FORMULA[rewrite]('¬A', '¬B')]);
    const mismatch = truthRows(c.inputs).flatMap((row, i) => {
      const all = evaluate(c, row);
      return all.notAnd !== all.rewrite ? [i] : [];
    });
    return { circuit: c, layoutId: 'de-morgan' as const, columns, mismatch };
  }
  if (board === 'custom') {
    const c = customCircuit(custom);
    const inner: TruthColumn[] = ['G1', 'G2', 'G3'].map((id) => ({ label: id, fn: (row) => evaluate(c, row)[id] }));
    return { circuit: c, layoutId: 'custom' as const, columns: [...inner, ...outputColumns(c)], mismatch: [] };
  }
  return { circuit: HALF_ADDER, layoutId: 'half-adder' as const, columns: outputColumns(HALF_ADDER), mismatch: [] };
}

function introFor(board: BoardId, nandTarget: NandTarget): ReactNode {
  switch (board) {
    case 'half-adder':
      return <>A <b>half adder</b>: XOR gives the sum bit, AND gives the carry. It's how a CPU adds 1 + 1 = 10 in binary.
        Flip A and B.</>;
    case 'nand':
      return <>Only NAND gates here, yet this behaves exactly like <b>{nandTarget}</b>: compare the two output columns.
        Any circuit at all can be built from NAND alone.</>;
    case 'de-morgan':
      return <>Top: ¬(A ∧ B). Bottom: a rewrite built from ¬A and ¬B. Is "negate each part" enough? The table's red rows
        say no. Switch the rewrite to ∨.</>;
    case 'custom':
      return <>Four gate slots with fixed wiring. Click a gate to change its type and watch the whole truth table
        recompute.</>;
  }
}

function readout(board: BoardId, c: Circuit, now: Record<string, boolean>, inputs: TruthRow): ReactNode {
  const ins = c.inputs.map((n) => `${n}=${bit(inputs[n])}`).join(', ');
  if (board === 'half-adder') {
    return <>{ins}: sum <b>{bit(now.sum)}</b>, carry <b>{bit(now.carry)}</b>, so {bit(inputs.A)} + {bit(inputs.B)} ={' '}
      <span className="hl">{bit(now.carry)}{bit(now.sum)}</span> in binary.</>;
  }
  if (board === 'de-morgan') {
    return now.notAnd === now.rewrite ? (
      <>{ins}: both circuits output <b>{bit(now.notAnd)}</b>. They agree on this row.</>
    ) : (
      <>{ins}: the top circuit says <b>{bit(now.notAnd)}</b>, the rewrite says <span className="hl bad">{bit(now.rewrite)}</span>.
        Not the same function.</>
    );
  }
  const out = c.outputs[0];
  return <>{ins}: {out.label} = <b>{bit(now[out.from])}</b>.</>;
}

function onActivate(fn: () => void) {
  return (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      fn();
    }
  };
}

function InputSwitch({ name, at, on, onFlip }: { name: string; at: { x: number; y: number }; on: boolean; onFlip: () => void }) {
  return (
    <g
      className={`lg-input ${on ? 'is-on' : ''}`}
      role="button"
      tabIndex={0}
      aria-pressed={on}
      aria-label={`Input ${name}, ${on ? 'high' : 'low'}`}
      onClick={onFlip}
      onKeyDown={onActivate(onFlip)}
    >
      <circle cx={at.x} cy={at.y} r={IO_R} />
      <text x={at.x} y={at.y + 5} textAnchor="middle" className="lg-io-value">
        {bit(on)}
      </text>
      <text x={at.x} y={at.y - IO_R - 8} textAnchor="middle" className="lg-io-name">
        {name}
      </text>
    </g>
  );
}

function GateShape({
  type, at, on, name, editable, selected, onSelect,
}: {
  type: GateType;
  at: { x: number; y: number };
  on: boolean;
  name?: string;
  editable: boolean;
  selected: boolean;
  onSelect: () => void;
}) {
  const bubble = bubbleAt(type);
  const interactive = editable
    ? { role: 'button', tabIndex: 0, 'aria-label': `${name ?? 'Gate'}: ${type}. Change its type`, onClick: onSelect, onKeyDown: onActivate(onSelect) }
    : {};
  return (
    <g
      transform={`translate(${at.x} ${at.y})`}
      className={`lg-gate ${on ? 'is-on' : ''} ${editable ? 'is-editable' : ''} ${selected ? 'is-selected' : ''}`}
      {...interactive}
    >
      {type === 'XOR' && <path d={XOR_BACK_PATH} className="lg-gate-back" />}
      <path d={gateBodyPath(type)} className="lg-gate-body" />
      {bubble && <circle cx={bubble.x} cy={bubble.y} r={BUBBLE_R} className="lg-gate-body" />}
      <text x={type === 'NOT' ? -6 : -4} y={4} textAnchor="middle" className="lg-gate-type">
        {type}
      </text>
      {name && (
        <text y={-30} textAnchor="middle" className="lg-gate-name">
          {name}
        </text>
      )}
    </g>
  );
}
