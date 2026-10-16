import { Fragment, useMemo, useState, type ReactNode } from 'react';
import { ArrayStrip, type ArrayCellState } from '../../components/ArrayStrip';
import { StageFrame } from '../../components/StageFrame';
import { ClaimLabel, Hint, Legend, Provenance, ProvenanceRow, Segmented, Slider, Stat, Stats, Toggle } from '../../components/ui';
import { sig } from '../../core/format';
import { usePlayer } from '../../core/usePlayer';
import { reduceFrames, type ReduceFrame } from './frames';
import { InputBar } from './InputBar';
import { reduceOpening } from './openings';
import { FLOAT_PRESET, MAX_PROCESSORS, OPS, OP_IDS, brentRange, floatGroupings, foldCost, lift, reduceVerdict, showValue, treeCost, type OpId } from './patterns';
import { useListInput } from './useListInput';

const OP_OPTIONS = OP_IDS.map((id) => ({ value: id, label: OPS[id].label }));
const CELL_MAX = 56;
const same = (a: readonly number[], b: readonly number[]) => a.length === b.length && a.every((v, i) => v === b[i]);

export function ReduceScene({ picker }: { picker: ReactNode }) {
  const [open] = useState(reduceOpening);
  const input = useListInput({ values: open.values, op: open.op });
  const [arrival, setArrival] = useState(open.arrival);
  const [p, setP] = useState(open.p);
  const { op, values } = input;
  const lifted = useMemo(() => lift(values, op), [values, op]);
  const verdict = useMemo(() => reduceVerdict(lifted, OPS[op], arrival), [lifted, op, arrival]);
  const frames = useMemo(() => reduceFrames(lifted, verdict, op, arrival), [lifted, verdict, op, arrival]);
  const player = usePlayer<ReduceFrame>(frames, { interval: 900, autoplayOnChange: false });
  const level = player.frame.level;
  const levels = verdict.tree.levels;
  const small = values.length > 10;
  const atEnd = player.atEnd;
  const tc = treeCost(values.length);
  const fc = foldCost(values.length);
  const range = brentRange(tc, p);
  const groupings = floatGroupings();
  const isFloat = same(values, FLOAT_PRESET);

  const levelState = (k: number) => (): ArrayCellState => {
    if (k > level) return 'dim';
    if (k === level && k > 0) return atEnd && k === levels.length - 1 ? (verdict.agree ? 'done' : 'bad') : 'active';
    if (k === level - 1) return 'info';
    return 'idle';
  };

  const setOp = (next: OpId) => input.setOp(next);

  return (
    <StageFrame
      player={player}
      height={440}
      stats={
        <Stats>
          <Stat label="Fold" value={showValue(verdict.fold.result, 10)} color="var(--ok)" sub={[`${fc.span} steps, one after another`]} />
          <Stat
            label="Tree"
            value={showValue(verdict.tree.result, 10)}
            color={verdict.agree ? 'var(--ok)' : 'var(--bad)'}
            sub={[`${tc.span} levels, ${tc.work} operations`, verdict.agree ? 'agrees with the fold' : verdict.reason === 'regrouping' ? 'regrouping changes the answer' : 'reordering changes the answer']}
          />
          <Stat label={`On ${p} processors`} value={`${sig(range.low)} to ${sig(range.high)}`} sub={['ceil(work / p) to work / p + span']} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'operands being combined' },
            { color: 'var(--hi)', label: 'partial result written' },
            { color: 'var(--ok)', label: 'tree agrees with the fold' },
            { color: 'var(--bad)', label: 'tree\'s wrong value' },
            { color: 'var(--dim)', label: 'not touched' },
          ]}
        />
      }
      controls={[
        <Fragment key="row0">
          {picker}
          <Segmented label="Operator" value={op} onChange={setOp} options={OP_OPTIONS} />
          <Toggle label="Combine" value={arrival} onChange={setArrival} off="in order" on="in arrival order" />
          <Slider label="Processors p" value={p} min={1} max={MAX_PROCESSORS} onChange={setP} />
        </Fragment>,
        <InputBar
          key="input"
          input={input}
          presets={[
            { id: 'sum8', label: 'sum of 8', on: op === 'plus' && same(values, [3, 1, 4, 1, 5, 9, 2, 6]), apply: () => input.load([3, 1, 4, 1, 5, 9, 2, 6], 'plus') },
            { id: 'sub4', label: 'subtract 8, 4, 2, 1', on: op === 'subtract' && same(values, [8, 4, 2, 1]), apply: () => input.load([8, 4, 2, 1], 'subtract') },
            { id: 'cat', label: 'concatenate 1 to 4', on: op === 'concat' && same(values, [1, 2, 3, 4]), apply: () => input.load([1, 2, 3, 4], 'concat') },
            { id: 'float', label: 'floats 0.1 to 0.8', on: isFloat, apply: () => input.load(FLOAT_PRESET, 'plus') },
          ]}
        />,
      ]}
    >
      <div className="pp-stage stage-pad">
        {levels.map((vals, k) => (
          <div key={k} className="pp-level">
            <span className="section-title">{k === 0 ? 'Input' : `Level ${k}`}</span>
            <ArrayStrip values={vals.map((v) => showValue(v))} cellState={levelState(k)} fontSize={small ? 10 : 13} cellMax={CELL_MAX} />
          </div>
        ))}
        <div className="pp-level">
          <span className="section-title">Sequential fold: the running result after each element</span>
          <ArrayStrip values={verdict.fold.prefix.map((v) => showValue(v))} cellState={(i) => (i === values.length - 1 ? 'done' : 'idle')} fontSize={small ? 10 : 13} cellMax={CELL_MAX} />
        </div>
        {isFloat && (
          <Hint tone="muted" block>
            Real JavaScript: (0.1 + 0.2) + 0.3 is {groupings.leftToRight}, while 0.1 + (0.2 + 0.3) is {groupings.rightToLeft}. Floating-point addition regroups to different bits.
          </Hint>
        )}
        <ProvenanceRow>
          <Provenance kind="toy">steps are model steps; real hardware has p fixed by the machine and memory costs the model ignores</Provenance>
          <Provenance kind="real">the sums and joins are real JavaScript arithmetic, so the floating-point result is the one your console gives</Provenance>
          <ClaimLabel kind="practice">map-reduce style systems need the combining function to be associative (and often commutative); from memory, verify against the Spark reduce documentation</ClaimLabel>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
