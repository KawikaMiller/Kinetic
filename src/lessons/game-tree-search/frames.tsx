import type { ReactNode } from 'react';
import { isLeaf, isMax, type Event, type SearchResult, type Spec } from './tree';
import { boundText, pathName } from './view';

export interface SearchFrame {
  say: ReactNode;
  /** Events of the search shown so far. */
  k: number;
}

const kindOf = (node: number, spec: Spec) => (isMax(node, spec.b) ? 'max' : 'min');

function eventSay(e: Event, spec: Spec, result: SearchResult, windows: boolean): ReactNode {
  const name = pathName(e.node, spec.b);
  switch (e.type) {
    case 'enter':
      return <>Enter {name}, a {kindOf(e.node, spec)} node{windows ? <> with the window ({boundText(e.alpha)}, {boundText(e.beta)})</> : null}.</>;
    case 'leaf':
      return <>Leaf {name} is worth {e.value}.</>;
    case 'return': {
      const max = isMax(e.node, spec.b);
      const child = result.chosen.get(e.node)!;
      return <>{name} is a {max ? 'max' : 'min'} node: it takes the {max ? 'largest' : 'smallest'} value among the children it looked at, {pathName(child, spec.b)} = {e.value}{e.node === 0 ? <>. The best first move is {pathName(child, spec.b)}.</> : '.'}</>;
    }
    case 'cut': {
      const names = e.skipped.map((s) => pathName(s, spec.b)).join(', ');
      return <>At {pathName(e.node, spec.b)} the window closes ({boundText(e.alpha)} is at least {boundText(e.beta)}): {names} cannot change the answer and {e.skipped.length === 1 ? 'is' : 'are'} skipped.</>;
    }
  }
}

/** The opening, one frame per event of the search, and a closing summary; every caption comes from the recorded search. */
export function searchFrames(spec: Spec, result: SearchResult, windows: boolean): SearchFrame[] {
  const frames: SearchFrame[] = [
    {
      k: 0,
      say: windows
        ? <>Alpha-beta walks the tree depth first. Each node carries a window: alpha, the best the maximiser can already guarantee on this path, and beta, the best the minimiser can.</>
        : <>Plain minimax walks every node of the tree, depth first, and values come back up from the leaves: a max node takes its largest child, a min node its smallest.</>,
    },
  ];
  result.events.forEach((e, i) => {
    // A leaf's own frame covers its entry: the caption would only say the same thing twice.
    if (e.type === 'enter' && isLeaf(e.node, spec)) return;
    frames.push({ k: i + 1, say: eventSay(e, spec, result, windows) });
  });
  frames.push({
    k: result.events.length,
    say: <>Done: the root is worth {result.value} and the best first move is {pathName(result.bestChild, spec.b)}, after looking at {result.nodes} of {(spec.b ** (spec.d + 1) - 1) / (spec.b - 1)} nodes ({result.leaves} of {spec.b ** spec.d} leaves).</>,
  });
  return frames;
}
