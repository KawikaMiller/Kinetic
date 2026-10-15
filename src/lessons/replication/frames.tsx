/**
 * Captions and drawing state for the four stories. Logs, roles, latencies, lag and loss come from
 * the run (`runStory` in ./model); this file decides where packets are drawn and what the words
 * around those facts say. Each frame samples the run at a moment the run itself names (when an
 * entry landed, when an answer arrived), not at a typed time.
 */
import type { ReactNode } from 'react';
import type { Frame } from '../../core/types';
import {
  DETECT_MS, everSent, FLUSH_MS, landedAt, latencyOf, LAT, writeMs, type NodeId, type NodeView, type OpRecord, type Story,
} from './model';

export type Place = 'C' | 'L' | 'F1' | 'F2';
export type Tone = 'ok' | 'bad' | 'wait' | '';

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
  nodes: Record<NodeId, NodeView>;
  pkts: Pkt[];
  client: { text: string; tone: Tone };
  /** Latency of the write the client has last been told succeeded. */
  latencyMs: number | null;
  /** Node whose newest log entry to glow this frame. */
  flash: NodeId | null;
  /** Reads answered so far that returned something older than the latest acknowledged write. */
  stale: number;
  /** Acknowledged writes that no live node holds. */
  missing: number;
}

const INITIAL_CLIENT = { text: 'ready', tone: '' } as const;

/** "name=Ada" is shown as Ada; other entries as they are. */
export const shown = (entry: string | null) => (entry === null ? 'nothing' : entry.replace(/^name=/, ''));

interface Recorder {
  push: (t: number, patch: Partial<Omit<RepFrame, 'say' | 'nodes' | 'stale' | 'missing'>>, say: ReactNode) => void;
  frames: RepFrame[];
}

function recorder(story: Story, initialClient: RepFrame['client'] = INITIAL_CLIENT): Recorder {
  const frames: RepFrame[] = [];
  let sticky = { client: initialClient as RepFrame['client'], latencyMs: null as number | null };
  const push: Recorder['push'] = (t, patch, say) => {
    const { client, latencyMs, pkts = [], flash = null, hold } = { ...sticky, ...patch };
    sticky = { client, latencyMs };
    frames.push({ say, hold, client, latencyMs, pkts, flash, nodes: story.at(t), stale: story.staleAt(t), missing: story.missingAt(t).length });
  };
  return { push, frames };
}

const must = (t: number | null): number => {
  if (t === null) throw new Error('the story never reached that moment');
  return t;
};

function staleFrames(story: Story): RepFrame[] {
  const [write, read] = story.ops;
  const isAsync = story.mode === 'async';
  const before = story.script.initialLog[0];
  const after = write.entry ?? '';
  const F1_LANDS = must(landedAt(story, 'F1', after));
  const F2_LANDS = must(landedAt(story, 'F2', after));
  const saved = `saved ✓ (${latencyOf(write)} ms)`;
  const r = recorder(story, { text: `profile: ${shown(before)}`, tone: '' });
  const writePkt: Pkt = { id: 'w', from: 'C', to: 'L', label: `SET ${after}`, kind: 'write' };
  const readPkt: Pkt = { id: 'rd', from: 'C', to: 'F2', label: 'GET profile', kind: 'read' };
  const answer = (id: string): Pkt => ({ id, from: 'F2', to: 'C', label: shown(read.entry), kind: 'resp' });
  const readClient = { text: `profile: ${shown(read.entry)}`, tone: read.entry === after ? ('ok' as const) : ('bad' as const) };

  r.push(0, {}, <>One leader takes all writes; two followers copy it. F2 is in another region, so its link is slow.</>);
  r.push(
    write.invoke + 1,
    { pkts: [writePkt], client: { text: 'saving…', tone: 'wait' } },
    <>You rename yourself to <span className="hl">{shown(after)}</span>. In single-leader replication, writes go to the leader.</>,
  );
  if (isAsync) {
    r.push(
      write.invoke + LAT.client + 1,
      {
        flash: 'L',
        pkts: [
          { id: 'ack', from: 'L', to: 'C', label: 'ok', kind: 'ack' },
          { id: 'r1', from: 'L', to: 'F1', label: shown(after), kind: 'repl' },
          { id: 'r2', from: 'L', to: 'F2', label: shown(after), kind: 'repl', dur: 4 },
        ],
      },
      <>
        <b>Async</b>: the leader stores it and replies <span className="hl ok">ok</span> straight away. A background sender ships the
        change to the followers every {FLUSH_MS} ms.
      </>,
    );
    r.push(
      F1_LANDS,
      {
        flash: 'F1',
        client: { text: saved, tone: 'ok' },
        latencyMs: latencyOf(write),
        pkts: [{ id: 'r2', from: 'L', to: 'F2', label: shown(after), kind: 'repl', dur: 4 }],
      },
      <>Saved in {latencyOf(write)} ms. F1 already has it; F2's copy is still crossing the ocean ({LAT.f2} ms each way).</>,
    );
    r.push(
      read.invoke + 1,
      { client: { text: 'reloading…', tone: 'wait' }, pkts: [{ id: 'r2', from: 'L', to: 'F2', label: shown(after), kind: 'repl', dur: 4 }, readPkt] },
      <>You reload the page. Reads are spread across followers, and this one lands on <b>F2</b>.</>,
    );
    r.push(
      must(read.response),
      { client: readClient, pkts: [{ id: 'r2', from: 'L', to: 'F2', label: shown(after), kind: 'repl', dur: 4 }, answer('rs')] },
      <>
        F2 hasn't caught up, so it answers <span className="hl bad">{shown(read.entry)}</span>. You just saved {shown(after)}, and your own
        change is gone: <b>read-your-writes</b> is broken.
      </>,
    );
    r.push(
      F2_LANDS,
      { flash: 'F2' },
      <>{F2_LANDS - must(read.response)} ms later F2 applies the change. <b>Eventually</b> consistent, just too late for that read.</>,
    );
    r.push(
      F2_LANDS + 1,
      { hold: 2.5 },
      <>
        Fixes: read from the leader right after writing, pin a user to one replica, or wait until the replica has caught up to your
        write. Async kept writes fast at {writeMs('async')} ms.
      </>,
    );
    return r.frames;
  }
  r.push(
    write.invoke + LAT.client + 1,
    { flash: 'L', pkts: [{ id: 'r1', from: 'L', to: 'F1', label: shown(after), kind: 'repl' }, { id: 'r2', from: 'L', to: 'F2', label: shown(after), kind: 'repl', dur: 2 }] },
    <>
      <b>Sync</b>: the leader stores it but does <b>not</b> reply yet. It waits until every follower confirms.
    </>,
  );
  r.push(
    F1_LANDS,
    {
      flash: 'F1',
      pkts: [{ id: 'r2', from: 'L', to: 'F2', label: shown(after), kind: 'repl', dur: 2 }, { id: 'a1', from: 'F1', to: 'L', label: 'have it', kind: 'ack' }],
    },
    <>F1 confirms quickly. Still waiting on F2, and so is your browser.</>,
  );
  r.push(
    F2_LANDS,
    { flash: 'F2', pkts: [{ id: 'a2', from: 'F2', to: 'L', label: 'have it', kind: 'ack', dur: 1.5 }] },
    <>F2 finally has it and confirms across the slow link.</>,
  );
  r.push(
    must(write.response),
    { pkts: [{ id: 'ack', from: 'L', to: 'C', label: 'ok', kind: 'ack' }], client: { text: saved, tone: 'ok' }, latencyMs: latencyOf(write) },
    <>Only now does the leader reply <span className="hl ok">ok</span>.</>,
  );
  r.push(
    read.invoke + 1,
    { pkts: [readPkt] },
    <>
      Saved, but it took <span className="hl bad">{latencyOf(write)} ms</span> instead of {writeMs('async')}. You reload; the read lands on F2
      again.
    </>,
  );
  r.push(
    must(read.response),
    { client: readClient, pkts: [answer('rs')] },
    <>
      F2 answers <span className="hl ok">{shown(read.entry)}</span>. In this run every replica is up to date once a write is acknowledged, so a read
      from any of them returns it.
    </>,
  );
  r.push(
    must(read.response) + 1,
    { hold: 2.5 },
    <>
      The trade: in this run reads are current on every replica, but each write waits for the slowest follower, and if a follower goes down, writes stall. Many
      setups wait for just one follower (semi-sync).
    </>,
  );
  return r.frames;
}

const orderName = (op: OpRecord) => op.entry ?? '';
const orderNo = (op: OpRecord) => orderName(op).replace('order ', '');

function failoverFrames(story: Story): RepFrame[] {
  const [first, second, query] = story.ops;
  const isAsync = story.mode === 'async';
  const crashAt = story.script.crashAt ?? 0;
  const promotedAt = must(story.promotedAt);
  const r = recorder(story);
  const orders = (nodes: Record<NodeId, NodeView>, id: NodeId) => nodes[id].log.length;
  const atPromotion = story.at(promotedAt - 1);
  const written = (op: OpRecord): Pkt => ({ id: `w${orderNo(op)}`, from: 'C', to: 'L', label: orderName(op), kind: 'write' });
  const queryAnswer = query.entry === null ? { text: `${orderNo(second)}: not found ✗`, tone: 'bad' as const } : { text: `${orderNo(second)}: found ✓`, tone: 'ok' as const };

  r.push(0, {}, <>Everyone has orders #1 and #2. Now customers place two more orders, and then the leader dies.</>);
  r.push(first.invoke + 1, { pkts: [written(first)], client: { text: `placing ${orderNo(first)}…`, tone: 'wait' } }, <>Order {orderNo(first)} goes to the leader.</>);

  if (isAsync) {
    const F1_HAS_FIRST = must(landedAt(story, 'F1', orderName(first)));
    r.push(
      first.invoke + LAT.client + 1,
      {
        flash: 'L',
        pkts: [
          { id: 'a3', from: 'L', to: 'C', label: 'ok', kind: 'ack' },
          { id: 'r31', from: 'L', to: 'F1', label: orderNo(first), kind: 'repl' },
          { id: 'r32', from: 'L', to: 'F2', label: orderNo(first), kind: 'repl', dur: 4 },
        ],
      },
      <>Stored and acknowledged immediately; the background sender ships it on its next {FLUSH_MS} ms round.</>,
    );
    r.push(
      F1_HAS_FIRST,
      {
        flash: 'F1',
        client: { text: `${orderNo(first)} confirmed ✓, placing ${orderNo(second)}…`, tone: 'wait' },
        latencyMs: latencyOf(first),
        pkts: [{ id: 'r32', from: 'L', to: 'F2', label: orderNo(first), kind: 'repl', dur: 4 }, written(second)],
      },
      <>F1 has {orderNo(first)}. The next customer places order {orderNo(second)}.</>,
    );
    r.push(
      must(second.response),
      {
        flash: 'L',
        client: { text: `${orderNo(first)} ✓  ${orderNo(second)} ✓ confirmed`, tone: 'ok' },
        latencyMs: latencyOf(second),
        pkts: [
          { id: 'r32', from: 'L', to: 'F2', label: orderNo(first), kind: 'repl', dur: 4 },
          { id: 'a4', from: 'L', to: 'C', label: 'ok', kind: 'ack' },
          { id: 'r41', from: 'L', to: 'F1', label: `${orderNo(second)} not sent yet`, kind: 'lost' },
          { id: 'r42', from: 'L', to: 'F2', label: `${orderNo(second)} not sent yet`, kind: 'lost' },
        ],
      },
      <>
        {orderNo(second)} is stored and <span className="hl ok">confirmed</span> to the customer. The background sender has not shipped it yet, and
        at that moment…
      </>,
    );
    r.push(
      crashAt + 1,
      { pkts: [{ id: 'r32', from: 'L', to: 'F2', label: orderNo(first), kind: 'repl', dur: 4 }] },
      <>
        <span className="hl bad">💥 the leader crashes</span> {crashAt - must(second.response)} ms after confirming {orderNo(second)}.{' '}
        {everSent(story, orderName(second)) ? 'Some copies had left.' : `Its copies of ${orderNo(second)} never left the building.`}
      </>,
    );
    r.push(
      promotedAt + 1,
      { flash: 'F1' },
      <>
        <b>Failover</b>: the manager notices {DETECT_MS} ms after the crash, asks the followers for their logs ({orders(atPromotion, 'F1')} entries on F1, {orders(atPromotion, 'F2')} on F2),
        and <span className="hl ok">promotes</span> the longest, F1.
      </>,
    );
    const f2Lands = must(landedAt(story, 'F2', orderName(first)));
    r.push(
      f2Lands,
      { flash: 'F2' },
      <>The slow copy of {orderNo(first)} still reaches F2, {f2Lands - promotedAt} ms after the failover. Nobody alive has {orderNo(second)}.</>,
    );
    r.push(
      query.invoke + 1,
      { client: { text: `where is order ${orderNo(second)}?`, tone: 'bad' }, pkts: [{ id: 'q', from: 'C', to: 'F1', label: `GET ${orderNo(second)}`, kind: 'read' }] },
      <>The customer checks on order {orderNo(second)}…</>,
    );
    r.push(
      must(query.response),
      { hold: 2.5, client: queryAnswer, pkts: [{ id: 'qr', from: 'F1', to: 'C', label: '404', kind: 'resp' }] },
      <>
        <span className="hl bad">Order {orderNo(second)} is gone</span>, even though the customer was told it succeeded. In this run, async replication
        lost the one write that had not been shipped.
      </>,
    );
    return r.frames;
  }

  r.push(
    first.invoke + LAT.client + 1,
    { flash: 'L', pkts: [{ id: 'r31', from: 'L', to: 'F1', label: orderNo(first), kind: 'repl' }, { id: 'r32', from: 'L', to: 'F2', label: orderNo(first), kind: 'repl', dur: 2 }] },
    <>Sync: the leader copies {orderNo(first)} to both followers before replying.</>,
  );
  r.push(
    must(first.response),
    { pkts: [{ id: 'a3', from: 'L', to: 'C', label: 'ok', kind: 'ack' }], client: { text: `${orderNo(first)} ✓ confirmed`, tone: 'ok' }, latencyMs: latencyOf(first) },
    <>Both followers have {orderNo(first)}, so now the customer hears ok, {latencyOf(first)} ms after placing it.</>,
  );
  r.push(
    second.invoke + 1,
    { client: { text: `${orderNo(first)} ✓ confirmed, placing ${orderNo(second)}…`, tone: 'wait' }, pkts: [written(second)] },
    <>Order {orderNo(second)} arrives.</>,
  );
  r.push(
    must(second.response),
    { flash: 'L', pkts: [{ id: 'a4', from: 'L', to: 'C', label: 'ok', kind: 'ack' }], client: { text: `${orderNo(first)} ✓  ${orderNo(second)} ✓ confirmed`, tone: 'ok' }, latencyMs: latencyOf(second) },
    <>Copied everywhere, then confirmed.</>,
  );
  r.push(
    crashAt + 1,
    {},
    <>
      <span className="hl bad">💥 the leader crashes.</span>
    </>,
  );
  r.push(
    promotedAt + 1,
    { flash: 'F1' },
    <>F1 is promoted. It already has every confirmed order ({orders(atPromotion, 'F1')} entries).</>,
  );
  r.push(
    must(query.response),
    { hold: 2.5, client: queryAnswer, pkts: [{ id: 'qr', from: 'F1', to: 'C', label: orderNo(second), kind: 'resp' }] },
    <>
      <span className="hl ok">Nothing lost.</span> The price: every order took {latencyOf(first)} ms instead of {writeMs('async')}, waiting on the slow
      region.
    </>,
  );
  return r.frames;
}

export function buildFrames(story: Story): RepFrame[] {
  return story.scenario === 'stale' ? staleFrames(story) : failoverFrames(story);
}
