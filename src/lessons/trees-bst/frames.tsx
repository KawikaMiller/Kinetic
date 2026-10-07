import type { ReactNode } from 'react';
import { plural } from '../../core/format';
import type { Frame } from '../../core/types';
import {
  deleteKey, findPath, height, inorderIds, insertKey, isLopsided, minHeight, size, successorPath,
  type Probe, type Side, type Tree,
} from './model';

export interface BstFrame extends Frame {
  tree: Tree;
  hi: number | null;
  path: number[];
  ok: number | null;
  bad: number | null;
  succ: number[];
  ghost: { parent: number; side: Side } | null;
  output: number[];
  comparisons: number;
}

function base(t: Tree, extra: Partial<BstFrame> = {}): BstFrame {
  return { tree: t, hi: null, path: [], ok: null, bad: null, succ: [], ghost: null, output: [], comparisons: 0, ...extra };
}

export function idleFrames(t: Tree, say: ReactNode): BstFrame[] {
  return [base(t, { say })];
}

/** Walk down from the root comparing with k: one frame per comparison that sends the search on. */
function descend(t: Tree, k: number, frames: BstFrame[], verb: string): Probe {
  const probe = findPath(t, k);
  probe.path.forEach((id, i) => {
    if (id === probe.found) return;
    const n = t.nodes[id];
    const dir = k < n.key ? 'left' : 'right';
    frames.push(
      base(t, {
        hi: id,
        path: probe.path.slice(0, i + 1),
        comparisons: i + 1,
        say: (
          <>
            {i === 0 ? <>{verb} {k}: start at the root. </> : null}
            {k} {k < n.key ? '<' : '>'} <span className="hl">{n.key}</span>, so go <b>{dir}</b>.
          </>
        ),
      }),
    );
  });
  return probe;
}

export function insertFrames(t: Tree, k: number) {
  const frames: BstFrame[] = [];
  if (t.root == null) {
    const t2 = insertKey(t, k);
    frames.push(base(t2, { ok: t2.root, comparisons: 0, say: <>Empty tree: <span className="hl ok">{k}</span> becomes the root.</> }));
    return { frames, tree: t2 };
  }
  const r = descend(t, k, frames, 'Insert');
  const comparisons = r.path.length;
  if (r.found != null) {
    frames.push(base(t, { hi: r.found, bad: r.found, path: r.path, comparisons, say: <>{k} is already in the tree. BSTs usually keep keys unique.</> }));
    return { frames, tree: t };
  }
  const t2 = insertKey(t, k);
  const id = t.nextId;
  frames.push(base(t, { ghost: { parent: r.parent!, side: r.side }, path: r.path, comparisons, say: <>Empty spot on the {r.side}…</> }));
  frames.push(
    base(t2, {
      ok: id,
      path: [...r.path, id],
      comparisons,
      hold: 1.6,
      say: (
        <>
          <span className="hl ok">{k}</span> goes in as {t.nodes[r.parent!].key}'s {r.side} child, after <b>{comparisons}</b>{' '}
          {comparisons === 1 ? 'comparison' : 'comparisons'}: one per level.
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
  const comparisons = r.path.length;
  if (r.found != null) {
    frames.push(
      base(t, {
        ok: r.found,
        path: r.path,
        comparisons,
        hold: 1.6,
        say: (
          <>
            Found <span className="hl ok">{k}</span> in {plural(comparisons, 'comparison')}.{' '}
            {isLopsided(t)
              ? `This tree is lopsided: ${height(t)} levels where ${minHeight(size(t))} would do, so a search can take up to ${height(t)} comparisons.`
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
        comparisons,
        hold: 1.6,
        say: (
          <>
            Fell off the tree into an empty spot: <span className="hl bad">{k} isn't here</span>. Proven in {plural(comparisons, 'comparison')}.
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
  const comparisons = r.path.length;
  if (r.found == null) {
    frames.push(base(t, { ghost: { parent: r.parent!, side: r.side }, path: r.path, comparisons, say: <>{k} isn't in the tree, so there's nothing to delete.</> }));
    return { frames, tree: t };
  }
  const target = t.nodes[r.found];
  const t2 = deleteKey(t, k);

  if (target.left == null || target.right == null) {
    const child = target.left ?? target.right;
    frames.push(
      base(t, {
        bad: target.id,
        path: r.path,
        comparisons,
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
    frames.push(base(t2, { ok: child, comparisons, hold: 1.4, say: <>Done. The tree is still in sorted order.</> }));
    return { frames, tree: t2 };
  }

  // Two children: replace with the in-order successor (smallest key in the right subtree).
  frames.push(
    base(t, {
      bad: target.id,
      path: r.path,
      comparisons,
      say: (
        <>
          Found <span className="hl bad">{k}</span>, but it has <b>two children</b>. Replace it with its <b>successor</b>: the smallest key in its right subtree.
        </>
      ),
    }),
  );
  const succPath = successorPath(t, target.id);
  succPath.forEach((_, i) => {
    frames.push(
      base(t, { bad: target.id, succ: succPath.slice(0, i + 1), comparisons, say: i === 0 ? <>Step right once…</> : <>…then left as far as possible.</> }),
    );
  });
  const s = succPath.at(-1)!;
  const succ = t.nodes[s];
  frames.push(
    base(t, {
      bad: target.id,
      succ: succPath,
      hi: s,
      comparisons,
      say: (
        <>
          Successor is <span className="hl info">{succ.key}</span>: bigger than everything on the left, smaller than everything else on the right.
        </>
      ),
    }),
  );
  frames.push(
    base(t2, {
      ok: s,
      comparisons,
      hold: 1.6,
      say: (
        <>
          <span className="hl info">{succ.key}</span> moves up to replace {k}
          {succPath.length > 1 && succ.right != null ? `, and its old right child (${t.nodes[succ.right].key}) takes its spot` : ''}. Sorted order preserved.
        </>
      ),
    }),
  );
  return { frames, tree: t2 };
}

export function inorderFrames(t: Tree) {
  const frames: BstFrame[] = [];
  if (t.root == null) return { frames: idleFrames(t, <>The tree is empty.</>), tree: t };
  const order = inorderIds(t);
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
