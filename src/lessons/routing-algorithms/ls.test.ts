import { describe, expect, it } from 'vitest';
import { checkInvariants, forSeeds } from '../../core/distSim';
import { scriptedSetup } from './init';
import {
  DEFAULT_LS, HORIZON_MS, LS_BROKEN_SEED, LS_DEAD_ROUTE_SEED, agrees, behind, components, deadRouterOf, frameAt, lsCluster, lsRun, monotoneSeq, routerView, settling, trueTopoAt,
  viewOf, wrongRouters, type LsSetup,
} from './ls';
import { nextHops } from './paths';
import { PRESETS, adjacency, intactTopo, presetTopo } from './topology';

const SEEDS = 200;
const linkOf = (presetId: string) => PRESETS.find((p) => p.id === presetId)!.cut[0] ?? 'AB';
const setups = (over: Partial<LsSetup>): LsSetup[] =>
  PRESETS.flatMap((p) => [false, true].map((restore) => ({ ...DEFAULT_LS, presetId: p.id, link: linkOf(p.id), restore, ...over })));

describe('LS1 holds over 200 seeded fault schedules when sequence numbers are honoured', () => {
  it('with delay, 20% loss and 5% duplication, on every preset, with and without a restore', () => {
    for (const base of setups({ loss: 0.2, minMs: 1, maxMs: 80 })) {
      const verdict = forSeeds(SEEDS, (seed) => lsCluster({ ...base, seed }), [monotoneSeq()], { until: HORIZON_MS });
      expect(verdict, `${base.presetId} restore=${base.restore}`).toMatchObject({ ok: true, seeds: SEEDS });
    }
  });

  it('lossless links that stay up: databases in each component become identical and every next hop matches Dijkstra on the true graph (liveness, stated separately)', () => {
    for (const base of setups({ loss: 0, minMs: 1, maxMs: 80 })) {
      for (let seed = 0; seed < SEEDS; seed++) {
        const run = lsRun({ ...base, seed });
        const last = run.frames[run.frames.length - 1];
        const truth = trueTopoAt(run.setup, run.endTime);
        expect(agrees(last, truth), `${base.presetId} restore=${base.restore} seed ${seed}`).toBe(true);
        const real = adjacency(truth);
        for (const r of truth.routers) {
          const mine = nextHops(viewOf(last.db[r]), r);
          const should = nextHops(real, r);
          for (const d of truth.routers) expect(mine[d] ?? null, `${base.presetId} seed ${seed}: ${r} to ${d}`).toBe(should[d]);
        }
      }
    }
  });
});

describe('the broken rule (ignore sequence numbers) violates LS1', () => {
  it('the scripted schedule reproduces it on every seed: the old LSA of A, 40 ms on the A-F link, lands at F after the new one, 10 ms', () => {
    for (let seed = 0; seed < SEEDS; seed++) {
      const run = lsRun({ ...scriptedSetup('ignore'), seed });
      expect(run.violation, `seed ${seed}`).toMatchObject({ time: 40, message: "F replaced its copy of A's LSA #2 with the older #1" });
    }
  });

  it('the same scripted schedule with sequence numbers honoured never violates, and F keeps #2', () => {
    for (let seed = 0; seed < SEEDS; seed++) {
      const run = lsRun({ ...scriptedSetup('seq'), seed });
      expect(run.violation).toBeNull();
      expect(frameAt(run, 41).db.F.A.seq).toBe(2);
    }
  });

  it('the lowest seed of 0-199 that violates on the default random delivery is LS_BROKEN_SEED, and one exists', () => {
    const verdict = forSeeds(SEEDS, (seed) => lsCluster({ ...DEFAULT_LS, mode: 'ignore', seed }), [monotoneSeq()], { until: HORIZON_MS });
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.seed).toBe(LS_BROKEN_SEED);
    expect(verdict.message).toContain('replaced its copy');
    for (let seed = 0; seed < LS_BROKEN_SEED; seed++) expect(lsRun({ ...DEFAULT_LS, mode: 'ignore', seed }).violation).toBeNull();
  });

  it('the lowest seed that leaves a router routing over the cut link when the run ends is LS_DEAD_ROUTE_SEED', () => {
    const dead = (seed: number) => {
      const run = lsRun({ ...DEFAULT_LS, mode: 'ignore', seed });
      return wrongRouters(run, run.endTime).some((r) => routerView(run, r, run.endTime).deadEdges.length > 0);
    };
    expect(dead(LS_DEAD_ROUTE_SEED)).toBe(true);
    for (let seed = 0; seed < LS_DEAD_ROUTE_SEED; seed++) expect(dead(seed), `seed ${seed}`).toBe(false);
  });

  it('the router the seed-70 chip opens on is B, which is really routing over the cut link', () => {
    expect(deadRouterOf(LS_DEAD_ROUTE_SEED)).toBe('B');
  });

  it('loss is NOT repaired beyond one hop: at 10% loss on the ring the databases stay different on many seeds, which is why the chip says so', () => {
    // Independent of the model's own summary: compare the final sequence numbers of every router directly.
    let never = 0;
    for (let seed = 0; seed < 100; seed++) {
      const run = lsRun({ ...DEFAULT_LS, loss: 0.1, seed });
      const last = run.frames[run.frames.length - 1];
      const sigs = new Set(Object.values(last.db).map((db) => JSON.stringify(Object.keys(db).sort().map((o) => [o, db[o].seq]))));
      if (sigs.size > 1) never++;
    }
    expect(never).toBeGreaterThan(10);
  });

  it('the run recorded for the screen reports the same first violation as checkInvariants', () => {
    for (const seed of [LS_BROKEN_SEED, LS_DEAD_ROUTE_SEED, 4, 9]) {
      const s: LsSetup = { ...DEFAULT_LS, mode: 'ignore', seed };
      const run = lsRun(s);
      const verdict = checkInvariants(lsCluster(s), [monotoneSeq()], { until: HORIZON_MS });
      if (verdict.ok) expect(run.violation).toBeNull();
      else expect(run.violation).toMatchObject({ time: verdict.time, message: verdict.message });
    }
  });

  it('monotoneSeq itself fails on a sequence number that goes down and passes one that goes up (a broken variant it must reject)', () => {
    const snap = (step: number, seq: number) => ({ time: step, step, inFlight: 0, nodes: { A: { up: true, paused: false, state: { db: { B: { seq, links: {} } } } } } });
    const check = monotoneSeq();
    expect(check(snap(0, 1))).toBeNull();
    expect(check(snap(1, 2))).toBeNull();
    expect(check(snap(2, 1))).toContain('older #1');
    const fresh = monotoneSeq();
    expect(fresh(snap(0, 3))).toBeNull();
    expect(fresh(snap(1, 3))).toBeNull();
  });
});

describe('scripted delivery ignores the random controls', () => {
  it('delay range, loss and seed leave a scripted run unchanged (hidden controls feed nothing)', () => {
    const base = lsRun(scriptedSetup('ignore'));
    for (const over of [{ minMs: 1, maxMs: 1 }, { minMs: 80, maxMs: 80, loss: 0.3 }, { seed: 99 }]) {
      const other = lsRun({ ...scriptedSetup('ignore'), ...over });
      expect(other.frames).toEqual(base.frames);
      expect(other.violation).toEqual(base.violation);
    }
  });
});

describe('reading a run', () => {
  const run = lsRun(DEFAULT_LS);

  it('the true topology has the cut link down from 60 ms and a restore brings it back at 200 ms', () => {
    expect(trueTopoAt(DEFAULT_LS, 59).links.every((l) => l.up)).toBe(true);
    expect(trueTopoAt(DEFAULT_LS, 60).links.filter((l) => !l.up).map((l) => l.id)).toEqual(['AB']);
    const back = { ...DEFAULT_LS, restore: true };
    expect(trueTopoAt(back, 199).links.filter((l) => !l.up)).toHaveLength(1);
    expect(trueTopoAt(back, 200).links.every((l) => l.up)).toBe(true);
  });

  it('components of a cut chain are {A, B} and {C}', () => {
    const chain = presetTopo(PRESETS[0]);
    expect(components(chain)).toEqual([['A', 'B'], ['C']]);
    expect(components(intactTopo(chain))).toEqual([['A', 'B', 'C']]);
  });

  it('before anything is flooded each router holds only its own LSA, and the databases differ', () => {
    const first = run.frames[0];
    expect(Object.keys(first.db.A)).toEqual(['A']);
    expect(agrees(first, intactTopo(presetTopo(PRESETS[2])))).toBe(false);
  });

  it('settling reports when agreement began, measured from the cut, and never for the broken seed', () => {
    const s = settling(run);
    expect(s.changeAt).toBe(60);
    expect(s.settledAt).not.toBeNull();
    expect(s.ms).toBeCloseTo((s.settledAt as number) - 60, 9);
    expect(settling(lsRun({ ...DEFAULT_LS, mode: 'ignore', seed: LS_BROKEN_SEED })).ms).toBeNull();
  });

  it('"behind" lists routers holding an older copy than the newest, and is empty once settled', () => {
    expect(behind(frameAt(run, 62)).length).toBeGreaterThan(0);
    expect(behind(run.frames[run.frames.length - 1])).toEqual([]);
  });

  it('the tree of a router, from its settled database, has no edge over the cut link', () => {
    expect(routerView(run, 'D', run.endTime).deadEdges).toEqual([]);
  });
});
