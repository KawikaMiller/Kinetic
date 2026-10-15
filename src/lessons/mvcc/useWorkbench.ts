import { useState } from 'react';
import { apply, applyAll, newDb, openSlots, type Db, type Key, type Op, type Outcome, type Timing, type Who } from './engine';
import { PRESETS, type PresetId } from './presets';

export interface LogEntry {
  id: number;
  status: Outcome['status'];
  text: string;
}

/** How many messages the log keeps. */
const LOG_SIZE = 6;
export const VALUES = [40, 50, 60, 70] as const;

export interface Workbench {
  db: Db;
  who: Who;
  key: Key;
  value: number;
  back: number;
  log: readonly LogEntry[];
  setWho: (who: Who) => void;
  setKey: (key: Key) => void;
  setValue: (value: number) => void;
  setBack: (back: number) => void;
  run: (op: Op) => void;
  /** Why the snapshot timing cannot change right now, or null. */
  timingBlocked: string | null;
  setTiming: (timing: Timing) => void;
  preset: (id: PresetId) => void;
  reset: () => void;
}

/** The learner's database and what they have selected: shared by the version and vacuum scenes. */
export function useWorkbench(): Workbench {
  const [db, setDb] = useState<Db>(() => newDb());
  const [who, setWho] = useState<Who>('auto');
  const [key, setKey] = useState<Key>('A');
  const [value, setValue] = useState<number>(VALUES[0]);
  const [back, setBack] = useState(0);
  const [log, setLog] = useState<readonly LogEntry[]>([]);
  const [counter, setCounter] = useState(0);

  const note = (outcomes: readonly Outcome[]) => {
    const entries = outcomes.map((o, i): LogEntry => ({ id: counter + i, status: o.status, text: o.message }));
    setCounter(counter + outcomes.length);
    setLog([...entries.reverse(), ...log].slice(0, LOG_SIZE));
  };
  const run = (op: Op) => {
    const before = openSlots(db);
    const applied = apply(db, op);
    setDb(applied.db);
    setBack(0);
    note([applied.outcome]);
    if (op.kind === 'begin') {
      const opened = openSlots(applied.db).find((s) => !before.includes(s));
      if (opened) setWho(opened);
    }
  };
  const load = (base: Db, ops: readonly Op[]) => {
    const result = applyAll(base, ops);
    setDb(result.db);
    setBack(0);
    note(result.outcomes.slice(-3));
    const open = openSlots(result.db);
    setWho(open[0] ?? 'auto');
  };
  return {
    db, who, key, value, back, log, setWho, setKey, setValue, setBack, run,
    timingBlocked: openSlots(db).length ? 'the snapshot timing is fixed while a transaction is open: commit or roll them back first' : null,
    setTiming: (timing) => !openSlots(db).length && setDb({ ...db, timing }),
    preset: (id) => load(newDb(db.timing), PRESETS[id]()),
    reset: () => {
      setDb(newDb(db.timing));
      setWho('auto');
      setBack(0);
      setLog([]);
    },
  };
}
