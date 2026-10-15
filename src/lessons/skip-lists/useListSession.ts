import { useState } from 'react';
import { insertFrames, removeFrames, type SkipFrame } from './frames';
import { parseKey, refuseOp } from './keys';
import type { Entry, Rig, Snapshot } from './model';
import { DEFAULT_COIN_SEED, DEFAULT_INSERT_KEY, DEFAULT_P, RIG_NOTE, coinFlips, defaultEntries } from './presets';

interface Session {
  frames: SkipFrame[];
  /** Inserts made so far: each takes the next coin stream of the seed. */
  inserts: number;
  note: string | null;
}

/** The towers a snapshot holds, as entries: inserting them in key order rebuilds the same list. */
export const entriesOf = (snap: Snapshot): Entry[] => snap.towers.map((t) => ({ key: t.key, height: t.height }));

const first = (): Session => ({
  frames: insertFrames(defaultEntries(), DEFAULT_INSERT_KEY, coinFlips(DEFAULT_COIN_SEED, 0, DEFAULT_P, 'fair'), null),
  inserts: 1,
  note: null,
});

export interface CoinSettings {
  p: number;
  rig: Rig;
  seed: number;
}

/**
 * The list the insert scenes work on: the frames of the latest insert or delete, and the list they
 * end with. A refused request leaves the list alone and says why in `note`.
 */
export function useListSession() {
  const [session, setSession] = useState<Session>(first);
  const last = session.frames[session.frames.length - 1];
  const entries = entriesOf(last.snap);

  const insert = (keyText: string, coins: CoinSettings): boolean => {
    const parsed = parseKey(keyText);
    const refusal = parsed.ok ? refuseOp('insert', parsed.value, entries.length, entries.some((e) => e.key === parsed.value)) : parsed.error;
    if (refusal || !parsed.ok) {
      setSession({ ...session, note: refusal });
      return false;
    }
    const flips = coinFlips(coins.seed, session.inserts, coins.p, coins.rig);
    setSession({ frames: insertFrames(entries, parsed.value, flips, RIG_NOTE[coins.rig]), inserts: session.inserts + 1, note: null });
    return true;
  };
  const remove = (keyText: string): boolean => {
    const parsed = parseKey(keyText);
    const refusal = parsed.ok ? refuseOp('delete', parsed.value, entries.length, entries.some((e) => e.key === parsed.value)) : parsed.error;
    if (refusal || !parsed.ok) {
      setSession({ ...session, note: refusal });
      return false;
    }
    setSession({ ...session, frames: removeFrames(entries, parsed.value), note: null });
    return true;
  };
  const reset = () => setSession(first());
  return { frames: session.frames, entries, note: session.note, insert, remove, reset };
}
