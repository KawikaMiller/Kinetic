import { createRecorder } from '../../core/recorder';
import type { Frame } from '../../core/types';
import { applyNaively, markUpdate, naiveWrites, type RangeUpdate } from './model';

export interface DiffFrame extends Frame {
  diff: number[];
  /** Diff slots written by this frame's update. */
  marked: number[];
  update: number | null;
  /** Index being rebuilt by the running-sum pass. */
  sweep: number | null;
  running: number;
  result: (number | null)[];
}

const signed = (v: number) => (v >= 0 ? `+${v}` : `−${-v}`);

/** Mark each update (two writes), then rebuild the array in one running-sum pass. */
export function diffFrames(base: number[], updates: RangeUpdate[]): DiffFrame[] {
  const n = base.length;
  const diff = new Array<number>(n + 1).fill(0);
  const rec = createRecorder<DiffFrame>(
    { diff: [...diff], marked: [], update: null, sweep: null, running: 0, result: new Array(n).fill(null) },
    { transient: { marked: [] } },
  );
  rec.snap(
    <>
      {updates.length} range updates to apply. Done naively, each one touches every cell in its range:{' '}
      <b>{naiveWrites(updates)}</b> writes. A difference array needs two per update.
    </>,
  );

  updates.forEach((u, k) => {
    markUpdate(diff, u);
    rec.snap(
      <>
        Add <span className="hl">{signed(u.add)}</span> to [{u.from}, {u.to}]: write{' '}
        <span className="hl ok">{signed(u.add)}</span> at {u.from} and <span className="hl bad">{signed(-u.add)}</span> at{' '}
        {u.to + 1}, just past the end. Two writes, not {u.to - u.from + 1}.
      </>,
      undefined,
      { diff: [...diff], marked: [u.from, u.to + 1], update: k },
    );
  });

  let running = 0;
  const result: (number | null)[] = new Array(n).fill(null);
  for (let i = 0; i < n; i++) {
    running += diff[i];
    result[i] = base[i] + running;
    rec.snap(
      <>
        Running sum of the difference array up to {i}: <b>{running}</b>, so the new value is {base[i]} {signed(running)} ={' '}
        <b>{result[i]}</b>.
      </>,
      undefined,
      { update: null, sweep: i, running, result: [...result] },
    );
  }

  const same = applyNaively(base, updates).every((v, i) => v === result[i]);
  const diffCost = 2 * updates.length + n;
  const naive = naiveWrites(updates);
  rec.snap(
    <>
      {same ? <span className="hl ok">Same result</span> : <span className="hl bad">Mismatch</span>} as updating cell by
      cell: {2 * updates.length} writes + a pass of {n} = <b>{diffCost}</b>, vs <b>{naive}</b> naive writes.{' '}
      {diffCost >= naive
        ? 'No win on a few short updates to a tiny array. '
        : ''}
      The payoff is at scale: 1,000 long updates to a million cells cost about a million steps, not up to a billion.
    </>,
    2,
    { sweep: null },
  );
  return rec.frames;
}
