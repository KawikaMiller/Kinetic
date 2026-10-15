import { plural } from '../../core/format';
import { createRecorder } from '../../core/recorder';
import type { Frame } from '../../core/types';
import { checkRb, heightOf, insertKey, removeKey, sizeOf, type RbResult, type RbTree } from './model';
import { CASE_TEXT, colorWord } from './text';

export interface RbFrame extends Frame {
  tree: RbTree;
  /** The node being compared, placed or looked at by the fix-up. */
  hi: number | null;
  /** Nodes on the walk down. */
  path: number[];
  /** The uncle or sibling the case turns on. */
  other: number | null;
  /** The two nodes that break rule 3. */
  bad: number[];
  /** Nodes just recoloured or rotated. */
  moved: number[];
  /** The spot that is one black short (a node, or the empty child of `parent`). */
  short: { node: number | null; parent: number; side: 'left' | 'right' } | null;
  rotations: number;
  recolors: number;
  /** The case just named. */
  fixCase: string | null;
}

export interface RbFrames {
  frames: RbFrame[];
  tree: RbTree;
  result: RbResult;
}

/** Nodes present in both trees whose colour differs: the recolours between two steps. */
const colourFlips = (a: RbTree, b: RbTree): number => Object.values(b.nodes).filter((n) => a.nodes[n.key] !== undefined && a.nodes[n.key].color !== n.color).length;

const hl = (n: number | string, tone = '') => <span className={`hl ${tone}`.trim()}>{n}</span>;

/** One insert or delete, a frame per step of CLRS's algorithm, narrated from the model's own step list. */
export function rbFrames(base: RbTree, op: 'insert' | 'delete', key: number): RbFrames {
  const result = op === 'insert' ? insertKey(base, key, { record: true }) : removeKey(base, key, { record: true });
  const rec = createRecorder<RbFrame>(
    { tree: base, hi: null, path: [], other: null, bad: [], moved: [], short: null, rotations: 0, recolors: 0, fixCase: null },
    { transient: { moved: [], fixCase: null } },
  );
  rec.snap(
    op === 'insert' ? (
      <>Insert {hl(key)} as in any search tree, colour the new node red, then check the rules from the new node upward.</>
    ) : (
      <>Delete {hl(key)} as in any search tree (a node with two children is replaced by its in-order successor), then check whether a black node was lost.</>
    ),
  );
  let seen = base;
  for (const step of result.steps) {
    if ('tree' in step) {
      rec.set({ recolors: rec.get().recolors + colourFlips(seen, step.tree) });
      seen = step.tree;
    }
    switch (step.kind) {
      case 'visit': {
        const at = step.path[step.path.length - 1];
        rec.snap(
          step.key === at ? <>Found {hl(at)}.</> : <>Compare {hl(step.key)} with {hl(at)}: {step.key < at ? 'smaller, go left' : 'bigger, go right'}.</>,
          undefined,
          { tree: step.tree, hi: at, path: [...step.path] },
        );
        break;
      }
      case 'place':
        rec.snap(
          <>
            {hl(step.key)} is placed as a leaf and coloured <span className="hl pink">red</span>: a red node adds no black node to any path, so rule 4 is safe. Rules 2 and 3 are still to check.
          </>,
          undefined,
          { tree: step.tree, hi: step.key, path: [...step.path] },
        );
        break;
      case 'violation':
        rec.snap(
          <>
            <span className="hl bad">Rule 3 is broken</span>: {step.child} is red and its parent {step.parent} is red. The uncle {step.uncle === null ? 'is nil, which counts as black' : `${step.uncle} is ${colorWord(step.uncleColor)}`}: {CASE_TEXT[step.case]}.
          </>,
          undefined,
          { tree: step.tree, hi: step.child, other: step.uncle, bad: [step.child, step.parent], fixCase: step.case },
        );
        break;
      case 'recolor': {
        const names = step.nodes.join(', ');
        rec.snap(
          step.reason === 'root' ? (
            <>The root must be black (rule 2): {names} is blackened.</>
          ) : (
            <>
              Recolour {names}: {step.reason === 'uncle-red' ? 'parent and uncle black, grandparent red; the trouble may have moved up to the grandparent' : 'the colours the rotation needs'}.
            </>
          ),
          undefined,
          { tree: step.tree, moved: [...step.nodes], hi: null, bad: [], other: null },
        );
        break;
      }
      case 'rotate':
        rec.set({ rotations: rec.get().rotations + 1 });
        rec.snap(
          <>
            {step.rotation.kind === 'right' ? 'Right' : 'Left'} rotation at {hl(step.rotation.down)}: {hl(step.rotation.up)} moves up. Only who is parent of whom changes; the in-order keys stay the same.
          </>,
          undefined,
          { tree: step.tree, moved: [step.rotation.up, step.rotation.down], hi: null, bad: [], other: null },
        );
        break;
      case 'remove': {
        const took = step.successor !== null ? <>{hl(key)} had two children, so its in-order successor {hl(step.successor)} took its place and its colour. </> : null;
        rec.snap(
          step.removed === 'R' ? (
            <>
              {took}The node that left its place was <span className="hl pink">red</span>, so no path lost a black node and no rule is broken.
            </>
          ) : (
            <>
              {took}The node that left its place was black, so <span className="hl violet">every path through this spot is one black short</span> (rule 4 is broken): the ringed spot is the &quot;double black&quot;.
            </>
          ),
          undefined,
          {
            tree: step.tree,
            hi: step.successor,
            short: step.removed === 'B' && step.xParent !== null && step.xSide ? { node: step.x, parent: step.xParent, side: step.xSide } : null,
          },
        );
        break;
      }      case 'fix':
        rec.snap(
          <>
            {step.x === null ? <>The short spot is an empty child of {step.xParent}</> : <>The short spot is {step.x}</>}, and its sibling is {step.sibling}. Case {CASE_TEXT[step.case]}.
          </>,
          undefined,
          { tree: step.tree, other: step.sibling, hi: step.xParent, short: { node: step.x, parent: step.xParent, side: step.xSide }, fixCase: step.case },
        );
        break;
      case 'done':
        break;
    }
  }
  const problems = checkRb(result.tree);
  rec.set({ hi: null, other: null, bad: [], short: null, path: [], recolors: result.recolors, rotations: result.rotations.length });
  rec.close(
    problems.length ? (
      <span className="hl bad wrap">The checker found: {problems[0]}</span>
    ) : (
      <>
        Done: {plural(result.rotations.length, 'rotation')} and {plural(result.recolors, 'recolour')} (counted separately, one flip each). All four rules hold again ({sizeOf(result.tree)} nodes, height {heightOf(result.tree)}).
      </>
    ),
    2,
  );
  return { frames: rec.frames, tree: result.tree, result };
}
