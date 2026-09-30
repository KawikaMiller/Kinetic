import type { ReactNode } from 'react';
import type { Frame } from '../../core/types';

export interface BNode {
  id: number;
  key: number;
  left: number | null;
  right: number | null;
}
export interface Tree {
  nodes: Record<number, BNode>;
  root: number | null;
  nextId: number;
}
export interface BstFrame extends Frame {
  tree: Tree;
  hi: number | null;
  path: number[];
  ok: number | null;
  bad: number | null;
  succ: number[];
  ghost: { parent: number; side: 'left' | 'right' } | null;
  output: number[];
  comparisons: number;
}

const clone = (t: Tree): Tree => ({
  root: t.root,
  nextId: t.nextId,
  nodes: Object.fromEntries(Object.values(t.nodes).map((n) => [n.id, { ...n }])),
});

export const emptyTree = (): Tree => ({ nodes: {}, root: null, nextId: 1 });

/** Insert without animation (for presets). */
export function build(keys: number[]): Tree {
  let t = emptyTree();
  for (const k of keys) t = insertSilently(t, k);
  return t;
}

function insertSilently(t0: Tree, k: number): Tree {
  const t = clone(t0);
  const id = t.nextId++;
  const node: BNode = { id, key: k, left: null, right: null };
  if (t.root == null) {
    t.nodes[id] = node;
    t.root = id;
    return t;
  }
  let cur = t.root;
  for (;;) {
    const n = t.nodes[cur];
    if (k === n.key) return t0;
    const side = k < n.key ? 'left' : 'right';
    const next = n[side];
    if (next == null) {
      t.nodes[id] = node;
      n[side] = id;
      return t;
    }
    cur = next;
  }
}

export function height(t: Tree, id: number | null = t.root): number {
  if (id == null) return 0;
  const n = t.nodes[id];
  return 1 + Math.max(height(t, n.left), height(t, n.right));
}

export const size = (t: Tree) => Object.keys(t.nodes).length;

function base(t: Tree, extra: Partial<BstFrame> = {}): BstFrame {
  return { tree: t, hi: null, path: [], ok: null, bad: null, succ: [], ghost: null, output: [], comparisons: 0, ...extra };
}

export function idleFrames(t: Tree, say: ReactNode): BstFrame[] {
  return [base(t, { say })];
}

/** Walk down from the root comparing with k. Emits one frame per comparison. */
function descend(t: Tree, k: number, frames: BstFrame[], verb: string) {
  const path: number[] = [];
  let cur = t.root;
  let parent: number | null = null;
  let side: 'left' | 'right' = 'left';
  let comparisons = 0;
  while (cur != null) {
    const n = t.nodes[cur];
    comparisons++;
    path.push(cur);
    if (n.key === k) return { found: cur, parent, side, path, comparisons };
    const dir = k < n.key ? 'left' : 'right';
    frames.push(
      base(t, {
        hi: cur,
        path: path.slice(),
        comparisons,
        say: (
          <>
            {comparisons === 1 ? <>{verb} {k}: start at the root. </> : null}
            {k} {k < n.key ? '<' : '>'} <span className="hl">{n.key}</span>, so go <b>{dir}</b>.
          </>
        ),
      }),
    );
    parent = cur;
    side = dir;
    cur = n[dir];
  }
  return { found: null as number | null, parent, side, path, comparisons };
}

export function insertFrames(t: Tree, k: number) {
  const frames: BstFrame[] = [];
  if (t.root == null) {
    const t2 = insertSilently(t, k);
    frames.push(base(t2, { ok: t2.root, comparisons: 0, say: <>Empty tree: <span className="hl ok">{k}</span> becomes the root.</> }));
    return { frames, tree: t2 };
  }
  const r = descend(t, k, frames, 'Insert');
  if (r.found != null) {
    frames.push(base(t, { hi: r.found, bad: r.found, path: r.path, comparisons: r.comparisons, say: <>{k} is already in the tree. BSTs usually keep keys unique.</> }));
    return { frames, tree: t };
  }
  const t2 = insertSilently(t, k);
  const id = t.nextId;
  frames.push(base(t, { ghost: { parent: r.parent!, side: r.side }, path: r.path, comparisons: r.comparisons, say: <>Empty spot on the {r.side}…</> }));
  frames.push(
    base(t2, {
      ok: id,
      path: [...r.path, id],
      comparisons: r.comparisons,
      hold: 1.6,
      say: (
        <>
          <span className="hl ok">{k}</span> goes in as {t.nodes[r.parent!].key}'s {r.side} child, after <b>{r.comparisons}</b>{' '}
          {r.comparisons === 1 ? 'comparison' : 'comparisons'}: one per level.
        </>
      ),
    }),
  );
  return { frames, tree: t2 };
}

export function searchFrames(t: Tree, k: number) {
  const frames: BstFrame[] = [];
  if (t.root == null) return { frames: idleFrames(t, <>The tree is empty. Insert something first.</>), tree: t };
  const r = descend(t, k, frames, 'Search for');
  if (r.found != null) {
    frames.push(
      base(t, {
        ok: r.found,
        path: r.path,
        comparisons: r.comparisons,
        hold: 1.6,
        say: (
          <>
            Found <span className="hl ok">{k}</span> in {r.comparisons} {r.comparisons === 1 ? 'comparison' : 'comparisons'}.{' '}
            {height(t) > Math.ceil(Math.log2(size(t) + 1)) + 1
              ? 'This tree is lopsided, so each comparison skipped almost nothing: that is linked-list speed.'
              : 'Each one skipped a whole subtree.'}
          </>
        ),
      }),
    );
  } else {
    frames.push(
      base(t, {
        ghost: { parent: r.parent!, side: r.side },
        path: r.path,
        comparisons: r.comparisons,
        hold: 1.6,
        say: (
          <>
            Fell off the tree into an empty spot: <span className="hl bad">{k} isn't here</span>. Proven in {r.comparisons} comparisons.
          </>
        ),
      }),
    );
  }
  return { frames, tree: t };
}

export function deleteFrames(t: Tree, k: number) {
  const frames: BstFrame[] = [];
  if (t.root == null) return { frames: idleFrames(t, <>The tree is empty. Nothing to delete.</>), tree: t };
  const r = descend(t, k, frames, 'Delete');
  if (r.found == null) {
    frames.push(base(t, { ghost: { parent: r.parent!, side: r.side }, path: r.path, comparisons: r.comparisons, say: <>{k} isn't in the tree, so there's nothing to delete.</> }));
    return { frames, tree: t };
  }
  const target = t.nodes[r.found];
  const t2 = clone(t);
  const setParentLink = (tree: Tree, to: number | null) => {
    if (r.parent == null) tree.root = to;
    else tree.nodes[r.parent][r.side] = to;
  };

  if (target.left == null || target.right == null) {
    const child = target.left ?? target.right;
    frames.push(
      base(t, {
        bad: target.id,
        path: r.path,
        comparisons: r.comparisons,
        say:
          child == null ? (
            <>
              Found <span className="hl bad">{k}</span>. It's a <b>leaf</b>: just cut it off.
            </>
          ) : (
            <>
              Found <span className="hl bad">{k}</span>. It has <b>one child</b>, so that child moves up into its place.
            </>
          ),
      }),
    );
    setParentLink(t2, child);
    delete t2.nodes[target.id];
    frames.push(base(t2, { ok: child, comparisons: r.comparisons, hold: 1.4, say: <>Done. The tree is still in sorted order.</> }));
    return { frames, tree: t2 };
  }

  // Two children: replace with the in-order successor (smallest key in the right subtree).
  frames.push(
    base(t, {
      bad: target.id,
      path: r.path,
      comparisons: r.comparisons,
      say: (
        <>
          Found <span className="hl bad">{k}</span>, but it has <b>two children</b>. Replace it with its <b>successor</b>: the smallest key in its right subtree.
        </>
      ),
    }),
  );
  const succPath: number[] = [];
  let sParent = target.id;
  let s = target.right!;
  succPath.push(s);
  frames.push(base(t, { bad: target.id, succ: succPath.slice(), comparisons: r.comparisons, say: <>Step right once…</> }));
  while (t.nodes[s].left != null) {
    sParent = s;
    s = t.nodes[s].left!;
    succPath.push(s);
    frames.push(base(t, { bad: target.id, succ: succPath.slice(), comparisons: r.comparisons, say: <>…then left as far as possible.</> }));
  }
  const succ = t.nodes[s];
  frames.push(
    base(t, {
      bad: target.id,
      succ: succPath.slice(),
      hi: s,
      comparisons: r.comparisons,
      say: (
        <>
          Successor is <span className="hl info">{succ.key}</span>: bigger than everything on the left, smaller than everything else on the right.
        </>
      ),
    }),
  );
  // Move the successor node itself into the target's place.
  if (sParent !== target.id) {
    t2.nodes[sParent].left = succ.right;
    t2.nodes[s].right = target.right;
  }
  t2.nodes[s].left = target.left;
  setParentLink(t2, s);
  delete t2.nodes[target.id];
  frames.push(
    base(t2, {
      ok: s,
      comparisons: r.comparisons,
      hold: 1.6,
      say: (
        <>
          <span className="hl info">{succ.key}</span> moves up to replace {k}
          {sParent !== target.id && succ.right != null ? `, and its old right child (${t.nodes[succ.right].key}) takes its spot` : ''}. Sorted order preserved.
        </>
      ),
    }),
  );
  return { frames, tree: t2 };
}

export function inorderFrames(t: Tree) {
  const frames: BstFrame[] = [];
  if (t.root == null) return { frames: idleFrames(t, <>The tree is empty.</>), tree: t };
  const order: number[] = [];
  const walk = (id: number | null) => {
    if (id == null) return;
    walk(t.nodes[id].left);
    order.push(id);
    walk(t.nodes[id].right);
  };
  walk(t.root);
  const output: number[] = [];
  frames.push(base(t, { say: <>In-order walk: visit the <b>left</b> subtree, then the <b>node</b>, then the <b>right</b> subtree.</> }));
  order.forEach((id, i) => {
    output.push(t.nodes[id].key);
    frames.push(
      base(t, {
        hi: id,
        path: order.slice(0, i + 1),
        output: output.slice(),
        say:
          i === 0 ? (
            <>
              Leftmost node first: <span className="hl">{t.nodes[id].key}</span>, the smallest key.
            </>
          ) : (
            <>
              Left side done, so visit <span className="hl">{t.nodes[id].key}</span>, then its right subtree.
            </>
          ),
      }),
    );
  });
  const last = frames[frames.length - 1];
  last.hold = 2;
  last.say = (
    <>
      Out comes <span className="hl ok">sorted order</span> for free. That's the BST rule at work: left &lt; node &lt; right, everywhere.
    </>
  );
  return { frames, tree: t };
}
