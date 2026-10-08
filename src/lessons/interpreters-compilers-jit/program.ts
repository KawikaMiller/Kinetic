import { compile, formatInstr } from './bytecode';
import { SUM_SQUARES, allNodes, printFn, type Node } from './lang';

/** The lesson's one program, prepared once: its bytecode, its printed source and its nodes by id. */
export const BYTECODE = compile(SUM_SQUARES);
export const BYTECODE_LINES = BYTECODE.code.map(formatInstr);
export const SOURCE = printFn(SUM_SQUARES);
export const NODES = new Map<number, Node>(allNodes(SUM_SQUARES).map((n) => [n.id, n]));

/** Node id → the source line it sits on: a statement's own line (a loop's condition sits on the `while` line). */
function nodeLines(): ReadonlyMap<number, number> {
  const map = new Map<number, number>();
  SOURCE.stmtOfLine.forEach((id, line) => {
    if (id === null) return;
    const node = NODES.get(id)!;
    map.set(id, line);
    const own = node.kind === 'while' ? allNodes(node.cond) : node.kind === 'fn' ? [] : allNodes(node);
    for (const n of own) if (!map.has(n.id)) map.set(n.id, line);
  });
  return map;
}

export const LINE_OF_NODE = nodeLines();
