import type { ReactNode } from 'react';
import { CHANNELS, linkCeiling, type QueueRun } from './nvme';

/** Within this share of a ceiling counts as "at" it. */
export const NEAR_CEILING = 0.97;

export type QueueVerdict = 'link' | 'channels' | 'room';

/** What limits this run, from its own numbers. */
export function queueVerdict(run: QueueRun): QueueVerdict {
  if (run.iface === 'sata' && run.iops >= NEAR_CEILING * linkCeiling('sata')) return 'link';
  if (run.busyChannels >= NEAR_CEILING * CHANNELS) return 'channels';
  return 'room';
}

const n = (v: number) => Math.round(v).toLocaleString('en-US');

export function queueCaption(run: QueueRun, qd1: QueueRun): ReactNode {
  const name = run.iface === 'sata' ? 'SATA' : 'NVMe';
  const gain = run.iops / qd1.iops;
  const verdict = queueVerdict(run);
  return (
    <>
      Queue depth {run.qd} on {name}: {n(run.iops)} reads/s at {n(run.latencyUs)} µs each on average
      {run.qd > 1 && <> ({gain.toFixed(1)}× the reads of queue depth 1)</>}.{' '}
      {verdict === 'link' ? (
        <>The SATA link is the bottleneck: it can't carry more than about {n(Math.round(linkCeiling('sata') / 1000) * 1000)} 4 KiB reads a second, however deep the queue.</>
      ) : verdict === 'channels' ? (
        <>The flash channels are nearly all busy ({run.busyChannels.toFixed(1)} of {CHANNELS}): a deeper queue now only adds waiting.</>
      ) : (
        <>Only {run.busyChannels.toFixed(1)} of {CHANNELS} flash channels are busy on average: more requests in flight would keep more of them working.</>
      )}
    </>
  );
}
