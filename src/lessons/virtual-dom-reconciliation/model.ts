/**
 * A teaching reconciler: pure functions, no React. It follows the heuristics React documents
 * for its own list and tree diff, which are also common elsewhere but not universal:
 *   1. Same element type at the same place: keep the node and update what changed in place.
 *   2. Different type: throw the old subtree away and build the new one (no descent).
 *   3. Children are matched by position, or by key when the new children have keys.
 * Moves use the placement rule of React's list diff: a keyed child whose old position is
 * before the last stable child's old position is moved. Other frameworks (those that use a
 * longest-increasing-subsequence) can need fewer moves for the same change.
 * The "real DOM" is a plain model here, patched in order, so tests can compare it with the
 * new virtual tree.
 */

export interface VNode {
  type: string;
  key?: string;
  text: string;
  cls: string;
  children: VNode[];
}

/** One node of the model DOM. `key` is kept by the framework (React keeps it on its fiber), not by the browser. */
export interface DomNode {
  id: number;
  type: string;
  key?: string;
  text: string;
  cls: string;
  children: DomNode[];
}

export const el = (type: string, o: { key?: string; text?: string; cls?: string } = {}, children: VNode[] = []): VNode => ({
  type,
  key: o.key,
  text: o.text ?? '',
  cls: o.cls ?? '',
  children,
});

export interface IdCounter {
  next: number;
}

export function buildDom(v: VNode, ids: IdCounter): DomNode {
  const id = ids.next++;
  return { id, type: v.type, key: v.key, text: v.text, cls: v.cls, children: v.children.map((c) => buildDom(c, ids)) };
}

export const domToV = (d: DomNode): VNode => ({ type: d.type, text: d.text, cls: d.cls, children: d.children.map(domToV) });

/** The same tree with keys dropped, for comparing a model DOM (which has none) with a virtual tree. */
export const stripKeys = (v: VNode): VNode => ({ type: v.type, text: v.text, cls: v.cls, children: v.children.map(stripKeys) });

export const subtreeIds = (d: DomNode): number[] => [d.id, ...d.children.flatMap(subtreeIds)];
export const sizeOfV = (v: VNode): number => 1 + v.children.reduce((n, c) => n + sizeOfV(c), 0);
export const maxId = (d: DomNode): number => Math.max(d.id, ...d.children.map(maxId));

// ── Patches ──────────────────────────────────────────────────────────

export type PatchOp = 'update' | 'replace' | 'insert' | 'move' | 'remove';

export type Patch =
  | { op: 'update'; id: number; field: 'text' | 'cls'; from: string; to: string }
  | { op: 'replace'; id: number; node: DomNode }
  | { op: 'insert'; parent: number; after: number | null; node: DomNode }
  | { op: 'move'; id: number; parent: number; after: number | null }
  | { op: 'remove'; id: number };

/** The DOM node a patch touches (the new node for an insert or a replace). */
export const patchTarget = (p: Patch): number => (p.op === 'insert' || p.op === 'replace' ? p.node.id : p.id);

/** Nodes a patch builds from scratch. */
export const nodesBuilt = (p: Patch): number => (p.op === 'insert' || p.op === 'replace' ? subtreeIds(p.node).length : 0);

function mapNode(d: DomNode, f: (n: DomNode) => DomNode): DomNode {
  const mapped = f(d);
  return { ...mapped, children: mapped.children.map((c) => mapNode(c, f)) };
}

/** Inserts `node` into `list` right after the node with id `after` (null = first). */
function placeAfter(list: readonly DomNode[], node: DomNode, after: number | null): DomNode[] {
  const rest = list.filter((c) => c.id !== node.id);
  const at = after === null ? 0 : rest.findIndex((c) => c.id === after) + 1;
  return [...rest.slice(0, at), node, ...rest.slice(at)];
}

export function applyPatch(root: DomNode, p: Patch): DomNode {
  switch (p.op) {
    case 'update':
      return mapNode(root, (n) => (n.id === p.id ? { ...n, [p.field]: p.to } : n));
    case 'replace':
      if (root.id === p.id) return p.node;
      return mapNode(root, (n) => ({ ...n, children: n.children.map((c) => (c.id === p.id ? p.node : c)) }));
    case 'insert':
      return mapNode(root, (n) => (n.id === p.parent ? { ...n, children: placeAfter(n.children, p.node, p.after) } : n));
    case 'remove':
      return mapNode(root, (n) => ({ ...n, children: n.children.filter((c) => c.id !== p.id) }));
    case 'move': {
      let moving: DomNode | undefined;
      const detached = mapNode(root, (n) => {
        moving ??= n.children.find((c) => c.id === p.id);
        return { ...n, children: n.children.filter((c) => c.id !== p.id) };
      });
      return moving ? mapNode(detached, (n) => (n.id === p.parent ? { ...n, children: placeAfter(n.children, moving!, p.after) } : n)) : root;
    }
  }
}

export const applyPatches = (root: DomNode, patches: readonly Patch[]): DomNode => patches.reduce(applyPatch, root);

// ── The diff ─────────────────────────────────────────────────────────

export type Match = 'root' | 'position' | 'key';

/** One comparison the diff makes: a pair, or a child with no partner. */
export interface Step {
  kind: 'same' | 'replace' | 'insert' | 'remove';
  match: Match | null;
  /** The old node compared (or removed); null for an insert. */
  oldId: number | null;
  /** The new node compared (or inserted), as a path of child indices from the root ("0.2"); null for a remove. */
  newPath: string | null;
  type: string;
  /** The old node's type, for a replace. */
  oldType: string;
  /** The key of the node (new, or old for a remove), and whether its siblings are matched by key. */
  key: string | undefined;
  keyed: boolean;
  /** Old and new child positions of a matched child, and whether the placement rule moved it. */
  oldIndex: number | null;
  newIndex: number | null;
  moved: boolean;
  /** Everything this step touches: for a replace, remove or insert the whole subtree. */
  oldSubtree: number[];
  newSubtree: string[];
  patches: Patch[];
}

export interface DiffResult {
  steps: Step[];
  patches: Patch[];
}

/**
 * For each new child, the index of the old child it is matched with (or null).
 * With any key among the new children, matching is by key; otherwise by position.
 */
export function matchChildren(oldKeys: readonly (string | undefined)[], newKeys: readonly (string | undefined)[]): (number | null)[] {
  const keyed = newKeys.some((k) => k !== undefined);
  const used = new Set<number>();
  return newKeys.map((k, i) => {
    const at = keyed ? (k === undefined ? -1 : oldKeys.findIndex((o, j) => o === k && !used.has(j))) : i < oldKeys.length ? i : -1;
    if (at < 0) return null;
    used.add(at);
    return at;
  });
}

const newPaths = (v: VNode, path: string): string[] => [path, ...v.children.flatMap((c, i) => newPaths(c, `${path}.${i}`))];

export function diff(oldRoot: DomNode, next: VNode, ids: IdCounter): DiffResult {
  const steps: Step[] = [];
  const step = (s: Partial<Step> & Pick<Step, 'kind' | 'match' | 'type'>): Step => {
    const full: Step = {
      oldId: null, newPath: null, oldType: '', key: undefined, keyed: false, oldIndex: null, newIndex: null, moved: false, oldSubtree: [], newSubtree: [], patches: [], ...s,
    };
    steps.push(full);
    return full;
  };

  /** Compares an old node with its partner; returns the id the node has afterwards and its step. */
  function walk(old: DomNode, v: VNode, path: string, match: Match, oldIndex: number | null, newIndex: number | null): { id: number; own: Step } {
    if (old.type !== v.type) {
      const node = buildDom(v, ids);
      const own = step({
        kind: 'replace', match, oldId: old.id, newPath: path, type: v.type, oldType: old.type, oldIndex, newIndex,
        oldSubtree: subtreeIds(old), newSubtree: newPaths(v, path), patches: [{ op: 'replace', id: old.id, node }],
      });
      return { id: node.id, own };
    }
    const patches: Patch[] = [];
    if (old.text !== v.text) patches.push({ op: 'update', id: old.id, field: 'text', from: old.text, to: v.text });
    if (old.cls !== v.cls) patches.push({ op: 'update', id: old.id, field: 'cls', from: old.cls, to: v.cls });
    const own = step({ kind: 'same', match, oldId: old.id, newPath: path, type: v.type, oldType: old.type, oldIndex, newIndex, patches });
    walkChildren(old, v, path);
    return { id: old.id, own };
  }

  function walkChildren(parent: DomNode, v: VNode, path: string) {
    const matched = matchChildren(parent.children.map((c) => c.key), v.children.map((c) => c.key));
    const keyed = v.children.some((c) => c.key !== undefined);
    let lastPlaced = 0;
    let after: number | null = null;
    v.children.forEach((child, i) => {
      const oldIndex = matched[i];
      const childPath = `${path}.${i}`;
      if (oldIndex === null) {
        const node = buildDom(child, ids);
        step({
          kind: 'insert', match: null, type: child.type, newPath: childPath, newIndex: i, key: child.key, keyed,
          newSubtree: newPaths(child, childPath), patches: [{ op: 'insert', parent: parent.id, after, node }],
        });
        after = node.id;
        return;
      }
      const { id, own } = walk(parent.children[oldIndex], child, childPath, keyed ? 'key' : 'position', oldIndex, i);
      own.key = child.key;
      own.keyed = keyed;
      if (oldIndex < lastPlaced) {
        own.moved = true;
        own.patches.push({ op: 'move', id, parent: parent.id, after });
      } else {
        lastPlaced = oldIndex;
      }
      after = id;
    });
    const kept = new Set(matched);
    parent.children.forEach((c, j) => {
      if (kept.has(j)) return;
      step({ kind: 'remove', match: null, type: c.type, oldId: c.id, oldIndex: j, key: c.key, keyed, oldSubtree: subtreeIds(c), patches: [{ op: 'remove', id: c.id }] });
    });
  }

  walk(oldRoot, next, '0', 'root', null, null);
  return { steps, patches: steps.flatMap((s) => s.patches) };
}

// ── Scenarios ────────────────────────────────────────────────────────

export interface Scenario {
  old: DomNode;
  next: VNode;
  result: DiffResult;
}

export function runDiff(old: VNode, next: VNode): Scenario {
  const ids: IdCounter = { next: 1 };
  const oldDom = buildDom(old, ids);
  return { old: oldDom, next, result: diff(oldDom, next, ids) };
}

/** Tree scenes: one product card, changed in different ways. */
const card = (o: { root?: string; blurb?: string; blurbType?: string; buttonCls?: string }): VNode =>
  el(o.root ?? 'div', { cls: 'card' }, [
    el('h2', { text: 'Blue mug' }),
    el(o.blurbType ?? 'p', { text: o.blurb ?? '350 ml' }),
    el('button', { text: 'Add', cls: o.buttonCls ?? '' }),
  ]);

export type TreePresetId = 'text' | 'class' | 'child-type' | 'root-type' | 'same';

export interface TreePreset {
  id: TreePresetId;
  label: string;
  next: VNode;
}

export const TREE_OLD = card({});
export const TREE_PRESETS: TreePreset[] = [
  { id: 'text', label: 'Change a text', next: card({ blurb: '450 ml' }) },
  { id: 'class', label: 'Change a class', next: card({ buttonCls: 'primary' }) },
  { id: 'child-type', label: 'p becomes div', next: card({ blurbType: 'div' }) },
  { id: 'root-type', label: 'div becomes section', next: card({ root: 'section' }) },
  { id: 'same', label: 'Nothing changed', next: card({}) },
];

/** List scenes. */
export interface Item {
  id: string;
  name: string;
}

export const ITEMS: Item[] = [
  { id: 'a', name: 'Ada' },
  { id: 'b', name: 'Bea' },
  { id: 'c', name: 'Cal' },
  { id: 'd', name: 'Dee' },
  { id: 'e', name: 'Eli' },
];

export type KeyMode = 'none' | 'index' | 'id';
export const KEY_MODES: { value: KeyMode; label: string }[] = [
  { value: 'none', label: 'no keys' },
  { value: 'index', label: 'index keys' },
  { value: 'id', label: 'id keys' },
];

export type ListPresetId = 'insert-start' | 'reverse' | 'delete-middle' | 'change-one';
export interface ListPreset {
  id: ListPresetId;
  label: string;
  apply: (items: readonly Item[]) => Item[];
}

export const NEW_ITEM: Item = { id: 'f', name: 'Fay' };
export const LIST_PRESETS: ListPreset[] = [
  { id: 'insert-start', label: 'Insert at the start', apply: (xs) => [NEW_ITEM, ...xs] },
  { id: 'reverse', label: 'Reverse', apply: (xs) => [...xs].reverse() },
  { id: 'delete-middle', label: 'Delete the middle', apply: (xs) => xs.filter((_, i) => i !== Math.floor(xs.length / 2)) },
  { id: 'change-one', label: 'Change one item', apply: (xs) => xs.map((x, i) => (i === 1 ? { ...x, name: 'Bo' } : x)) },
];

export const keyFor = (mode: KeyMode, item: Item, index: number): string | undefined =>
  mode === 'none' ? undefined : mode === 'index' ? String(index) : item.id;

export const listTree = (items: readonly Item[], mode: KeyMode): VNode =>
  el('ul', {}, items.map((it, i) => el('li', { key: keyFor(mode, it, i), text: it.name })));

export const runList = (preset: ListPresetId, mode: KeyMode, items: readonly Item[] = ITEMS): Scenario =>
  runDiff(listTree(items, mode), listTree(LIST_PRESETS.find((p) => p.id === preset)!.apply(items), mode));

/** What a diff did, counted from its patches. */
export interface Counts {
  update: number;
  replace: number;
  insert: number;
  move: number;
  remove: number;
  /** DOM calls: one per patch. */
  ops: number;
  /** Nodes built from scratch by inserts and replaces. */
  built: number;
  /** Pairs the diff compared (matched nodes, replaced ones included). */
  compared: number;
}

export function countsOf(result: DiffResult): Counts {
  const c: Counts = { update: 0, replace: 0, insert: 0, move: 0, remove: 0, ops: 0, built: 0, compared: 0 };
  for (const p of result.patches) {
    c[p.op]++;
    c.ops++;
    c.built += nodesBuilt(p);
  }
  c.compared = result.steps.filter((s) => s.kind === 'same' || s.kind === 'replace').length;
  return c;
}

/** Whether a row component instance is kept for an item: the heart of the "typed text sticks to the wrong row" bug. */
export function keptInstances(oldItems: readonly Item[], newItems: readonly Item[], mode: Exclude<KeyMode, 'none'>): (string | null)[] {
  const matched = matchChildren(oldItems.map((it, i) => keyFor(mode, it, i)), newItems.map((it, i) => keyFor(mode, it, i)));
  return matched.map((at) => (at === null ? null : oldItems[at].id));
}
