/**
 * kafka-partitioned-log, scene 3: a replication run as frames (one per event) for the replay slider, and the
 * rules for how each log cell is toned. Pure.
 */
import { toSequence, type TraceRow } from '../../core/distSim';
import type { Tone } from '../../core/tone';
import {
  BROKERS, HORIZON_MS, SEED_COUNT, brokersOf, controllerOf, lostRecords, missingSentRecords, lowestViolatingSeed, producerOf, replCluster, runChecked, scriptedSetup, seededSetup,
  type LostRecord, type ProducerRecord, type ReplCluster, type ReplConfig, type ReplMsg, type ReplSetup, type ReplVerdict, type ScriptedFault,
} from './replication';

export type Schedule = 'scripted' | 'seeded';

export interface ReplControls {
  schedule: Schedule;
  config: ReplConfig;
  faults: readonly ScriptedFault[];
  seed: number;
  seededFaults: boolean;
}

export const DEFAULT_REPL: ReplControls = {
  schedule: 'scripted',
  config: { acks: 1, minIsr: 1, unclean: false },
  faults: ['crash-leader'],
  seed: 0,
  seededFaults: true,
};

/** A hidden control is pinned: the seed means nothing on the scripted schedule, and the scripted faults mean nothing on the seeded one. */
export const effectiveControls = (c: ReplControls): ReplControls =>
  c.schedule === 'scripted' ? { ...c, seed: 0, seededFaults: true } : { ...c, faults: [] };

/** acks=0 and acks=1 never look at min.insync.replicas, and the model ignores it there. */
export const effectiveConfig = (config: ReplConfig): ReplConfig => (config.acks === 'all' ? config : { ...config, minIsr: 1 });

export function setupFor(controls: ReplControls): ReplSetup {
  const c = effectiveControls(controls);
  const config = effectiveConfig(c.config);
  return c.schedule === 'scripted' ? scriptedSetup(config, c.faults) : seededSetup(c.seed, config, c.seededFaults);
}

export interface BrokerFrame {
  log: number[];
  hwm: number;
  up: boolean;
  paused: boolean;
}

export interface ReplFrame {
  t: number;
  brokers: Record<string, BrokerFrame>;
  /** The controller's leader and the live brokers' view of the ISR. */
  leader: string | null;
  epoch: number;
  isr: string[];
  records: ProducerRecord[];
  lost: LostRecord[];
  /** acks=0 records sent and never confirmed that the leader lacks. */
  missing: LostRecord[];
}

export interface ReplRun {
  frames: ReplFrame[];
  verdict: ReplVerdict;
  cluster: ReplCluster;
  setup: ReplSetup;
}

function frameOf(c: ReplCluster): ReplFrame {
  const snap = c.snapshot();
  const ctl = controllerOf(snap);
  const brokers = brokersOf(snap);
  return {
    t: c.time,
    brokers: Object.fromEntries(BROKERS.map((b) => [b, { log: brokers[b].log, hwm: brokers[b].hwm, up: snap.nodes[b].up, paused: snap.nodes[b].paused }])),
    leader: ctl.leader,
    epoch: ctl.epoch,
    isr: ctl.isr,
    records: producerOf(snap).records,
    lost: lostRecords(snap),
    missing: missingSentRecords(snap, c.time),
  };
}

export function runRepl(controls: ReplControls, until = HORIZON_MS): ReplRun {
  const setup = setupFor(controls);
  const c = replCluster(setup);
  c.start();
  const frames: ReplFrame[] = [frameOf(c)];
  while (c.nextTime() <= until && c.step()) frames.push(frameOf(c));
  return { frames, verdict: runChecked(setup, until), cluster: c, setup };
}

/** The last frame at or before `t`. */
export const frameAt = (run: ReplRun, t: number): ReplFrame => [...run.frames].reverse().find((f) => f.t <= t) ?? run.frames[0];

export interface TapeCell {
  text: string;
  tone: Tone;
  fill: 'solid' | 'tint' | 'outline';
}

/**
 * How one log entry is drawn, given the leader's log and the high watermark: committed (below the watermark and on the
 * leader) is `ok`, in flight (on the leader, above the watermark) is `hi`, an acknowledged record the leader lacks is `bad`,
 * and a copy the leader does not hold (it will be truncated) is `dim`. With no live leader there is nothing to judge against.
 */
export function cellFor(id: number, offset: number, leader: BrokerFrame | null, lostIds: ReadonlySet<number>): TapeCell {
  const text = `r${id}`;
  if (lostIds.has(id)) return { text, tone: 'bad', fill: 'solid' };
  if (!leader) return { text, tone: 'muted', fill: 'outline' };
  if (leader.log[offset] !== id) return { text, tone: 'dim', fill: 'outline' };
  return offset < leader.hwm ? { text, tone: 'ok', fill: 'tint' } : { text, tone: 'hi', fill: 'outline' };
}

/** The columns every tape shares: the longest log, and at least the records that were acknowledged somewhere. */
export const tapeColumns = (f: ReplFrame): number =>
  Math.max(1, ...BROKERS.map((b) => f.brokers[b].log.length), ...f.lost.map((l) => l.offset + 1));

/** The leader of the moment as a frame, or null while there is none up. */
export const liveLeader = (f: ReplFrame): BrokerFrame | null => (f.leader !== null && f.brokers[f.leader].up ? f.brokers[f.leader] : null);

/* ---------- the ladder diagram: the messages that carry the story ---------- */

const carriesStory = (m: ReplMsg): boolean => {
  if (m.type === 'data') return m.ids.length > 0;
  return m.type === 'produce' || m.type === 'ack' || m.type === 'refused' || m.type === 'truncate' || m.type === 'meta';
};

/**
 * The trace rows worth a ladder: produces, acknowledgements, refusals, data that carries entries, truncations, and the
 * controller's announcement of each new epoch (the first one to each broker). Heartbeats, empty fetches and repeats are left out.
 */
export function storyRows(trace: readonly TraceRow<ReplMsg>[], until: number): TraceRow<ReplMsg>[] {
  const keep = new Set<number>();
  const announced = new Set<string>();
  for (const r of trace) {
    if (r.t > until || r.kind !== 'send' || !r.payload || !carriesStory(r.payload)) continue;
    if (r.payload.type === 'meta') {
      if (r.payload.epoch < 2) continue;
      const key = `${r.payload.epoch}:${r.to}`;
      if (announced.has(key)) continue;
      announced.add(key);
    }
    keep.add(r.msgId!);
  }
  return trace.filter((r) => r.t <= until && (r.msgId === undefined ? ['crash', 'restart'].includes(r.kind) : keep.has(r.msgId)));
}

export const messageLabel = (m: ReplMsg): string => {
  switch (m.type) {
    case 'produce': return `produce r${m.id}`;
    case 'ack': return `ack r${m.id} @${m.offset}`;
    case 'refused': return `refused r${m.id}`;
    case 'data': return `data ${m.ids.map((i) => `r${i}`).join(' ')}`;
    case 'truncate': return `truncate to ${m.to}`;
    case 'meta': return `leader ${m.leader ?? 'none'}, epoch ${m.epoch}`;
    case 'send': return `send r${m.id}`;
    default: return m.type;
  }
};

/** Every lane the ladder can draw, in order. */
export const LANES = [
  { id: 'producer', label: 'producer' },
  { id: 'b1', label: 'b1' },
  { id: 'b2', label: 'b2' },
  { id: 'b3', label: 'b3' },
  { id: 'ctl', label: 'controller' },
];

/**
 * The ladder of the story up to `until`: only the lanes its rows use, so a short replay stays narrow, or every lane
 * while nothing has happened yet (a diagram with no lanes cannot be laid out).
 */
export function storySequence(trace: readonly TraceRow<ReplMsg>[], until: number, times: boolean) {
  const rows = storyRows(trace, until);
  const used = new Set(rows.flatMap((r) => [r.from, r.to, r.node]));
  const drawn = LANES.filter((l) => used.has(l.id));
  return toSequence(rows, { actors: drawn.length > 0 ? drawn : LANES, label: messageLabel, events: true, times });
}

/* ---------- the seeds ---------- */

const pinned = new Map<string, number>();
const key = (c: ReplConfig, faults: boolean) => `${c.acks}/${effectiveConfig(c).minIsr}/${c.unclean}/${faults}`;

/** The lowest seed in the first SEED_COUNT whose seeded schedule breaks safety for this config, or null when none does. */
export function lowestBrokenSeed(config: ReplConfig, faults: boolean): number | null {
  const k = key(config, faults);
  if (!pinned.has(k)) pinned.set(k, lowestViolatingSeed(effectiveConfig(config), faults, SEED_COUNT) ?? -1);
  const v = pinned.get(k)!;
  return v < 0 ? null : v;
}

/** The seed a learner is put on: the lowest one that breaks these settings, else seed 0. */
export const pinnedSeed = (config: ReplConfig, faults: boolean): number => lowestBrokenSeed(config, faults) ?? 0;

