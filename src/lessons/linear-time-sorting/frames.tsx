import type { ReactNode } from 'react';
import { plural, power } from '../../core/format';
import { createRecorder } from '../../core/recorder';
import type { Frame } from '../../core/types';
import {
  COUNT_KEYS, countingSort, digitOf, firstBreak, isSorted, isStable, itemsOf, leaves, lowerBound, nodeOf, occurrenceTag, RADIX_BASE,
  RADIX_DIGITS, radixSort, TREE_ROOT, walkAnswers, type BucketOrder, type Item, type Triple,
} from './model';

export const itemText = (it: Item) => `${it.key}${occurrenceTag(it.occurrence)}`;
const DIGIT_NAMES = ['ones', 'tens', 'hundreds'];

// ── Scene 1: walking the decision tree ────────────────────────────────

export interface BoundFrame extends Frame {
  /** Nodes visited, root first; the last is where the walk is now. */
  path: string[];
  answers: boolean[];
}

const orderText = (order: readonly string[]) => order.join(' < ');

/** What the leaves teach: how deep they are, and why the tree can't be shallower. */
function leafSummary(depth: number): ReactNode {
  const all = leaves().length;
  const bound = lowerBound(3);
  const deepest = Math.max(...leaves().map((l) => walkAnswersTo(l.id).length - 1));
  const atDeepest = leaves().filter((l) => walkAnswersTo(l.id).length - 1 === deepest).length;
  return (
    <>
      {depth < deepest
        ? <> This input needed only {depth}, but {atDeepest} of the {all} orders need {deepest}.</>
        : null}{' '}
      A tree {bound - 1} levels deep has at most {power(bound - 1)} = {2 ** (bound - 1)} leaves, fewer than the {all} orders, so every
      comparison sort needs <b>{bound}</b> comparisons on some input of three.
    </>
  );
}

/** Root-to-leaf path to a node, found by search (the tree is tiny). */
function walkAnswersTo(target: string): string[] {
  const go = (id: string, path: string[]): string[] | null => {
    const next = [...path, id];
    if (id === target) return next;
    const n = nodeOf(id);
    if (n.kind === 'leaf') return null;
    return go(n.yes, next) ?? go(n.no, next);
  };
  return go(TREE_ROOT, []) ?? [];
}

export function boundFrames(answers: readonly boolean[], values: Triple | null): BoundFrame[] {
  const path = walkAnswers(answers);
  const r = createRecorder<BoundFrame>({ path: [TREE_ROOT], answers: [] });
  const input = values ? <>Input a = {values.a}, b = {values.b}, c = {values.c}. </> : null;
  r.snap(
    <>
      {input}Each box is one comparison. {values ? 'Watch the answers walk down' : 'Answer Yes or No to walk down'}: a leaf is a finished sort,
      and the number of boxes on the way is the number of comparisons.
    </>,
  );
  for (let i = 1; i < path.length; i++) {
    const asked = nodeOf(path[i - 1]);
    if (asked.kind !== 'ask') break;
    const yes = answers[i - 1];
    const here = nodeOf(path[i]);
    const why = values ? <> ({values[asked.x]} {yes ? '<' : '>'} {values[asked.y]})</> : null;
    const head = (
      <>
        Comparison {i}: is {asked.x} &lt; {asked.y}? <b>{yes ? 'Yes' : 'No'}</b>{why}.
      </>
    );
    r.snap(
      here.kind === 'leaf' ? (
        <>
          {head} Leaf after {plural(i, 'comparison')}: the order is <span className="hl ok">{orderText(here.order)}</span>
          {values ? null : <>, and any input in that order ends here</>}.{leafSummary(i)}
        </>
      ) : (
        head
      ),
      here.kind === 'leaf' ? 2 : undefined,
      { path: path.slice(0, i + 1), answers: answers.slice(0, i) },
    );
  }
  return r.frames;
}

// ── Scene 2: counting sort ────────────────────────────────────────────

export type CountPhase = 'intro' | 'count' | 'start' | 'place' | 'done';

export interface CountFrame extends Frame {
  phase: CountPhase;
  counts: number[];
  /** Next free output slot per key, once worked out (null before pass 2 reaches it). */
  starts: (number | null)[];
  out: (Item | null)[];
  /** The input item being handled now. */
  current: number | null;
  /** The key cell being updated now. */
  hotKey: number | null;
  /** The output slot just filled. */
  slot: number | null;
  /** Input items already placed. */
  placed: number[];
  /** Steps done: counts + starts + placements. */
  work: number;
}

export function countingFrames(keys: readonly number[]): CountFrame[] {
  const n = keys.length;
  const run = countingSort(keys);
  const r = createRecorder<CountFrame>(
    {
      phase: 'intro', counts: new Array(COUNT_KEYS).fill(0), starts: new Array(COUNT_KEYS).fill(null), out: new Array(n).fill(null),
      current: null, hotKey: null, slot: null, placed: [], work: 0,
    },
    { transient: { current: null, hotKey: null, slot: null } },
  );
  r.snap(
    <>
      Counting sort never compares two items with each other: it uses each key as an index. Pass 1 counts how many items have each key
      0 to {COUNT_KEYS - 1}. Letters tell equal keys apart in input order.
    </>,
  );
  for (const s of run.steps) {
    r.set({ work: r.get().work + 1 });
    if (s.t === 'count') {
      r.snap(
        <>
          <b>{itemText(s.item)}</b> has key {s.item.key}, so count[{s.item.key}] goes up to {s.counts[s.item.key]}.
        </>,
        undefined,
        { phase: 'count', counts: s.counts, current: s.item.id, hotKey: s.item.key },
      );
    } else if (s.t === 'start') {
      const starts = s.starts.map((v, k) => (k <= s.key ? v : null));
      const say =
        s.key === 0 ? (
          <>
            All {plural(n, 'item')} counted. Pass 2 works out where each key starts in the output: the number of items with a smaller key.
            Nothing is smaller than 0, so start[0] = 0.
          </>
        ) : (
          <>
            start[{s.key}] = start[{s.key - 1}] + count[{s.key - 1}] = {s.starts[s.key - 1]} + {s.counts[s.key - 1]} = <b>{s.starts[s.key]}</b>.
          </>
        );
      r.snap(say, undefined, { phase: 'start', starts, hotKey: s.key });
    } else {
      const before = r.get().placed.map((id) => run.out.find((it) => it.id === id)!).filter((it) => it.key === s.item.key);
      const latest = before[before.length - 1];
      r.snap(
        <>
          <b>{itemText(s.item)}</b> goes to slot {s.slot}, the next one for key {s.item.key}; start[{s.item.key}] moves on to {s.slot + 1}.
          {latest ? <> It lands after {itemText(latest)} because {itemText(latest)} came first in the input: that is what stable means.</> : null}
        </>,
        undefined,
        {
          phase: 'place', starts: s.starts, out: s.out, current: s.item.id, hotKey: s.item.key, slot: s.slot,
          placed: [...r.get().placed, s.item.id],
        },
      );
    }
  }
  r.set({ phase: 'done' });
  r.close(countingVerdict(run.out, n), 2);
  return r.frames;
}

/** The closing caption, from the output itself. */
export function countingVerdict(out: readonly Item[], n: number): ReactNode {
  const sorted = isSorted(out);
  const stable = isStable(out);
  return (
    <>
      {sorted ? 'Sorted' : 'Not sorted'} with <b>0</b> comparisons between items: {n} counts + {COUNT_KEYS} starts + {n} placements, so
      the work grows as n + k, with k = {COUNT_KEYS} possible keys.{' '}
      {stable ? 'Equal keys kept their input order: the sort is stable.' : 'Equal keys changed order: not stable.'}
    </>
  );
}

// ── Scene 3: LSD radix sort ───────────────────────────────────────────

export interface RadixFrame extends Frame {
  /** The pass under way (0 = ones), or null before the first. */
  pass: number | null;
  strip: Item[];
  buckets: Item[][];
  /** The item just dropped. */
  current: number | null;
  /** Shown as read back into the strip. */
  collected: boolean;
  done: boolean;
  /** Digits read so far: one per drop. */
  reads: number;
}

export function radixFrames(keys: readonly number[], order: BucketOrder): RadixFrame[] {
  const run = radixSort(keys, order);
  const empty = () => Array.from({ length: RADIX_BASE }, () => [] as Item[]);
  const r = createRecorder<RadixFrame>(
    { pass: null, strip: itemsOf(keys), buckets: empty(), current: null, collected: false, done: false, reads: 0 },
    { transient: { current: null } },
  );
  r.snap(
    <>
      LSD radix sort, base 10: sort by the ones digit, then the tens, then the hundreds. Each pass drops the strip into 10 buckets in strip
      order and reads them back from 0 to 9, {order === 'fifo' ? 'each bucket first in, first out' : <>each bucket <b>newest first</b> (not stable)</>}.
    </>,
  );
  for (const s of run.steps) {
    if (s.t === 'drop') {
      const d = digitOf(s.item.key, s.pass);
      const bucket = s.buckets[d];
      const ahead = bucket[bucket.length - 2];
      r.snap(
        <>
          {pad(s.item.key)}: {DIGIT_NAMES[s.pass]} digit <span className="hl">{d}</span>, so it joins bucket {d}
          {ahead ? <>, behind {pad(ahead.key)}</> : null}.
        </>,
        undefined,
        { pass: s.pass, strip: s.order.slice(), buckets: s.buckets, current: s.item.id, collected: false, reads: r.get().reads + 1 },
      );
    } else {
      r.snap(collectCaption(s.order, s.pass, order), 1.6, { pass: s.pass, strip: s.order, buckets: s.buckets, collected: true });
    }
  }
  r.set({ done: true });
  r.close(radixVerdict(run.out, keys.length, run.digitReads), 2);
  return r.frames;
}

export const pad = (key: number) => String(key).padStart(RADIX_DIGITS, '0');

function collectCaption(strip: readonly Item[], pass: number, order: BucketOrder): ReactNode {
  const digits = pass + 1;
  const broken = firstBreak(strip, digits);
  const what = digits === 1 ? 'its last digit' : `its last ${digits} digits`;
  if (broken) {
    const [x, y] = broken;
    const low = (k: number) => String(k % RADIX_BASE ** digits).padStart(digits, '0');
    return (
      <>
        Read back 0 to 9, newest first. The strip is <span className="hl bad">not</span> in order by {what}: {pad(x.key)} comes before{' '}
        {pad(y.key)}, but {low(x.key)} &gt; {low(y.key)}. Handing a bucket back newest first undid the order the previous pass left.
      </>
    );
  }
  const keep =
    pass === 0 ? null : order === 'fifo' ? (
      <> Inside a bucket, items kept the order the last pass left them, so ties on this digit stay in order by the lower digits.</>
    ) : (
      <> Newest-first buckets didn't scramble anything this time.</>
    );
  return (
    <>
      Read the buckets back from 0 to 9{order === 'fifo' ? '' : ', newest first'}. The strip is now in order by {what}.{keep}
    </>
  );
}

export function radixVerdict(out: readonly Item[], n: number, digitReads: number): ReactNode {
  const broken = firstBreak(out, RADIX_DIGITS);
  return (
    <>
      {isSorted(out) ? <span className="hl ok">Sorted</span> : <span className="hl bad">Not sorted</span>} after {RADIX_DIGITS} passes,
      each touching every number once and all 10 buckets: {digitReads} digit reads for {plural(n, 'number')}, and no two numbers were ever compared.
      {broken ? (
        <>
          {' '}{pad(broken[0].key)} still comes before {pad(broken[1].key)}: the passes only add up when each one is stable.
        </>
      ) : null}
    </>
  );
}
