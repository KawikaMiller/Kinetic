// The SQL equivalent of an algebra expression. σ, π, ρ and joins of plain inputs fold into one
// SELECT; anything that would change meaning if folded (a projection under a join, a renamed
// input, a compound on the right of another) becomes a subquery. The tests run every preset
// and thousands of random trees through real SQLite and compare with the evaluator.
import { condText, postOrder, schemaOf, type Expr, type Mode } from './model';

interface SelItem {
  col: string;
  as?: string;
}

type From =
  | { kind: 'table'; name: string; alias?: string }
  | { kind: 'join'; how: 'NATURAL JOIN' | 'CROSS JOIN'; left: From; right: From }
  | { kind: 'sub'; block: Block; alias: string };

interface SelectBlock {
  kind: 'select';
  distinct: boolean;
  cols: SelItem[] | null;
  from: From;
  where: string[];
}

type Block = SelectBlock | { kind: 'compound'; op: string; left: Block; right: Block };

const hasAlias = (b: Block) => b.kind === 'select' && !!b.cols?.some((c) => c.as);

/** Compiles to SQL lines (for the code panel). The expression must be schema-valid. */
export function toSql(e: Expr, mode: Mode): string[] {
  let n = 0;
  // A relation used twice (a self-join) needs a name per copy, or SQL can't tell them apart.
  const uses = new Map<string, number>();
  for (const x of postOrder(e)) if (x.op === 'rel') uses.set(x.name, (uses.get(x.name) ?? 0) + 1);
  const copies = new Map<string, number>();
  const tableAlias = (name: string) => {
    if ((uses.get(name) ?? 0) < 2) return undefined;
    const k = (copies.get(name) ?? 0) + 1;
    copies.set(name, k);
    return `${name[0].toLowerCase()}${k}`;
  };
  const wrap = (b: Block): SelectBlock => ({ kind: 'select', distinct: false, cols: null, from: { kind: 'sub', block: b, alias: `t${++n}` }, where: [] });
  /** A block that more clauses can be added to: compounds and renamed outputs become subqueries first. */
  const open = (b: Block): SelectBlock => (b.kind === 'compound' || hasAlias(b) ? wrap(b) : b);
  const colsOf = (x: Expr) => {
    const s = schemaOf(x);
    if (!s.ok) throw new Error(s.error);
    return s.schema.cols;
  };
  const side = (b: Block): { from: From; where: string[] } =>
    b.kind === 'select' && b.cols === null && !b.distinct ? { from: b.from, where: b.where } : { from: { kind: 'sub', block: b, alias: `t${++n}` }, where: [] };

  const compile = (x: Expr): Block => {
    switch (x.op) {
      case 'rel':
        return { kind: 'select', distinct: false, cols: null, from: { kind: 'table', name: x.name, alias: tableAlias(x.name) }, where: [] };
      case 'select': {
        const b = open(compile(x.input));
        return { ...b, where: [...b.where, condText(x.cond)] };
      }
      case 'project': {
        const b = open(compile(x.input));
        return { ...b, cols: x.cols.map((col) => ({ col })), distinct: mode === 'set' };
      }
      case 'rename': {
        const b = open(compile(x.input));
        return { ...b, cols: colsOf(x.input).map((col) => (col === x.from ? { col, as: x.to } : { col })) };
      }
      case 'join':
      case 'product': {
        const l = side(compile(x.left));
        const r = side(compile(x.right));
        return {
          kind: 'select', distinct: false, cols: null, where: [...l.where, ...r.where],
          from: { kind: 'join', how: x.op === 'join' ? 'NATURAL JOIN' : 'CROSS JOIN', left: l.from, right: r.from },
        };
      }
      case 'union':
      case 'diff': {
        const left = compile(x.left);
        // SQL matches compound columns by position, the algebra by name: list them in the left's order.
        const right: SelectBlock = { ...open(compile(x.right)), cols: colsOf(x.left).map((col) => ({ col })) };
        const word = x.op === 'union' ? 'UNION' : 'EXCEPT';
        return { kind: 'compound', op: mode === 'set' ? word : `${word} ALL`, left, right };
      }
    }
  };
  return blockLines(compile(e));
}

const INDENT = '  ';
const indent = (lines: string[]) => lines.map((l) => INDENT + l);

function prefixFirst(prefix: string, lines: string[]): string[] {
  return [prefix + lines[0], ...lines.slice(1)];
}

function fromLines(f: From): string[] {
  switch (f.kind) {
    case 'table':
      return [f.alias ? `${f.name} AS ${f.alias}` : f.name];
    case 'sub':
      return ['(', ...indent(blockLines(f.block)), `) AS ${f.alias}`];
    case 'join': {
      const right = f.right.kind === 'join' ? ['(', ...indent(fromLines(f.right)), ')'] : fromLines(f.right);
      return [...fromLines(f.left), ...indent(prefixFirst(`${f.how} `, right))];
    }
  }
}

function blockLines(b: Block): string[] {
  if (b.kind === 'compound') return [...blockLines(b.left), b.op, ...blockLines(b.right)];
  const cols = b.cols ? b.cols.map((c) => (c.as ? `${c.col} AS ${c.as}` : c.col)).join(', ') : '*';
  return [
    `SELECT ${b.distinct ? 'DISTINCT ' : ''}${cols}`,
    ...prefixFirst('FROM ', fromLines(b.from)),
    ...(b.where.length ? [`WHERE ${b.where.join(' AND ')}`] : []),
  ];
}
