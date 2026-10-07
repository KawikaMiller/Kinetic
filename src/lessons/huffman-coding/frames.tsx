import type { ReactNode } from 'react';
import { createRecorder } from '../../core/recorder';
import type { Frame } from '../../core/types';
import { costs, decode, decodeSteps, encode, forcedOneBitCost, frequencies, showSym, type Huffman, type TieBreak } from './model';

export type Mode = 'build' | 'decode';

export interface HfFrame extends Frame {
  /** Forest roots, in queue order (lightest first). */
  roots: number[];
  /** The two trees being merged right now. */
  merging: number[];
  /** The parent a merge just created. */
  parent: number | null;
  /** The tree is complete: edges get 0/1 and the codes are known. */
  finished: boolean;
  /** Decode: the bit being read, and how many bits are already read. */
  cursor: number | null;
  /** Decode: the node the walk is on. */
  at: number | null;
  /** Decode: nodes walked for the code being read, root first. */
  path: number[];
  /** Decode: the symbol this bit just finished, if any. */
  emitted: string | null;
  decoded: string;
}

const q = (s: string) => <b>&lsquo;{showSym(s)}&rsquo;</b>;
const bitWord = (k: number) => `${k} bit${k === 1 ? '' : 's'}`;
const tieWord = (tie: TieBreak) => (tie === 'old' ? 'the older tree' : 'the newer tree');

function nodeName(h: Huffman, id: number): ReactNode {
  const n = h.nodes[id];
  return n.sym !== undefined ? <>{q(n.sym)} ({n.weight})</> : <>a tree weighing {n.weight}</>;
}

/** True when the second pick's weight is shared by a tree left behind: the tie-break decided it. */
export function tieDecided(h: Huffman, step: number): boolean {
  const m = h.merges[step];
  const w = h.nodes[m.b].weight;
  return m.queueBefore.slice(2).some((id) => h.nodes[id].weight === w);
}

/** "a", "a and b", "a, b and c": symbols for a caption. */
function symList(syms: readonly string[]): ReactNode {
  return syms.map((x, i) => (
    <span key={x}>
      {i > 0 && (i === syms.length - 1 ? ' and ' : ', ')}
      {q(x)}
    </span>
  ));
}

/** How many tied symbols a caption names one by one; beyond that it gives the code lengths. */
const LIST_MAX = 3;

/** One end of the count table (commonest or rarest), worded for ties. */
function endPhrase(h: Huffman, group: readonly { sym: string; count: number }[], role: 'commonest' | 'rarest'): ReactNode {
  const code = (x: string) => h.codes.get(x)!;
  if (group.length === 1) {
    const g = group[0];
    return <>the {role}, {q(g.sym)} ×{g.count}, gets {code(g.sym)} ({bitWord(code(g.sym).length)})</>;
  }
  const lens = group.map((g) => code(g.sym).length);
  const lo = Math.min(...lens);
  const hi = Math.max(...lens);
  const codes =
    group.length <= LIST_MAX
      ? <>get {group.map((g) => code(g.sym)).join(', ')}</>
      : <>get codes of {lo === hi ? bitWord(lo) : `${lo}-${hi} bits`}</>;
  return <>{symList(group.map((g) => g.sym))} tie as {role} (×{group[0].count} each) and {codes}</>;
}

/** The summary of the code table: commonest and rarest symbols (ties named as ties), totals against fixed width and ASCII. */
export function codeSummary(h: Huffman): ReactNode {
  const c = costs(h);
  const freq = frequencies(h.text);
  if (c.distinct === 1) {
    return (
      <>
        Only one distinct character, {q(freq[0].sym)} ×{c.n}. A lone leaf has no edges to label, so by convention it gets a 1-bit code, 0: {bitWord(c.huffman)} in
        all, against {c.ascii} in 8-bit ASCII.
      </>
    );
  }
  const totals = (
    <>
      Total <b>{c.huffman} bits</b>, against {c.fixedBits} at a fixed {bitWord(c.fixedWidth)} and {c.ascii} in ASCII.
    </>
  );
  const max = freq[0].count;
  const min = freq[freq.length - 1].count;
  if (max === min) {
    const lens = freq.map((f) => h.codes.get(f.sym)!.length);
    const lo = Math.min(...lens);
    const hi = Math.max(...lens);
    return (
      <>
        Codes read off root to leaf. All {c.distinct} characters appear ×{max} each, so none earns a shorter code than another:{' '}
        {lo === hi ? <>every code is {bitWord(lo)}.</> : <>the codes are {lo}-{hi} bits, as even as a tree with {c.distinct} leaves allows.</>} {totals}
      </>
    );
  }
  const tops = freq.filter((f) => f.count === max);
  const rares = freq.filter((f) => f.count === min);
  const shortestTop = Math.min(...tops.map((t) => h.codes.get(t.sym)!.length));
  return (
    <>
      Codes read off root to leaf: {endPhrase(h, tops, 'commonest')}; {endPhrase(h, rares, 'rarest')}. {totals}
      {shortestTop > 1 && <> {oneBitNote(h, tops.length > 1)}</>}
    </>
  );
}

/** Why no commonest symbol got 1 bit, from the best total with one of them forced to 1 bit (by symmetry, any of a tie gives the same). */
function oneBitNote(h: Huffman, tied: boolean): ReactNode {
  const forced = forcedOneBitCost(h.text);
  const best = costs(h).huffman;
  const it = tied ? 'one of them' : 'it';
  return forced > best ? (
    <>Forcing {it} to a 1-bit code would take half of all codes and cost {forced} bits in all, {forced - best} more.</>
  ) : (
    <>Forcing {it} to a 1-bit code would tie at {forced} bits: another optimal tree does that, this one just doesn't.</>
  );
}

const blank = (h: Huffman): Omit<HfFrame, 'say' | 'hold'> => ({
  roots: h.leaves, merging: [], parent: null, finished: false, cursor: null, at: null, path: [], emitted: null, decoded: '',
});

export function buildFrames(h: Huffman, tie: TieBreak): HfFrame[] {
  const rec = createRecorder<HfFrame>(blank(h), { transient: { merging: [], parent: null } });
  const c = costs(h);
  if (c.distinct === 1) {
    rec.snap(<>Count the characters: {c.n} of them, all the same. One leaf, so there's nothing to merge.</>);
    rec.snap(codeSummary(h), 2, { finished: true });
    return rec.frames;
  }
  rec.snap(
    <>
      Count the characters: {c.n}, of which {c.distinct} are distinct. Each distinct one becomes a leaf weighted by its count, and the queue lists the trees lightest
      first.
    </>,
  );
  const firstTie = h.merges.findIndex((_, i) => tieDecided(h, i));
  h.merges.forEach((m, i) => {
    const tied = tieDecided(h, i);
    rec.snap(
      <>
        Take the two lightest trees: {nodeName(h, m.a)} and {nodeName(h, m.b)}.
        {tied && (
          <>
            {' '}Another tree weighs {h.nodes[m.b].weight} too: ties go to {tieWord(tie)}.
            {i === firstTie && <> Creation order: the leaves first, lightest first with equal counts in reverse character order (z before a), then each merged tree as it's made.</>}
          </>
        )}
      </>,
      undefined,
      { roots: m.queueBefore, merging: [m.a, m.b] },
    );
    const left = m.queueAfter.length;
    rec.snap(
      <>
        Merge them under a new parent weighing {h.nodes[m.a].weight} + {h.nodes[m.b].weight} = {h.nodes[m.parent].weight}, back into the queue.{' '}
        {left === 1 ? 'One tree left.' : `${left} trees left.`}
      </>,
      undefined,
      { roots: m.queueAfter, parent: m.parent },
    );
  });
  rec.snap(
    <>
      The tree is done, and its root weighs {c.n}, the message length. Label every left edge 0 and every right edge 1: a symbol's code is the path from the root down
      to its leaf.
    </>,
    undefined,
    { finished: true },
  );
  rec.close(codeSummary(h), 2);
  return rec.frames;
}

/** True when decoding the encoded bits gives the original text back. */
export const roundTrips = (h: Huffman) => decode(h, encode(h)) === h.text;

export function decodeFrames(h: Huffman): HfFrame[] {
  const bits = encode(h);
  const steps = decodeSteps(h, bits);
  const single = h.nodes[h.root].sym !== undefined;
  const rec = createRecorder<HfFrame>({ ...blank(h), roots: [h.root], finished: true, at: h.root, path: [h.root] }, { transient: { emitted: null } });
  rec.snap(
    single ? (
      <>Decode {bitWord(bits.length)}. The tree is a single leaf, so every bit read is one {q(h.symbols[0])}.</>
    ) : (
      <>Decode {bitWord(bits.length)}, one at a time: start at the root, go left on 0 and right on 1, and output a symbol whenever you land on a leaf.</>
    ),
  );
  let decoded = '';
  let path = [h.root];
  for (const s of steps) {
    const b = bits[s.bit];
    path = single ? [s.node] : [...path, s.node];
    if (s.emitted !== undefined) {
      decoded += s.emitted;
      rec.snap(
        <>
          Bit {s.bit + 1} is {b}: {single ? 'the leaf' : 'that reaches leaf'} {q(s.emitted)}. Output it and go back to the root.
        </>,
        undefined,
        { cursor: s.bit, at: s.node, path, emitted: s.emitted, decoded },
      );
      path = [h.root];
    } else {
      rec.snap(
        <>
          Bit {s.bit + 1} is {b}: go {b === '0' ? 'left' : 'right'} to {nodeName(h, s.node)}. Not a leaf yet, so keep reading.
        </>,
        undefined,
        { cursor: s.bit, at: s.node, path, decoded },
      );
    }
  }
  rec.close(
    roundTrips(h) ? (
      <>
        All {bitWord(bits.length)} decode back to the original {Array.from(h.text).length} characters, with no separators: no code is the start of another, so a leaf
        is only ever reached at the end of a whole code.
      </>
    ) : (
      <>The decoded text doesn't match the original.</>
    ),
    2,
  );
  return rec.frames;
}

export const framesFor = (mode: Mode, h: Huffman, tie: TieBreak) => (mode === 'build' ? buildFrames(h, tie) : decodeFrames(h));
