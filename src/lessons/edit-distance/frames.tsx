import type { ReactNode } from 'react';
import { plural } from '../../core/format';
import { createRecorder } from '../../core/recorder';
import type { Frame } from '../../core/types';
import { editTable, hamming, replay, traceback, type Candidates, type Costs, type Op, type Source, type Tinted } from './model';

export type EdPhase = 'fill' | 'trace' | 'replay' | 'done';

export interface EdFrame extends Frame {
  phase: EdPhase;
  /** Row 0 and column 0 shown yet. */
  edges: 0 | 1 | 2;
  /** Inner cells filled, in row-major order. */
  cells: number;
  /** The cell computed now and its candidates. */
  cur: [number, number] | null;
  cands: Candidates | null;
  /** Traceback cells so far, from (m, n) back towards (0, 0). */
  path: [number, number][];
  /** The replayed word, letter by letter, and the op just applied. */
  letters: Tinted[] | null;
  op: Op | null;
}

const q = (s: string) => `“${s}”`;
const SOURCE_NAME: Record<Source, string> = { left: 'the left', up: 'above', diag: 'the diagonal' };

/** Is inner cell (i, j) filled after `cells` row-major steps over an m × n table? */
export const isFilled = (f: Pick<EdFrame, 'edges' | 'cells'>, i: number, j: number, n: number) =>
  i === 0 ? f.edges >= 1 : j === 0 ? f.edges >= 2 : (i - 1) * n + (j - 1) < f.cells;

export function tableFrames(a: string, b: string, costs: Costs): EdFrame[] {
  const t = editTable(a, b, costs);
  const m = t.a.length;
  const n = t.b.length;
  const r = createRecorder<EdFrame>(
    { phase: 'fill', edges: 0, cells: 0, cur: null, cands: null, path: [], letters: null, op: null },
    { transient: { cur: null, cands: null } },
  );
  const subNote = costs.sub === 1 ? 'substitute 1' : 'substitute 2, as much as a delete plus an insert';
  r.snap(
    <>
      D[i][j] is the cheapest way to turn the first i letters of {q(a)} into the first j letters of {q(b)}. Costs: insert 1, delete 1,{' '}
      {subNote}.
    </>,
  );
  r.snap(<>Row 0: from nothing, the first j letters of {q(b)} take j inserts.</>, undefined, { edges: 1 });
  r.snap(<>Column 0: deleting the first i letters of {q(a)} takes i deletes.</>, undefined, { edges: 2 });
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const c = t.cands[i][j]!;
      r.snap(cellCaption(t.a, t.b, i, j, c, costs), undefined, { cur: [i, j], cands: c, cells: r.get().cells + 1 });
    }
  }
  const dist = t.d[m][n];
  r.set({ phase: 'trace' });
  const { path, ops } = traceback(t);
  r.snap(
    <>
      Table full: the distance is D[{m}][{n}] = <b>{dist}</b>. Now trace back from that corner, following each cell's winning arrow to (0, 0).
    </>,
    undefined,
    { path: [path[0]] },
  );
  // Ops are in forward order; the traceback walks them backwards.
  for (let k = 1; k < path.length; k++) {
    const op = ops[ops.length - k];
    const [fi, fj] = path[k - 1];
    const [ti, tj] = path[k];
    r.snap(
      <>
        D[{fi}][{fj}] came from D[{ti}][{tj}]: {opText(op)}
      </>,
      undefined,
      { path: path.slice(0, k + 1) },
    );
  }
  r.set({ phase: 'replay' });
  for (const step of replay(a, ops)) {
    if (step.op.t === 'match') r.set({ letters: step.letters, op: step.op });
    else r.snap(<>Replay: {opText(step.op)} The word is now {q(step.word)}.</>, undefined, { letters: step.letters, op: step.op });
  }
  r.set({ phase: 'done', op: null, letters: replay(a, ops).at(-1)?.letters ?? [...a].map((ch) => ({ ch, kind: 'match' as const })) });
  r.close(summary(a, b, ops, dist, costs), 2);
  return r.frames;
}

function cellCaption(A: string[], B: string[], i: number, j: number, c: Candidates, costs: Costs): ReactNode {
  const tie = (['diag', 'up', 'left'] as Source[]).filter((s) => c[s] === c[c.win]);
  return (
    <>
      D[{i}][{j}], {q(A[i - 1])} against {q(B[j - 1])}: from the left {c.left - costs.ins} + {costs.ins} (insert {q(B[j - 1])}) = {c.left}; from
      above {c.up - costs.del} + {costs.del} (delete {q(A[i - 1])}) = {c.up}; diagonal {c.match ? <>{c.diag} + 0 (match)</> : <>{c.diag - costs.sub} + {costs.sub} (substitute)</>}{' '}
      = {c.diag}. Best <b>{c[c.win]}</b>, from {SOURCE_NAME[c.win]}
      {tie.length > 1 ? <> (a tie between {tie.map((x) => SOURCE_NAME[x]).join(' and ')}; either gives an optimal script)</> : null}.
    </>
  );
}

export function opText(op: Op): ReactNode {
  if (op.t === 'match') return <>{q(op.ch)} matches: free.</>;
  if (op.t === 'sub') return <>Substitute {q(op.from)} → {q(op.to)}.</>;
  if (op.t === 'ins') return <>Insert {q(op.ch)}.</>;
  return <>Delete {q(op.ch)}.</>;
}

/** The closing caption: the distance, the script's make-up, and Hamming beside it. */
export function summary(a: string, b: string, ops: readonly Op[], dist: number, costs: Costs): ReactNode {
  const count = (t: Op['t']) => ops.filter((o) => o.t === t).length;
  const parts = [
    count('sub') && plural(count('sub'), 'substitution'),
    count('ins') && plural(count('ins'), 'insertion'),
    count('del') && plural(count('del'), 'deletion'),
  ].filter(Boolean);
  const h = hamming(a, b);
  return (
    <>
      {q(a)} → {q(b)}: edit distance <b>{dist}</b>
      {parts.length ? <> ({parts.join(', ')}{costs.sub === 2 && count('sub') ? ', substitutions costing 2' : ''})</> : <>, the words are equal</>}.{' '}
      {h === null ? (
        <>Hamming distance isn't defined: the lengths differ.</>
      ) : (
        <>Hamming distance, comparing position by position, says {h}{h > dist && costs.sub === 1 ? <>: it can't shift letters, so it overcounts</> : null}.</>
      )}
    </>
  );
}

// ── Line diff scene ───────────────────────────────────────────────────

export function diffCaption(removed: number, added: number, kept: number, applies: boolean): ReactNode {
  return (
    <>
      With only inserts and deletes allowed, the cheapest script keeps {plural(kept, 'line')} in common and costs {removed} + {added} ={' '}
      <b>{removed + added}</b>: {plural(removed, 'line')} removed, {plural(added, 'line')} added.{' '}
      {applies ? <>Applying it to version 1 gives version 2 exactly.</> : <>Applying it to version 1 does not give version 2.</>}
    </>
  );
}
