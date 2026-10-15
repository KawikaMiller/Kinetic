import { describe, expect, it } from 'vitest';
import { forSeeds, type TraceRow } from '../../core/distSim';
import {
  BROKEN_CONFIG, BROKEN_SEED, HORIZON_MS, SAFE_CONFIG, SEED_COUNT, UNCLEAN_CONFIG, UNCLEAN_SEED, acknowledgedNeverLost, highWatermarkMonotone, lostRecords,
  replCluster, runChecked, scriptedSetup, seededSetup,
  type ReplConfig, type ReplMsg, type ReplSnapshot, type ReplState, type ScriptedFault,
} from './replication';
import { DEFAULT_REPL, effectiveConfig, runRepl, setupFor } from './replView';

const bounds = { until: HORIZON_MS };
const seeds = (from: number, to: number, config: ReplConfig, faults = true) =>
  forSeeds({ from, to }, (s) => replCluster(seededSetup(s, config, faults)), [acknowledgedNeverLost, highWatermarkMonotone()], bounds);

const ACKS = [0, 1, 'all'] as const;
const FAULT_SETS: ScriptedFault[][] = [[], ['crash-leader'], ['slow-b2'], ['slow-b3'], ['slow-b2', 'slow-b3'], ['crash-leader', 'slow-b2'], ['crash-leader', 'slow-b3'], ['crash-leader', 'slow-b2', 'slow-b3']];

describe('the safe settings hold on every seeded fault schedule', () => {
  it('acks=all, min.insync=2, clean election: no acknowledged record is missing from the leader in office and no leader high watermark falls, over 500 seeds with loss, duplication, crashes, stalls and cuts', () => {
    expect(seeds(0, 500, SAFE_CONFIG)).toEqual({ ok: true, seeds: 500 });
  });
  it('acks=all with min.insync=1 and a clean election also holds: the data waits on a dead leader, unavailable and not lost', () => {
    expect(seeds(0, 500, { acks: 'all', minIsr: 1, unclean: false })).toEqual({ ok: true, seeds: 500 });
  });
  it('acks=0 acknowledges nothing, so there is nothing acknowledged to lose', () => {
    expect(seeds(0, SEED_COUNT, { acks: 0, minIsr: 1, unclean: true })).toEqual({ ok: true, seeds: SEED_COUNT });
  });
  it('with delays only (no faults) every setting holds', () => {
    for (const acks of ACKS) for (const unclean of [false, true]) expect(seeds(0, SEED_COUNT, { acks, minIsr: 1, unclean }, false).ok).toBe(true);
  });
  it('liveness is a separate claim: with both followers slow the ISR shrinks to the leader, and acks=all with min.insync=2 acknowledges nothing', () => {
    const run = runRepl({ ...DEFAULT_REPL, config: SAFE_CONFIG, faults: ['slow-b2', 'slow-b3'] });
    expect(run.verdict.ok).toBe(true);
    const records = run.frames.at(-1)!.records;
    expect(records.filter((r) => r.fate === 'acked')).toEqual([]);
    expect(records.every((r) => r.fate === 'refused' || r.fate === 'failed')).toBe(true);
  });
});

/** The id the violation message names, from "record rN was acknowledged...". */
const lostId = (message: string) => Number(/record r(\d+)/.exec(message)![1]);
const deliveredData = (trace: readonly TraceRow<ReplMsg>[], to: string, id: number) =>
  trace.some((r) => r.kind === 'deliver' && r.to === to && r.payload?.type === 'data' && r.payload.ids.includes(id));

describe('the broken mode violates the invariant on a pinned seed, for the stated reason', () => {
  const broken = seeds(0, SEED_COUNT, BROKEN_CONFIG);
  it(`acks=1 with unclean election: the lowest failing seed is ${BROKEN_SEED}`, () => {
    expect(broken.ok).toBe(false);
    if (broken.ok) return;
    expect(broken.seed).toBe(BROKEN_SEED);
    expect(broken.rule).toBe(0);
  });
  it('by trace: the lost record was acknowledged, the leader in office never received it, and the old leader that held it went down first', () => {
    if (broken.ok) throw new Error('the broken mode did not break');
    const id = lostId(broken.message);
    const ack = broken.trace.find((r) => r.kind === 'send' && r.payload?.type === 'ack' && r.payload.id === id)!;
    expect(ack).toBeDefined();
    const holder = ack.from!;
    const leader = /missing from leader (b\d)/.exec(broken.message)![1];
    expect(leader).not.toBe(holder);
    expect(deliveredData(broken.trace, leader, id)).toBe(false);
    expect(broken.trace.some((r) => r.kind === 'crash' && r.node === holder && r.t >= ack.t)).toBe(true);
  });
  it('by counterfactual: the same seed with acks=all and min.insync=2 loses nothing, and acks=1 alone is enough to lose it', () => {
    expect(seeds(BROKEN_SEED, BROKEN_SEED + 1, SAFE_CONFIG).ok).toBe(true);
    expect(seeds(BROKEN_SEED, BROKEN_SEED + 1, { acks: 1, minIsr: 1, unclean: false }).ok).toBe(false);
  });
  it(`acks=all with min.insync=1 and unclean election loses committed data: the lowest failing seed is ${UNCLEAN_SEED}`, () => {
    const lost = seeds(0, SEED_COUNT, UNCLEAN_CONFIG);
    expect(lost.ok).toBe(false);
    if (lost.ok) return;
    expect(lost.seed).toBe(UNCLEAN_SEED);
    const id = lostId(lost.message);
    const leader = /missing from leader (b\d)/.exec(lost.message)![1];
    // The record was acknowledged by a leader whose ISR was only itself, and the leader elected afterwards was outside that ISR.
    const metas = lost.trace.filter((r) => r.kind === 'send' && r.payload?.type === 'meta').map((r) => r.payload as Extract<ReplMsg, { type: 'meta' }>);
    const elected = metas.find((m) => m.leader === leader && m.epoch > 1)!;
    const before = [...metas].reverse().find((m) => m.epoch === elected.epoch - 1)!;
    expect(before.isr).not.toContain(leader);
    expect(deliveredData(lost.trace, leader, id)).toBe(false);
    // Counterfactual: a clean election with every other setting the same loses nothing on this seed (the data waits on the dead leader).
    expect(seeds(UNCLEAN_SEED, UNCLEAN_SEED + 1, { ...UNCLEAN_CONFIG, unclean: false }).ok).toBe(true);
  });
  it('and acks=all with min.insync=2 and unclean election can still lose it, when the whole ISR is down', () => {
    expect(seeds(0, SEED_COUNT, { acks: 'all', minIsr: 2, unclean: true }).ok).toBe(false);
  });
});

describe('the hand-built schedule does not depend on luck', () => {
  it('append, acknowledge, crash the leader before the follower fetch: acks=1 violates under every seed argument, and loses record r4 at offset 3', () => {
    for (let seed = 0; seed < 50; seed++) {
      const v = runChecked(setupFor({ ...DEFAULT_REPL, seed }));
      expect(v.ok).toBe(false);
      if (!v.ok) expect(v.message).toBe('record r4 was acknowledged at offset 3 and is missing from leader b2');
    }
  });
  it('the same crash with acks=all and min.insync=2 acknowledges r4 never, so nothing acknowledged is lost', () => {
    const run = runRepl({ ...DEFAULT_REPL, config: SAFE_CONFIG });
    expect(run.verdict.ok).toBe(true);
    const r4 = run.frames.at(-1)!.records.find((r) => r.id === 4)!;
    expect(r4.fate).toBe('failed');
  });
  it('the old leader that comes back truncates its unacknowledged-by-anyone tail and joins the new log', () => {
    const run = runRepl({ ...DEFAULT_REPL, config: SAFE_CONFIG });
    const end = run.frames.at(-1)!;
    expect(end.brokers.b1.log).toEqual(end.brokers.b2.log);
    expect(run.cluster.trace.some((r) => r.kind === 'send' && r.payload?.type === 'truncate')).toBe(true);
  });
});

describe('walking every setting of the scripted scene', () => {
  const configs: ReplConfig[] = ACKS.flatMap((acks) => [1, 2].flatMap((minIsr) => [false, true].map((unclean) => ({ acks, minIsr: minIsr as 1 | 2, unclean }))));
  it('acks=all with a clean election never loses an acknowledged record, in any fault combination', () => {
    for (const config of configs.filter((c) => c.acks === 'all' && !c.unclean)) {
      for (const faults of FAULT_SETS) expect(runChecked(scriptedSetup(effectiveConfig(config), faults)).ok, `${JSON.stringify(config)} ${faults.join('+')}`).toBe(true);
    }
  });
  it('acks=1 loses an acknowledged record whenever the leader alone crashes in this schedule, and nothing is lost when no one crashes', () => {
    for (const config of configs.filter((c) => c.acks === 1)) {
      expect(runChecked(scriptedSetup(effectiveConfig(config), ['crash-leader'])).ok, JSON.stringify(config)).toBe(false);
      for (const faults of FAULT_SETS.filter((f) => !f.includes('crash-leader'))) expect(runChecked(scriptedSetup(effectiveConfig(config), faults)).ok, `${JSON.stringify(config)} ${faults.join('+')}`).toBe(true);
    }
  });
  it('hidden controls do not feed the model: min.insync means nothing unless acks=all, the seed means nothing on the scripted schedule, and the scripted faults mean nothing on the seeded one', () => {
    const runOf = (c: typeof DEFAULT_REPL) => JSON.stringify(runRepl(c).frames.map((f) => [f.t, f.leader, f.epoch, f.isr, f.records, Object.values(f.brokers).map((b) => [b.log, b.hwm, b.up])]));
    for (const acks of [0, 1] as const) {
      for (const unclean of [false, true]) {
        for (const faults of FAULT_SETS) {
          const a = { ...DEFAULT_REPL, faults, config: { acks, minIsr: 1 as const, unclean } };
          expect(runOf({ ...a, config: { ...a.config, minIsr: 2 } }), `${acks} ${unclean} ${faults.join('+')}`).toBe(runOf(a));
        }
      }
    }
    const scripted = { ...DEFAULT_REPL, config: SAFE_CONFIG, faults: ['crash-leader'] as ScriptedFault[] };
    expect(runOf({ ...scripted, seed: 99, seededFaults: false })).toBe(runOf(scripted));
    const seeded = { ...DEFAULT_REPL, schedule: 'seeded' as const, seed: 3 };
    expect(runOf({ ...seeded, faults: ['slow-b2', 'slow-b3'] })).toBe(runOf({ ...seeded, faults: [] }));
  });
});

describe('the checks themselves reject a broken log', () => {
  const state = (o: Partial<Record<string, unknown>>): ReplSnapshot => ({
    time: 0, step: 0, inFlight: 0,
    nodes: {
      ctl: { up: true, paused: false, state: { role: 'controller', leader: 'b2', epoch: 2, isr: ['b2'] } },
      producer: { up: true, paused: false, state: { role: 'producer', records: [{ id: 1, at: 0, fate: 'acked', offset: 0 }, { id: 2, at: 1, fate: 'acked', offset: 1 }, { id: 3, at: 2, fate: 'failed' }] } },
      b1: { up: true, paused: false, state: { role: 'broker', log: [1, 2], hwm: 0, leader: 'b2', epoch: 2, isr: [], incarnation: 1 } },
      b2: { up: true, paused: false, state: { role: 'broker', log: [1], hwm: 1, leader: 'b2', epoch: 2, isr: ['b2'], incarnation: 1, ...o } as ReplState },
      b3: { up: true, paused: false, state: { role: 'broker', log: [], hwm: 0, leader: 'b2', epoch: 2, isr: [], incarnation: 1 } },
    },
  });
  it('a leader missing an acknowledged record is reported, and one holding it, or a failed record it lacks, is not', () => {
    expect(lostRecords(state({}))).toEqual([{ id: 2, offset: 1, leader: 'b2' }]);
    expect(lostRecords(state({ log: [1, 2] }))).toEqual([]);
  });
  it('a leader that is down, or has not heard it was elected, is not judged', () => {
    const down = state({});
    down.nodes.b2.up = false;
    expect(lostRecords(down)).toEqual([]);
    expect(lostRecords(state({ epoch: 1 }))).toEqual([]);
  });
  it('a falling high watermark on the same run of a leader is reported; a restart or a new epoch is not', () => {
    const check = highWatermarkMonotone();
    expect(check(state({ hwm: 1 }))).toBeNull();
    expect(check(state({ hwm: 0 }))).toBe('the high watermark of leader b2 fell from 1 to 0');
    const fresh = highWatermarkMonotone();
    fresh(state({ hwm: 1 }));
    expect(fresh(state({ hwm: 0, incarnation: 2 }))).toBeNull();
    const newEpoch = highWatermarkMonotone();
    newEpoch(state({ hwm: 1 }));
    expect(newEpoch(state({ hwm: 0, epoch: 3 }))).toBeNull();
  });
  it('the protocol itself is deterministic: one seed, one trace', () => {
    const run = () => {
      const c = replCluster(seededSetup(11, SAFE_CONFIG, true));
      c.run({ until: HORIZON_MS });
      return JSON.stringify(c.trace);
    };
    expect(run()).toBe(run());
  });
});
