import { describe, expect, it } from 'vitest';
import { humanDuration } from '../../core/format';
import lesson from './index';
import {
  ALL_REGIONS, ALL_USERS, costFactor, DETECT_S, DETECTED_AT_S, DNS_S, hasLiveReplica, latencyStats, nearest, PROMOTE_S, PROMOTED_AT_S,
  phaseOf, RECOVERED_AT_S, REGION_RTT, REROUTE_S, regionsInUse, route, routesFor, rpoText, rtoSeconds, rtoText, RTT, USERS,
  type Mode, type RegionId, type Replication, type UserId,
} from './model';

const MODES: Mode[] = ['single', 'passive', 'active'];
const REPLICATIONS: Replication[] = ['async', 'sync'];
const DEAD_SETS: RegionId[][] = [[], ['us'], ['eu'], ['ap'], ['us', 'eu'], ['us', 'ap'], ['eu', 'ap'], ['us', 'eu', 'ap']];

/** Great-circle distance in km, from latitude and longitude in degrees (haversine, Earth radius 6,371 km). */
function km(a: [number, number], b: [number, number]): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(rad(b[0] - a[0]) / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(rad(b[1] - a[1]) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

// Approximate coordinates, written from memory: only used to check a floor, never shown. A user population is
// represented by one city, chosen so that the invented round-trip times stay above the floor for every pair.
const REGION_AT: Record<RegionId, [number, number]> = { us: [37.4, -78.7], eu: [53.3, -6.3], ap: [1.35, 103.8] };
const USER_AT: Record<UserId, [number, number]> = { na: [41.9, -87.6], euu: [50.1, 8.7], apu: [-6.2, 106.8] };
/** Light in fibre: about 200 km per millisecond, so a round trip needs 2 x distance / 200 ms. */
const FIBRE_KM_PER_MS = 200;
const floorMs = (km_: number) => (2 * km_) / FIBRE_KM_PER_MS;

describe('the round-trip tables obey the speed of light in fibre', () => {
  it('every user-to-region round trip is at least the great-circle floor', () => {
    for (const u of ALL_USERS) for (const r of ALL_REGIONS) expect(RTT[u][r], `${u} to ${r}`).toBeGreaterThanOrEqual(floorMs(km(USER_AT[u], REGION_AT[r])));
  });

  it('every region-to-region round trip is at least the floor, and symmetric', () => {
    for (const a of ALL_REGIONS) {
      for (const b of ALL_REGIONS) {
        expect(REGION_RTT[a][b], `${a} to ${b}`).toBeGreaterThanOrEqual(floorMs(km(REGION_AT[a], REGION_AT[b])));
        expect(REGION_RTT[a][b]).toBe(REGION_RTT[b][a]);
      }
    }
  });

  it('puts a little over 150 ms between Virginia and Singapore at the floor, the figure the lesson quotes for 15,000 km', () => {
    expect(floorMs(15_000)).toBe(150);
    // The real Virginia to Singapore path is a little over 15,000 km, so its floor is a little over 150 ms.
    const real = floorMs(km(REGION_AT.us, REGION_AT.ap));
    expect(real).toBeGreaterThan(150);
    expect(real).toBeLessThan(165);
  });

  it('shares of users add up to one', () => {
    expect(ALL_USERS.reduce((s, u) => s + USERS[u].share, 0)).toBeCloseTo(1, 12);
  });
});

describe('the active-passive failover timeline', () => {
  it('has phases that run one after another: the downtime is their sum, not the last phase alone', () => {
    expect(DETECTED_AT_S).toBe(DETECT_S);
    expect(PROMOTED_AT_S).toBe(DETECT_S + PROMOTE_S);
    expect(RECOVERED_AT_S).toBe(DETECT_S + PROMOTE_S + DNS_S);
    expect(RECOVERED_AT_S).toBe(300);
    expect(rtoSeconds('passive')).toBe(RECOVERED_AT_S);
  });

  it('switches phase exactly at the boundaries, on each side of each one', () => {
    const at = (s: number) => phaseOf('passive', ['us'], s)?.text;
    expect(at(0)).toMatch(/^Detecting/);
    expect(at(DETECTED_AT_S - 0.001)).toMatch(/^Detecting/);
    expect(at(DETECTED_AT_S)).toMatch(/^Promoting/);
    expect(at(PROMOTED_AT_S - 0.001)).toMatch(/^Promoting/);
    expect(at(PROMOTED_AT_S)).toMatch(/^DNS/);
    expect(at(RECOVERED_AT_S - 0.001)).toMatch(/^DNS/);
    expect(at(RECOVERED_AT_S)).toMatch(/^Recovered/);
  });

  it('keeps users down until the timeline ends: the RTO the stat prints is the downtime the scene shows', () => {
    const down = (s: number) => routesFor('passive', ['us'], phaseOf('passive', ['us'], s)!.done).na.state;
    expect(down(RECOVERED_AT_S - 1)).toBe('failing');
    expect(down(RECOVERED_AT_S)).toBe('ok');
    expect(rtoText('passive')).toBe(`${humanDuration(RECOVERED_AT_S)} (failover)`);
    expect(rtoText('passive')).toBe('5 min (failover)');
  });

  it('reroutes active-active after REROUTE_S, and has nothing to fail over to in a single region', () => {
    expect(phaseOf('active', ['us'], REROUTE_S - 0.001)?.done).toBe(false);
    expect(phaseOf('active', ['us'], REROUTE_S)?.done).toBe(true);
    expect(rtoText('active')).toBe('30 s (reroute)');
    expect(rtoSeconds('single')).toBeNull();
    expect(phaseOf('single', ['us'], 1_000)?.done).toBe(false);
  });
});

describe('routing', () => {
  it('sends each user population to its nearest live region', () => {
    expect(nearest('na', ALL_REGIONS)).toBe('us');
    expect(nearest('euu', ALL_REGIONS)).toBe('eu');
    expect(nearest('apu', ALL_REGIONS)).toBe('ap');
    expect(nearest('na', ['eu', 'ap'])).toBe('eu');
    expect(nearest('na', [])).toBeNull();
  });

  it('single region: everyone is down the moment us-east dies, and unaffected by other regions', () => {
    for (const u of ALL_USERS) {
      expect(route(u, 'single', ['us'], true).state).toBe('down');
      expect(route(u, 'single', ['eu', 'ap'], false)).toEqual({ region: 'us', state: 'ok' });
    }
  });

  it('active-active: only the dead region\'s users move, to the next-nearest region, after the reroute', () => {
    expect(route('na', 'active', ['us'], false).state).toBe('failing');
    expect(route('na', 'active', ['us'], true)).toEqual({ region: 'eu', state: 'ok' });
    expect(route('euu', 'active', ['us'], false)).toEqual({ region: 'eu', state: 'ok' });
    expect(route('apu', 'active', ['us'], false)).toEqual({ region: 'ap', state: 'ok' });
    expect(route('na', 'active', ALL_REGIONS, true).state).toBe('down');
  });
});

describe('the stats, on hand-worked vectors', () => {
  it('single region, nobody down: the share-weighted round trips', () => {
    // 0.40 x 20 + 0.35 x 85 + 0.25 x 220 = 8 + 29.75 + 55 = 92.75 ms
    const s = latencyStats(routesFor('single', [], false), 'single', 'async', []);
    expect(s.avgRead).toBeCloseTo(92.75, 10);
    expect(s.avgWrite).toBeCloseTo(92.75, 10);
    expect(s.worst).toBe(220);
    expect(s.downShare).toBe(0);
  });

  it('active-active, nobody down: each population is served at home', () => {
    // 0.40 x 20 + 0.35 x 15 + 0.25 x 35 = 8 + 5.25 + 8.75 = 22 ms
    const s = latencyStats(routesFor('active', [], false), 'active', 'async', []);
    expect(s.avgRead).toBeCloseTo(22, 10);
    expect(s.worst).toBe(35);
  });

  it('sync replication adds the slowest replica round trip to each write', () => {
    // active-active: us waits for max(75, 220) = 220, eu for max(75, 165) = 165, ap for max(220, 165) = 220:
    // 0.40 x (20 + 220) + 0.35 x (15 + 165) + 0.25 x (35 + 220) = 96 + 63 + 63.75 = 222.75 ms
    const s = latencyStats(routesFor('active', [], false), 'active', 'sync', []);
    expect(s.avgWrite).toBeCloseTo(222.75, 10);
    expect(s.avgRead).toBeCloseTo(22, 10);
    // active-passive: everyone writes in us-east, which waits for eu-west (75): 92.75 + 75 = 167.75 ms
    const p = latencyStats(routesFor('passive', [], false), 'passive', 'sync', []);
    expect(p.avgWrite).toBeCloseTo(167.75, 10);
  });

  it('counts the users who are down by their share', () => {
    const s = latencyStats(routesFor('active', ['us'], false), 'active', 'async', ['us']);
    expect(s.downShare).toBeCloseTo(0.4, 12);
  });

  it('cost is one region\'s worth per region in use', () => {
    expect(MODES.map(costFactor)).toEqual([1, 2, 3]);
    expect(MODES.map((m) => regionsInUse(m).length)).toEqual([1, 2, 3]);
  });

  it('RPO: lag when async, 0 only while a live replica exists when sync, and a backup in a single region', () => {
    expect(rpoText('single', 'sync', [])).toBe('up to last backup');
    expect(rpoText('passive', 'async', [])).toBe('~1.2 s of writes');
    expect(rpoText('passive', 'sync', [])).toBe('0 (sync)');
    expect(rpoText('passive', 'sync', ['eu'])).toBe('unreplicated: no live replica');
    expect(rpoText('passive', 'sync', ['us'])).toBe('unreplicated: no live replica');
    expect(rpoText('active', 'sync', ['us'])).toBe('0 (sync)');
    expect(rpoText('active', 'sync', ['us', 'eu'])).toBe('unreplicated: no live replica');
    expect(hasLiveReplica('active', ['us', 'eu', 'ap'])).toBe(false);
  });
});

describe('every control combination, including every set of dead regions', () => {
  it('gives finite numbers or nulls, never NaN, and never serves a user from a dead region', () => {
    for (const mode of MODES) {
      for (const replication of REPLICATIONS) {
        for (const dead of DEAD_SETS) {
          for (const failedOver of [false, true]) {
            const routes = routesFor(mode, dead, failedOver);
            const s = latencyStats(routes, mode, replication, dead);
            const label = `${mode}/${replication}/${dead.join('+') || 'none'}/${failedOver}`;
            expect(Number.isFinite(s.avgRead) && Number.isFinite(s.downShare), label).toBe(true);
            if (s.avgWrite !== null) expect(Number.isFinite(s.avgWrite), label).toBe(true);
            expect(s.anyServed, label).toBe(s.worst !== null);
            for (const u of ALL_USERS) if (routes[u].region) expect(dead.includes(routes[u].region!), label).toBe(false);
            expect(typeof rpoText(mode, replication, dead)).toBe('string');
          }
        }
      }
    }
  });
});

describe("try-this entries, from the default state, as written", () => {
  it('try-this 1: Asia-Pacific reads 220 ms to us-east, and killing us-east in a single region takes 100% of users down', () => {
    expect(RTT.apu.us).toBe(220);
    const alive = latencyStats(routesFor('single', [], false), 'single', 'async', []);
    expect(alive.downShare).toBe(0);
    const killed = latencyStats(routesFor('single', ['us'], false), 'single', 'async', ['us']);
    expect(Math.round(killed.downShare * 100)).toBe(100);
    expect(killed.anyServed).toBe(false);
    expect(phaseOf('single', ['us'], 0)?.text).toContain('no other region');
  });

  it('try-this 2: active-passive downtime is the sum of the three phases, 5 min, with every phase adding to it', () => {
    expect(DETECT_S + PROMOTE_S + DNS_S).toBe(RECOVERED_AT_S);
    expect(humanDuration(RECOVERED_AT_S)).toBe('5 min');
    expect(lesson.tryThis[1]).toContain('5 min');
    expect(phaseOf('passive', ['us'], 1)?.text).toMatch(/^Detecting/);
    expect(routesFor('passive', ['us'], false).na.state).toBe('failing');
  });

  it('try-this 3: in active-active the dead region\'s users reroute to the next-nearest region within the reroute time', () => {
    expect(REROUTE_S).toBe(30);
    expect(routesFor('active', ['us'], false).na.state).toBe('failing');
    expect(routesFor('active', ['us'], true).na).toEqual({ region: 'eu', state: 'ok' });
    expect(lesson.tryThis[2]).toContain('eu-west');
    expect(lesson.tryThis[2]).toContain(`${REROUTE_S} s`);
  });

  it('try-this 4: the write latency stat goes from 22 ms to 223 ms between async and sync, and the text says so', () => {
    const w = (r: Replication) => latencyStats(routesFor('active', [], false), 'active', r, []).avgWrite!;
    expect(Math.round(w('async'))).toBe(22);
    expect(Math.round(w('sync'))).toBe(223);
    expect(lesson.tryThis[3]).toContain('22 ms to 223 ms');
  });
});

describe('the lesson text', () => {
  it('keeps four try-this entries and five questions, and scopes the claims the audit flagged', () => {
    expect(lesson.tryThis).toHaveLength(4);
    expect(lesson.quiz).toHaveLength(5);
    expect(lesson.summary.what).toContain('cannot get a round trip under about 150 ms');
    expect(lesson.summary.what).not.toMatch(/removes data loss|can never/);
    expect(lesson.summary.useCases.join(' ')).not.toContain('they do happen');
    expect(lesson.keyIdeas.join(' ')).not.toContain('always on');
  });
});
