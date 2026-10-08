import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { CodePanel } from '../../components/CodePanel';
import { SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Button, ChipButton, ControlGroup, Hint, Legend, Toggle } from '../../components/ui';
import { WideRegion } from '../../components/WideRegion';
import { usePlayer } from '../../core/usePlayer';
import { MAX_NODES, canWrap, renameTarget, swapRelation, unwrapNode, wrapNode, type Wrap } from './edit';
import { ExprTree } from './ExprTree';
import { nodeTitle, runFrames, type AlgebraFrame } from './frames';
import {
  CMP_OPS, GLYPH, OP_NAME, PRESETS, REL_NAMES, compareValues, evaluate, findNode, formatValue, schemaOf,
  type BinaryOp, type CmpOp, type Expr, type Mode, type PresetId, type RelName, type Rhs,
} from './model';
import { RelTable } from './RelTable';
import { toSql } from './sql';
import { panelsFor, type Panel } from './view';

const STEP_MS = 1700;
/** A table this wide (columns) gets its own sideways scroller on a phone. */
const WIDE_COLS = 5;
const WIDE_TABLES_PX = 460;
const UNARY: ('select' | 'project' | 'rename')[] = ['select', 'project', 'rename'];
const BINARY: BinaryOp[] = ['join', 'product', 'union', 'diff'];
const MAX_VALUE_CHIPS = 8;

const HONEST = "Evaluated by the lesson's own engine; the SQL shown is checked against SQLite in tests (bag difference, which SQLite lacks, against a reference).";

type Pending =
  | null
  | { op: 'select'; col: string | null; cmp: CmpOp; rhs: Rhs | null }
  | { op: 'project'; cols: string[] }
  | { op: 'rename'; col: string | null }
  | { op: BinaryOp; right: RelName | null };

const BUILD_LEGEND = (
  <Legend items={[
    { color: 'var(--hi)', label: 'operator running now' },
    { color: 'var(--info)', label: 'rows passing through' },
    { color: 'var(--dim)', label: 'rows filtered out' },
    { color: 'var(--violet)', label: 'duplicate, about to merge' },
    { color: 'var(--bad)', label: "a node that can't run" },
  ]} />
);

export function BuildScene({ picker }: { picker: ReactNode }) {
  const [tree, setTree] = useState<Expr>(PRESETS[0].expr);
  const [preset, setPreset] = useState<PresetId | null>(PRESETS[0].id);
  const [mode, setMode] = useState<Mode>('set');
  const [selected, setSelected] = useState<string>(PRESETS[0].expr.id);
  const [pending, setPending] = useState<Pending>(null);
  const [focusTree, setFocusTree] = useState(0);
  const sceneRef = useRef<HTMLDivElement>(null);

  const ev = useMemo(() => evaluate(tree, mode), [tree, mode]);
  const frames = useMemo(() => runFrames(tree, mode), [tree, mode]);
  const player = usePlayer<AlgebraFrame>(frames, { interval: STEP_MS, autoplayOnChange: false });
  const f = player.frame;
  const final = f.node === null && player.index > 0;
  const panels = panelsFor(tree, ev, f.node, f.phase, final, mode);
  const sql = schemaOf(tree).ok ? toSql(tree, mode) : null;
  const picked = findNode(tree, selected) ?? tree;
  const current = f.node ? findNode(tree, f.node) : null;
  const currentError = current && ev.get(current.id);

  // After an edit that unmounts the focused control, put focus on the picked node in the tree.
  useEffect(() => {
    if (!focusTree) return;
    sceneRef.current?.querySelector<SVGGElement>(`[data-node="${CSS.escape(selected)}"]`)?.focus();
  }, [focusTree, selected]);

  const commit = (next: Expr, sel: string) => {
    setTree(next);
    setSelected(sel);
    setPreset(null);
    setPending(null);
    setFocusTree((k) => k + 1);
  };
  const load = (id: PresetId) => {
    const p = PRESETS.find((x) => x.id === id)!;
    setTree(p.expr);
    setSelected(p.expr.id);
    setPreset(id);
    setPending(null);
  };
  const apply = (w: Wrap) => {
    const r = wrapNode(tree, picked.id, w);
    if (r) commit(r.tree, r.selected);
  };
  const remove = () => {
    const r = unwrapNode(tree, picked.id);
    if (r) commit(r.tree, r.selected);
  };

  const editRow = (
    <EditRow
      picked={picked}
      tree={tree}
      pending={pending}
      setPending={setPending}
      onRemove={remove}
      onSwap={(name) => { setTree(swapRelation(tree, picked.id, name)); setPreset(null); }}
    />
  );
  const paramRow = pending && <ParamRow picked={picked} tree={tree} mode={mode} pending={pending} setPending={setPending} onApply={apply} />;
  const wide = [...panels.inputs, ...(panels.output ? [panels.output] : [])].some((p) => p.cols.length >= WIDE_COLS);
  const tables = <Tables inputs={panels.inputs} output={panels.output} />;

  return (
    <StageFrame
      player={player}
      height={560}
      legend={BUILD_LEGEND}
      controls={[
        <Fragment key="scene">{picker}<Toggle label="Semantics" value={mode === 'bag'} onChange={(b) => setMode(b ? 'bag' : 'set')} off="Set (the algebra)" on="Bag (SQL's default)" /></Fragment>,
        <ControlGroup key="presets" label="Presets" inline>
          {PRESETS.map((p) => <ChipButton key={p.id} tone="info" on={preset === p.id} onClick={() => load(p.id)}>{p.label}</ChipButton>)}
        </ControlGroup>,
        <Fragment key="edit">{editRow}</Fragment>,
        ...(paramRow ? [<Fragment key="params">{paramRow}</Fragment>] : []),
      ]}
    >
      <div className="stage-pad ra" ref={sceneRef}>
        <div className="ra-top">
          <div className="ra-tree-box">
            <SectionTitle weight="regular" hint="click a node to edit it">Expression tree</SectionTitle>
            <ExprTree
              expr={tree}
              ev={ev}
              current={f.node}
              selected={picked.id}
              counted={new Set(f.done)}
              onSelect={(id) => { setSelected(id); setPending(null); }}
              label="Relational algebra expression tree"
            />
          </div>
          <div className="ra-sql">
            <SectionTitle weight="regular" hint={mode === 'set' ? 'set: DISTINCT, UNION, EXCEPT' : 'bag: ALL'}>The same query in SQL</SectionTitle>
            {sql ? <CodePanel lines={sql} gutter="none" className="ra-code" /> : <p className="empty-note">Fix the red node and the SQL appears.</p>}
          </div>
        </div>
        {currentError && !currentError.ok && <p className="ra-error" role="status">{nodeTitle(current!)}: {currentError.error}.</p>}
        {wide ? <WideRegion minWidth={WIDE_TABLES_PX} label="Tables: scroll sideways to see every column">{tables}</WideRegion> : tables}
        <Hint block>
          SQL's <code>SELECT</code> keeps duplicates unless you write <code>DISTINCT</code>, but <code>UNION</code> and <code>EXCEPT</code> remove them
          unless you write <code>ALL</code>. <code>EXCEPT ALL</code> is standard SQL (Postgres has it; SQLite doesn't). {HONEST}
        </Hint>
      </div>
    </StageFrame>
  );
}

function Tables({ inputs, output }: { inputs: Panel[]; output: Panel | null }) {
  return (
    <div className="ra-tables">
      {inputs.map((p) => (
        <RelTable key={`${p.title}-${p.detail}`} title={<>{p.title}: <span className="keep-case">{p.detail}</span></>} cols={p.cols} rows={p.rows} ariaLabel={`${p.title}: ${p.detail}`} />
      ))}
      {inputs.length > 0 && output && <span className="ra-arrow" aria-hidden="true">→</span>}
      {output && (
        <RelTable
          title={output.title}
          cols={output.cols}
          rows={output.rows}
          headTone={(c) => (c === output.litCol ? 'hi' : null)}
          ariaLabel={output.title}
        />
      )}
    </div>
  );
}

function EditRow({ picked, tree, pending, setPending, onRemove, onSwap }: {
  picked: Expr;
  tree: Expr;
  pending: Pending;
  setPending: (p: Pending) => void;
  onRemove: () => void;
  onSwap: (name: RelName) => void;
}) {
  const startFor = (op: NonNullable<Pending>['op']): Pending => {
    switch (op) {
      case 'select':
        return { op, col: null, cmp: '=', rhs: null };
      case 'project':
        return { op, cols: [] };
      case 'rename':
        return { op, col: null };
      default:
        return { op, right: null };
    }
  };
  const full = !canWrap(tree, false);
  const fullBinary = !canWrap(tree, true);
  return (
    <>
      <span className="ra-picked">Picked: <b>{nodeTitle(picked)}</b></span>
      <ControlGroup label="Wrap it in" inline>
        {[...UNARY, ...BINARY].map((op) => (
          <ChipButton
            key={op}
            tone="info"
            on={pending?.op === op}
            disabled={UNARY.includes(op as 'select') ? full : fullBinary}
            title={OP_NAME[op]}
            ariaLabel={`Wrap in ${OP_NAME[op]} (${GLYPH[op]})`}
            onClick={() => setPending(pending?.op === op ? null : startFor(op))}
          >
            {GLYPH[op]}
          </ChipButton>
        ))}
      </ControlGroup>
      {picked.op === 'rel' ? (
        <ControlGroup label="Or swap for" inline>
          {REL_NAMES.filter((r) => r !== picked.name).map((r) => <ChipButton key={r} tone="violet" onClick={() => onSwap(r)}>{r}</ChipButton>)}
        </ControlGroup>
      ) : (
        <Button onClick={onRemove}>Remove {GLYPH[picked.op]}</Button>
      )}
      {(full || fullBinary) && <Hint>Trees here stop at {MAX_NODES} nodes, so they stay readable.</Hint>}
    </>
  );
}

function ParamRow({ picked, tree, mode, pending, setPending, onApply }: {
  picked: Expr;
  tree: Expr;
  mode: Mode;
  pending: NonNullable<Pending>;
  setPending: (p: Pending) => void;
  onApply: (w: Wrap) => void;
}) {
  const s = schemaOf(picked);
  const cancel = <Button onClick={() => setPending(null)}>Cancel</Button>;
  if (pending.op === 'join' || pending.op === 'product' || pending.op === 'union' || pending.op === 'diff') {
    const op = pending.op;
    return (
      <>
        <ControlGroup label={`${GLYPH[op]} with`} inline>
          {REL_NAMES.map((r) => <ChipButton key={r} tone="violet" on={pending.right === r} onClick={() => setPending({ op, right: r })}>{r}</ChipButton>)}
        </ControlGroup>
        <Button variant="primary" disabled={!pending.right} onClick={() => pending.right && onApply({ op, right: pending.right })}>Apply {GLYPH[op]}</Button>
        {cancel}
        <Hint>The picked node becomes the left input.</Hint>
      </>
    );
  }
  if (!s.ok) return <><Hint tone="muted">This node has an error, so it has no columns to choose from. Fix it first.</Hint>{cancel}</>;
  const { cols, types } = s.schema;
  if (pending.op === 'project') {
    const toggle = (c: string) => setPending({ op: 'project', cols: pending.cols.includes(c) ? pending.cols.filter((x) => x !== c) : cols.filter((x) => x === c || pending.cols.includes(x)) });
    return (
      <>
        <ControlGroup label="π keep" inline>
          {cols.map((c) => <ChipButton key={c} tone="info" on={pending.cols.includes(c)} onClick={() => toggle(c)}>{c}</ChipButton>)}
        </ControlGroup>
        <Button variant="primary" disabled={pending.cols.length === 0} onClick={() => onApply({ op: 'project', cols: pending.cols })}>Apply π</Button>
        {cancel}
      </>
    );
  }
  if (pending.op === 'rename') {
    return (
      <>
        <ControlGroup label="ρ rename" inline>
          {cols.map((c) => (
            <ChipButton key={c} tone="info" on={pending.col === c} onClick={() => setPending({ op: 'rename', col: c })}>
              {c} → {renameTarget(c, cols)}
            </ChipButton>
          ))}
        </ControlGroup>
        <Button variant="primary" disabled={!pending.col} onClick={() => pending.col && onApply({ op: 'rename', from: pending.col, to: renameTarget(pending.col, cols) })}>Apply ρ</Button>
        {cancel}
      </>
    );
  }
  if (pending.op !== 'select') return null;
  // σ: column, comparison, then a value seen in that column or another column of the same kind.
  const colType = pending.col ? types[cols.indexOf(pending.col)] : null;
  const ev = evaluate(tree, mode).get(picked.id);
  const values = pending.col && ev?.ok
    ? [...new Set(ev.out.rows.map((r) => r[cols.indexOf(pending.col!)]))].sort(compareValues).slice(0, MAX_VALUE_CHIPS)
    : [];
  const otherCols = pending.col ? cols.filter((c, i) => c !== pending.col && types[i] === colType) : [];
  const rhsIs = (r: Rhs) => pending.rhs !== null && JSON.stringify(pending.rhs) === JSON.stringify(r);
  const set = (patch: Partial<{ col: string; cmp: CmpOp; rhs: Rhs | null }>) => setPending({ ...pending, ...patch });
  return (
    <>
      <ControlGroup label="σ test" inline>
        {cols.map((c) => <ChipButton key={c} tone="info" on={pending.col === c} onClick={() => set({ col: c, rhs: null })}>{c}</ChipButton>)}
      </ControlGroup>
      {pending.col && (
        <ControlGroup label="is" inline>
          {CMP_OPS.map((o) => <ChipButton key={o} tone="info" on={pending.cmp === o} onClick={() => set({ cmp: o })}>{o}</ChipButton>)}
        </ControlGroup>
      )}
      {pending.col && (
        <ControlGroup label="against" inline>
          {values.map((v) => <ChipButton key={String(v)} tone="violet" on={rhsIs({ kind: 'value', value: v })} onClick={() => set({ rhs: { kind: 'value', value: v } })}>{formatValue(v)}</ChipButton>)}
          {otherCols.map((c) => <ChipButton key={`c-${c}`} tone="violet" on={rhsIs({ kind: 'col', col: c })} onClick={() => set({ rhs: { kind: 'col', col: c } })}>column {c}</ChipButton>)}
          {values.length === 0 && otherCols.length === 0 && <Hint>This input has no rows, so there are no values to pick.</Hint>}
        </ControlGroup>
      )}
      <Button variant="primary" disabled={!pending.col || !pending.rhs} onClick={() => pending.col && pending.rhs && onApply({ op: 'select', cond: { col: pending.col, op: pending.cmp, rhs: pending.rhs } })}>Apply σ</Button>
      {cancel}
    </>
  );
}
