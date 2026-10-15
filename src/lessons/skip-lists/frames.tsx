import { createRecorder, type Recorder } from '../../core/recorder';
import type { Frame } from '../../core/types';
import type { Edge } from './SkipDrawing';
import { HEAD, buildList, type Entry, type Flips, type Pos, type SearchResult, type Snapshot, type SkipList } from './model';
import { nodeName, plainSteps } from './text';

export interface SkipFrame extends Frame {
  snap: Snapshot;
  target: number | null;
  token: { pos: Pos; level: number } | null;
  followed: Edge[];
  drops: { at: Pos; level: number }[];
  /** update[l]: remembered at each level the search leaves. */
  update: Pos[];
  moves: number;
  dropCount: number;
  comparisons: number;
  /** Set once the search has ended. */
  found: number | null;
  stop: Pos | null;
  /** The linear walk a plain list would make: keys below the target. */
  linear: number | null;
  coins: boolean[];
  fresh: number | null;
  changed: Edge[];
  /** Pointer writes made so far by an insert or a delete. */
  writes: number;
}

const hl = (n: number | string, tone = '') => <span className={`hl ${tone}`.trim()}>{n}</span>;

const initialFrame = (snap: Snapshot): Omit<SkipFrame, 'say' | 'hold' | 'quiet'> => ({
  snap, target: null, token: null, followed: [], drops: [], update: [], moves: 0, dropCount: 0, comparisons: 0, found: null, stop: null, linear: null, coins: [], fresh: null, changed: [], writes: 0,
});

type Rec = Recorder<SkipFrame>;

/** One frame per move and drop of the search, narrated from the model's own events. */
function searchPhase(rec: Rec, snap: Snapshot, target: number, s: SearchResult, remember: boolean) {
  rec.set({ target, token: { pos: HEAD, level: snap.levels - 1 } });
  rec.snap(
    <>
      Search for {hl(target)}: start at the head on the top level (level {snap.levels - 1}). Move right while the next key is smaller than {target}; drop a level when it is not.
    </>,
  );
  const update: Pos[] = [];
  s.events.forEach((e) => {
    const cur = rec.get();
    if (e.kind === 'move') {
      rec.snap(
        <>
          Level {e.level}: the next key after {nodeName(e.from)} is {hl(e.to)}, smaller than {target}. <span className="hl info">Move right</span>.
        </>,
        undefined,
        { token: { pos: e.to, level: e.level }, followed: [...cur.followed, { from: e.from, to: e.to, level: e.level }], moves: cur.moves + 1 },
      );
    } else {
      update[e.level] = e.at;
      rec.snap(
        <>
          Level {e.level}: {e.saw === null ? <>the next pointer is nil</> : <>the next key is {hl(e.saw)}, not smaller than {target}</>}. <span className="hl violet">Drop to level {e.level - 1}</span>
          {remember ? <> and remember {nodeName(e.at)} as the node to link after at level {e.level}</> : null}.
        </>,
        undefined,
        { token: { pos: e.at, level: e.level - 1 }, drops: [...cur.drops, { at: e.at, level: e.level }], dropCount: cur.dropCount + 1, update: remember ? [...update] : [] },
      );
    }
  });
  update[0] = s.pred;
  rec.set({ comparisons: s.comparisons, update: remember ? [...update] : [] });
  if (!remember) rec.set({ found: s.found ? target : null, stop: s.found ? null : s.pred, linear: plainSteps(snap, target) });
}

/** A search for `target`: ends on a verdict that compares the skip path with a plain list's walk. */
export function searchFrames(entries: readonly Entry[], target: number): SkipFrame[] {
  const list = buildList(entries);
  const snap = list.snapshot();
  const s = list.search(target);
  const rec = createRecorder<SkipFrame>(initialFrame(snap));
  searchPhase(rec, snap, target, s, false);
  const steps = s.steps;
  const linear = plainSteps(snap, target);
  rec.close(
    s.found ? (
      <>
        Found {hl(target, 'ok')} in {hl(steps, 'ok')} steps ({s.moves} moves, {s.drops} drops). A plain linked list walks {hl(linear, 'bad')} steps to reach the same spot.
      </>
    ) : (
      <>
        {hl(target, 'dim')} is not in the list: the search stopped after {hl(steps, 'ok')} steps{' '}
        {s.pred === HEAD ? <>at the head, since no key is below it</> : <>at {s.pred}, the last key below it</>}, and the next key is {s.candidate === null ? 'nil' : s.candidate}. A plain list walks {hl(linear, 'bad')} {linear === 1 ? 'step' : 'steps'} to learn that.
      </>
    ),
    2,
  );
  return rec.frames;
}

const coinWord = (heads: boolean) => (heads ? 'heads' : 'tails');

/** Insert: search and remember, flip the coins, then link level by level. `rigged` is named in the captions. */
export function insertFrames(entries: readonly Entry[], key: number, flips: Flips, rigged: string | null): SkipFrame[] {
  const list: SkipList = buildList(entries);
  const before = list.snapshot();
  const s = list.search(key);
  const rec = createRecorder<SkipFrame>(initialFrame(before));
  searchPhase(rec, before, key, s, true);
  const update = s.update;
  rec.snap(
    <>
      Reached level 0: {nodeName(s.pred)} is the node to link after at level 0, so {hl(key)} goes between {nodeName(s.pred)} and {s.candidate === null ? 'nil' : s.candidate}. Now the coin flips decide how tall its tower is.
    </>,
    undefined,
    { token: { pos: s.pred, level: 0 } },
  );
  const coins: boolean[] = [];
  flips.flips.forEach((heads, i) => {
    coins.push(heads);
    const height = 1 + coins.filter(Boolean).length;
    rec.snap(
      <>
        Flip {i + 1}: {hl(coinWord(heads), heads ? 'amber' : 'pink')}.{' '}
        {heads ? <>The tower grows to height {height}{height === flips.height ? <> (the level cap), so there is nothing left to flip</> : <>: flip again</>}.</> : <>The tower stops at height {height}.</>}
        {rigged ? <> The coin is rigged ({rigged}): this is not random.</> : null}
      </>,
      undefined,
      { coins: [...coins], token: null },
    );
  });
  const snaps: { level: number; snap: Snapshot }[] = [];
  list.insert(key, flips.height, (level) => snaps.push({ level, snap: list.snapshot() }));
  let writes = 0;
  snaps.forEach(({ level, snap }) => {
    const pred = update[level] ?? HEAD;
    const next = snap.towers.find((t) => t.key === key)?.next[level] ?? null;
    writes += 2;
    rec.snap(
      <>
        Level {level}: {hl(key)} points on to {next === null ? 'nil' : next}, and {nodeName(pred)} now points to {key}. Two pointer writes; no other tower changes.
      </>,
      undefined,
      {
        snap,
        fresh: key,
        changed: [{ from: pred, to: key, level }, { from: key, to: next, level }],
        writes,
        coins: [...coins],
      },
    );
  });
  const after = list.snapshot();
  rec.set({ changed: [], snap: after });
  rec.close(
    <>
      Inserted {hl(key, 'ok')} with a tower of height {flips.height}: {hl(writes)} pointer writes, all on its own tower and its {flips.height === 1 ? 'one predecessor' : `${flips.height} predecessors`}. No rebalancing.
    </>,
    2,
  );
  return rec.frames;
}

/** Delete: search, then unlink the tower at every level it reaches. */
export function removeFrames(entries: readonly Entry[], key: number): SkipFrame[] {
  const list = buildList(entries);
  const before = list.snapshot();
  const s = list.search(key);
  const rec = createRecorder<SkipFrame>(initialFrame(before));
  searchPhase(rec, before, key, s, true);
  const height = list.heightOf(key);
  const snaps: { level: number; snap: Snapshot }[] = [];
  list.remove(key, (level) => snaps.push({ level, snap: list.snapshot() }));
  let writes = 0;
  snaps.forEach(({ level, snap }) => {
    writes += 1;
    rec.snap(
      <>
        Level {level}: {nodeName(s.update[level])} now points past {hl(key, 'bad')}. One pointer write.
      </>,
      undefined,
      { snap, changed: [{ from: s.update[level], to: snap.towers.find((t) => t.key === s.update[level])?.next[level] ?? null, level }], writes },
    );
  });
  rec.set({ changed: [], snap: list.snapshot(), found: null, stop: null, token: null });
  rec.close(
    <>
      Deleted {hl(key, 'bad')}: its tower of height {height} is unlinked with {hl(writes)} pointer writes.
    </>,
    2,
  );
  return rec.frames;
}
