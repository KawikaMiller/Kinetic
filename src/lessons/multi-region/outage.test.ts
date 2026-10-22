import { describe, expect, it } from 'vitest';
import {
  ALL_REGIONS, ALL_USERS, phaseOf, route, rpoText, toggleRegion,
  type Mode, type OutageState, type RegionId, type Replication, type ToggleEvent,
} from './model';

const MODES: Mode[] = ['single', 'passive', 'active'];
const REPLICATIONS: Replication[] = ['async', 'sync'];
const SEQUENCE_LENGTH = 6;
const AN_HOUR_S = 3_600;
const START: OutageState = { dead: [], clock: null };

/** Visit every click sequence of up to SEQUENCE_LENGTH clicks on the three regions, at each step. */
function walk(mode: Mode, replication: Replication, visit: (before: OutageState, after: OutageState, r: RegionId, event: ToggleEvent) => void) {
  const go = (state: OutageState, depth: number) => {
    if (depth === SEQUENCE_LENGTH) return;
    for (const r of ALL_REGIONS) {
      const out = toggleRegion(mode, replication, state, r);
      visit(state, out.state, r, out.event);
      go(out.state, depth + 1);
    }
  };
  go(START, 0);
}

const routesAt = (mode: Mode, dead: RegionId[], clock: number | null) => {
  const done = clock === null ? false : (phaseOf(mode, dead, clock)?.done ?? false);
  return ALL_USERS.map((u) => route(u, mode, dead, done));
};
const failingAt = (mode: Mode, dead: RegionId[], clock: number | null) => routesAt(mode, dead, clock).filter((r) => r.state === 'failing').length;

/** What the click handler did before the state machine: a restore always stopped the clock, even with a region still dead. */
function legacyToggle(mode: Mode, state: OutageState, r: RegionId): OutageState {
  if (state.dead.includes(r)) return { dead: state.dead.filter((x) => x !== r), clock: null };
  const serving = mode === 'active' || r === 'us' || (mode === 'passive' && r === 'eu' && state.dead.includes('us'));
  return { dead: [...state.dead, r], clock: serving ? 0 : state.clock };
}

describe('the Kill/Restore state machine, over every reachable click sequence of three regions', () => {
  it('never leaves users failing with no timeline running, and every failover finishes: no stuck state', () => {
    let states = 0;
    for (const mode of MODES) {
      walk(mode, 'async', (_before, after) => {
        states += 1;
        const label = `${mode}: dead ${after.dead.join('+') || 'none'}, clock ${after.clock}`;
        if (after.clock === null) {
          expect(failingAt(mode, after.dead, null), `${label}: users failing but the clock is stopped`).toBe(0);
          expect(routesAt(mode, after.dead, null).filter((r) => r.state === 'down').length, `${label}: users down with no downtime clock`).toBe(0);
        }
        expect(failingAt(mode, after.dead, AN_HOUR_S), `${label}: still failing after an hour`).toBe(0);
      });
    }
    expect(states).toBeGreaterThan(1_000);
  });

  it('the old handler is caught by the same check: kill eu, kill us, restore eu stranded the passive users', () => {
    let old = START;
    for (const r of ['eu', 'us', 'eu'] as RegionId[]) old = legacyToggle('passive', old, r);
    expect(old.dead).toEqual(['us']);
    expect(old.clock).toBeNull();
    expect(failingAt('passive', old.dead, old.clock), 'every user stuck failing, with no clock').toBe(ALL_USERS.length);
    let fixed = START;
    for (const r of ['eu', 'us', 'eu'] as RegionId[]) fixed = toggleRegion('passive', 'async', fixed, r).state;
    expect(fixed.clock).toBe(0);
    expect(failingAt('passive', fixed.dead, AN_HOUR_S)).toBe(0);
  });

  it('active-active: kill us, kill eu, restore eu leaves a running reroute, not a frozen one', () => {
    let old = START;
    for (const r of ['us', 'eu', 'eu'] as RegionId[]) old = legacyToggle('active', old, r);
    expect(old.clock, 'the old handler stopped the clock while us-east was still dead').toBeNull();
    let state = START;
    for (const r of ['us', 'eu', 'eu'] as RegionId[]) state = toggleRegion('active', 'async', state, r).state;
    expect(state.dead).toEqual(['us']);
    expect(state.clock).not.toBeNull();
    expect(failingAt('active', state.dead, AN_HOUR_S)).toBe(0);
  });

  it('the loss a kill reports agrees with the RPO stat that was on screen just before it, in every sequence and both settings', () => {
    for (const mode of MODES) {
      for (const replication of REPLICATIONS) {
        let failed = 0;
        walk(mode, replication, (before, _after, r, event) => {
          if (event.kind !== 'failed') return;
          failed += 1;
          const stat = rpoText(mode, replication, before.dead);
          const label = `${mode}/${replication}: kill ${r} with ${before.dead.join('+') || 'nothing'} down, stat "${stat}", loss ${event.loss.kind}`;
          switch (event.loss.kind) {
            case 'backup':
              expect(stat, label).toBe('up to last backup');
              break;
            case 'lag':
              expect(replication, label).toBe('async');
              expect(stat, label).toMatch(/^~1\.2 s/);
              break;
            case 'zero':
              expect(replication, label).toBe('sync');
              expect(stat, label).toBe('0 (sync)');
              break;
            case 'no-replica':
              expect(stat, label).toBe('no live replica: one copy');
              break;
          }
        });
        expect(failed).toBeGreaterThan(0);
      }
    }
  });

  it('a restore event lists exactly the regions still down, and killing an unused region leaves the clock alone', () => {
    walk('passive', 'async', (before, after, r, event) => {
      if (event.kind === 'restored') expect(event.stillDown).toEqual(after.dead);
      if (event.kind === 'unused') {
        expect(r).toBe('ap');
        expect(after.clock).toBe(before.clock);
      }
    });
  });
});
