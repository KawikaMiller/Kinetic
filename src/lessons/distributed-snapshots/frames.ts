/**
 * distributed-snapshots: a seeded run as a list of frames for the step player, one per event, with the tokens in flight
 * derived from the trace (sends minus deliveries) and a caption that names what happened.
 */
import type { Frame } from '../../core/types';
import { complete, TOKENS_EACH, TOTAL_TOKENS, type Proc } from './snapshot';
import { NAMES, resultOf, snapshotScenario, viewsOf, type NodeView, type Result, type SimOptions, type SnapMsg } from './sim';

export interface InFlight {
  id: number;
  from: string;
  to: string;
  kind: 'token' | 'marker';
  amount: number | null;
}

export interface SnapFrame extends Frame {
  time: number;
  procs: Proc[];
  inflight: InFlight[];
  /** Every process has recorded and (for markers) every channel is closed in this frame. */
  finished: boolean;
}

export interface Run {
  frames: SnapFrame[];
  result: Result;
}

const tokensText = (n: number | null) => `${n} token${n === 1 ? '' : 's'}`;

/** What one step did, in words, from the trace rows it added. */
function describe(rows: readonly { kind: string; from?: string; to?: string; node?: string; detail?: string; payload?: unknown; t: number }[], recording: boolean): string {
  const at = `${Math.round(rows[0].t)} ms`;
  const deliver = rows.find((r) => r.kind === 'deliver');
  if (deliver) {
    const m = deliver.payload as SnapMsg;
    if (m.type === 'token') return `${at}: ${deliver.to} receives ${tokensText(m.amount)} from ${deliver.from}${recording ? ` (recorded as the content of the channel from ${deliver.from})` : ''}`;
    return `${at}: ${deliver.to} receives a marker from ${deliver.from}${recording ? ': it records its own state and sends markers' : ': the channel from ' + deliver.from + ' is closed'}`;
  }
  const timer = rows.find((r) => r.kind === 'timer');
  const sends = rows.filter((r) => r.kind === 'send');
  const first = sends[0]?.payload as SnapMsg | undefined;
  if (timer?.detail?.includes('record')) return `${at}: ${timer.node} records its state${first?.type === 'marker' ? ' and sends a marker on each outgoing channel' : ''}`;
  if (first?.type === 'token') return `${at}: ${sends[0].from} sends ${tokensText(first.amount)} to ${sends[0].to}`;
  return `${at}: ${timer?.node ?? 'a process'} waits`;
}

/** Run one seed, step by step. */
export function buildRun(options: SimOptions, seed: number): Run {
  const cluster = snapshotScenario(options)(seed);
  cluster.start();
  const inflight = new Map<number, InFlight>();
  const frame = (say: string, views: NodeView[]): SnapFrame => {
    const procs = views.map((v) => v.proc);
    return {
      say,
      time: cluster.time,
      procs,
      inflight: [...inflight.values()],
      finished: options.method === 'markers' ? complete(procs) : procs.every((p) => p.recorded !== null),
    };
  };
  const frames: SnapFrame[] = [frame(`Three processes, ${TOKENS_EACH} tokens each: ${TOTAL_TOKENS} in all. Press play.`, viewsOf(cluster))];
  let seen = cluster.trace.length;
  while (cluster.step()) {
    const rows = cluster.trace.slice(seen);
    seen = cluster.trace.length;
    if (rows.length === 0) continue;
    const before = viewsOf(cluster);
    const deliver = rows.find((r) => r.kind === 'deliver');
    for (const r of rows) {
      if (r.kind === 'send' && r.msgId !== undefined) {
        const m = r.payload as SnapMsg;
        inflight.set(r.msgId, { id: r.msgId, from: r.from!, to: r.to!, kind: m.type, amount: m.type === 'token' ? m.amount : null });
      }
      if (r.kind === 'deliver' && r.msgId !== undefined) inflight.delete(r.msgId);
    }
    const target = deliver ? NAMES.indexOf(deliver.to as (typeof NAMES)[number]) : -1;
    const wasRecorded = target >= 0 && frames[frames.length - 1].procs[target].recorded !== null;
    const m = deliver?.payload as SnapMsg | undefined;
    const recordingNow = target >= 0 && !wasRecorded && m?.type === 'marker';
    const tokenIntoRecording = target >= 0 && m?.type === 'token' && before[target].proc.recorded !== null && before[target].proc.channels[deliver!.from!]?.status === 'recording';
    frames.push(frame(describe(rows, m?.type === 'token' ? tokenIntoRecording : recordingNow), before));
  }
  const views = viewsOf(cluster);
  return { frames, result: resultOf(views, cluster.trace, options.method) };
}
