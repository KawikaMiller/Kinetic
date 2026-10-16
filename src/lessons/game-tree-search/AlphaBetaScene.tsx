import { useMemo, useState, type ReactNode } from 'react';
import { Button, Hint, Segmented, Stat, Toggle } from '../../components/ui';
import { DEFAULT_LEAVES, OPENING, SPEC, swappedBoundsCounterexample } from './presets';
import { SearchStage } from './SearchStage';
import { knuthMooreMinimum, leafCount, nodeCount, orderingFor, scorePrediction, search, type Ordering } from './tree';
import { pathName } from './view';

const ORDER_SEED = 7;
const ORDERINGS: { value: Ordering; label: string }[] = [
  { value: 'given', label: 'As drawn' },
  { value: 'best', label: 'Best first' },
  { value: 'worst', label: 'Worst first' },
  { value: 'random', label: 'Random' },
];
const COUNTEREXAMPLE = swappedBoundsCounterexample();

/** Scene 2, alpha-beta: windows at each node, skipped subtrees struck through, and an ordering that changes the work but never the answer. */
export function AlphaBetaScene({ picker }: { picker: ReactNode }) {
  const [pruning, setPruning] = useState<boolean>(OPENING.alphabeta.pruning);
  const [ordering, setOrdering] = useState<Ordering>(OPENING.alphabeta.ordering);
  const [predicted, setPredicted] = useState<ReadonlySet<number>>(new Set());
  const leaves = DEFAULT_LEAVES;

  const order = useMemo(() => orderingFor(SPEC, leaves, ordering, ORDER_SEED), [leaves, ordering]);
  const result = useMemo(() => search(SPEC, leaves, { prune: pruning, order }), [leaves, pruning, order]);
  const plain = useMemo(() => search(SPEC, leaves, { prune: false }), [leaves]);
  const ge = useMemo(() => search(SPEC, leaves, { prune: true, order }), [leaves, order]);
  const gt = useMemo(() => search(SPEC, leaves, { prune: true, variant: 'gt', order }), [leaves, order]);
  const swapped = useMemo(() => search(SPEC, leaves, { prune: true, variant: 'swapped-bounds', order }), [leaves, order]);
  const bestOrdered = useMemo(() => search(SPEC, leaves, { prune: true, order: orderingFor(SPEC, leaves, 'best') }), [leaves]);
  const score = scorePrediction([...predicted], result.cutRoots, SPEC);

  const toggle = (id: number) => {
    if (id === 0) return;
    setPredicted((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <SearchStage
      spec={SPEC}
      leaves={leaves}
      result={result}
      windows={pruning}
      marks={{ predicted }}
      onNodeClick={toggle}
      ariaLabel="Game tree with an alpha-beta window at each node; click a node to predict that it will be skipped"
      extraStats={({ done }) => (
        <>
          <Stat label="Leaves looked at" value={result.leaves} color={result.leaves < plain.leaves ? 'var(--ok)' : 'var(--bad)'} sub={`plain minimax looks at ${plain.leaves}; ${plain.nodes} nodes against ${nodeCount(SPEC)}`} />
          <Stat label="Root value" value={result.value === plain.value ? 'same as minimax' : 'DIFFERENT'} color={result.value === plain.value ? 'var(--ok)' : 'var(--bad)'} sub={`${result.value} here, ${plain.value} from plain minimax`} />
          <Stat
            label="Your predicted cuts"
            value={predicted.size === 0 ? 'none marked' : done ? `${score.hits} right, ${score.wrong} wrong` : `${predicted.size} marked`}
            color={done && predicted.size > 0 ? (score.wrong === 0 ? 'var(--ok)' : 'var(--hi)') : 'var(--dim)'}
            sub={done ? `${score.missed} of ${result.cutRoots.length} skipped subtrees had no mark` : 'checked when the run ends'}
          />
        </>
      )}
      controls={[
        picker,
        <>
          <Toggle label="Pruning" value={pruning} onChange={setPruning} off="Plain minimax" on="Alpha-beta" />
          <Segmented label="Order the children" value={ordering} onChange={setOrdering} options={ORDERINGS} />
          <Button softDisabled={predicted.size === 0} onClick={() => setPredicted(new Set())}>Clear marks</Button>
          <Hint><span role="status">Click nodes to mark what you think will be skipped, then play. A mark inside a skipped subtree counts as right.</span></Hint>
        </>,
      ]}
      below={
        <>
          <p className="gt-note">
            The answer is {result.value === plain.value ? `the minimax value ${plain.value}` : 'different from minimax (a bug)'} whichever order the children are tried in; only the work changes: {result.leaves} leaves with this order{pruning ? '' : ' and no pruning'}, {bestOrdered.leaves} with the best order. Knuth and Moore's minimum for a perfectly ordered tree with distinct values is b^ceil(d/2) + b^floor(d/2) - 1 = {knuthMooreMinimum(SPEC)} leaves (verify against Knuth and Moore, 1975); this tree has ties, so a best order can match or beat it. Worst-first ordering looks at {search(SPEC, leaves, { prune: true, order: orderingFor(SPEC, leaves, 'worst') }).leaves} of {leafCount(SPEC)} leaves.
          </p>
          <h4 className="gt-h">Why the test is alpha at least beta, and what a bug looks like</h4>
          <p className="gt-note">
            With this order the standard test (alpha at least beta) looks at {ge.leaves} leaves; testing alpha strictly above beta still gives {gt.value} but looks at {gt.leaves}, because a window that has just closed is not yet counted as closed. A node that tightens the wrong bound (each side updating the other's) returns {swapped.value} here{swapped.value === plain.value ? ', which happens to be right on this tree' : ', which is wrong'}. On a tree the lesson found by search, minimax says {COUNTEREXAMPLE.truth} and that bug says {COUNTEREXAMPLE.buggy}: leaves {COUNTEREXAMPLE.leaves.join(', ')}.
          </p>
          <p className="gt-note">Moves are named by path: {pathName(1, SPEC.b)}, {pathName(2, SPEC.b)}, {pathName(3, SPEC.b)} at the top, then a digit for each reply.</p>
        </>
      }
    />
  );
}
