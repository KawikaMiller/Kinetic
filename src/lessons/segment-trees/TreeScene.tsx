import { useState, type ReactNode } from 'react';
import { ArrayStrip } from '../../components/ArrayStrip';
import { Tray } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Button, Hint, Legend, Provenance, ProvenanceRow, Segmented, Stat, Stats, TextField, Toggle } from '../../components/ui';
import { usePlayer } from '../../core/usePlayer';
import { segFrames, type Action, type SegRun } from './frames';
import { parseField, parseRange, parseValue } from './keys';
import { OPS, addRange, buildTree, cellValues, type Op, type SegTree } from './model';
import { ADD_DEFAULT, DEFAULT_OP, DEFAULT_SIZE, QUERY_DEFAULT, SIZES, valuesFor } from './presets';
import { SegTreeView } from './SegTreeView';

const STEP_MS = 1000;

interface Session {
  tree: SegTree;
  run: SegRun;
  /** The operation just run and the tree it ran on: what the "other way" stat compares against. */
  action: Action;
  before: SegTree;
}

const defaultAction = (mode: 'basic' | 'lazy', n: number): Action =>
  mode === 'basic'
    ? { kind: 'query', l: Math.min(QUERY_DEFAULT.l, n - 1), r: Math.min(QUERY_DEFAULT.r, n - 1) }
    : { kind: 'add', l: Math.min(ADD_DEFAULT.l, n - 1), r: Math.min(ADD_DEFAULT.r, n - 1), v: ADD_DEFAULT.v, lazy: true };

const start = (mode: 'basic' | 'lazy', n: number, op: Op): Session => {
  const tree = buildTree(valuesFor(n), op);
  const action = defaultAction(mode, n);
  const run = segFrames(tree, action);
  return { tree: run.result.tree, run, action, before: tree };
};

const OPS_BASIC: Op[] = ['sum', 'min', 'max', 'gcd'];
const OPS_LAZY: Op[] = ['sum', 'min', 'max'];
const WORD: Record<'basic' | 'lazy', string> = { basic: 'Query and point update', lazy: 'Range add with lazy tags' };

/** Scenes 2 and 3: the segment tree, one step at a time. In `lazy` mode a range add takes tags and a toggle turns laziness off. */
export function TreeScene({ picker, mode }: { picker: ReactNode; mode: 'basic' | 'lazy' }) {
  const [n, setN] = useState<number>(DEFAULT_SIZE);
  const [op, setOp] = useState<Op>(DEFAULT_OP);
  const [session, setSession] = useState<Session>(() => start(mode, DEFAULT_SIZE, DEFAULT_OP));
  const first = defaultAction(mode, DEFAULT_SIZE);
  const [lText, setLText] = useState(String('l' in first ? first.l : 0));
  const [rText, setRText] = useState(String('r' in first ? first.r : 0));
  const [vText, setVText] = useState(String(mode === 'lazy' ? ADD_DEFAULT.v : 7));
  const [lazy, setLazy] = useState(true);
  const [note, setNote] = useState<string | null>(null);
  const [swap, setSwap] = useState<{ l: number; r: number } | null>(null);
  const player = usePlayer(session.run.frames, { interval: STEP_MS });
  const f = player.frame;
  const result = session.run.result;

  const reload = (nextN: number, nextOp: Op) => {
    player.queueNext({ play: false });
    setSession(start(mode, nextN, nextOp));
    const a = defaultAction(mode, nextN);
    if ('l' in a) {
      setLText(String(a.l));
      setRText(String(a.r));
    }
    setNote(null);
    setSwap(null);
  };
  const run = (kind: 'range' | 'cell', make: (l: number, r: number, v: number) => Action) => {
    let l: number;
    let r: number;
    if (kind === 'range') {
      const range = parseRange(lText, rText, n);
      if (!range.ok) {
        setNote(range.error);
        setSwap(range.swapOffer ?? null);
        return;
      }
      ({ l, r } = range);
    } else {
      const cell = parseField(lText, 0, n - 1, 'the cell');
      if (!cell.ok) {
        setNote(cell.error);
        return;
      }
      l = cell.value;
      r = cell.value;
    }
    const value = parseValue(vText);
    if (!value.ok) {
      setNote(value.error);
      return;
    }
    setNote(null);
    setSwap(null);
    const action = make(l, r, value.value);
    const next = segFrames(session.tree, action);
    setSession({ tree: next.result.tree, run: next, action, before: session.tree });
  };
  const doQuery = () => run('range', (l, r) => ({ kind: 'query', l, r }));
  const doSet = () => run('cell', (l, _r, v) => ({ kind: 'set', i: l, v }));
  const doAdd = () => run('range', (l, r, v) => ({ kind: 'add', l, r, v, lazy }));

  const last = session.action;
  const otherWay = last.kind === 'add' ? addRange(session.before, last.l, last.r, last.v, !last.lazy).touched : null;
  const values = cellValues(f.tree);
  const bound = 2 * Math.ceil(Math.log2(n));

  return (
    <StageFrame
      player={player}
      height={470}
      stats={
        <Stats>
          <Stat label="Nodes touched" value={result.touched} color="var(--ok)" sub={`by the last operation, of ${2 * n - 1} nodes`} />
          {mode === 'basic' ? (
            <Stat label="Covering nodes" value={result.covering.length} sub={`at most 2 x ceil(log2 ${n}) = ${bound}`} />
          ) : (
            <Stat label="Same add, other way" value={otherWay ?? '–'} sub={last.kind !== 'add' ? 'shown after an add' : last.lazy ? 'nodes the eager way would touch' : 'nodes lazy tags would touch'} />
          )}
          <Stat label="Pending tags" value={Object.values(f.tree.nodes).filter((x) => x.tag !== 0).length} color="var(--violet)" sub="added, not yet pushed down" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'node being looked at', shape: 'square' },
            { color: 'var(--ok)', label: 'inside the range: taken whole', shape: 'square' },
            { color: 'var(--info)', label: 'overlaps in part: go down', shape: 'square' },
            { color: 'var(--dim)', label: 'outside the range', shape: 'square' },
            { color: 'var(--violet)', label: 'lazy tag / tag being pushed', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented label="Cells" value={n} onChange={(v) => { setN(v); reload(v, op); }} options={SIZES.map((s) => ({ value: s, label: String(s) }))} />
          <Segmented
            label="Operation"
            value={op}
            onChange={(v) => {
              setOp(v);
              reload(n, v);
            }}
            options={(mode === 'basic' ? OPS_BASIC : OPS_LAZY).map((o) => ({ value: o, label: OPS[o].label }))}
          />
          {mode === 'lazy' && <Toggle label="Laziness" value={lazy} onChange={setLazy} off="Off: visit every leaf" on="On: tags" />}
        </>,
        <>
          <TextField label={mode === 'basic' ? 'l (cell for a set)' : 'l'} value={lText} onChange={setLText} onEnter={doQuery} width={64} spellCheck={false} />
          <TextField label="r" value={rText} onChange={setRText} onEnter={doQuery} width={64} spellCheck={false} />
          <TextField label={mode === 'basic' ? 'Value' : 'Add'} value={vText} onChange={setVText} width={72} spellCheck={false} />
          {mode === 'basic' ? (
            <>
              <Button variant="primary" onClick={doQuery}>Query [l, r]</Button>
              <Button onClick={doSet}>Set cell l to value</Button>
            </>
          ) : (
            <>
              <Button variant="primary" onClick={doAdd}>Add to [l, r]</Button>
              <Button onClick={doQuery}>Query [l, r]</Button>
            </>
          )}
          <Button onClick={() => reload(n, op)}>Reset</Button>
          {swap && (
            <Button
              onClick={() => {
                setLText(String(swap.l));
                setRText(String(swap.r));
                setSwap(null);
                setNote(null);
              }}
            >
              Swap l and r
            </Button>
          )}
          <Hint>
            <span role="status">{note ?? `${WORD[mode]}. Cells are numbered from 0 to ${n - 1}; values are whole numbers from -999 to 999.${mode === 'lazy' ? ' gcd is not offered here: a range add has no effect on a gcd that a tag could hold, so it is refused.' : ''}`}</span>
          </Hint>
        </>,
      ]}
    >
      <div className="st-stage stage-pad">
        <SegTreeView tree={f.tree} frame={f} ariaLabel={`Segment tree over ${n} cells for ${OPS[op].label}`} />
        <Tray label="The cells, with tags applied" labelWeight="regular" stack ariaLabel="Cells">
          <ArrayStrip
            values={values}
            ranges={f.range ? [{ from: f.range.l, to: f.range.r, tone: 'info', labels: ['l', 'r'] }] : []}
            showIndex
            cellMax={56}
            fontSize={12}
          />
        </Tray>
      </div>
      <ProvenanceRow>
        <Provenance kind="real">node counts are counted from the tree as drawn; answers are checked against a plain loop</Provenance>
      </ProvenanceRow>
    </StageFrame>
  );
}
