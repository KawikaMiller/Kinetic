import type { ReactNode } from 'react';
import { power } from '../../core/format';
import { createRecorder } from '../../core/recorder';
import { factorial } from '../../core/stats';
import type { Frame } from '../../core/types';
import { LEAF_CAP, counts, deepestShown, doublingFactor, permutations, type Growth } from './model';

export const group = (n: number | bigint) => n.toLocaleString('en-US');

export interface TreeFrame extends Frame {
  /** Deepest level drawn so far (0 = just the root). */
  depth: number;
  /** The level whose nodes are splitting this frame, or null. */
  expanding: number | null;
  /** The leaves are complete (coloured as finished). */
  leaves: boolean;
  /** The leaves have merged into combinations. */
  merged: boolean;
}

/** n·(n−1)·… written out for k factors: "5 × 4 × 3". */
export const product = (n: number, k: number) => Array.from({ length: k }, (_, i) => n - i).join(' × ');

export function treeFrames(n: number, k: number, ordered: boolean): TreeFrame[] {
  const shown = deepestShown(n, k);
  const P = permutations(n, k);
  const r = createRecorder<TreeFrame>({ depth: 0, expanding: null, leaves: false, merged: false });
  r.snap(<>{n} tiles, pick {k}. Every pick is a branch: {n} ways for the first tile, then {n - 1} for the second, and so on.</>);
  for (let d = 1; d <= shown; d++) {
    const before = permutations(n, d - 1);
    r.snap(
      d === 1
        ? <>Pick {d}: <span className="hl">{n}</span> branches, one per tile.</>
        : <>Pick {d}: each of the {group(before)} branches splits {n - d + 1} ways, one per tile not used yet:{' '}
            <span className="hl">{group(permutations(n, d))}</span> so far.</>,
      1.2,
      { depth: d, expanding: d - 1 },
    );
  }
  if (shown < k) {
    r.snap(<>The full tree would have {group(P)} leaves, more than {LEAF_CAP}, so its last {k - shown === 1 ? 'level is' : `${k - shown} levels are`}
      {' '}hidden. The count carries on all the same: {product(n, k)} = {group(P)}.</>, 1.6, { expanding: null });
  }
  r.snap(<>{product(n, k)} = <span className="hl info">{group(P)}</span> ordered picks: P({n}, {k}) = {n}! / {n - k}!.</>, 1.4,
    { expanding: null, leaves: true });
  if (!ordered) {
    const kf = factorial(k);
    r.snap(<>Now order doesn't matter: the {group(kf)} orderings of the same {k} tiles are one choice. Each group merges {group(kf)}
      {' '}leaves, so <span className="hl violet">{group(P)} / {group(kf)} = {group(counts(n, k).unordered)}</span>.</>, 1.6,
    { merged: true });
  }
  const c = counts(n, k);
  r.close(
    ordered
      ? <>Order matters: P({n}, {k}) = {group(c.ordered)}. Switch "Order matters" off to see them merge into C({n}, {k}) ={' '}
          {group(c.unordered)} groups.</>
      : <>C({n}, {k}) = P({n}, {k}) / {k}! = {group(c.ordered)} / {group(factorial(k))} = <span className="hl ok">{group(c.unordered)}</span>{' '}
          combinations.</>,
    2,
  );
  return r.frames;
}

// ── Pascal ───────────────────────────────────────────────────────────

export function pascalCaption(rows: number[][], r: number, c: number): ReactNode {
  if (c === 0 || c === r) {
    return <>C({r}, {c}) = 1: there's only one way to choose {c === 0 ? 'nothing' : 'everything'}. The edges of the triangle are all 1.</>;
  }
  const [a, b] = [rows[r - 1][c - 1], rows[r - 1][c]];
  return <>C({r}, {c}) = C({r - 1}, {c - 1}) + C({r - 1}, {c}) = <span className="hl info">{a}</span> + <span className="hl info">{b}</span> ={' '}
    <span className="hl">{rows[r][c]}</span>. Look at one item: either it's in (choose {c - 1} of the other {r - 1}) or it's out
    (choose {c} of them).</>;
}

export function countsCaption(n: number, k: number, repeat: boolean, onTriangle = true): ReactNode {
  const c = counts(n, k);
  const cell = onTriangle ? ', the highlighted cell' : '';
  return repeat
    ? <>With repeats, {k} picks from {n}: in order {power(k, n)} = <b>{group(c.orderedRepeat)}</b>; ignoring order C({n} + {k} − 1, {k}) ={' '}
        <b>{group(c.unorderedRepeat)}</b>, the "stars and bars" count{cell}.</>
    : <>Without repeats, {k} from {n}: in order P({n}, {k}) = <b>{group(c.ordered)}</b>; ignoring order C({n}, {k}) ={' '}
        <b>{group(c.unordered)}</b>{cell}.</>;
}

// ── Explosion ────────────────────────────────────────────────────────

export function growthCaption(g: Growth, n: number): ReactNode {
  const doubled = 2 * n <= g.max ? 2 * n : null;
  return doubled === null
    ? <>{g.formula(n)} = {group(g.count(n))}.</>
    : <>{g.unit} {n} → {doubled}: from {group(g.count(n))} to {group(g.count(doubled))}, ×{group(doublingFactor(g, n))}, not ×2.</>;
}
