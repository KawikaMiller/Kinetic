// What the tables under the tree show at each frame: the current operator's inputs, with each
// row marked passing, dropped or cancelled, and its output, with duplicates flagged before
// they collapse. Pure, so the marks are tested against the evaluator's own counts.
import { plural } from '../../core/format';
import type { ShownRow } from './RelTable';
import { DB, children, findNode, postOrder, type Evaluation, type Expr, type Mode, type RelName, type Relation, type Row } from './model';
import { nodeTitle, type Phase } from './frames';

export interface Panel {
  title: string;
  /** The operator or relation the table belongs to, shown as typed (never uppercased). */
  detail?: string;
  cols: readonly string[];
  rows: ShownRow[];
  /** A column whose name just changed (ρ). */
  litCol?: string;
}

export interface Panels {
  inputs: Panel[];
  output: Panel | null;
}

const plain = (key: string, rel: Relation): ShownRow[] => rel.rows.map((cells, i) => ({ key: `${key}-${i}`, cells, tone: 'info' }));
const marked = (key: string, rows: readonly Row[], struck: (i: number) => boolean): ShownRow[] =>
  rows.map((cells, i) => (struck(i) ? { key: `${key}-${i}`, cells, tone: 'dim', struck: true } : { key: `${key}-${i}`, cells, tone: 'info' }));

/** `final`: the summary frame (show the result) rather than the intro (show the base relations). */
export function panelsFor(expr: Expr, ev: Evaluation, node: string | null, phase: Phase, final: boolean, mode: Mode): Panels {
  if (node === null) {
    if (final) {
      const r = ev.get(expr.id)!;
      return { inputs: [], output: r.ok ? { title: 'Result', cols: r.out.cols, rows: plain(expr.id, r.out) } : null };
    }
    const names = [...new Set(postOrder(expr).flatMap((x) => (x.op === 'rel' ? [x.name] : [])))] as RelName[];
    return { inputs: names.map((name) => ({ title: 'Relation', detail: name, cols: DB[name].cols, rows: plain(name, DB[name]).map((r) => ({ ...r, tone: null })) })), output: null };
  }
  const x = findNode(expr, node)!;
  const kids = children(x);
  const inRel = kids.map((k) => ev.get(k.id)!);
  const r = ev.get(x.id)!;
  const inputPanel = (k: Expr, i: number, rows: ShownRow[]): Panel => ({
    title: kids.length === 2 ? (i === 0 ? 'Left' : 'Right') : 'Input',
    detail: nodeTitle(k),
    cols: (inRel[i] as { ok: true; out: Relation }).out.cols,
    rows,
  });
  if (!r.ok) {
    return { inputs: kids.flatMap((k, i) => (inRel[i].ok ? [inputPanel(k, i, plain(k.id, inRel[i].out))] : [])), output: null };
  }
  const ins = inRel.map((v) => (v as { ok: true; out: Relation }).out);
  const outTitle = `Output: ${plural(r.out.rows.length, 'row')}`;
  const d = r.detail;
  switch (d.op) {
    case 'rel':
      return { inputs: [], output: { title: outTitle, cols: r.out.cols, rows: plain(x.id, r.out) } };
    case 'select':
      return {
        inputs: [inputPanel(kids[0], 0, marked(kids[0].id, ins[0].rows, (i) => !d.kept[i]))],
        output: { title: outTitle, cols: r.out.cols, rows: plain(x.id, r.out) },
      };
    case 'project':
    case 'union': {
      const all = d.op === 'project' ? d.projected : d.stacked;
      const rows: ShownRow[] = all
        .map((cells, i): ShownRow => ({ key: `${x.id}-s${i}`, cells, tone: d.dupOf[i] >= 0 ? 'violet' : 'info', flash: d.dupOf[i] >= 0 }))
        .filter((_, i) => phase === 'run' || d.dupOf[i] < 0);
      const shownCount = mode === 'set' && phase === 'run' ? all.length : r.out.rows.length;
      return {
        inputs: kids.map((k, i) => inputPanel(k, i, plain(k.id, ins[i]))),
        output: { title: `Output: ${plural(shownCount, 'row')}`, cols: r.out.cols, rows },
      };
    }
    case 'rename':
      return {
        inputs: [inputPanel(kids[0], 0, plain(kids[0].id, ins[0]))],
        output: { title: outTitle, cols: r.out.cols, rows: plain(x.id, r.out), litCol: x.op === 'rename' ? x.to : undefined },
      };
    case 'join':
    case 'product':
      return {
        inputs: [
          inputPanel(kids[0], 0, marked(kids[0].id, ins[0].rows, (i) => d.leftUnmatched.includes(i))),
          inputPanel(kids[1], 1, marked(kids[1].id, ins[1].rows, (i) => d.rightUnmatched.includes(i))),
        ],
        output: { title: outTitle, cols: r.out.cols, rows: plain(x.id, r.out) },
      };
    case 'diff':
      return {
        inputs: [inputPanel(kids[0], 0, marked(kids[0].id, ins[0].rows, (i) => d.removed[i])), inputPanel(kids[1], 1, plain(kids[1].id, ins[1]))],
        output: { title: outTitle, cols: r.out.cols, rows: plain(x.id, r.out) },
      };
  }
}
