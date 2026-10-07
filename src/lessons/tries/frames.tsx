import { plural } from '../../core/format';
import { createRecorder } from '../../core/recorder';
import type { Frame } from '../../core/types';
import { buildTrie, completions, countNodes, find, remove, scanCost } from './model';

export type Action =
  | { kind: 'build'; note: string | null }
  | { kind: 'search'; prefix: string }
  | { kind: 'insert'; word: string }
  | { kind: 'delete'; word: string };

export interface TrFrame extends Frame {
  /** The word set whose trie is drawn on this frame. */
  words: string[];
  /** The node being matched or created now. */
  hot: string | null;
  /** The matched path, root excluded. */
  path: string[];
  created: string[];
  /** Nodes of the drawn trie not created yet. */
  hidden: string[];
  pruned: string[];
  /** A node whose end mark has just been cleared. */
  unmarked: string | null;
  /** The prefix node whose subtree holds the completions. */
  found: string | null;
  completions: string[] | null;
  steps: number;
}

const q = (s: string) => (s === '' ? 'the empty prefix' : `“${s}”`);
const prefixesOf = (w: string) => Array.from({ length: w.length }, (_, i) => w.slice(0, i + 1));

/** The frames for one action on `before`, and the word list it leaves. */
export function actionFrames(before: readonly string[], action: Action): { frames: TrFrame[]; after: string[] } {
  const base: Omit<TrFrame, 'say' | 'hold'> = {
    words: [...before], hot: null, path: [], created: [], hidden: [], pruned: [], unmarked: null, found: null, completions: null, steps: 0,
  };
  const r = createRecorder<TrFrame>(base);
  const root = buildTrie(before);
  const nodes = countNodes(root);

  if (action.kind === 'build') {
    r.snap(
      <>
        A trie of {plural(before.length, 'word')} has <b>{nodes}</b> nodes: one per distinct prefix, plus the root. Each word is a path from the
        root, shared prefixes are stored once, and a green ring marks where a word ends.{action.note ? <> {action.note}</> : null}
      </>,
    );
    return { frames: r.frames, after: [...before] };
  }

  if (action.kind === 'search') {
    const p = action.prefix;
    r.snap(<>Look up {q(p)}: walk down from the root one letter at a time.</>);
    let at = '';
    for (const ch of p) {
      const next = at + ch;
      if (!find(root, next)) {
        const scan = scanCost(before, p);
        r.snap(
          <>
            No “{ch}” under {at === '' ? 'the root' : q(at)}: no word starts with {q(p)}. The trie knew after {plural(r.get().steps + 1, 'child lookup')}; a
            scan of the list makes {scan.calls} startsWith calls.
          </>,
          1.6,
          { hot: at, found: null, completions: [], steps: r.get().steps + 1 },
        );
        return { frames: r.frames, after: [...before] };
      }
      r.snap(<>“{ch}” → node {q(next)}.</>, undefined, { hot: next, path: [...r.get().path, next], steps: r.get().steps + 1 });
      at = next;
    }
    const words = completions(root, p);
    const scan = scanCost(before, p);
    r.snap(
      <>
        Reached {p === '' ? 'the root' : <>the node for {q(p)}</>} in {plural(r.get().steps, 'child lookup')}. Its subtree holds{' '}
        {plural(words.length, 'word')}, read out depth first in letter order{words.length ? <>: {words.join(', ')}</> : null}. Scanning the list
        instead: {scan.calls} startsWith calls, {plural(scan.chars, 'character check')}.
      </>,
      2,
      { hot: null, found: p, completions: words },
    );
    return { frames: r.frames, after: [...before] };
  }

  if (action.kind === 'insert') {
    const w = action.word;
    if (before.includes(w)) {
      r.snap(<>Insert {q(w)}: every letter's node already exists and the end ring is already there, so nothing changes.</>, 1.6, {
        path: prefixesOf(w), found: null,
      });
      return { frames: r.frames, after: [...before] };
    }
    const after = [...before, w];
    const fresh = prefixesOf(w).filter((x) => !find(root, x));
    r.set({ words: after, hidden: fresh });
    r.snap(<>Insert {q(w)}: walk down, creating a node only where the path doesn't exist yet.</>);
    for (const pre of prefixesOf(w)) {
      const ch = pre[pre.length - 1];
      const isNew = fresh.includes(pre);
      const st = r.get();
      r.snap(
        isNew ? <>No “{ch}” here yet, so create node {q(pre)}.</> : <>“{ch}”: node {q(pre)} already exists, follow it.</>,
        undefined,
        {
          hot: pre, path: [...st.path, pre], created: isNew ? [...st.created, pre] : st.created, hidden: st.hidden.filter((x) => x !== pre),
          steps: st.steps + 1,
        },
      );
    }
    const shared = prefixesOf(w).filter((x) => !fresh.includes(x));
    r.snap(
      <>
        Ring the last node: {q(w)} is now a word. {plural(fresh.length, 'new node')}
        {shared.length ? <>; the shared prefix {q(shared[shared.length - 1])} cost nothing new</> : null}. The trie has{' '}
        {countNodes(buildTrie(after))} nodes.
      </>,
      2,
      { hot: null },
    );
    return { frames: r.frames, after };
  }

  const w = action.word;
  const target = find(root, w);
  if (!target || !target.end) {
    const why = target ? <>{q(w)} is only a prefix here, with no end ring</> : <>the path for {q(w)} breaks off</>;
    r.snap(<>Delete {q(w)}: {why}, so there is nothing to delete.</>, 1.6, {
      path: prefixesOf(w).filter((x) => find(root, x)),
    });
    return { frames: r.frames, after: [...before] };
  }
  r.snap(<>Delete {q(w)}: first walk down to its last letter.</>);
  for (const pre of prefixesOf(w)) {
    r.snap(<>“{pre[pre.length - 1]}” → {q(pre)}.</>, undefined, { hot: pre, path: [...r.get().path, pre], steps: r.get().steps + 1 });
  }
  r.snap(<>Clear the end ring on {q(w)}: it is no longer a word.</>, undefined, { hot: null, unmarked: w });
  const copy = buildTrie(before);
  const pruned = remove(copy, w)!;
  for (const pre of pruned) {
    r.snap(<>Node {q(pre)} now leads to no word: no ring, no children. Prune it.</>, undefined, { pruned: [...r.get().pruned, pre] });
  }
  const after = before.filter((x) => x !== w);
  const keeper = prefixesOf(w).reverse().find((x) => !pruned.includes(x));
  const kept = keeper ? find(copy, keeper)! : null;
  const why = kept
    ? <> Pruning stops at {q(keeper!)}, which {kept.end ? 'is itself a word' : <>still leads to {plural(completions(copy, keeper!).length, 'word')}</>}.</>
    : null;
  r.snap(
    <>
      Removed {plural(pruned.length, 'node')}.{why} The trie has {countNodes(copy)} nodes.
    </>,
    2,
    { words: after, path: [], pruned: [], unmarked: null },
  );
  return { frames: r.frames, after };
}
