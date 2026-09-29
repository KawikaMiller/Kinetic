import type { ReactNode } from 'react';
import type { Frame } from '../../core/types';

export type Mode = 'async' | 'sync';
export type Scenario = 'stale' | 'failover';
export type Place = 'C' | 'L' | 'F1' | 'F2';
export type NodeId = 'L' | 'F1' | 'F2';
export type Tone = 'ok' | 'bad' | 'wait' | '';

export interface NodeState {
  role: 'leader' | 'follower' | 'dead' | 'promoted';
  log: string[];
}

export interface Pkt {
  id: string;
  from: Place;
  to: Place;
  label: string;
  kind: 'write' | 'repl' | 'ack' | 'read' | 'resp' | 'lost';
  /** Travel time in frames (default 1). Slow cross-region links take longer. */
  dur?: number;
}

export interface RepFrame extends Frame {
  nodes: Record<NodeId, NodeState>;
  pkts: Pkt[];
  client: { text: string; tone: Tone };
  /** Client-observed write latency in ms, once acked. */
  latency: number | null;
  /** Node whose log entry to glow this frame. */
  flash: NodeId | null;
}

// Simulated one-way latencies (ms): client↔leader and leader↔F1 are local, F2 is another region.
export const LAT = { client: 2, f1: 3, f2: 60 };
export const WRITE_MS: Record<Mode, number> = {
  async: LAT.client * 2,
  sync: LAT.client * 2 + LAT.f2 * 2,
};

type Draft = Omit<RepFrame, 'say'> & { say?: ReactNode };

function recorder(initial: Omit<RepFrame, 'say'>) {
  let cur: Omit<RepFrame, 'say'> = initial;
  const frames: RepFrame[] = [];
  const push = (patch: Partial<Draft>, say: ReactNode) => {
    const nodes = patch.nodes ?? cur.nodes;
    cur = { ...cur, pkts: [], flash: null, ...patch, nodes };
    frames.push({ ...cur, say });
  };
  const node = (id: NodeId, change: Partial<NodeState>) => ({ ...cur.nodes, [id]: { ...cur.nodes[id], ...change } });
  const log = (id: NodeId) => cur.nodes[id].log;
  return { push, node, log, frames, get cur() { return cur; } };
}

function stale(mode: Mode): RepFrame[] {
  const r = recorder({
    nodes: {
      L: { role: 'leader', log: ['name=Ana'] },
      F1: { role: 'follower', log: ['name=Ana'] },
      F2: { role: 'follower', log: ['name=Ana'] },
    },
    pkts: [], client: { text: 'profile: Ana', tone: '' }, latency: null, flash: null,
  });
  r.push({}, <>One leader takes all writes; two followers copy it. F2 is in another region, so its link is slow.</>);
  r.push(
    { pkts: [{ id: 'w', from: 'C', to: 'L', label: 'SET name=Ada', kind: 'write' }], client: { text: 'saving…', tone: 'wait' } },
    <>You rename yourself to <span className="hl">Ada</span>. Writes always go to the leader.</>,
  );
  if (mode === 'async') {
    r.push(
      {
        nodes: r.node('L', { log: [...r.log('L'), 'name=Ada'] }),
        flash: 'L',
        pkts: [
          { id: 'ack', from: 'L', to: 'C', label: 'ok', kind: 'ack' },
          { id: 'r1', from: 'L', to: 'F1', label: 'Ada', kind: 'repl' },
          { id: 'r2', from: 'L', to: 'F2', label: 'Ada', kind: 'repl', dur: 4 },
        ],
      },
      <>
        <b>Async</b>: the leader stores it and replies <span className="hl ok">ok</span> straight away, then ships the
        change to followers in the background.
      </>,
    );
    r.push(
      {
        nodes: r.node('F1', { log: [...r.log('F1'), 'name=Ada'] }),
        flash: 'F1',
        client: { text: `saved ✓ (${WRITE_MS.async} ms)`, tone: 'ok' },
        latency: WRITE_MS.async,
        pkts: [{ id: 'r2', from: 'L', to: 'F2', label: 'Ada', kind: 'repl', dur: 4 }],
      },
      <>Saved in {WRITE_MS.async} ms. F1 already has it; F2's copy is still crossing the ocean.</>,
    );
    r.push(
      {
        client: { text: 'reloading…', tone: 'wait' },
        pkts: [
          { id: 'r2', from: 'L', to: 'F2', label: 'Ada', kind: 'repl', dur: 4 },
          { id: 'rd', from: 'C', to: 'F2', label: 'GET profile', kind: 'read' },
        ],
      },
      <>You reload the page. Reads are spread across followers, and this one lands on <b>F2</b>.</>,
    );
    r.push(
      {
        client: { text: 'profile: Ana ?!', tone: 'bad' },
        pkts: [
          { id: 'r2', from: 'L', to: 'F2', label: 'Ada', kind: 'repl', dur: 4 },
          { id: 'rs', from: 'F2', to: 'C', label: 'Ana', kind: 'resp' },
        ],
      },
      <>
        F2 hasn't caught up, so it answers <span className="hl bad">Ana</span>. You just saved Ada, and your own change
        is gone: <b>read-your-writes</b> is broken.
      </>,
    );
    r.push(
      { nodes: r.node('F2', { log: [...r.log('F2'), 'name=Ada'] }), flash: 'F2' },
      <>A moment later F2 applies the change. <b>Eventually</b> consistent, just too late for that read.</>,
    );
    r.push(
      { hold: 2.5 },
      <>
        Fixes: read from the leader right after writing, pin a user to one replica, or wait until the replica has
        caught up to your write. Async kept writes fast at {WRITE_MS.async} ms.
      </>,
    );
  } else {
    r.push(
      {
        nodes: r.node('L', { log: [...r.log('L'), 'name=Ada'] }),
        flash: 'L',
        pkts: [
          { id: 'r1', from: 'L', to: 'F1', label: 'Ada', kind: 'repl' },
          { id: 'r2', from: 'L', to: 'F2', label: 'Ada', kind: 'repl', dur: 2 },
        ],
      },
      <>
        <b>Sync</b>: the leader stores it but does <b>not</b> reply yet. It waits until every follower confirms.
      </>,
    );
    r.push(
      {
        nodes: r.node('F1', { log: [...r.log('F1'), 'name=Ada'] }),
        flash: 'F1',
        pkts: [
          { id: 'r2', from: 'L', to: 'F2', label: 'Ada', kind: 'repl', dur: 2 },
          { id: 'a1', from: 'F1', to: 'L', label: 'have it', kind: 'ack' },
        ],
      },
      <>F1 confirms quickly. Still waiting on F2, and so is your browser.</>,
    );
    r.push(
      {
        nodes: r.node('F2', { log: [...r.log('F2'), 'name=Ada'] }),
        flash: 'F2',
        pkts: [{ id: 'a2', from: 'F2', to: 'L', label: 'have it', kind: 'ack', dur: 1.5 }],
      },
      <>F2 finally has it and confirms across the slow link.</>,
    );
    r.push(
      { pkts: [{ id: 'ack', from: 'L', to: 'C', label: 'ok', kind: 'ack' }] },
      <>Only now does the leader reply <span className="hl ok">ok</span>.</>,
    );
    r.push(
      {
        client: { text: `saved ✓ (${WRITE_MS.sync} ms)`, tone: 'ok' },
        latency: WRITE_MS.sync,
        pkts: [{ id: 'rd', from: 'C', to: 'F2', label: 'GET profile', kind: 'read' }],
      },
      <>
        Saved, but it took <span className="hl bad">{WRITE_MS.sync} ms</span> instead of {WRITE_MS.async}. You
        reload; the read lands on F2 again.
      </>,
    );
    r.push(
      { client: { text: 'profile: Ada', tone: 'ok' }, pkts: [{ id: 'rs', from: 'F2', to: 'C', label: 'Ada', kind: 'resp' }] },
      <>
        F2 answers <span className="hl ok">Ada</span>. Every replica is up to date, so any read is correct.
      </>,
    );
    r.push(
      { hold: 2.5 },
      <>
        The trade: correct reads everywhere, but every write waits for the slowest follower, and if F2 goes down,
        writes stall. Many setups wait for just one follower (semi-sync).
      </>,
    );
  }
  return r.frames;
}

function failover(mode: Mode): RepFrame[] {
  const start = ['order #1', 'order #2'];
  const r = recorder({
    nodes: {
      L: { role: 'leader', log: start },
      F1: { role: 'follower', log: start },
      F2: { role: 'follower', log: start },
    },
    pkts: [], client: { text: 'ready', tone: '' }, latency: null, flash: null,
  });
  r.push({}, <>Everyone has orders #1 and #2. Now customers place two more orders, and then the leader dies.</>);
  r.push(
    { pkts: [{ id: 'w3', from: 'C', to: 'L', label: 'order #3', kind: 'write' }], client: { text: 'placing #3…', tone: 'wait' } },
    <>Order #3 goes to the leader.</>,
  );

  if (mode === 'async') {
    r.push(
      {
        nodes: r.node('L', { log: [...r.log('L'), 'order #3'] }),
        flash: 'L',
        pkts: [
          { id: 'a3', from: 'L', to: 'C', label: 'ok', kind: 'ack' },
          { id: 'r31', from: 'L', to: 'F1', label: '#3', kind: 'repl' },
          { id: 'r32', from: 'L', to: 'F2', label: '#3', kind: 'repl', dur: 4 },
        ],
      },
      <>Stored and acknowledged immediately; replication follows in the background.</>,
    );
    r.push(
      {
        nodes: r.node('F1', { log: [...r.log('F1'), 'order #3'] }),
        flash: 'F1',
        client: { text: '#3 confirmed ✓, placing #4…', tone: 'wait' },
        pkts: [
          { id: 'r32', from: 'L', to: 'F2', label: '#3', kind: 'repl', dur: 4 },
          { id: 'w4', from: 'C', to: 'L', label: 'order #4', kind: 'write' },
        ],
      },
      <>F1 has #3. The next customer places order #4.</>,
    );
    r.push(
      {
        nodes: r.node('L', { log: [...r.log('L'), 'order #4'] }),
        flash: 'L',
        client: { text: '#3 ✓  #4 ✓ confirmed', tone: 'ok' },
        latency: WRITE_MS.async,
        pkts: [
          { id: 'r32', from: 'L', to: 'F2', label: '#3', kind: 'repl', dur: 4 },
          { id: 'a4', from: 'L', to: 'C', label: 'ok', kind: 'ack' },
          { id: 'r41', from: 'L', to: 'F1', label: '#4', kind: 'lost' },
          { id: 'r42', from: 'L', to: 'F2', label: '#4', kind: 'lost' },
        ],
      },
      <>
        #4 is stored and <span className="hl ok">confirmed</span> to the customer, and at that exact moment…
      </>,
    );
    r.push(
      {
        nodes: r.node('L', { role: 'dead' }),
        pkts: [{ id: 'r32', from: 'L', to: 'F2', label: '#3', kind: 'repl', dur: 4 }],
      },
      <>
        <span className="hl bad">💥 the leader crashes.</span> Its copies of #4 never left the building.
      </>,
    );
    r.push(
      { nodes: r.node('F2', { log: [...r.log('F2'), 'order #3'] }), flash: 'F2' },
      <>The slow copy of #3 still reaches F2. Nobody has #4 except the dead leader.</>,
    );
    r.push(
      { nodes: r.node('F1', { role: 'promoted' }), flash: 'F1' },
      <>
        <b>Failover</b>: F1 is the most up to date follower, so it's <span className="hl ok">promoted</span> to leader.
      </>,
    );
    r.push(
      {
        client: { text: 'where is order #4?', tone: 'bad' },
        pkts: [{ id: 'q', from: 'C', to: 'F1', label: 'GET #4', kind: 'read' }],
      },
      <>The customer checks on order #4…</>,
    );
    r.push(
      {
        hold: 2.5,
        client: { text: '#4: not found ✗', tone: 'bad' },
        pkts: [{ id: 'qr', from: 'F1', to: 'C', label: '404', kind: 'resp' }],
      },
      <>
        <span className="hl bad">Order #4 is gone</span>, even though the customer was told it succeeded. With async
        replication, a failover can lose whatever hadn't replicated yet.
      </>,
    );
  } else {
    r.push(
      {
        nodes: r.node('L', { log: [...r.log('L'), 'order #3'] }),
        flash: 'L',
        pkts: [
          { id: 'r31', from: 'L', to: 'F1', label: '#3', kind: 'repl' },
          { id: 'r32', from: 'L', to: 'F2', label: '#3', kind: 'repl', dur: 2 },
        ],
      },
      <>Sync: the leader copies #3 to both followers before replying.</>,
    );
    r.push(
      {
        nodes: {
          ...r.cur.nodes,
          F1: { ...r.cur.nodes.F1, log: [...r.log('F1'), 'order #3'] },
          F2: { ...r.cur.nodes.F2, log: [...r.log('F2'), 'order #3'] },
        },
        pkts: [{ id: 'a3', from: 'L', to: 'C', label: 'ok', kind: 'ack' }],
      },
      <>Both followers have #3, so now the customer hears ok.</>,
    );
    r.push(
      {
        client: { text: '#3 ✓ confirmed, placing #4…', tone: 'wait' },
        latency: WRITE_MS.sync,
        pkts: [{ id: 'w4', from: 'C', to: 'L', label: 'order #4', kind: 'write' }],
      },
      <>Order #4 arrives.</>,
    );
    r.push(
      {
        nodes: {
          L: { ...r.cur.nodes.L, log: [...r.log('L'), 'order #4'] },
          F1: { ...r.cur.nodes.F1, log: [...r.log('F1'), 'order #4'] },
          F2: { ...r.cur.nodes.F2, log: [...r.log('F2'), 'order #4'] },
        },
        pkts: [{ id: 'a4', from: 'L', to: 'C', label: 'ok', kind: 'ack' }],
      },
      <>Copied everywhere, then confirmed.</>,
    );
    r.push(
      { nodes: r.node('L', { role: 'dead' }), client: { text: '#3 ✓  #4 ✓ confirmed', tone: 'ok' } },
      <>
        <span className="hl bad">💥 the leader crashes.</span>
      </>,
    );
    r.push(
      { nodes: r.node('F1', { role: 'promoted' }), flash: 'F1' },
      <>F1 is promoted. It already has every confirmed order.</>,
    );
    r.push(
      { hold: 2.5, client: { text: '#4: found ✓', tone: 'ok' } },
      <>
        <span className="hl ok">Nothing lost.</span> The price: every order took {WRITE_MS.sync} ms instead of{' '}
        {WRITE_MS.async}, waiting on the slow region.
      </>,
    );
  }
  return r.frames;
}

export const SCENARIOS: Record<Scenario, (m: Mode) => RepFrame[]> = { stale, failover };
