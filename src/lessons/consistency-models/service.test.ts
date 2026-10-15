import { describe, expect, it } from 'vitest';
import { forSeeds } from '../../core/distSim';
import { orderVerdict, smallestViolation } from './model';
import {
  BROKEN_SEED, COPY_LINK_MS, DESIGNS, FOLLOWER_NOT_SEQUENTIAL_SEED, SEARCH_SEEDS, SERVICE_OPS, SESSION_NOT_LINEARIZABLE_SEED,
  failureAt, historySafety, lowestFailingSeed, opsUpTo, runService, serviceScenario, writeVersions, type Design, type ScriptStep,
} from './service';

const SEEDS = 300;
/** Hand-built network: every client link takes 3 ms, and the leader's copies take `copyMs`. */
const fixedLatency = (copyMs: number) => (_rnd: () => number, from: string, to: string) => (from === 'r1' && to.startsWith('r') ? copyMs : 3);
const noDuplicates = { duplicate: 0 };

const script = (op: number, kind: 'write' | 'read', node: string, thinkMs: number, value: number | null = null): ScriptStep => ({ op, kind, node, thinkMs, value });

describe('a hand-built schedule that every design must handle the same way, with no duplication and fixed delays', () => {
  // c1 writes 1 at t=0 (the leader has it at 3, c1 hears at 6); c2 reads from r2 at t=10: the copy to r2 lands at 3 + 40 = 43.
  const scripts = (read: ScriptStep): ScriptStep[][] => [[script(0, 'write', 'r1', 0, 1)], [read], []];

  it('follower reads: W(1) is acknowledged at 6 and a read at 10 from a follower still returns 0, so the history is not linearizable', () => {
    const run = runService('follower', 0, { scripts: scripts(script(1, 'read', 'r2', 10)), latency: fixedLatency(40), faults: noDuplicates });
    const [w, r] = run.ops;
    expect([w.invoke, w.response, w.value]).toEqual([0, 6, 1]);
    expect([r.invoke, r.response, r.value]).toEqual([10, 16, 0]);
    const ops = opsUpTo(run.ops, Infinity);
    expect(orderVerdict('linearizable', ops).ok).toBe(false);
    expect(orderVerdict('sequential', ops).ok).toBe(true);
    const minimal = smallestViolation('linearizable', ops)!;
    expect(minimal.map((o) => `${o.kind}:${o.value}`)).toEqual(['write:1', 'read:0']);
  });

  it('the one leader answers the same read with 1, and the history is linearizable', () => {
    const run = runService('leader', 0, { scripts: scripts(script(1, 'read', 'r1', 10)), latency: fixedLatency(40), faults: noDuplicates });
    expect(run.ops.map((o) => o.value)).toEqual([1, 1]);
    expect(failureAt('linearizable', run.ops)).toBeNull();
  });

  it('copies that arrive before the acknowledgement does remove the violation: the lag is the cause', () => {
    const run = runService('follower', 0, { scripts: scripts(script(1, 'read', 'r2', 10)), latency: fixedLatency(0), faults: noDuplicates });
    expect(run.ops[1].value).toBe(1);
    expect(failureAt('linearizable', run.ops)).toBeNull();
  });

  it('the session cache fixes read-your-writes but not a stale read by someone else', () => {
    // c1 writes, then reads from r2 at t=10 (its own write is not at r2 yet).
    const own = [[script(0, 'write', 'r1', 0, 1), script(1, 'read', 'r2', 4)], [], []];
    const follower = runService('follower', 0, { scripts: own, latency: fixedLatency(40), faults: noDuplicates });
    expect(follower.ops[1].value).toBe(0);
    expect(failureAt('sequential', follower.ops)).not.toBeNull();
    const session = runService('session', 0, { scripts: own, latency: fixedLatency(40), faults: noDuplicates });
    expect(session.ops[1].value).toBe(1);
    expect(failureAt('sequential', session.ops)).toBeNull();
    const other = runService('session', 0, { scripts: scripts(script(1, 'read', 'r2', 10)), latency: fixedLatency(40), faults: noDuplicates });
    expect(other.ops[1].value).toBe(0);
    expect(failureAt('linearizable', other.ops)).not.toBeNull();
    expect(failureAt('sequential', other.ops)).toBeNull();
  });
});

describe('design (a), one leader: linearizable at every step', () => {
  it(`${SEEDS} seeds with delay and duplication: the history is linearizable after every event`, () => {
    const verdict = forSeeds(SEEDS, serviceScenario('leader'), [historySafety('linearizable')]);
    expect(verdict).toEqual({ ok: true, seeds: SEEDS });
  });

  it('200 seeds with loss, crashes, partitions and pauses on top: still linearizable (operations that never answer stay in the history as writes that may have happened)', () => {
    const chaos = { horizonMs: 120, partitions: 1, crashes: 1, pauses: 1 };
    const verdict = forSeeds(200, serviceScenario('leader', { loss: 0.1, chaos }), [historySafety('linearizable')]);
    expect(verdict).toEqual({ ok: true, seeds: 200 });
  });
});

describe('design (b), follower reads: the broken mode', () => {
  it(`BROKEN_SEED ${BROKEN_SEED} is the lowest seed below ${SEARCH_SEEDS} on which the history stops being linearizable, found by forSeeds at a step`, () => {
    const verdict = forSeeds(SEARCH_SEEDS, serviceScenario('follower'), [historySafety('linearizable')]);
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.seed).toBe(BROKEN_SEED);
    expect(lowestFailingSeed('follower', 'linearizable', SEARCH_SEEDS)).toBe(BROKEN_SEED);
    expect(verdict.trace.length).toBeGreaterThan(0);
  });

  it(`the lowest seed that is not even sequential is ${FOLLOWER_NOT_SEQUENTIAL_SEED}`, () => {
    expect(lowestFailingSeed('follower', 'sequential', SEARCH_SEEDS)).toBe(FOLLOWER_NOT_SEQUENTIAL_SEED);
  });

  it('the violation on BROKEN_SEED is replication lag: the read that went stale was answered by a follower that had not yet received a write acknowledged before the read began', () => {
    const run = runService('follower', BROKEN_SEED);
    const subset = smallestViolation('linearizable', opsUpTo(run.ops, Infinity))!;
    const versions = writeVersions(run.trace);
    const reads = subset.filter((o) => o.kind === 'read');
    expect(reads.length).toBeGreaterThan(0);
    const explained = reads.some((r) => {
      const rec = run.ops.find((o) => `op${o.op}` === r.id)!;
      expect(rec.node).not.toBe('r1');
      const handledAt = run.trace.find((row) => row.kind === 'deliver' && row.to === rec.node && row.payload?.type === 'request' && row.payload.op === rec.op)!.t;
      const applied = Math.max(0, ...run.trace.filter((row) => row.kind === 'deliver' && row.to === rec.node && row.payload?.type === 'replicate' && row.t <= handledAt).map((row) => (row.payload as { version: number }).version));
      // Some write in the subset that was acknowledged before this read began, whose version this follower had not applied.
      return subset.some((w) => w.kind === 'write' && w.response < r.invoke && versions.get(Number(w.id.slice(2)))! > applied);
    });
    expect(explained).toBe(true);
  });

  it('the same seed with the one-leader routing, the same scripts and the same delays and duplicates, passes: the cause is where the read went, not duplication or delay', () => {
    expect(failureAt('linearizable', runService('leader', BROKEN_SEED).ops)).toBeNull();
  });

  it('the same seed with no duplication still fails, so duplication is not the cause', () => {
    const run = runService('follower', BROKEN_SEED, { faults: noDuplicates });
    expect(failureAt('linearizable', run.ops)).not.toBeNull();
  });

  it('the copy delay is the lever: the same seed with copies that always arrive first (0 ms) is linearizable', () => {
    const run = runService('follower', BROKEN_SEED, { latency: (rnd, from, to) => (from === 'r1' && to.startsWith('r') ? 0 : 2 + Math.round(rnd() * 6)) });
    expect(failureAt('linearizable', run.ops)).toBeNull();
    expect(COPY_LINK_MS.min).toBeGreaterThan(0);
  });
});

describe('design (c), the session cache: sequential, never linearizable', () => {
  it(`sequential and causal at every step on ${SEEDS} seeds with delay and duplication`, () => {
    expect(forSeeds(SEEDS, serviceScenario('session'), [historySafety('sequential'), historySafety('causal')])).toEqual({ ok: true, seeds: SEEDS });
  });

  it(`not linearizable on seed ${SESSION_NOT_LINEARIZABLE_SEED}, the lowest seed below ${SEARCH_SEEDS} that fails`, () => {
    expect(lowestFailingSeed('session', 'linearizable', SEARCH_SEEDS)).toBe(SESSION_NOT_LINEARIZABLE_SEED);
  });
});

describe('the run itself', () => {
  it('same seed, same design: the same trace, row for row; a different seed gives a different one', () => {
    for (const { id } of DESIGNS) {
      expect(runService(id, 7).trace).toEqual(runService(id, 7).trace);
      expect(JSON.stringify(runService(id, 7).trace)).not.toEqual(JSON.stringify(runService(id, 8).trace));
    }
  });

  it('every design runs the same scripts on a seed: the same writes with the same values, in the same order per client', () => {
    const shape = (d: Design) => runService(d, 11).ops.map((o) => `${o.client}:${o.op}:${o.kind}:${o.kind === 'write' ? o.value : '-'}`);
    expect(shape('follower')).toEqual(shape('leader'));
    expect(shape('session')).toEqual(shape('leader'));
  });

  it('liveness, tested apart from safety: with no loss every operation is answered, in every design, on 300 seeds', () => {
    for (const { id } of DESIGNS) {
      for (let seed = 0; seed < SEEDS; seed++) {
        const { ops } = runService(id, seed);
        expect(ops.length).toBe(SERVICE_OPS);
        expect(ops.every((o) => o.outcome === 'ok' && o.response !== null && o.response >= o.invoke)).toBe(true);
      }
    }
  });

  it('a client has one outstanding operation at a time', () => {
    for (const { id } of DESIGNS) {
      const { ops } = runService(id, 3);
      for (const client of ['c1', 'c2', 'c3']) {
        const mine = ops.filter((o) => o.client === client).sort((a, b) => a.invoke - b.invoke);
        for (let i = 1; i < mine.length; i++) expect(mine[i].invoke).toBeGreaterThanOrEqual(mine[i - 1].response!);
      }
    }
  });

  it('the history up to time t drops reads that have not answered, keeps writes that have not as never-answered, and equals the full history at the end', () => {
    const run = runService('follower', BROKEN_SEED);
    const full = opsUpTo(run.ops, Infinity);
    expect(full.length).toBe(SERVICE_OPS);
    const midpoint = Math.floor(run.end / 2);
    const mid = opsUpTo(run.ops, midpoint);
    for (const o of mid) {
      const rec = run.ops.find((r) => `op${r.op}` === o.id)!;
      if (rec.response !== null && rec.response <= midpoint) expect(o.response).toBe(rec.response);
      else {
        expect(o.kind).toBe('write');
        expect(o.response).toBe(Infinity);
      }
    }
    expect(opsUpTo(run.ops, -1)).toEqual([]);
  });
});
