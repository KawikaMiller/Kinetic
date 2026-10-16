import { createRecorder } from '../../core/recorder';
import type { Frame } from '../../core/types';
import { balanceOf, checkAvl, insertKey, removeKey, sizeOf, heightOf, type Case, type OpResult, type Tree } from '../../core/avl';
import { CASE_FIX, CASE_NAME, fixCount, rotationCount, rotationText, signed } from './text';

export interface AvlFrame extends Frame {
  tree: Tree;
  /** The node being compared, placed or removed. */
  hi: number | null;
  /** Nodes on the walk so far. */
  path: number[];
  /** Ancestors the retrace has checked and found within -1..1. */
  checked: number[];
  /** The out-of-balance node. */
  bad: number | null;
  /** The two nodes the latest rotation moved. */
  moved: number[];
  /** The in-order successor lifted into a deleted node's place. */
  succ: number | null;
  /** The case named for the current out-of-balance node. */
  caseAt: Case | null;
  rotations: number;
  fixes: number;
  /** The rotations so far, in words: the ledger. */
  log: string[];
}

export interface OpFrames {
  frames: AvlFrame[];
  tree: Tree;
  result: OpResult;
}

const hl = (n: number | string) => <span className="hl">{n}</span>;

/** One insert or delete, one frame per step of the algorithm, all from the model's own step list. */
export function opFrames(base: Tree, op: 'insert' | 'delete', key: number): OpFrames {
  const result = op === 'insert' ? insertKey(base, key, { record: true }) : removeKey(base, key, { record: true });
  const rec = createRecorder<AvlFrame>(
    { tree: base, hi: null, path: [], checked: [], bad: null, moved: [], succ: null, caseAt: null, rotations: 0, fixes: 0, log: [] },
    { transient: { moved: [] } },
  );
  const doomed = op === 'delete' ? base.nodes[key] : null;
  rec.snap(
    op === 'insert' ? (
      <>Insert {hl(key)}: walk down comparing, place it as a leaf, then walk back up checking every ancestor.</>
    ) : (
      <>Delete {hl(key)}: find it, unlink it (a node with two children is replaced by its in-order successor), then walk back up checking every ancestor from the change.</>
    ),
  );
  for (const step of result.steps) {
    switch (step.kind) {
      case 'visit': {
        const at = step.path[step.path.length - 1];
        const left = step.key < at;
        rec.snap(
          step.key === at ? (
            <>Found {hl(at)}.</>
          ) : (
            <>
              Compare {hl(step.key)} with {hl(at)}: {left ? 'smaller, so go left' : 'bigger, so go right'}.
            </>
          ),
          undefined,
          { tree: step.tree, hi: at, path: [...step.path] },
        );
        break;
      }
      case 'place': {
        const parent = step.path[step.path.length - 1];
        rec.snap(
          parent === undefined ? (
            <>The tree was empty, so {hl(step.key)} is the root.</>
          ) : (
            <>
              {hl(step.key)} becomes the {step.key < parent ? 'left' : 'right'} child of {parent}. Heights above it are now stale: walk back up.
            </>
          ),
          undefined,
          { tree: step.tree, hi: step.key, path: [...step.path] },
        );
        break;
      }
      case 'remove': {
        const kids = doomed ? Number(doomed.left !== null) + Number(doomed.right !== null) : 0;
        rec.snap(
          kids === 2 && step.successor !== null ? (
            <>
              {hl(key)} has two children, so its in-order successor {hl(step.successor)} (the smallest key on its right) takes its place.
            </>
          ) : kids === 1 ? (
            <>{hl(key)} has one child, which takes its place.</>
          ) : (
            <>{hl(key)} is a leaf: it is simply unlinked.</>
          ),
          undefined,
          { tree: step.tree, hi: step.successor, succ: step.successor, path: [] },
        );
        break;
      }
      case 'retrace': {
        const within = Math.abs(step.bf) <= 1;
        if (within) rec.set({ checked: [...rec.get().checked, step.at] });
        rec.snap(
          <>
            Back at {hl(step.at)}: height {step.h}, balance factor {signed(step.bf)}
            {within ? <>, inside the AVL rule of −1 to +1.</> : <>, outside −1 to +1: out of balance.</>}
          </>,
          undefined,
          { tree: step.tree, hi: step.at, bad: within ? null : step.at },
        );
        break;
      }
      case 'unbalanced': {
        rec.set({ fixes: rec.get().fixes + 1 });
        rec.snap(
          <>
            <span className="hl bad">{step.at} is out of balance</span> ({signed(step.bf)}): its heavy child {step.child}{' '}
            {balanceOf(step.tree, step.child) === 0 ? 'is level itself' : step.case === 'LL' || step.case === 'RR' ? 'leans the same way' : 'leans the other way'}. That is the {CASE_NAME[step.case]} case, repaired by {CASE_FIX[step.case]}.
          </>,
          undefined,
          { tree: step.tree, bad: step.at, caseAt: step.case, hi: step.child },
        );
        break;
      }
      case 'rotate': {
        rec.set({ rotations: rec.get().rotations + 1, log: [...rec.get().log, rotationText(step.rotation)] });
        rec.snap(
          <>
            {step.rotation.kind === 'right' ? 'Right' : 'Left'} rotation at {hl(step.rotation.down)}: {hl(step.rotation.up)} moves up, {step.rotation.down} moves down. Only who is parent of whom changes; the in-order keys stay the same.
          </>,
          undefined,
          { tree: step.tree, moved: [step.rotation.up, step.rotation.down], hi: null, bad: null },
        );
        break;
      }
    }
  }
  const problems = checkAvl(result.tree);
  const { rotations, fixes } = rec.get();
  rec.set({ hi: null, bad: null, path: [], succ: null, caseAt: null });
  rec.close(
    problems.length ? (
      <span className="hl bad wrap">The checker found: {problems[0]}</span>
    ) : (
      <>
        Done: {rotationCount(rotations)} in {fixCount(fixes)}. Every balance factor is inside −1 to +1 again ({sizeOf(result.tree)} nodes, height {heightOf(result.tree)}).
      </>
    ),
    2,
  );
  return { frames: rec.frames, tree: result.tree, result };
}
