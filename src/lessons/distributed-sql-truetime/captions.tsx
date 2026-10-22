import type { ReactNode } from 'react';
import { decimal } from '../../core/format';
import { versionAt, type Version, type Race, type TwoShardResult } from './truetime';

const verText = (v: Version | null, key: string) => (v === null ? `${key}: no version` : `${key} = ${v.value} (written at ${v.at})`);

/** Scene 1: what a snapshot read at `at` returns from each shard, from the version lists. */
export function snapshotCaption(a: { at: number; x: readonly Version[]; y: readonly Version[]; txnAt: number }): ReactNode {
  const x = versionAt(a.x, a.at);
  const y = versionAt(a.y, a.at);
  const sawX = x?.at === a.txnAt;
  const sawY = y?.at === a.txnAt;
  return (
    <>
      A snapshot read at {a.at} returns {verText(x, 'x')} and {verText(y, 'y')}.{' '}
      {sawX && sawY
        ? <>The transaction that wrote both at {a.txnAt} is <span className="hl ok">visible on both shards</span>.</>
        : !sawX && !sawY
          ? <>The transaction that wrote both at {a.txnAt} is <span className="hl info">invisible on both shards</span>: atomic visibility by timestamp.</>
          : <>One shard shows the transaction and the other does not.</>}
    </>
  );
}

/** Scene 2: the race, in words from the model. */
export function raceCaption(a: { race: Race; epsilon: number; delta: number; commitWait: boolean; e1: number; e2: number; fraction: number; failing: number; seeds: number; closed: number | null }): ReactNode {
  const r = a.race;
  const when = `T2 started ${decimal(r.t2 - r.ackAt, 1)} ms after T1 was acknowledged`;
  return (
    <>
      {when}. T1 took timestamp {decimal(r.s1, 1)} and T2 {decimal(r.s2, 1)}:{' '}
      {r.ordered ? <span className="hl ok">T2 is ordered after T1</span> : <span className="hl bad">T2 is timestamped earlier than T1</span>}
      {r.sees ? ', and its read sees the write' : <>, and its read <span className="hl bad">misses the acknowledged write</span></>}.{' '}
      {a.commitWait ? `Commit wait cost ${decimal(r.waitMs, 0)} ms.` : 'There is no commit wait.'} Over seeds 1 to {a.seeds}: {a.failing} of {a.seeds} break the order{a.closed === null ? '' : `, against ${decimal(a.closed * 100, 1)}% in closed form`}.
    </>
  );
}

/** Scene 3. */
export function twoShardCaption(a: { result: TwoShardResult; epsilon: number }): ReactNode {
  const r = a.result;
  return (
    <>
      The participants prepare at {r.prepares[0]} and {r.prepares[1]}, the coordinator&apos;s own latest is {r.coordinatorLatest}, so the commit timestamp is the maximum, <span className="hl ok">{r.commitTimestamp}</span>.
      It then waits until TT.now().earliest passes it: {decimal(r.waitMs, 0)} ms of the coordinator&apos;s clock at ε = {a.epsilon} ms. The replication of each shard is shown, not run.
    </>
  );
}
