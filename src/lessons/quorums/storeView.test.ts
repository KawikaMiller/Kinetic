import { describe, expect, it } from 'vitest';
import { checkInvariants, forSeeds, toSequence } from '../../core/distSim';
import { sequenceLayout } from '../../core/sequenceLayout';
import {
  BROKEN_SEED_NO_OVERLAP, BROKEN_SEED_SLOPPY_TOGGLE, TOGGLE_FAULTS, readsSeeAcknowledgedWrites, storeCluster, storeScenario,
} from './store';
import {
  DEFAULT_STORE, HORIZON_MS, SCHEDULES, drawnActors, effectiveControls, pinnedSeed, replicaRow, runStore, setupFor, sloppyApplies, type StoreControls,
} from './storeView';

const SEEDS = [0, BROKEN_SEED_NO_OVERLAP, 18];
const bools = [false, true];
const allControls = (): StoreControls[] =>
  SCHEDULES.flatMap(({ id: schedule }) =>
    [1, 2, 3].flatMap((w) => [1, 2, 3].flatMap((r) => bools.flatMap((sloppy) => bools.flatMap((repair) => bools.flatMap((faults) => SEEDS.map((seed) => ({ schedule, w, r, sloppy, repair, faults, seed }))))))),
  );

describe('every control combination of scene 3 draws', () => {
  const all = allControls();
  it('is the full cross product: 3 schedules x W x R x sloppy x repair x faults x 3 seeds = 648', () => {
    expect(all).toHaveLength(648);
  });
  it('never throws and every message endpoint of the whole run is a drawn lane, at every replay time', () => {
    for (const c of all) {
      const run = runStore(setupFor(c), HORIZON_MS[c.schedule]);
      const actors = drawnActors(run);
      const ids = new Set(actors.map((a) => a.id));
      for (const row of run.cluster.trace.filter((x) => x.kind === 'send' || x.kind === 'deliver')) for (const end of [row.from, row.to]) if (end !== undefined) expect(ids.has(end), `${JSON.stringify(c)}: ${end}`).toBe(true);
      for (const t of [0, HORIZON_MS[c.schedule] / 2, HORIZON_MS[c.schedule]]) {
        const { messages } = toSequence(run.cluster.trace.filter((r) => r.t <= t), { actors, events: false, times: true });
        expect(() => sequenceLayout(actors, messages), JSON.stringify(c)).not.toThrow();
      }
    }
  });
});

describe('a hidden control never reaches the model', () => {
  it('the Sloppy toggle is hidden on the in-flight schedule only', () => {
    expect(SCHEDULES.map((s) => [s.id, sloppyApplies(s.id)])).toEqual([['inflight', false], ['sloppy', true], ['seeded', true]]);
  });
  it('in-flight results are identical whatever Sloppy was left at, for every W, R and repair setting', () => {
    for (const w of [1, 2, 3]) for (const r of [1, 2, 3]) for (const repair of bools) {
      const off = runStore(setupFor({ ...DEFAULT_STORE, w, r, repair, sloppy: false }), HORIZON_MS.inflight);
      const on = runStore(setupFor({ ...DEFAULT_STORE, w, r, repair, sloppy: true }), HORIZON_MS.inflight);
      expect(on.ops, `W${w} R${r}`).toEqual(off.ops);
      expect(on.cluster.trace).toEqual(off.cluster.trace);
    }
  });
  it('with Sloppy left on and W = 1 the in-flight write is still acknowledged at 50 ms, as the note says', () => {
    const run = runStore(setupFor({ ...DEFAULT_STORE, w: 2, r: 2, sloppy: true }), HORIZON_MS.inflight);
    expect(run.ops[0]).toMatchObject({ kind: 'write', invoke: 0, response: 50 });
    expect(effectiveControls({ ...DEFAULT_STORE, sloppy: true }).sloppy).toBe(false);
    expect(replicaRow({ ...DEFAULT_STORE, sloppy: true }).ids).toEqual(['A', 'B', 'C']);
  });
});

describe('the partition schedule draws its cut', () => {
  it('puts the writer side left of the cut, stand-ins only when sloppy', () => {
    expect(replicaRow({ ...DEFAULT_STORE, schedule: 'sloppy' })).toEqual({ ids: ['A', 'B', 'C'], cutAfter: 0 });
    expect(replicaRow({ ...DEFAULT_STORE, schedule: 'sloppy', sloppy: true })).toEqual({ ids: ['A', 'S1', 'S2', 'B', 'C'], cutAfter: 2 });
    expect(replicaRow(DEFAULT_STORE).cutAfter).toBeNull();
  });
});

describe('reads still waiting are reported, not silently dropped', () => {
  it('R = 3 on the in-flight schedule leaves both reads open, and the run says so', () => {
    const run = runStore(setupFor({ ...DEFAULT_STORE, w: 2, r: 3 }), HORIZON_MS.inflight);
    expect(run.open).toBe(2);
    expect(runStore(setupFor(DEFAULT_STORE), HORIZON_MS.inflight).open).toBe(0);
  });
});

describe('the seed the scene pins matches the on-screen Faults toggle', () => {
  const sloppy = { n: 3, w: 2, r: 2, sloppy: true, repair: false };
  it(`BROKEN_SEED_SLOPPY_TOGGLE ${BROKEN_SEED_SLOPPY_TOGGLE} is the lowest of 500 seeds failing under exactly the toggle's mix, and strict passes it`, () => {
    const verdict = forSeeds(500, storeScenario(sloppy, TOGGLE_FAULTS), [readsSeeAcknowledgedWrites]);
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.seed).toBe(BROKEN_SEED_SLOPPY_TOGGLE);
    expect(checkInvariants(storeScenario({ ...sloppy, sloppy: false }, TOGGLE_FAULTS)(BROKEN_SEED_SLOPPY_TOGGLE), [readsSeeAcknowledgedWrites]).ok).toBe(true);
    expect(checkInvariants(storeScenario(sloppy)(BROKEN_SEED_SLOPPY_TOGGLE), [readsSeeAcknowledgedWrites]).ok).toBe(true);
  });
  it('the scene setup with Sloppy and Faults on runs that mix on the pinned seed and breaks the invariant', () => {
    const c = { ...DEFAULT_STORE, schedule: 'seeded' as const, sloppy: true, faults: true };
    expect(pinnedSeed(c)).toBe(BROKEN_SEED_SLOPPY_TOGGLE);
    expect(checkInvariants(storeCluster(setupFor({ ...c, seed: pinnedSeed(c) })), [readsSeeAcknowledgedWrites], { until: HORIZON_MS.seeded }).ok).toBe(false);
    expect(pinnedSeed(DEFAULT_STORE)).toBe(BROKEN_SEED_NO_OVERLAP);
  });
});
