import type { ReactNode } from 'react';
import type { Frame } from '../../core/types';

export type Net = 'partition' | 'healthy';
/** cp/ap during a partition; ec/el (PACELC "else") when healthy. */
export type Choice = 'cp' | 'ap' | 'ec' | 'el';
export type Place = 'C1' | 'N1' | 'N2' | 'N3' | 'C2';
export type NodeId = 'N1' | 'N2' | 'N3';

export interface Pkt {
  id: string;
  from: Place;
  to: Place;
  label: string;
  kind: 'write' | 'read' | 'repl' | 'ok' | 'err' | 'lost';
}

export interface CapFrame extends Frame {
  values: Record<NodeId, string[]>; // usually one value; two during an unresolved conflict
  partitioned: boolean;
  pkts: Pkt[];
  c1: { text: string; tone: 'ok' | 'bad' | 'wait' | '' };
  c2: { text: string; tone: 'ok' | 'bad' | 'wait' | '' };
  latency: number | null;
  refusing: NodeId[];
}

function recorder() {
  let cur: Omit<CapFrame, 'say'> = {
    values: { N1: ['x=1'], N2: ['x=1'], N3: ['x=1'] },
    partitioned: false,
    pkts: [],
    c1: { text: 'idle', tone: '' },
    c2: { text: 'idle', tone: '' },
    latency: null,
    refusing: [],
  };
  const frames: CapFrame[] = [];
  type Patch = Partial<Omit<CapFrame, 'say' | 'values'>> & { values?: Partial<CapFrame['values']> };
  const push = (patch: Patch, say: ReactNode) => {
    const values = { ...cur.values };
    for (const [k, v] of Object.entries(patch.values ?? {})) if (v) values[k as NodeId] = v;
    cur = { ...cur, pkts: [], refusing: [], ...patch, values };
    frames.push({ ...cur, say });
  };
  return { push, frames };
}

function partition(choice: 'cp' | 'ap'): CapFrame[] {
  const r = recorder();
  r.push({}, <>Three replicas of the same data. All agree: <span className="hl">x = 1</span>.</>);
  r.push(
    { partitioned: true },
    <>
      The network <span className="hl bad">splits</span>. N1 can't reach N2 or N3. Nobody chose this: cables, switches
      and clouds fail. <b>P is not optional.</b>
    </>,
  );
  r.push(
    { pkts: [{ id: 'w1', from: 'C1', to: 'N1', label: 'SET x=2', kind: 'write' }], c1: { text: 'writing x=2…', tone: 'wait' } },
    <>A client on N1's side writes <span className="hl">x = 2</span>. N1 must decide, right now, without talking to the others.</>,
  );
  if (choice === 'cp') {
    r.push(
      {
        refusing: ['N1'],
        pkts: [
          { id: 'rq1', from: 'N1', to: 'N2', label: 'ack?', kind: 'lost' },
          { id: 'e1', from: 'N1', to: 'C1', label: '503', kind: 'err' },
        ],
        c1: { text: '✗ unavailable', tone: 'bad' },
      },
      <>
        <b>CP</b>: N1 can only reach 1 of 3 replicas, not a majority. Rather than risk disagreeing, it{' '}
        <span className="hl bad">refuses the write</span>.
      </>,
    );
    r.push(
      { pkts: [{ id: 'w2', from: 'C2', to: 'N2', label: 'SET x=3', kind: 'write' }], c2: { text: 'writing x=3…', tone: 'wait' } },
      <>On the other side, a client writes <span className="hl">x = 3</span> to N2.</>,
    );
    r.push(
      {
        values: { N2: ['x=3'], N3: ['x=3'] },
        pkts: [
          { id: 'rp', from: 'N2', to: 'N3', label: 'x=3', kind: 'repl' },
          { id: 'o2', from: 'N2', to: 'C2', label: 'ok', kind: 'ok' },
        ],
        c2: { text: '✓ x=3 saved', tone: 'ok' },
      },
      <>N2 and N3 are a <b>majority</b> (2 of 3), so they can safely accept it.</>,
    );
    r.push(
      {
        refusing: ['N1'],
        pkts: [
          { id: 'r1', from: 'C1', to: 'N1', label: 'GET x', kind: 'read' },
          { id: 'e2', from: 'N1', to: 'C1', label: '503', kind: 'err' },
        ],
        c1: { text: '✗ unavailable', tone: 'bad' },
      },
      <>
        C1 tries to read. N1 still has x = 1, which might be stale, so a CP system refuses reads too.{' '}
        <span className="hl bad">That side is down</span> until the network heals.
      </>,
    );
    r.push(
      {
        partitioned: false,
        values: { N1: ['x=3'] },
        pkts: [{ id: 'cu', from: 'N2', to: 'N1', label: 'x=3', kind: 'repl' }],
        c1: { text: 'idle', tone: '' },
        hold: 2.5,
      },
      <>
        Healed. N1 catches up to x = 3. <span className="hl ok">Never inconsistent</span>, but N1's users got errors
        the whole time. Think: bank balances, inventory, leader election (etcd, ZooKeeper).
      </>,
    );
  } else {
    r.push(
      {
        values: { N1: ['x=2'] },
        pkts: [{ id: 'o1', from: 'N1', to: 'C1', label: 'ok', kind: 'ok' }],
        c1: { text: '✓ x=2 saved', tone: 'ok' },
      },
      <>
        <b>AP</b>: N1 stays available and <span className="hl ok">accepts the write</span> locally. It'll tell the others
        later.
      </>,
    );
    r.push(
      { pkts: [{ id: 'w2', from: 'C2', to: 'N2', label: 'SET x=3', kind: 'write' }], c2: { text: 'writing x=3…', tone: 'wait' } },
      <>Meanwhile the other side writes <span className="hl">x = 3</span>.</>,
    );
    r.push(
      {
        values: { N2: ['x=3'], N3: ['x=3'] },
        pkts: [
          { id: 'rp', from: 'N2', to: 'N3', label: 'x=3', kind: 'repl' },
          { id: 'o2', from: 'N2', to: 'C2', label: 'ok', kind: 'ok' },
        ],
        c2: { text: '✓ x=3 saved', tone: 'ok' },
      },
      <>Also accepted. Both sides are happily serving traffic.</>,
    );
    r.push(
      {
        pkts: [
          { id: 'r1', from: 'N1', to: 'C1', label: 'x=2', kind: 'ok' },
          { id: 'r2', from: 'N3', to: 'C2', label: 'x=3', kind: 'ok' },
        ],
        c1: { text: 'reads x=2', tone: 'bad' },
        c2: { text: 'reads x=3', tone: 'bad' },
      },
      <>
        Two clients ask for the same key and get <span className="hl bad">different answers</span>. The replicas have
        diverged.
      </>,
    );
    r.push(
      {
        partitioned: false,
        values: { N1: ['x=2', 'x=3'], N2: ['x=3', 'x=2'], N3: ['x=3', 'x=2'] },
        pkts: [
          { id: 'x1', from: 'N1', to: 'N2', label: 'x=2', kind: 'repl' },
          { id: 'x2', from: 'N2', to: 'N1', label: 'x=3', kind: 'repl' },
        ],
      },
      <>
        Healed. The replicas swap notes and find a <span className="hl bad">conflict</span>: x = 2 or x = 3?
      </>,
    );
    r.push(
      {
        values: { N1: ['x=3'], N2: ['x=3'], N3: ['x=3'] },
        c1: { text: 'x=2 lost!', tone: 'bad' },
        c2: { text: 'x=3', tone: 'ok' },
        hold: 2.5,
      },
      <>
        <b>Last-write-wins</b> keeps x = 3 and <span className="hl bad">silently drops</span> C1's write. Better options:
        keep both for the app to merge, or use CRDTs. Think: shopping carts, likes, DNS, Cassandra and DynamoDB.
      </>,
    );
  }
  return r.frames;
}

function healthy(choice: 'ec' | 'el'): CapFrame[] {
  const r = recorder();
  r.push({}, <>No partition. Everything is up. Is there still a trade-off? <b>PACELC</b> says yes.</>);
  r.push(
    { pkts: [{ id: 'w', from: 'C1', to: 'N1', label: 'SET x=2', kind: 'write' }], c1: { text: 'writing x=2…', tone: 'wait' } },
    <>C1 writes <span className="hl">x = 2</span>.</>,
  );
  if (choice === 'ec') {
    r.push(
      {
        values: { N1: ['x=2'] },
        pkts: [
          { id: 'r2', from: 'N1', to: 'N2', label: 'x=2', kind: 'repl' },
          { id: 'r3', from: 'N1', to: 'N3', label: 'x=2', kind: 'repl' },
        ],
      },
      <>
        <b>Consistency first</b>: N1 copies it to the others and <b>waits</b> for them before answering.
      </>,
    );
    r.push(
      {
        values: { N2: ['x=2'], N3: ['x=2'] },
        pkts: [
          { id: 'a2', from: 'N2', to: 'N1', label: 'ack', kind: 'ok' },
          { id: 'a3', from: 'N3', to: 'N1', label: 'ack', kind: 'ok' },
        ],
      },
      <>Both replicas confirm.</>,
    );
    r.push(
      { pkts: [{ id: 'o', from: 'N1', to: 'C1', label: 'ok', kind: 'ok' }], c1: { text: '✓ saved (80 ms)', tone: 'ok' }, latency: 80 },
      <>
        Only now: ok. The write took <span className="hl bad">80 ms</span> of round trips.
      </>,
    );
    r.push(
      {
        pkts: [
          { id: 'q', from: 'C2', to: 'N3', label: 'GET x', kind: 'read' },
          { id: 'qa', from: 'N3', to: 'C2', label: 'x=2', kind: 'ok' },
        ],
        c2: { text: 'reads x=2 ✓', tone: 'ok' },
        hold: 2.5,
      },
      <>
        Any replica gives the <span className="hl ok">latest value</span>. Consistent, but every write pays for the
        slowest replica.
      </>,
    );
  } else {
    r.push(
      {
        values: { N1: ['x=2'] },
        pkts: [
          { id: 'o', from: 'N1', to: 'C1', label: 'ok', kind: 'ok' },
          { id: 'r2', from: 'N1', to: 'N2', label: 'x=2', kind: 'repl' },
        ],
        c1: { text: '✓ saved (5 ms)', tone: 'ok' },
        latency: 5,
      },
      <>
        <b>Latency first</b>: N1 answers <span className="hl ok">immediately</span> (5 ms) and replicates in the background.
      </>,
    );
    r.push(
      {
        values: { N2: ['x=2'] },
        pkts: [
          { id: 'q', from: 'C2', to: 'N3', label: 'GET x', kind: 'read' },
          { id: 'r3', from: 'N1', to: 'N3', label: 'x=2', kind: 'repl' },
        ],
        c2: { text: 'reading…', tone: 'wait' },
      },
      <>C2 reads from N3 while the copy is still on its way.</>,
    );
    r.push(
      { pkts: [{ id: 'qa', from: 'N3', to: 'C2', label: 'x=1', kind: 'ok' }], c2: { text: 'reads x=1 (stale)', tone: 'bad' } },
      <>
        N3 answers <span className="hl bad">x = 1</span>. Stale, with no failure anywhere.
      </>,
    );
    r.push(
      { values: { N3: ['x=2'] }, hold: 2.5 },
      <>
        A moment later N3 catches up. <b>Eventually consistent.</b> Fast writes, at the cost of sometimes-stale reads.
      </>,
    );
  }
  return r.frames;
}

export function buildFrames(net: Net, choice: Choice): CapFrame[] {
  if (net === 'partition') return partition(choice === 'ap' ? 'ap' : 'cp');
  return healthy(choice === 'el' ? 'el' : 'ec');
}
