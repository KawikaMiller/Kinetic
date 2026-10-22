import { describe, expect, it } from 'vitest';
import { inc, type Kind, type Mode } from './crdt';
import { runSchedule, SCHEDULE_SEEDS } from './schedule';
import { agree, DEFAULT_SEED, freshWorld, landAll, localEdit, lostIncrements, setOnline, startSync, syncOrder, syncOutcome, valuesOf, type World } from './world';

const KINDS: Kind[] = ['counter', 'set', 'register'];
const MODES: Mode[] = ['crdt', 'naive'];

const edit = (w: World, r: 'A' | 'B' | 'C', times = 1, mode: Mode = 'crdt') => {
  let next = w;
  for (let i = 0; i < times; i += 1) next = landAll(localEdit(next, r, (s) => inc(s, r), 'adds +1'), 'counter', mode);
  return next;
};
const sync = (w: World, mode: Mode, from?: World['reps']) => landAll(startSync(w, syncOrder(DEFAULT_SEED, w.syncCount), from), 'counter', mode);

describe('what the stage prints is read from the replicas, not assumed', () => {
  it('Replay sync cannot erase an edit made after the sync: the edit drops the replay state the button needs', () => {
    let w = setOnline(freshWorld(), 'B', false);
    w = edit(w, 'A', 3);
    w = edit(w, 'B', 2);
    w = sync(w, 'crdt');
    expect(valuesOf(w, 'counter', 'crdt')).toEqual(['5', '5', '5']);
    expect(w.preSync).not.toBeNull();
    w = edit(w, 'A');
    expect(valuesOf(w, 'counter', 'crdt')).toEqual(['6', '6', '6']);
    expect(w.preSync, 'the stage disables Replay when this is null').toBeNull();
    // What the old button did: restart from the stale snapshot. It put the CRDT at 5 with 6 made, "lost" 1.
    const stale = freshWorld().reps;
    const forced = sync(w, 'crdt', stale);
    expect(valuesOf(forced, 'counter', 'crdt')).not.toEqual(['6', '6', '6']);
  });

  it('Lost increments is not a number before the first sync, in CRDT mode too (try-this 1, before the sync)', () => {
    let w = setOnline(freshWorld(), 'B', false);
    w = edit(w, 'A', 3);
    w = edit(w, 'B', 2);
    expect(lostIncrements(w, 'crdt'), 'five made, replicas read 3, 2, 3: merely unmerged').toBeNull();
    expect(lostIncrements(sync(w, 'crdt'), 'crdt')).toBe(0);
  });

  it('in CRDT mode Lost increments is never above 0 once it shows a number, over 200 random schedules', () => {
    for (let seed = 1; seed <= SCHEDULE_SEEDS; seed += 1) {
      const run = runSchedule(seed, 'counter', 'crdt');
      for (const w of [run.open, run.world]) {
        const lost = lostIncrements(w, 'crdt');
        expect(lost === null || lost === 0, `seed ${seed}`).toBe(true);
      }
    }
  });

  it('the sync caption outcome never contradicts the stats, over 200 seeds of every kind and mode', () => {
    let checked = 0;
    for (const kind of KINDS) {
      for (const mode of MODES) {
        for (let seed = 1; seed <= SCHEDULE_SEEDS; seed += 1) {
          const run = runSchedule(seed, kind, mode);
          for (const w of [run.open, run.world]) {
            if (w.msgs.length) continue;
            checked += 1;
            const o = syncOutcome(w, kind, mode);
            const label = `${kind}/${mode}/seed ${seed}: ${o.kind}`;
            const same = agree(w, kind, mode);
            if (o.kind === 'converged') expect(same, label).toBe(true);
            if (o.kind === 'still-apart' || o.kind === 'diverged') expect(same, label).toBe(false);
            if (o.kind === 'still-apart') expect(mode, label).toBe('crdt');
            if (o.kind === 'diverged') expect(mode, label).toBe('naive');
            if (o.kind === 'agree-lost') expect(lostIncrements(w, mode), label).toBeGreaterThan(0);
            if (o.kind === 'agree-none-lost') expect(lostIncrements(w, mode) ?? 0, label).toBe(0);
            if (o.kind === 'nothing') expect(w.made, label).toBe(0);
            if (same && w.made > 0 && mode === 'crdt') expect(o.kind, label).toBe('converged');
            if (!same && mode === 'crdt') expect(o.kind, label).toBe('still-apart');
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(1_000);
  });

  it('toggling a replica offline mid-sync and editing is "still apart", not "converged"', () => {
    let w = startSync(freshWorld(), syncOrder(DEFAULT_SEED, 0));
    w = setOnline(w, 'B', false);
    w = localEdit(w, 'A', (s) => inc(s, 'A'), 'adds +1');
    w = landAll(w, 'counter', 'crdt');
    expect(valuesOf(w, 'counter', 'crdt')).toEqual(['1', '0', '1']);
    expect(syncOutcome(w, 'counter', 'crdt').kind).toBe('still-apart');
    expect(lostIncrements(w, 'crdt')).toBeNull();
  });

  it('naive counter with a single editor: the sync outcome says nothing was lost, and the stat reads 0', () => {
    let w = edit(freshWorld(), 'A', 2, 'naive');
    w = sync(w, 'naive');
    expect(valuesOf(w, 'counter', 'naive')).toEqual(['2', '2', '2']);
    expect(lostIncrements(w, 'naive')).toBe(0);
    expect(syncOutcome(w, 'counter', 'naive').kind).toBe('agree-none-lost');
  });

  it('a sync with no edits at all says there was nothing to merge', () => {
    expect(syncOutcome(sync(freshWorld(), 'crdt'), 'counter', 'crdt').kind).toBe('nothing');
    expect(syncOutcome(sync(freshWorld(), 'naive'), 'set', 'naive').kind).toBe('nothing');
  });
});
