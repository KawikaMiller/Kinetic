/**
 * The resolver tree of one execution, as TreeSvg wants it: a node per field resolver that
 * returns an object or list, and a node per list element, with each object's plain scalar
 * fields listed as small text on its node. Long lists are cut to the first few elements and
 * say so on a "+ more" node. Pure.
 */
import type { Execution } from './exec';

export interface TreeNode {
  id: string;
  /** "User.orders", "Order 2" */
  title: string;
  /** The scalar fields read on it ("total"), or what it did ("1 DB call"). */
  sub: string;
  /** The level it resolves in: Query.user is 0. */
  level: number;
  kind: 'field' | 'item' | 'more';
  /** The database call it made or shared, if any. */
  dbCall: number | null;
  batched: boolean;
  error: string | null;
}

export interface ResolverTree {
  root: string;
  nodes: Map<string, TreeNode>;
  children: Map<string, string[]>;
  maxLevel: number;
  /** List elements left out of the drawing. */
  hidden: number;
}

/** How many elements of a list the drawing shows. */
export const SHOWN_ITEMS = 3;

export function buildTree(exec: Execution): ResolverTree {
  const nodes = new Map<string, TreeNode>();
  const children = new Map<string, string[]>();
  const add = (parent: string | null, node: TreeNode) => {
    nodes.set(node.id, node);
    if (parent) children.set(parent, [...(children.get(parent) ?? []), node.id]);
    children.set(node.id, children.get(node.id) ?? []);
  };
  const callOf = (invocation: number) => exec.dbCalls.find((c) => c.invocations.includes(invocation));
  const scalars = (parent: number, index?: number) =>
    exec.invocations.filter((i) => i.scalar && i.parent === parent && (index === undefined || i.path.at(-2) === index)).map((i) => i.field);
  const objectChildren = (parent: number, index?: number) =>
    exec.invocations.filter((i) => !i.scalar && i.parent === parent && (index === undefined || i.path.at(-2) === index));
  let hidden = 0;

  const addField = (invId: number, parentNode: string | null): void => {
    const inv = exec.invocations[invId];
    const call = callOf(invId);
    const id = `f${invId}`;
    const listItems = exec.items.filter((it) => it.parent === invId);
    const sub = inv.list ? `${listItems.length} ${listItems.length === 1 ? 'item' : 'items'}` : scalars(invId).join(', ');
    add(parentNode, {
      id, title: inv.typeField, sub, level: inv.level, kind: 'field', dbCall: call?.id ?? null, batched: call?.batched ?? false, error: inv.error,
    });
    if (inv.list) {
      listItems.slice(0, SHOWN_ITEMS).forEach((it) => {
        const itemId = `t${it.id}`;
        add(id, { id: itemId, title: `${it.type} ${it.index + 1}`, sub: scalars(invId, it.index).join(', '), level: inv.level + 1, kind: 'item', dbCall: null, batched: false, error: null });
        for (const child of objectChildren(invId, it.index)) addField(child.id, itemId);
      });
      if (listItems.length > SHOWN_ITEMS) {
        const more = listItems.length - SHOWN_ITEMS;
        hidden += more;
        add(id, { id: `m${invId}`, title: `+ ${more} more`, sub: 'same shape', level: inv.level + 1, kind: 'more', dbCall: null, batched: false, error: null });
      }
    } else {
      for (const child of objectChildren(invId)) addField(child.id, id);
    }
  };

  const top = exec.invocations.find((i) => !i.scalar && i.parent === null)!;
  addField(top.id, null);
  return { root: `f${top.id}`, nodes, children, maxLevel: Math.max(...[...nodes.values()].map((n) => n.level)), hidden };
}
