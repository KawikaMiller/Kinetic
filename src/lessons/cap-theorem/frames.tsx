/**
 * Captions and drawing state for the four stories. Every value, count and outcome comes from
 * the replicas' run (`runStory` in ./model); this file only decides where packets are drawn
 * and what the words around those facts say.
 */
import type { ReactNode } from 'react';
import type { Frame } from '../../core/types';
import {
  INITIAL_VALUE, MAJORITY, NODE_IDS, OP_TIMEOUT_MS, PARTITION, PROCESS_MS, HEALTHY_ONE_WAY_MS, reachableAt, staleReads, type NodeId,
  type OpRecord, type Story,
} from './model';

export type Place = 'C1' | 'N1' | 'N2' | 'N3' | 'C2';

export interface Pkt {
  id: string;
  from: Place;
  to: Place;
  label: string;
  kind: 'write' | 'read' | 'repl' | 'ok' | 'err' | 'lost';
}

type Tone = 'ok' | 'bad' | 'wait' | '';

export interface CapFrame extends Frame {
  values: Record<NodeId, number>;
  partitioned: boolean;
  pkts: Pkt[];
  c1: { text: string; tone: Tone };
  c2: { text: string; tone: Tone };
  /** Latency of the write this frame has just shown acknowledged. */
  latencyMs: number | null;
  refusing: NodeId[];
  /** Reads answered so far that were not the latest acknowledged write. */
  stale: number;
}

const IDLE = { text: 'idle', tone: '' } as const;

export const valueLabel = (v: number) => `x=${v}`;
const latencyOf = (op: OpRecord) => (op.response === null ? null : op.response - op.invoke);
/** A read that returned something other than the latest acknowledged write is red; a current answer is green. */
const toneOfRead = (story: Story, read: OpRecord): Tone => (staleReads(story.ops).includes(read) ? 'bad' : 'ok');
const writing = (op: OpRecord): { text: string; tone: Tone } => ({ text: `writing ${valueLabel(op.value ?? 0)}…`, tone: 'wait' });

interface Recorder {
  push: (t: number, patch: Partial<Omit<CapFrame, 'say' | 'values' | 'stale'>>, say: ReactNode) => void;
  frames: CapFrame[];
}

/** Frames sample the run at simulated time `t`: replica values and the stale-read count are read back, not typed. */
function recorder(story: Story): Recorder {
  const frames: CapFrame[] = [];
  let cur = { partitioned: false, c1: IDLE as CapFrame['c1'], c2: IDLE as CapFrame['c2'], latencyMs: null as number | null };
  const push: Recorder['push'] = (t, patch, say) => {
    const { partitioned, c1, c2, latencyMs, pkts = [], refusing = [], hold } = { ...cur, ...patch };
    cur = { partitioned, c1, c2, latencyMs };
    frames.push({ say, hold, partitioned, c1, c2, latencyMs, pkts, refusing, values: story.valuesAt(t), stale: story.staleAt(t) });
  };
  return { push, frames };
}

function partitionFrames(story: Story): CapFrame[] {
  const [w1, w2, r1, r2] = story.ops;
  const r = recorder(story);
  const v = story.valuesAt;
  const cp = story.choice === 'cp';
  const reach = (op: OpRecord) => reachableAt(story.cluster, op.node, op.invoke);
  const cutAt = PARTITION.from + 10;

  r.push(0, {}, <>Three replicas of the same data. All agree: <span className="hl">x = {INITIAL_VALUE}</span>.</>);
  r.push(
    cutAt,
    { partitioned: true },
    <>
      The network <span className="hl bad">splits</span>. N1 can't reach N2 or N3. Nobody chose this: cables, switches and clouds fail.{' '}
      <b>P is not optional.</b>
    </>,
  );
  r.push(
    w1.invoke,
    { pkts: [{ id: 'w1', from: 'C1', to: 'N1', label: `SET ${valueLabel(w1.value ?? 0)}`, kind: 'write' }], c1: writing(w1) },
    <>A client on N1's side writes <span className="hl">x = {w1.value}</span>. N1 must decide, right now, without talking to the others.</>,
  );
  if (cp) {
    r.push(
      w1.response ?? w1.invoke,
      {
        refusing: ['N1'],
        pkts: [
          { id: 'rq1', from: 'N1', to: 'N2', label: 'ack?', kind: 'lost' },
          { id: 'e1', from: 'N1', to: 'C1', label: '503', kind: 'err' },
        ],
        c1: { text: '✗ unavailable', tone: 'bad' },
      },
      <>
        <b>CP</b>: N1 can reach {reach(w1)} of {NODE_IDS.length} replicas, and a majority is {MAJORITY}. It waits{' '}
        {OP_TIMEOUT_MS} ms, hears nothing, and <span className="hl bad">refuses the write</span>.
      </>,
    );
    r.push(
      w2.invoke,
      { pkts: [{ id: 'w2', from: 'C2', to: 'N2', label: `SET ${valueLabel(w2.value ?? 0)}`, kind: 'write' }], c2: writing(w2) },
      <>On the other side, a client writes <span className="hl">x = {w2.value}</span> to N2.</>,
    );
    r.push(
      (w2.response ?? w2.invoke) + 2 * PARTITION_SETTLE_MS,
      {
        pkts: [
          { id: 'rp', from: 'N2', to: 'N3', label: valueLabel(w2.value ?? 0), kind: 'repl' },
          { id: 'o2', from: 'N2', to: 'C2', label: 'ok', kind: 'ok' },
        ],
        c2: { text: `✓ ${valueLabel(w2.value ?? 0)} saved`, tone: 'ok' },
        latencyMs: latencyOf(w2),
      },
      <>
        N2 and N3 can reach {reach(w2)} of {NODE_IDS.length} replicas, a <b>majority</b>, so they can safely accept it.
      </>,
    );
    r.push(
      r1.response ?? r1.invoke,
      {
        refusing: ['N1'],
        pkts: [
          { id: 'r1', from: 'C1', to: 'N1', label: 'GET x', kind: 'read' },
          { id: 'e2', from: 'N1', to: 'C1', label: '503', kind: 'err' },
        ],
        c1: { text: '✗ unavailable', tone: 'bad' },
      },
      <>
        C1 tries to read. N1 still holds {valueLabel(v(r1.invoke).N1)} and can't confirm it is current, so this CP system refuses reads
        too. <span className="hl bad">That side is down</span> until the network heals.
      </>,
    );
    r.push(
      HEALED_AT,
      {
        partitioned: false,
        pkts: [{ id: 'cu', from: 'N2', to: 'N1', label: valueLabel(v(HEALED_AT).N2), kind: 'repl' }],
        c1: IDLE,
        hold: 2.5,
      },
      <>
        Healed. N1 catches up to {valueLabel(v(HEALED_AT).N1)}. Clients were told {story.staleAt(HEALED_AT) === 0 ? 'nothing stale or conflicting' : 'something stale'}, but N1's users got errors during the partition. Think: bank balances,
        inventory, leader election.
      </>,
    );
    return r.frames;
  }

  r.push(
    (w1.response ?? w1.invoke) + 5,
    {
      pkts: [{ id: 'o1', from: 'N1', to: 'C1', label: 'ok', kind: 'ok' }],
      c1: { text: `✓ ${valueLabel(w1.value ?? 0)} saved`, tone: 'ok' },
      latencyMs: latencyOf(w1),
    },
    <>
      <b>AP</b>: N1 stays available and <span className="hl ok">accepts the write</span> locally, answering in {latencyOf(w1)} ms. It tells the others in the background, and
      the partition drops that message.
    </>,
  );
  r.push(
    w2.invoke,
    { pkts: [{ id: 'w2', from: 'C2', to: 'N2', label: `SET ${valueLabel(w2.value ?? 0)}`, kind: 'write' }], c2: writing(w2) },
    <>Meanwhile the other side writes <span className="hl">x = {w2.value}</span>.</>,
  );
  r.push(
    (w2.response ?? w2.invoke) + 2 * PARTITION_SETTLE_MS,
    {
      pkts: [
        { id: 'rp', from: 'N2', to: 'N3', label: valueLabel(w2.value ?? 0), kind: 'repl' },
        { id: 'o2', from: 'N2', to: 'C2', label: 'ok', kind: 'ok' },
      ],
      c2: { text: `✓ ${valueLabel(w2.value ?? 0)} saved`, tone: 'ok' },
      latencyMs: latencyOf(w2),
    },
    <>Also accepted. Both sides are happily serving traffic.</>,
  );
  r.push(
    Math.max(r1.response ?? 0, r2.response ?? 0),
    {
      pkts: [
        { id: 'r1', from: 'N1', to: 'C1', label: valueLabel(r1.value ?? 0), kind: 'ok' },
        { id: 'r2', from: 'N3', to: 'C2', label: valueLabel(r2.value ?? 0), kind: 'ok' },
      ],
      c1: { text: `reads ${valueLabel(r1.value ?? 0)}`, tone: toneOfRead(story, r1) },
      c2: { text: `reads ${valueLabel(r2.value ?? 0)}`, tone: toneOfRead(story, r2) },
    },
    <>
      Two clients ask for the same key and get <span className="hl bad">different answers</span>: {valueLabel(r1.value ?? 0)} and {valueLabel(r2.value ?? 0)}. The
      replicas have diverged, and the {valueLabel(r1.value ?? 0)} answer is stale: {valueLabel(w2.value ?? 0)} was already acknowledged.
    </>,
  );
  r.push(
    PARTITION.to + 5,
    {
      partitioned: false,
      pkts: [
        { id: 'x1', from: 'N1', to: 'N2', label: valueLabel(v(PARTITION.to + 5).N1), kind: 'repl' },
        { id: 'x2', from: 'N2', to: 'N1', label: valueLabel(v(PARTITION.to + 5).N2), kind: 'repl' },
      ],
    },
    <>
      Healed. Each replica sends its value to the others and they find they <span className="hl bad">disagree</span>:{' '}
      {valueLabel(v(PARTITION.to + 5).N1)} or {valueLabel(v(PARTITION.to + 5).N2)}?
    </>,
  );
  r.push(
    HEALED_AT,
    {
      c1: { text: `${valueLabel(w1.value ?? 0)} gone`, tone: 'bad' },
      c2: { text: valueLabel(v(HEALED_AT).N2), tone: 'ok' },
      hold: 2.5,
    },
    <>
      The merge rule here is <b>last-write-wins</b> by timestamp: every replica ends at {valueLabel(v(HEALED_AT).N1)}, and C1's acknowledged{' '}
      {valueLabel(w1.value ?? 0)} is <span className="hl bad">silently gone</span>. Better options: keep both for the app to merge, or use CRDTs.
      Think: shopping carts, likes, DNS.
    </>,
  );
  return r.frames;
}

/** After the partition ends the replicas have caught up by this time (a few gossip rounds). */
const HEALED_AT = PARTITION.to + 200;
/** One partition-story message delay is 10 ms; frames sample a little after it so the copy has landed. */
const PARTITION_SETTLE_MS = 10;

function healthyFrames(story: Story): CapFrame[] {
  const [w, ...reads] = story.ops;
  const r = recorder(story);
  const ec = story.choice === 'ec';
  const sendTo = (node: NodeId): Pkt => ({ id: `r${node}`, from: 'N1', to: node, label: valueLabel(w.value ?? 0), kind: 'repl' });

  r.push(0, {}, <>No partition. Everything is up. Is there still a trade-off? <b>PACELC</b> says yes.</>);
  r.push(
    w.invoke,
    { pkts: [{ id: 'w', from: 'C1', to: 'N1', label: `SET ${valueLabel(w.value ?? 0)}`, kind: 'write' }], c1: writing(w) },
    <>C1 writes <span className="hl">x = {w.value}</span>.</>,
  );
  if (ec) {
    const [read] = reads;
    r.push(
      PROCESS_MS + 5,
      { pkts: [sendTo('N2'), sendTo('N3')] },
      <>
        <b>Consistency first</b>: N1 stores it, copies it to the others and <b>waits</b> for them before answering.
      </>,
    );
    r.push(
      PROCESS_MS + HEALTHY_ONE_WAY_MS + 5,
      {
        pkts: [
          { id: 'a2', from: 'N2', to: 'N1', label: 'ack', kind: 'ok' },
          { id: 'a3', from: 'N3', to: 'N1', label: 'ack', kind: 'ok' },
        ],
      },
      <>Both replicas confirm.</>,
    );
    r.push(
      (w.response ?? 0) + 1,
      {
        pkts: [{ id: 'o', from: 'N1', to: 'C1', label: 'ok', kind: 'ok' }],
        c1: { text: `✓ saved (${latencyOf(w)} ms)`, tone: 'ok' },
        latencyMs: latencyOf(w),
      },
      <>
        Only now: ok. The write took <span className="hl bad">{latencyOf(w)} ms</span>: {PROCESS_MS} ms of work plus a round trip to the replicas (2 × {HEALTHY_ONE_WAY_MS} ms).
      </>,
    );
    r.push(
      read.response ?? read.invoke,
      {
        pkts: [
          { id: 'q', from: 'C2', to: 'N3', label: 'GET x', kind: 'read' },
          { id: 'qa', from: 'N3', to: 'C2', label: valueLabel(read.value ?? 0), kind: 'ok' },
        ],
        c2: { text: `reads ${valueLabel(read.value ?? 0)} ✓`, tone: toneOfRead(story, read) },
        hold: 2.5,
      },
      <>
        Any replica gives the <span className="hl ok">latest value</span>. Consistent, but every write pays for the slowest replica.
      </>,
    );
    return r.frames;
  }

  const [early, late] = reads;
  r.push(
    PROCESS_MS + 5,
    {
      pkts: [{ id: 'o', from: 'N1', to: 'C1', label: 'ok', kind: 'ok' }, sendTo('N2'), sendTo('N3')],
      c1: { text: `✓ saved (${latencyOf(w)} ms)`, tone: 'ok' },
      latencyMs: latencyOf(w),
    },
    <>
      <b>Latency first</b>: N1 answers <span className="hl ok">immediately</span> ({latencyOf(w)} ms) and replicates in the background.
    </>,
  );
  r.push(
    early.invoke,
    {
      pkts: [{ id: 'q', from: 'C2', to: 'N3', label: 'GET x', kind: 'read' }],
      c2: { text: 'reading…', tone: 'wait' },
    },
    <>C2 reads from N3 while the copy is still on its way (it lands {HEALTHY_ONE_WAY_MS + PROCESS_MS} ms after the write began).</>,
  );
  r.push(
    early.response ?? early.invoke,
    {
      pkts: [{ id: 'qa', from: 'N3', to: 'C2', label: valueLabel(early.value ?? 0), kind: 'ok' }],
      c2: { text: `reads ${valueLabel(early.value ?? 0)}${toneOfRead(story, early) === 'bad' ? ' (stale)' : ''}`, tone: toneOfRead(story, early) },
    },
    <>
      N3 answers <span className="hl bad">{valueLabel(early.value ?? 0)}</span>. Stale, with no failure anywhere: the write was acknowledged{' '}
      {early.invoke - (w.response ?? 0)} ms earlier.
    </>,
  );
  r.push(
    late.invoke,
    { hold: 2.5 },
    <>
      By {late.invoke} ms N3 has caught up: a read now returns {valueLabel(late.value ?? 0)}. <b>Eventually consistent.</b> Fast writes,
      at the cost of sometimes-stale reads.
    </>,
  );
  return r.frames;
}

export function buildFrames(story: Story): CapFrame[] {
  return story.net === 'partition' ? partitionFrames(story) : healthyFrames(story);
}
